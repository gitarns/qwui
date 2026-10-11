use anyhow::Result;
use axum::{
    body::{to_bytes, Body, Bytes},
    extract::{Query, Request, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
    Json, Router,
};
use axum_reverse_proxy::ReverseProxy;
use dotenvy::dotenv;
use hyper_util::client::legacy::{connect::HttpConnector, Client};
use openidconnect::{
    core::{CoreClient, CoreProviderMetadata, CoreResponseType},
    AuthenticationFlow, ClientId, ClientSecret, CsrfToken, IssuerUrl, Nonce, RedirectUrl, Scope,
    TokenResponse,
};
use reqwest::{header, Client as ReqwestClient};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    env,
    io::{Cursor, Write},
    net::SocketAddr,
    time::Duration,
};

use tower::ServiceBuilder;
use tower_http::{
    cors::{Any, CorsLayer},
    services::ServeDir,
    trace::{TraceLayer, DefaultMakeSpan, DefaultOnResponse},
    LatencyUnit,
};
use tower_sessions::{Expiry, MemoryStore, Session, SessionManagerLayer};
use tracing::{error, info, Level};
use vrl::compiler::{state::RuntimeState, Context, TimeZone};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;

mod mcp;
mod metrics;

/// StateStore manages OIDC state tokens with expiration
#[derive(Clone)]
struct StateStore {
    states: Arc<Mutex<HashMap<String, std::time::SystemTime>>>,
}

impl StateStore {
    fn new() -> Self {
        Self {
            states: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn save(&self, state: String) {
        let expiration = std::time::SystemTime::now() + Duration::from_secs(600); // 10 minutes
        if let Ok(mut states) = self.states.lock() {
            states.insert(state, expiration);
        }
    }

    fn verify(&self, state: &str) -> bool {
        if let Ok(mut states) = self.states.lock() {
            if let Some(expiration) = states.remove(state) {
                return std::time::SystemTime::now() <= expiration;
            }
        }
        false
    }

    fn cleanup(&self) {
        if let Ok(mut states) = self.states.lock() {
            let now = std::time::SystemTime::now();
            states.retain(|_, exp| now <= *exp);
        }
    }
}

#[derive(Clone)]
struct AppState {
    config: Config,
    client: ReqwestClient,
    oidc_client: Option<CoreClient>,
    // RP-initiated logout endpoint, discovered at startup. None when the
    // provider does not advertise one.
    oidc_end_session: Option<String>,
    state_store: StateStore,
}

#[derive(Clone, Debug)]
struct Config {
    port: String,
    quickwit_url: String,
    quickwit_indexer_url: Option<String>,
    max_export_docs: usize,
    oidc_enabled: bool,
    oidc_client_id: String,
    oidc_secret: String,
    oidc_issuer: String,
    oidc_redirect: String,
    oidc_post_logout: String,
    session_secret: Option<String>,
    // Whether the session cookie carries the `Secure` attribute. Inferred from
    // the OIDC redirect URL's scheme, overridable with SESSION_COOKIE_SECURE.
    session_cookie_secure: bool,
    _origin: String,
}

impl Config {
    fn from_env() -> Self {
        let mut config = Self {
            port: env::var("PORT").unwrap_or_else(|_| "8080".to_string()),
            quickwit_url: env::var("QUICKWIT_URL")
                .unwrap_or_else(|_| "http://localhost:7280".to_string()),
            quickwit_indexer_url: env::var("QUICKWIT_INDEXER_URL").ok(),
            max_export_docs: env::var("MAX_EXPORT_DOCS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10000),
            oidc_enabled: env::var("OIDC_ENABLED").unwrap_or_else(|_| "false".to_string())
                == "true",
            oidc_client_id: env::var("OIDC_CLIENT_ID").unwrap_or_default(),
            oidc_secret: env::var("OIDC_CLIENT_SECRET").unwrap_or_default(),
            oidc_issuer: env::var("OIDC_ISSUER").unwrap_or_default(),
            oidc_redirect: env::var("OIDC_REDIRECT_URL").unwrap_or_default(),
            oidc_post_logout: env::var("OIDC_POST_LOGOUT_REDIRECT_URL").unwrap_or_default(),
            session_secret: env::var("SESSION_SECRET").ok(),
            session_cookie_secure: match env::var("SESSION_COOKIE_SECURE") {
                Ok(v) => v == "true",
                // No explicit setting: HTTPS deployments get `Secure`, local
                // HTTP development does not (where it would break the cookie).
                Err(_) => env::var("OIDC_REDIRECT_URL")
                    .unwrap_or_default()
                    .starts_with("https://"),
            },
            _origin: env::var("ORIGIN").unwrap_or_else(|_| "*".to_string()),
        };

        // Disable OIDC if SESSION_SECRET is missing
        if config.oidc_enabled && config.session_secret.is_none() {
            eprintln!("WARNING: OIDC is enabled but SESSION_SECRET is not set. Disabling OIDC.");
            eprintln!("Please set SESSION_SECRET environment variable for secure session management.");
            config.oidc_enabled = false;
        }

        config
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct User {
    email: String,
    name: String,
    sub: String,
}

// Middleware to add cache headers.
//
// Deny-by-default: only provably immutable assets get a long cache, everything
// else is `no-store`. The auth routes must never be cached at all -- the /login
// redirect carries a single-use OAuth2 `state`, so a cached copy replays a state
// that is already spent and login becomes permanently impossible.
async fn cache_control_middleware(req: Request, next: Next) -> Response {
    let path = req.uri().path().to_string();
    let mut response = next.run(req).await;

    // Auth and session routes: single-use OAuth2 state, or per-user data that a
    // shared cache must never hand to somebody else.
    let is_auth_route = matches!(
        path.as_str(),
        "/login"
            | "/logout"
            | "/auth/callback"
            | "/api/auth/status"
            | "/api/user-info"
            // Bare forms, in case these ever stop being nested under /api.
            | "/auth/status"
            | "/user-info"
    );

    // Fingerprinted build output: the filename changes when the bytes change.
    let is_immutable_asset = path.contains("/assets/")
        || path.ends_with(".js")
        || path.ends_with(".css")
        || path.ends_with(".woff")
        || path.ends_with(".woff2")
        || path.ends_with(".ttf");

    // Unfingerprinted static media (favicons, logo). Not sensitive, and worth a
    // moderate cache, but they can change in place so no `immutable`.
    let is_static_media = path.ends_with(".png")
        || path.ends_with(".jpg")
        || path.ends_with(".jpeg")
        || path.ends_with(".gif")
        || path.ends_with(".svg")
        || path.ends_with(".ico")
        || path.ends_with(".webp");

    if is_auth_route {
        // `no-store`, not `no-cache`: no-cache still permits storing the
        // response and revalidating it. A one-shot state must not be written to
        // any cache, shared or private.
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        );
        response.headers_mut().insert(
            header::PRAGMA,
            HeaderValue::from_static("no-cache"),
        );
        response.headers_mut().insert(
            header::EXPIRES,
            HeaderValue::from_static("0"),
        );
    } else if is_immutable_asset {
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=31536000, immutable"),
        );
    } else if is_static_media {
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=86400"),
        );
    } else {
        // Everything else: HTML, the API, the Quickwit proxy, and any route
        // added later. Dynamic until proven otherwise.
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-cache, no-store, must-revalidate"),
        );
        response.headers_mut().insert(
            header::PRAGMA,
            HeaderValue::from_static("no-cache"),
        );
        response.headers_mut().insert(
            header::EXPIRES,
            HeaderValue::from_static("0"),
        );
    }

    response
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();

    // Parse LOG_LEVEL env var (default to info)
    let log_level_str = env::var("LOG_LEVEL").unwrap_or_else(|_| "info".to_string());
    let log_level = match log_level_str.to_lowercase().as_str() {
        "trace" => Level::TRACE,
        "debug" => Level::DEBUG,
        "info" => Level::INFO,
        "warn" => Level::WARN,
        "error" => Level::ERROR,
        _ => {
            eprintln!("Invalid LOG_LEVEL '{}', using 'info'", log_level_str);
            Level::INFO
        }
    };

    // Minimal logging setup (we output JSON directly to stdout)
    tracing_subscriber::fmt()
        .with_max_level(log_level)
        .with_target(false)
        .with_thread_ids(false)
        .with_thread_names(false)
        .with_file(false)
        .with_line_number(false)
        .with_level(false)
        .without_time()
        .with_ansi(false)
        .init();

    let config = Config::from_env();
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Nanos, true);
    println!("{}", serde_json::json!({"type": "startup", "timestamp": now, "message": "Starting server", "port": config.port}));
    println!("{}", serde_json::json!({"type": "startup", "timestamp": now, "message": "Quickwit URL", "url": config.quickwit_url}));
    println!("{}", serde_json::json!({"type": "startup", "timestamp": now, "message": "OIDC Enabled", "value": config.oidc_enabled}));

