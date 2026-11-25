//! OIDC provider access: discovery in the background, an optional internal
//! URL for the provider, and an optional extra CA.
//!
//! The browser and qwui do not always reach the provider the same way. In a
//! Kubernetes cluster the issuer is often a public (or VPN-only) URL that the
//! pod cannot resolve, while the provider is reachable in-cluster through its
//! Service, usually with a certificate from a private CA. So:
//!
//! - `OIDC_ISSUER` stays the identity of the provider: the `iss` of its
//!   tokens, the base of the discovery document, and the URLs the browser is
//!   sent to (authorization, logout), which qwui never fetches itself.
//! - `OIDC_INTERNAL_URL`, when set, replaces the `OIDC_ISSUER` prefix of every
//!   URL qwui fetches itself (discovery, token, JWKS). The discovery document
//!   still announces the public issuer, so the issuer check passes, and its
//!   endpoints are public URLs, so the same rewrite catches them.
//! - `OIDC_CA_FILE`, when set, is a PEM bundle trusted in addition to the
//!   system CAs for those requests.
//!
//! Discovery runs in a background task with a backoff, so a provider that is
//! down at startup no longer crashes qwui: `/ready` answers 503 and `/login`
//! asks to retry until it succeeds.

use anyhow::{bail, Context, Result};
use openidconnect::{
    core::{CoreClient, CoreProviderMetadata},
    http as oidc_http, ClientId, ClientSecret, HttpRequest, HttpResponse, IssuerUrl, RedirectUrl,
};
use serde_json::Value;
use std::{
    fmt,
    sync::{Arc, OnceLock},
    time::Duration,
};
use tracing::{error, info};

const HTTP_TIMEOUT: Duration = Duration::from_secs(30);
const FIRST_RETRY: Duration = Duration::from_secs(2);
const MAX_RETRY: Duration = Duration::from_secs(60);

/// What discovery produced; set once, read by the auth handlers.
pub struct Provider {
    pub client: CoreClient,
    /// RP-initiated logout endpoint (a browser URL, never rewritten). None
    /// when the provider does not advertise one.
    pub end_session: Option<String>,
}

/// Empty until discovery succeeds.
pub type ProviderCell = Arc<OnceLock<Provider>>;

#[derive(Debug)]
pub struct HttpError(String);

impl fmt::Display for HttpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for HttpError {}

/// HTTP client for qwui's own calls to the provider.
#[derive(Clone)]
pub struct OidcHttp {
    client: reqwest::Client,
    issuer: String,
    internal: Option<String>,
}

impl OidcHttp {
    pub fn new(issuer: &str, internal: Option<&str>, ca_file: Option<&str>) -> Result<Self> {
        // No redirects: the openidconnect crate requires it (a redirect could
        // send the token request, with the client secret, elsewhere).
        let mut builder = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(HTTP_TIMEOUT);
        if let Some(path) = ca_file {
            for cert in load_ca_bundle(path)? {
                builder = builder.add_root_certificate(cert);
            }
        }
        Ok(Self {
            client: builder.build()?,
            issuer: issuer.trim_end_matches('/').to_string(),
            internal: internal.map(|u| u.trim_end_matches('/').to_string()),
        })
    }

    /// `url` with the issuer prefix replaced by the internal URL. Only a whole
    /// prefix matches (the issuer itself, or followed by `/` or `?`), so
    /// `https://issuer.example.com.evil/` is left alone.
    pub fn rewrite(&self, url: &str) -> String {
        let Some(internal) = &self.internal else {
            return url.to_string();
        };
        match url.strip_prefix(&self.issuer) {
            Some(rest) if rest.is_empty() || rest.starts_with('/') || rest.starts_with('?') => {
                format!("{internal}{rest}")
            }
            _ => url.to_string(),
        }
    }

    /// The openidconnect crate's HTTP client contract, on reqwest 0.12.
    pub async fn execute(&self, req: HttpRequest) -> Result<HttpResponse, HttpError> {
        let url = self.rewrite(req.url.as_str());
        let method = reqwest::Method::from_bytes(req.method.as_str().as_bytes())
            .map_err(|e| HttpError(format!("method: {e}")))?;
        let mut builder = self.client.request(method, &url).body(req.body);
        for (name, value) in req.headers.iter() {
            builder = builder.header(name.as_str(), value.as_bytes());
        }
        let resp = builder
            .send()
            .await
            .map_err(|e| HttpError(format!("{url}: {e}")))?;

        let status_code = oidc_http::StatusCode::from_u16(resp.status().as_u16())
            .map_err(|e| HttpError(format!("status: {e}")))?;
        let mut headers = oidc_http::HeaderMap::new();
        for (name, value) in resp.headers() {
            if let (Ok(n), Ok(v)) = (
                oidc_http::header::HeaderName::from_bytes(name.as_str().as_bytes()),
                oidc_http::header::HeaderValue::from_bytes(value.as_bytes()),
            ) {
                headers.append(n, v);
            }
        }
        let body = resp
            .bytes()
            .await
            .map_err(|e| HttpError(format!("{url}: {e}")))?
            .to_vec();
        Ok(HttpResponse {
            status_code,
            headers,
            body,
        })
    }