    let client = ReqwestClient::builder()
        .timeout(Duration::from_secs(300))
        .pool_max_idle_per_host(0) // disable connection reuse for load balancing across pods
        .build()?;

    // Test Quickwit connection
    let health_url = format!("{}/api/v1/version", config.quickwit_url);
    match client.get(&health_url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Nanos, true);
            println!("{}", serde_json::json!({"type": "startup", "timestamp": now, "message": "Successfully connected to Quickwit"}));
        }
        Ok(resp) => {
            anyhow::bail!(
                "Quickwit health check returned status {} {}",
                health_url,
                resp.status()
            );
        }
        Err(e) => {
            anyhow::bail!("Cannot connect to Quickwit:{} {}", health_url, e);
        }
    }

    let mut oidc_client = None;
    let mut oidc_end_session: Option<String> = None;
    if config.oidc_enabled {
        if config.oidc_client_id.is_empty()
            || config.oidc_secret.is_empty()
            || config.oidc_issuer.is_empty()
            || config.oidc_redirect.is_empty()
        {
            anyhow::bail!("OIDC is enabled but missing configuration");
        }

        let provider_metadata = CoreProviderMetadata::discover_async(
            IssuerUrl::new(config.oidc_issuer.clone())?,
            openidconnect::reqwest::async_http_client,
        )
        .await?;

        oidc_client = Some(
            CoreClient::from_provider_metadata(
                provider_metadata,
                ClientId::new(config.oidc_client_id.clone()),
                Some(ClientSecret::new(config.oidc_secret.clone())),
            )
            .set_redirect_uri(RedirectUrl::new(config.oidc_redirect.clone())?),
        );

        // openidconnect's CoreProviderMetadata does not surface
        // end_session_endpoint, so read it straight from the discovery
        // document. Optional: providers without it fall back to a local-only
        // session clear at logout.
        let discovery_url = format!(
            "{}/.well-known/openid-configuration",
            config.oidc_issuer.trim_end_matches('/')
        );
        oidc_end_session = match client.get(&discovery_url).send().await {
            Ok(resp) => match resp.json::<Value>().await {
                Ok(doc) => doc
                    .get("end_session_endpoint")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                Err(e) => {
                    error!("Could not parse OIDC discovery document: {}", e);
                    None
                }
            },
            Err(e) => {
                error!("Could not fetch OIDC discovery document: {}", e);
                None
            }
        };
        match &oidc_end_session {
            Some(url) => info!("RP-initiated logout available: {}", url),
            None => error!(
                "Provider advertises no end_session_endpoint: logout will only clear the local session, the provider SSO session will survive"
            ),
        }
    }

    let state = AppState {
        config: config.clone(),
        client,
        oidc_client,
        oidc_end_session,
        state_store: StateStore::new(),
    };

    // Session setup
    let session_store = if let Some(secret) = &config.session_secret {
        if secret.len() < 32 {
            eprintln!("WARNING: SESSION_SECRET is too short (must be at least 32 bytes)");
        }
        info!("Session store initialized with configured SESSION_SECRET");
        MemoryStore::default()
    } else {
        info!("No SESSION_SECRET provided - sessions will not persist across restarts");
        MemoryStore::default()
    };

    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(config.session_cookie_secure)
        .with_same_site(tower_sessions::cookie::SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(time::Duration::days(7)));

    // CORS setup
    let cors = CorsLayer::new()
        .allow_origin(Any) // In production, use config.origin
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    let mut connector = HttpConnector::new();
    connector.set_nodelay(true);
    connector.enforce_http(false);
    connector.set_keepalive(None); // disable TCP keep-alive for load balancing across pods

    let client = Client::builder(hyper_util::rt::TokioExecutor::new())
        .pool_idle_timeout(std::time::Duration::ZERO)
        .pool_max_idle_per_host(0) // disable connection reuse for load balancing across pods
        .build(connector);
    let proxy = ReverseProxy::new_with_client("/", &state.config.quickwit_url, client);
    let protected_reverse_proxy: Router = proxy.into();

    let protected_api_routes = Router::new()
        .route("/export/csv", post(handle_csv_export))
        .route("/patterns", post(handle_patterns))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ))
        .with_state(state.clone());

    let public_api_routes = Router::new()
        .route("/auth/status", get(auth_status))
        .route("/user-info", get(user_info))
        .with_state(state.clone());

    let api_routes = Router::new()
        .merge(public_api_routes)
        .merge(protected_api_routes);

    let auth_routes = Router::new()
        .route("/login", get(login_handler))
        .route("/auth/callback", get(auth_callback))
        .route("/logout", get(logout_handler))
        .with_state(state.clone());

    // MCP is deliberately NOT wrapped in auth_middleware: an agent cannot
    // complete an interactive OIDC login, so /mcp carries its own bearer
    // credential (see mcp::require_token). None when disabled or unconfigured.
    let mcp_routes = mcp::router(&state).await;

    let mut routes = Router::new()
        .nest("/api", api_routes)
        .nest(
            "/quickwit",
            protected_reverse_proxy
                .layer(middleware::from_fn(log_quickwit_query))
                .layer(middleware::from_fn_with_state(
                    state.clone(),
                    smart_proxy_middleware,
                ))
                .layer(ServiceBuilder::new().layer(middleware::from_fn_with_state(
                    state.clone(),
                    auth_middleware,
                ))),
        )
        .merge(auth_routes);

    // Nested before the layer chain below, so /mcp picks up cache-control and
    // request tracing like every other route. A `.layer()` only applies to the
    // routes registered before it, so mounting afterwards would silently opt
    // MCP out of all of them.
    if let Some(mcp_routes) = mcp_routes {
        routes = routes.nest("/mcp", mcp_routes);
    }

    // Prometheus scrape target, off unless asked for.
    //
    // Unauthenticated by design, the way an exporter is, so that an in-cluster
    // Prometheus can scrape it without a credential. That makes it a footgun
    // behind a catch-all ingress: one that routes "/" as a Prefix makes an
    // always-on /metrics reachable from the internet. It carries no query text
    // and no credentials, but it does
    // name the configured agents, so it is opt-in and the log says to restrict
    // it at the ingress.
    let routes = if env::var("METRICS_ENABLED").unwrap_or_else(|_| "false".into()) == "true" {
        info!(
            "Metrics enabled at /metrics -- unauthenticated by design; block this path at \
             the ingress if it is publicly routed"
        );
        routes.route(
            "/metrics",
            get(|| async {
                (
                    [(
                        axum::http::header::CONTENT_TYPE,
                        "text/plain; version=0.0.4",
                    )],
                    metrics::render(),
                )
            }),
        )
    } else {
        info!("Metrics disabled (set METRICS_ENABLED=true to serve /metrics)");
        routes
    };

    let app = routes
        .fallback_service(ServeDir::new("dist"))
        .layer(middleware::from_fn(cache_control_middleware))
        .layer(session_layer)
        .layer(cors)
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(
                    DefaultMakeSpan::new()
                        .level(Level::DEBUG)
                        .include_headers(false),
                )
                .on_response(
                    DefaultOnResponse::new()
                        .level(Level::DEBUG)
                        .latency_unit(LatencyUnit::Millis),
                ),
        );

    let addr: SocketAddr = format!("0.0.0.0:{}", config.port).parse()?;
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Nanos, true);
    println!("{}", serde_json::json!({"type": "startup", "timestamp": now, "message": "Listening on", "address": addr.to_string()}));

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

// Auth Handlers

/// Session key for the page to land on once the OIDC login completes.
const POST_LOGIN_REDIRECT_KEY: &str = "post_login_redirect";

/// Longest `return_to` kept. A search link carrying filters runs to a few KB;
/// the cap stops a crafted link parking an arbitrary value in the in-memory
/// session store.
const MAX_RETURN_PATH_LEN: usize = 8192;

#[derive(Deserialize)]
struct LoginParams {
    /// The page the browser was on when it was sent to log in, so a shared
    /// search link survives the round trip through the identity provider.
    return_to: Option<String>,
}

/// `candidate` if it is a path on this site, otherwise None. Anything a
/// browser could read as another origin is refused rather than repaired:
/// `//evil.example` and `/\evil.example` are protocol-relative to browsers,
/// and browsers drop tabs and newlines from URLs, so `/\t/evil.example` turns
/// into `//evil.example`. ASCII only, as the frontend sends it percent-encoded,
/// which also keeps it a valid Location header.
fn safe_return_path(candidate: &str) -> Option<&str> {
    let path = candidate.split(['?', '#']).next().unwrap_or_default();
    if candidate.len() > MAX_RETURN_PATH_LEN
        || !candidate.is_ascii()
        || !candidate.starts_with('/')
        || candidate.starts_with("//")
        || path.contains('\\')
        || candidate.chars().any(|c| c.is_ascii_control())
    {
        return None;
    }
    Some(candidate)
}