    async fn get_json(&self, url: &str) -> Result<Value> {
        let url = self.rewrite(url);
        let resp = self.client.get(&url).send().await?.error_for_status()?;
        Ok(resp.json().await?)
    }
}

/// Every certificate of a PEM bundle; an unreadable file or one without any
/// certificate is a configuration error.
pub fn load_ca_bundle(path: &str) -> Result<Vec<reqwest::Certificate>> {
    let pem = std::fs::read(path).with_context(|| format!("OIDC_CA_FILE {path}"))?;
    let certs = reqwest::Certificate::from_pem_bundle(&pem)
        .with_context(|| format!("OIDC_CA_FILE {path}: invalid PEM"))?;
    if certs.is_empty() {
        bail!("OIDC_CA_FILE {path}: no certificate found");
    }
    Ok(certs)
}

/// Settings checked before the server starts: a bad URL is a configuration
/// error, not something to retry.
#[derive(Clone)]
pub struct Settings {
    pub issuer: IssuerUrl,
    pub redirect: RedirectUrl,
    pub client_id: String,
    pub client_secret: String,
}

impl Settings {
    pub fn new(issuer: &str, redirect: &str, client_id: &str, client_secret: &str) -> Result<Self> {
        Ok(Self {
            issuer: IssuerUrl::new(issuer.to_string()).context("OIDC_ISSUER")?,
            redirect: RedirectUrl::new(redirect.to_string()).context("OIDC_REDIRECT_URL")?,
            client_id: client_id.to_string(),
            client_secret: client_secret.to_string(),
        })
    }
}

pub async fn discover(settings: &Settings, http: &OidcHttp) -> Result<Provider> {
    let h = http.clone();
    let metadata = CoreProviderMetadata::discover_async(settings.issuer.clone(), move |req| {
        let h = h.clone();
        async move { h.execute(req).await }
    })
    .await?;

    let client = CoreClient::from_provider_metadata(
        metadata,
        ClientId::new(settings.client_id.clone()),
        Some(ClientSecret::new(settings.client_secret.clone())),
    )
    .set_redirect_uri(settings.redirect.clone());

    // CoreProviderMetadata does not surface end_session_endpoint, so read it
    // from the discovery document. Optional: without it, logout only clears
    // the local session.
    let discovery_url = format!(
        "{}/.well-known/openid-configuration",
        settings.issuer.as_str().trim_end_matches('/')
    );
    let end_session = match http.get_json(&discovery_url).await {
        Ok(doc) => doc
            .get("end_session_endpoint")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        Err(e) => {
            error!("Could not read end_session_endpoint from the discovery document: {e}");
            None
        }
    };

    Ok(Provider {
        client,
        end_session,
    })
}