async fn login_handler(
    State(app_state): State<AppState>,
    session: Session,
    Query(params): Query<LoginParams>,
) -> impl IntoResponse {
    let client = match app_state.oidc_client {
        Some(c) => c,
        None => return (StatusCode::INTERNAL_SERVER_ERROR, "OIDC not enabled").into_response(),
    };

    let (auth_url, csrf_token, nonce) = client
        .authorize_url(
            AuthenticationFlow::<CoreResponseType>::AuthorizationCode,
            CsrfToken::new_random,
            Nonce::new_random,
        )
        .add_scope(Scope::new("email".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .url();

    info!("Generated OIDC state: {}", csrf_token.secret());

    // Store state server-side (survives external redirects)
    app_state.state_store.save(csrf_token.secret().to_string());

    // Store nonce in session (still needed for ID token validation)
    session.insert("oidc_nonce", nonce.secret()).await.unwrap();

    // Cleared when absent, so an abandoned earlier login cannot send this one
    // somewhere stale.
    match params.return_to.as_deref().and_then(safe_return_path) {
        Some(path) => session.insert(POST_LOGIN_REDIRECT_KEY, path).await.unwrap(),
        None => {
            session
                .remove::<String>(POST_LOGIN_REDIRECT_KEY)
                .await
                .unwrap();
        }
    }

    Redirect::to(auth_url.as_str()).into_response()
}

#[derive(Deserialize)]
struct AuthCallbackParams {
    code: String,
    state: String,
}

async fn auth_callback(
    State(app_state): State<AppState>,
    session: Session,
    Query(params): Query<AuthCallbackParams>,
) -> impl IntoResponse {
    // Verify state (prevents CSRF and ensures it was issued by us)
    if !app_state.state_store.verify(&params.state) {
        error!("OIDC state validation failed - Invalid or expired state: {}", params.state);
        return (StatusCode::BAD_REQUEST, "Invalid or expired state").into_response();
    }

    let stored_nonce: Option<String> = session.get("oidc_nonce").await.unwrap();

    let client = app_state.oidc_client.unwrap();
    let token_response = match client
        .exchange_code(openidconnect::AuthorizationCode::new(params.code))
        .request_async(openidconnect::reqwest::async_http_client)
        .await
    {
        Ok(token) => token,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to exchange token: {}", e),
            )
                .into_response()
        }
    };

    let id_token = match token_response.id_token() {
        Some(token) => token,
        None => return (StatusCode::INTERNAL_SERVER_ERROR, "No ID token received").into_response(),
    };

    let nonce = match stored_nonce {
        Some(n) => Nonce::new(n),
        None => return (StatusCode::BAD_REQUEST, "Missing stored nonce").into_response(),
    };

    let claims = match id_token.claims(&client.id_token_verifier(), &nonce) {
        Ok(claims) => claims,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to verify ID token: {}", e),
            )
                .into_response()
        }
    };

    let user = User {
        email: claims
            .email()
            .map(|e| e.as_str().to_string())
            .unwrap_or_default(),
        name: claims
            .name()
            .and_then(|n| n.get(None))
            .map(|n| n.as_str().to_string())
            .unwrap_or_default(),
        sub: claims.subject().as_str().to_string(),
    };

    info!("User logged in: {} ({})", user.name, user.email);
    session.insert("user", user).await.unwrap();
    // Kept so /logout can pass it as id_token_hint to the provider.
    session
        .insert("id_token", id_token.to_string())
        .await
        .unwrap();
    session.remove::<String>("oidc_nonce").await.unwrap();

    // Checked again on the way out: it came from a query string, and this is
    // where it becomes a redirect.
    let return_to = session
        .remove::<String>(POST_LOGIN_REDIRECT_KEY)
        .await
        .unwrap()
        .filter(|path| safe_return_path(path).is_some())
        .unwrap_or_else(|| "/".to_string());

    Redirect::to(&return_to).into_response()
}

async fn logout_handler(
    State(app_state): State<AppState>,
    session: Session,
) -> impl IntoResponse {
    // Read the ID token before wiping the session: the provider needs it as
    // id_token_hint to know which session to end.
    let id_token: Option<String> = session.get("id_token").await.unwrap_or(None);

    // flush() drops the session from the store and expires the cookie;
    // clear() alone would leave an empty but valid session behind.
    if let Err(e) = session.flush().await {
        error!("Failed to flush session during logout: {}", e);
    }

    // Clearing our cookie is not a logout: the provider keeps its own SSO
    // session, so the next /login would silently re-authenticate. Hand the
    // user to the provider so it ends its session too.
    let end_session = match &app_state.oidc_end_session {
        Some(e) => e,
        None => return Redirect::to("/").into_response(),
    };

    let mut url = match reqwest::Url::parse(end_session) {
        Ok(u) => u,
        Err(e) => {
            error!("Invalid end_session_endpoint {}: {}", end_session, e);
            return Redirect::to("/").into_response();
        }
    };
    {
        let mut q = url.query_pairs_mut();
        if let Some(token) = &id_token {
            q.append_pair("id_token_hint", token);
        }
        q.append_pair("client_id", &app_state.config.oidc_client_id);
        if !app_state.config.oidc_post_logout.is_empty() {
            q.append_pair(
                "post_logout_redirect_uri",
                &app_state.config.oidc_post_logout,
            );
        }
    }

    Redirect::to(url.as_str()).into_response()
}

async fn auth_status(State(state): State<AppState>, session: Session) -> impl IntoResponse {
    let user: Option<User> = session.get("user").await.unwrap();
    let authenticated = user.is_some();

    let status = if state.config.oidc_enabled {
        serde_json::json!({
            "oidc_enabled": true,
            "authenticated": authenticated,
            "user": user.map(|u| serde_json::json!({ "email": u.email, "name": u.name })),
            "features": { "vrl": true, "mcp": mcp::enabled() }
        })
    } else {
        serde_json::json!({
            "oidc_enabled": false,
            "authenticated": true,
            "user": { "name": "Anonymous User", "email": "anonymous@local" },
            "features": { "vrl": true, "mcp": mcp::enabled() }
        })
    };

    Json(status)
}

async fn user_info(session: Session) -> impl IntoResponse {
    let user: Option<User> = session.get("user").await.unwrap();
    match user {
        Some(u) => Json(serde_json::json!({
            "sub": u.sub,
            "name": u.name,
            "email": u.email
        }))
        .into_response(),
        None => Json(serde_json::json!({
            "sub": "anonymous",
            "name": "Anonymous User"
        }))
        .into_response(),
    }
}

// Middleware

async fn auth_middleware(
    State(state): State<AppState>,
    session: Session,
    mut request: Request,
    next: Next,
) -> Response {
    if !state.config.oidc_enabled {
        return next.run(request).await;
    }

    let user: Option<User> = session.get("user").await.unwrap();
    if let Some(ref u) = user {
        // Store username in request extensions for logging
        request.extensions_mut().insert(u.email.clone());
        next.run(request).await
    } else {
        (StatusCode::UNAUTHORIZED, "Unauthorized").into_response()
    }
}

// Proxy Handler

// CSV Export

#[derive(Deserialize)]
struct CSVExportRequest {
    index: String,
    query: String,
    columns: Vec<String>,
    max_docs: usize,
    start_timestamp: Option<i64>,
    end_timestamp: Option<i64>,
    timestamp_field: String,
}

#[derive(Serialize, Debug)]
struct QuickwitSearchRequest {
    query: String,
    max_hits: usize,
    start_offset: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    start_timestamp: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    end_timestamp: Option<i64>,
}

#[derive(Deserialize)]
struct QuickwitSearchResponse {
    num_hits: u128,
    hits: Vec<serde_json::Map<String, serde_json::Value>>,
}

async fn handle_csv_export(
    State(state): State<AppState>,
    Json(mut req): Json<CSVExportRequest>,
) -> impl IntoResponse {
    if req.index.is_empty() || req.columns.is_empty() {
        return (StatusCode::BAD_REQUEST, "Index and columns are required").into_response();
    }

    if req.max_docs > state.config.max_export_docs {
        req.max_docs = state.config.max_export_docs;
    }

    let batch_size = 1000;
    let _max_parallel = 5;
    let num_batches = (req.max_docs + batch_size - 1) / batch_size;

    let mut csv_writer = csv::Writer::from_writer(Vec::new());
    let mut headers = vec![req.timestamp_field.clone()];
    headers.extend(req.columns.clone());
    csv_writer.write_record(&headers).unwrap();

    let mut tasks = Vec::new();

    for i in 0..num_batches {
        let offset = i * batch_size;
        let mut limit = batch_size;
        if offset + limit > req.max_docs {
            limit = req.max_docs - offset;
        }

        let client = state.client.clone();
        let qw_url = state.config.quickwit_url.clone();
        let index = req.index.clone();
        let query = req.query.clone();
        let start_ts = req.start_timestamp;
        let end_ts = req.end_timestamp;

        tasks.push(tokio::spawn(async move {
            fetch_batch(
                &client, &qw_url, &index, &query, offset, limit, start_ts, end_ts,
            )
            .await
        }));
    }

    // Process results
    let results = futures::future::join_all(tasks).await;

    // We need to sort results by batch index to maintain order, but join_all returns in order of submission (which corresponds to batch index).
    // So we just iterate.

    for res in results {
        match res {
            Ok(Ok(hits)) => {
                for hit in hits {
                    let mut row = Vec::new();
                    for col in &headers {
                        let val = hit.get(col).unwrap_or(&serde_json::Value::Null);
                        row.push(format_value(val));
                    }
                    csv_writer.write_record(&row).unwrap();
                }
            }
            Ok(Err(e)) => {
                error!("Error fetching batch: {}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Error fetching batch: {}", e),
                )
                    .into_response();
            }
            Err(e) => {
                error!("Task join error: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, "Internal error").into_response();
            }
        }
    }

    let csv_data = csv_writer.into_inner().unwrap();

    // Zip it
    let mut zip_writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let filename = format!("quickwit-export-{}-{}.csv", req.index, timestamp);

    zip_writer.start_file(filename, options).unwrap();
    zip_writer.write_all(&csv_data).unwrap();
    let zip_data = zip_writer.finish().unwrap().into_inner();

    let zip_filename = format!("quickwit-export-{}-{}.zip", req.index, timestamp);

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", HeaderValue::from_static("application/zip"));
    headers.insert(
        "Content-Disposition",
        HeaderValue::from_str(&format!("attachment; filename=\"{}\"", zip_filename)).unwrap(),
    );

    (headers, zip_data).into_response()
}

async fn fetch_batch(
    client: &ReqwestClient,
    qw_url: &str,
    index: &str,
    query: &str,
    offset: usize,
    limit: usize,
    start_ts: Option<i64>,
    end_ts: Option<i64>,
) -> Result<Vec<serde_json::Map<String, serde_json::Value>>> {
    let url = format!("{}/api/v1/{}/search", qw_url, index);
    let req_body = QuickwitSearchRequest {
        query: query.to_string(),
        max_hits: limit,
        start_offset: offset,
        start_timestamp: start_ts,
        end_timestamp: end_ts,
    };

    let start_time = std::time::Instant::now();

    let resp = match client.post(&url).json(&req_body).send().await {
        Ok(r) => r,
        Err(e) => {
            let duration_ms = start_time.elapsed().as_millis();
            let log_json = serde_json::json!({
                "type": "quickwit_query",
                "timestamp": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Nanos, true),
                "duration_ms": duration_ms,
                "status_code": "error",
                "index": index,
                "query": query,
                "offset": offset,
                "limit": limit,
                "error": e.to_string(),
            });
            println!("{}", log_json);
            return Err(e.into());
        }
    };

    let status_code = resp.status().as_u16();
    let duration_ms = start_time.elapsed().as_millis();

    if !resp.status().is_success() {
        let error_text = resp.text().await.unwrap_or_else(|_| "unknown error".to_string());
        let log_json = serde_json::json!({
            "type": "quickwit_query",
            "timestamp": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Nanos, true),
            "duration_ms": duration_ms,
            "status_code": status_code,
            "index": index,
            "query": query,
            "offset": offset,
            "limit": limit,
            "error": error_text,
        });
        println!("{}", log_json);
        anyhow::bail!("Quickwit returned status {}", status_code);
    }

    let search_resp: QuickwitSearchResponse = resp.json().await?;

    let log_json = serde_json::json!({
        "type": "quickwit_query",
        "timestamp": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Nanos, true),
        "duration_ms": duration_ms,
        "status_code": status_code,
        "index": index,
        "query": query,
        "offset": offset,
        "limit": limit,
        "num_hits": search_resp.num_hits,
    });
    println!("{}", log_json);

    Ok(search_resp.hits)
}