/// Discovers in the background until it succeeds, then fills `cell`.
pub fn spawn_discovery(settings: Settings, http: OidcHttp, cell: ProviderCell) {
    tokio::spawn(async move {
        let mut delay = FIRST_RETRY;
        loop {
            match discover(&settings, &http).await {
                Ok(provider) => {
                    info!("OIDC provider discovered: {}", settings.issuer.as_str());
                    match &provider.end_session {
                        Some(url) => info!("RP-initiated logout available: {url}"),
                        None => error!(
                            "Provider advertises no end_session_endpoint: logout will only clear \
                             the local session, the provider SSO session will survive"
                        ),
                    }
                    let _ = cell.set(provider);
                    return;
                }
                Err(e) => {
                    error!(
                        "OIDC discovery of {} failed, retrying in {}s: {e:#}",
                        settings.issuer.as_str(),
                        delay.as_secs()
                    );
                    tokio::time::sleep(delay).await;
                    delay = (delay * 2).min(MAX_RETRY);
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn http(internal: Option<&str>) -> OidcHttp {
        OidcHttp::new("https://sso.example.com/api/dex/", internal, None).unwrap()
    }

    #[test]
    fn rewrite_replaces_the_issuer_prefix() {
        let h = http(Some("https://dex.argocd.svc:5556/api/dex/"));
        assert_eq!(
            h.rewrite("https://sso.example.com/api/dex/.well-known/openid-configuration"),
            "https://dex.argocd.svc:5556/api/dex/.well-known/openid-configuration"
        );
        assert_eq!(
            h.rewrite("https://sso.example.com/api/dex/token"),
            "https://dex.argocd.svc:5556/api/dex/token"
        );
        assert_eq!(
            h.rewrite("https://sso.example.com/api/dex"),
            "https://dex.argocd.svc:5556/api/dex"
        );
        assert_eq!(
            h.rewrite("https://sso.example.com/api/dex?x=1"),
            "https://dex.argocd.svc:5556/api/dex?x=1"
        );
    }

    #[test]
    fn rewrite_leaves_other_urls_alone() {
        let h = http(Some("https://dex.argocd.svc:5556/api/dex"));
        for url in [
            "https://sso.example.com/api/dexterity/token",
            "https://sso.example.com.evil/api/dex/token",
            "https://other.example.com/api/dex/token",
            "http://sso.example.com/api/dex/token",
        ] {
            assert_eq!(h.rewrite(url), url);
        }
    }

    #[test]
    fn rewrite_is_a_no_op_without_internal_url() {
        let h = http(None);
        let url = "https://sso.example.com/api/dex/token";
        assert_eq!(h.rewrite(url), url);
    }

    #[test]
    fn ca_bundle_errors() {
        assert!(load_ca_bundle("/nonexistent/ca.crt").is_err());
        let dir = std::env::temp_dir().join(format!("qwui-ca-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let empty = dir.join("empty.pem");
        std::fs::write(&empty, "not a certificate\n").unwrap();
        assert!(load_ca_bundle(empty.to_str().unwrap()).is_err());
    }

    #[test]
    fn ca_bundle_loads_a_pem_certificate() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/src/testdata/ca.pem");
        assert_eq!(load_ca_bundle(path).unwrap().len(), 1);
        assert!(OidcHttp::new("https://sso.example.com", None, Some(path)).is_ok());
    }

    /// A provider whose documents name the public issuer, served on a local
    /// port that only OIDC_INTERNAL_URL points to.
    async fn fake_provider(listener: tokio::net::TcpListener, issuer: &'static str) {
        use axum::{routing::get, Json, Router};
        let app = Router::new()
            .route(
                "/dex/.well-known/openid-configuration",
                get(move || async move {
                    Json(serde_json::json!({
                        "issuer": issuer,
                        "authorization_endpoint": format!("{issuer}/auth"),
                        "token_endpoint": format!("{issuer}/token"),
                        "jwks_uri": format!("{issuer}/keys"),
                        "end_session_endpoint": format!("{issuer}/logout"),
                        "response_types_supported": ["code"],
                        "subject_types_supported": ["public"],
                        "id_token_signing_alg_values_supported": ["RS256"],
                    }))
                }),
            )
            .route("/dex/keys", get(|| async { Json(serde_json::json!({ "keys": [] })) }));
        axum::serve(listener, app).await.unwrap();
    }

    const ISSUER: &str = "https://sso.example.invalid/dex";

    fn settings() -> Settings {
        Settings::new(ISSUER, "https://qwui.example.invalid/auth/callback", "qwui", "secret")
            .unwrap()
    }

    #[tokio::test]
    async fn discovery_goes_through_the_internal_url() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let internal = format!("http://{}/dex", listener.local_addr().unwrap());
        tokio::spawn(fake_provider(listener, ISSUER));

        let http = OidcHttp::new(ISSUER, Some(&internal), None).unwrap();
        let provider = discover(&settings(), &http).await.unwrap();
        // Browser-facing URLs stay public.
        assert_eq!(
            provider.end_session.as_deref(),
            Some("https://sso.example.invalid/dex/logout")
        );
        let (auth_url, _, _) = provider
            .client
            .authorize_url(
                openidconnect::AuthenticationFlow::<openidconnect::core::CoreResponseType>::AuthorizationCode,
                openidconnect::CsrfToken::new_random,
                openidconnect::Nonce::new_random,
            )
            .url();
        assert!(auth_url.as_str().starts_with("https://sso.example.invalid/dex/auth?"));
    }

    #[tokio::test]
    async fn discovery_fails_without_the_internal_url() {
        let http = OidcHttp::new(ISSUER, None, None).unwrap();
        assert!(discover(&settings(), &http).await.is_err());
    }

    #[tokio::test]
    async fn background_discovery_retries_until_the_provider_is_up() {
        // Reserve a port, release it: the provider is down at first.
        let addr = std::net::TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap();
        let internal = format!("http://{addr}/dex");
        let http = OidcHttp::new(ISSUER, Some(&internal), None).unwrap();
        let cell: ProviderCell = Default::default();
        spawn_discovery(settings(), http, cell.clone());

        tokio::time::sleep(Duration::from_millis(500)).await;
        assert!(cell.get().is_none(), "no provider yet");

        let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
        tokio::spawn(fake_provider(listener, ISSUER));
        for _ in 0..100 {
            if cell.get().is_some() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        panic!("discovery did not succeed after the provider came up");
    }

    #[test]
    fn settings_reject_bad_urls() {
        assert!(Settings::new("not a url", "https://q/auth/callback", "id", "s").is_err());
        assert!(Settings::new("https://sso.example.com", "nope", "id", "s").is_err());
        assert!(Settings::new("https://sso.example.com", "https://q/auth/callback", "id", "s").is_ok());
    }
}