// ── patterns (drain) ─────────────────────────────────────────────────────────

const DRAIN_THRESHOLD: f64 = 0.4;
const DRAIN_MAX_CLUSTERS: usize = 1000;
const DRAIN_MAX_TOKEN_LEN: usize = 40;
const DRAIN_MAX_TOKENS: usize = 30;
const PATTERN_BUCKETS: usize = 20;
const PATTERN_BUCKET_SIZE: usize = 500;

#[derive(Deserialize)]
struct PatternRequest {
    index: String,
    query: String,
    #[serde(default)]
    field: String,
    #[serde(default)]
    top_n: usize,
    start_timestamp: Option<i64>,
    end_timestamp: Option<i64>,
}

#[derive(Serialize)]
struct PatternResult {
    template: String,
    count: usize,
    percentage: f64,
    sample: String,
}

#[derive(Serialize)]
struct PatternResponse {
    patterns: Vec<PatternResult>,
    total_logs: usize,
    total_clusters: usize,
}

struct LogCluster {
    tokens: Vec<String>,
    count: usize,
    sample: String,
}

struct DrainTree {
    by_len: std::collections::HashMap<usize, Vec<LogCluster>>,
    total: usize,
}

impl DrainTree {
    fn new() -> Self {
        Self { by_len: std::collections::HashMap::new(), total: 0 }
    }

    fn normalize_token(t: &str) -> String {
        if t.len() > DRAIN_MAX_TOKEN_LEN {
            return "<*>".to_string();
        }
        if Self::is_variable(t) {
            return "<*>".to_string();
        }
        t.to_string()
    }

    fn is_variable(t: &str) -> bool {
        // UUID: 8-4-4-4-12 hex groups
        let parts: Vec<&str> = t.split('-').collect();
        if parts.len() == 5 {
            let lens = [8, 4, 4, 4, 12];
            if parts.iter().zip(lens.iter()).all(|(p, &l)| p.len() == l && p.chars().all(|c| c.is_ascii_hexdigit())) {
                return true;
            }
        }
        // IP address (with optional port)
        let ip_part = t.split(':').next().unwrap_or(t);
        let ip_segs: Vec<&str> = ip_part.split('.').collect();
        if ip_segs.len() == 4 && ip_segs.iter().all(|s| s.parse::<u8>().is_ok()) {
            return true;
        }
        // Pure hex string of 8+ chars
        if t.len() >= 8 && t.chars().all(|c| c.is_ascii_hexdigit()) {
            return true;
        }
        // Number (integer or float, with optional suffix)
        let stripped = t.trim_end_matches(|c: char| c.is_alphabetic() || c == '%');
        if !stripped.is_empty() {
            let no_sign = stripped.trim_start_matches('-');
            if !no_sign.is_empty() && no_sign.chars().all(|c| c.is_ascii_digit() || c == '.' || c == ',') {
                return true;
            }
        }
        false
    }

    fn tokenize(line: &str) -> Vec<String> {
        let toks: Vec<String> = line.split_whitespace()
            .take(DRAIN_MAX_TOKENS)
            .map(Self::normalize_token)
            .collect();
        toks
    }

    fn similarity(template: &[String], tokens: &[String]) -> f64 {
        if template.len() != tokens.len() { return 0.0; }
        let matches = template.iter().zip(tokens.iter())
            .filter(|(t, tok)| t.as_str() == "<*>" || t == tok)
            .count();
        matches as f64 / template.len() as f64
    }

    fn add(&mut self, line: &str) {
        self.total += 1;
        let toks = Self::tokenize(line);
        if toks.is_empty() { return; }
        let len = toks.len();
        let candidates = self.by_len.entry(len).or_default();

        let best = candidates.iter_mut()
            .map(|c| {
                let sim = Self::similarity(&c.tokens, &toks);
                (sim, c as *mut LogCluster)
            })
            .filter(|(s, _)| *s >= DRAIN_THRESHOLD)
            .max_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

        if let Some((_, ptr)) = best {
            let cluster = unsafe { &mut *ptr };
            for (t, tok) in cluster.tokens.iter_mut().zip(toks.iter()) {
                if t.as_str() != "<*>" && t != tok {
                    *t = "<*>".to_string();
                }
            }
            cluster.count += 1;
        } else if candidates.len() < DRAIN_MAX_CLUSTERS {
            candidates.push(LogCluster { tokens: toks, count: 1, sample: line.to_string() });
        }
    }

    fn top_n(&self, n: usize) -> Vec<&LogCluster> {
        let mut all: Vec<&LogCluster> = self.by_len.values().flatten().collect();
        all.sort_by(|a, b| b.count.cmp(&a.count));
        all.truncate(n);
        all
    }

    fn total_clusters(&self) -> usize {
        self.by_len.values().map(|v| v.len()).sum()
    }
}

fn extract_field_text(hit: &serde_json::Map<String, serde_json::Value>, field: &str) -> String {
    if field == "_all" || field.is_empty() {
        let mut keys: Vec<&str> = hit.keys().map(|k| k.as_str()).collect();
        keys.sort_unstable();
        return keys.iter()
            .filter_map(|k| if let Some(Value::String(s)) = hit.get(*k) { Some(s.as_str()) } else { None })
            .collect::<Vec<_>>()
            .join(" ");
    }
    match hit.get(field) {
        Some(Value::String(s)) => s.clone(),
        Some(v) => v.to_string(),
        None => String::new(),
    }
}

async fn handle_patterns(
    State(state): State<AppState>,
    Json(req): Json<PatternRequest>,
) -> impl IntoResponse {
    let field = if req.field.is_empty() { "_all".to_string() } else { req.field.clone() };
    let top_n = if req.top_n == 0 { 10 } else { req.top_n };

    let all_hits: Vec<serde_json::Map<String, serde_json::Value>>;

    if let (Some(start), Some(end)) = (req.start_timestamp, req.end_timestamp) {
        let bucket_size = ((end - start) / PATTERN_BUCKETS as i64).max(1);
        let mut tasks = Vec::new();
        for i in 0..PATTERN_BUCKETS {
            let b_start = start + i as i64 * bucket_size;
            let b_end = if i == PATTERN_BUCKETS - 1 { end } else { b_start + bucket_size };
            let client = state.client.clone();
            let qw_url = state.config.quickwit_url.clone();
            let index = req.index.clone();
            let query = req.query.clone();
            tasks.push(tokio::spawn(async move {
                fetch_batch(&client, &qw_url, &index, &query, 0, PATTERN_BUCKET_SIZE, Some(b_start), Some(b_end)).await
            }));
        }
        let mut hits = Vec::new();
        for task in futures::future::join_all(tasks).await {
            match task {
                Ok(Ok(h)) => hits.extend(h),
                Ok(Err(e)) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
                Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
            }
        }
        all_hits = hits;
    } else {
        match fetch_batch(&state.client, &state.config.quickwit_url, &req.index, &req.query, 0, PATTERN_BUCKETS * PATTERN_BUCKET_SIZE, None, None).await {
            Ok(h) => all_hits = h,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        }
    }

    let mut tree = DrainTree::new();
    for hit in &all_hits {
        let text = extract_field_text(hit, &field);
        if !text.is_empty() {
            tree.add(&text);
        }
    }

    let total = tree.total;
    let total_clusters = tree.total_clusters();
    let top = tree.top_n(top_n);
    let patterns: Vec<PatternResult> = top.iter().map(|cl| {
        let pct = if total > 0 { (cl.count as f64 / total as f64 * 10000.0).round() / 100.0 } else { 0.0 };
        PatternResult { template: cl.tokens.join(" "), count: cl.count, percentage: pct, sample: cl.sample.clone() }
    }).collect();

    Json(PatternResponse { patterns, total_logs: total, total_clusters }).into_response()
}

fn format_value(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Null => "".to_string(),
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => b.to_string(),
        _ => v.to_string(),
    }
}

// Middleware to log Quickwit search query responses (timing + status + username)
async fn log_quickwit_query(mut req: Request, next: Next) -> Result<Response, StatusCode> {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let start_time = std::time::Instant::now();

    // Extract username from request extensions (set by auth_middleware)
    let username = req.extensions().get::<String>().cloned();

    // Extract query from request body for logging
    let mut query_string: Option<String> = None;
    if method == Method::POST && uri.path().contains("/api/v1/") && uri.path().contains("/search") {
        let body = std::mem::take(req.body_mut());
        if let Ok(body_bytes) = to_bytes(body, usize::MAX).await {
            if let Ok(body_json) = serde_json::from_slice::<Value>(&body_bytes) {
                if let Some(query) = body_json.get("query").and_then(|q| q.as_str()) {
                    query_string = Some(query.to_string());
                }
            }
            // Put body back
            *req.body_mut() = Body::from(body_bytes);
        }
    }

    // Call the next middleware
    let response = next.run(req).await;
    let duration_ms = start_time.elapsed().as_millis();

    // Log response for search queries only (not the request)
    if method == Method::POST && uri.path().contains("/api/v1/") && uri.path().contains("/search") {
        let status = response.status();
        if let Some(query) = query_string {
            let user_field = username.as_deref().unwrap_or("anonymous");

            let log_json = serde_json::json!({
                "type": "quickwit_query",
                "timestamp": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Nanos, true),
                "duration_ms": duration_ms,
                "status_code": status.as_u16(),
                "path": uri.path(),
                "username": user_field,
                "query": query,
            });

            println!("{}", log_json);
        }
    }

    Ok(response)
}

async fn smart_proxy_middleware(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let (mut parts, body) = req.into_parts();
    let path = parts.uri.path().to_string();

    // Route ingest requests to indexer if configured
    if parts.method == Method::POST && path.contains("/ingest") {
        if let Some(indexer_url) = &state.config.quickwit_indexer_url {
            let body_bytes = match to_bytes(body, usize::MAX).await {
                Ok(b) => b,
                Err(_) => return Err(StatusCode::PAYLOAD_TOO_LARGE),
            };

            let indexer_endpoint = format!(
                "{}/{}",
                indexer_url.trim_end_matches('/'),
                path.trim_start_matches('/')
            );

            info!("Routing ingest request to indexer: {}", indexer_endpoint);

            match state.client.post(&indexer_endpoint)
                .headers(parts.headers.clone())
                .body(body_bytes)
                .send()
                .await
            {
                Ok(resp) => {
                    let status = resp.status();
                    let body = match resp.bytes().await {
                        Ok(b) => Body::from(b),
                        Err(_) => Body::from(""),
                    };
                    info!("Ingest response from indexer: {}", status);
                    return Ok(Response::builder()
                        .status(status)
                        .body(body)
                        .unwrap_or_else(|_| Response::new(Body::from(""))));
                }
                Err(e) => {
                    error!("Failed to forward ingest to indexer: {}", e);
                    return Err(StatusCode::BAD_GATEWAY);
                }
            }
        }
    }

    // --- PRE-HANDLER PHASE: Extract and Remove Trigger Field ---

    // 1. Consume the body bytes
    let body_bytes = match to_bytes(body, usize::MAX).await {
        Ok(b) => b,
        Err(_) => return Err(StatusCode::PAYLOAD_TOO_LARGE),
    };

    // 2. Attempt to parse the body as mutable JSON
    let mut body_json: Value = match serde_json::from_slice(&body_bytes) {
        Ok(v) => v,
        // If the body isn't valid JSON, proceed but store no trigger value
        Err(_) => {
            // Put the original (invalid) body back and continue to handler
            let req = Request::from_parts(parts, Body::from(body_bytes));
            return Ok(next.run(req).await);
        }
    };

    let mut trigger_value: Option<String> = None;

    // 3. Check for, extract, and REMOVE the "trigger" field
    if let Some(map) = body_json.as_object_mut() {
        if let Some(removed_value) = map.remove("vrl") {
            // Extract the value before it's dropped/removed
            if let Some(trigger_val) = removed_value.as_str() {
                trigger_value = Some(trigger_val.to_owned());

                let rfn = vrl::stdlib::all();
                let rvlr = vrl::compiler::compile(&trigger_val, &rfn);
                match rvlr {
                    Ok(_) => {
                        // Store the trigger value in request extensions for POST-HANDLER use
                        parts.extensions.insert(trigger_value.clone());
                        println!("Middleware removed and stored trigger: '{}'", trigger_val);
                    }
                    Err(e) => {
                        trigger_value = None;
                        error!("Middleware failed to compile trigger: {:?}", e);
                    }
                }
            }
        }
    }

    // 4. Reserialize the MODIFIED JSON (without the "trigger" field) back to bytes
    let modified_json_string = body_json.to_string();
    let modified_body_bytes = Bytes::from(modified_json_string);

    // Update Content-Length header
    parts.headers.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from(modified_body_bytes.len()),
    );

    // 5. Replace the consumed body with the new, modified body
    req = Request::from_parts(parts, Body::from(modified_body_bytes));

    // 6. Call the inner service/handler (which now receives the cleaner body)
    let mut response = next.run(req).await;

    // --- POST-HANDLER PHASE: Modify Response if Triggered ---

    // Check if a trigger value was stored in the PRE-HANDLER phase
    if let Some(val) = trigger_value {
        // 7. Check if the response has a JSON Content-Type and read the response body
        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|h| h.to_str().ok());

        if content_type.is_some() && content_type.unwrap().starts_with("application/json") {
            // Consume the response body bytes
            let response_body = std::mem::take(response.body_mut());
            let res_bytes = match to_bytes(response_body, usize::MAX).await {
                Ok(b) => b,
                Err(_) => return Ok(response), // Cannot read response body, send original
            };

            // Attempt to parse the response body as JSON
            if let Ok(mut res_json) = serde_json::from_slice::<Value>(&res_bytes) {
                // 8. Modify the response JSON
                let mut vrl_duration = None;
                let mut vrl_error = None;
                if let Some(_obj) = res_json.as_object_mut() {
                    if let Some(hits) = res_json.get_mut("hits").and_then(|h| h.as_array_mut()) {
                        let fnc = vrl::stdlib::all();
                        let vlr = vrl::compiler::compile(&val, &fnc).unwrap(); // We checked that it's valid in the request phase.

                        let start = std::time::Instant::now();
                        for hit in hits {
                            // Convert serde_json::Value -> vrl::value::Value
                            let vrl_value = vrl::value::Value::from(hit.clone());
                            let metadata = vrl::value::Value::Object(Default::default());
                            let secrets = vrl::value::Secrets::new();
                            let mut target = vrl::compiler::TargetValue {
                                value: vrl_value,
                                metadata: metadata,
                                secrets: secrets,
                            };
                            // Run program
                            let mut state = RuntimeState::default();
                            let timezone = TimeZone::default();
                            let mut ctx = Context::new(&mut target, &mut state, &timezone);
                            let r = vlr.program.resolve(&mut ctx);
                            match r {
                                Ok(_) => {
                                    *hit = serde_json::to_value(&target.value).unwrap();
                                }
                                Err(e) => {
                                    vrl_error = Some(e.to_string());
                                }
                            }
                        }
                        vrl_duration = Some(start.elapsed());
                    }
                }

                if let Some(duration) = vrl_duration {
                    if let Some(obj) = res_json.as_object_mut() {
                        obj.insert(
                            "vrl_time".to_string(),
                            serde_json::json!(duration.as_micros() as u64),
                        );
                    }
                }

                if let Some(err) = vrl_error {
                    if let Some(obj) = res_json.as_object_mut() {
                        obj.insert("vrl_error".to_string(), serde_json::json!(err));
                    }
                }

                // 9. Replace the response body with the modified JSON
                let modified_bytes = Bytes::from(res_json.to_string());
                let modified_len = modified_bytes.len();
                *response.body_mut() = Body::from(modified_bytes);

                // Ensure content-length is updated (optional, but good practice)
                if let Some(len) = response.headers_mut().get_mut(header::CONTENT_LENGTH) {
                    *len = HeaderValue::from_str(&modified_len.to_string()).unwrap();
                }
                return Ok(response);
            }
        }
    }

    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn return_path_keeps_a_search_link() {
        let link = "/?index=logs&query=level:error&from=now-15m&to=now&filters=%5B%5D";
        assert_eq!(safe_return_path(link), Some(link));
        assert_eq!(safe_return_path("/"), Some("/"));
        // A backslash in the query string is data, not a path separator.
        assert_eq!(safe_return_path(r"/?query=a\b"), Some(r"/?query=a\b"));
    }

    #[test]
    fn return_path_refuses_other_origins() {
        for hostile in [
            "https://evil.example/",
            "//evil.example",
            r"/\evil.example",
            "/\t/evil.example",
            "/\n/evil.example",
            "evil.example",
            "",
            "/caf\u{e9}",
        ] {
            assert_eq!(safe_return_path(hostile), None, "accepted {hostile:?}");
        }
    }

    #[test]
    fn return_path_is_capped() {
        let long = format!("/?query={}", "a".repeat(MAX_RETURN_PATH_LEN));
        assert_eq!(safe_return_path(&long), None);
    }
}
