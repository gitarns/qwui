package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/csv"
	"encoding/gob"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"

	"github.com/joho/godotenv"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/oauth2"
)

type Config struct {
	Port          string
	QuickwitURL   string
	MaxExportDocs int
	OIDCEnabled   bool
	OIDCClientID  string
	OIDCSecret    string
	OIDCIssuer    string
	OIDCRedirect  string
	SessionSecret string
	LogLevel      string
	Origin        string
}

// responseWriter wraps http.ResponseWriter to capture status code
type responseWriter struct {
	http.ResponseWriter
	statusCode int
	written    bool
}

func (w *responseWriter) WriteHeader(code int) {
	if !w.written {
		w.statusCode = code
		w.written = true
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *responseWriter) Write(b []byte) (int, error) {
	if !w.written {
		w.statusCode = http.StatusOK
		w.written = true
	}
	return w.ResponseWriter.Write(b)
}

type QuickwitSearchRequest struct {
	Query          string                 `json:"query"`
	MaxHits        int                    `json:"max_hits"`
	Aggs           map[string]interface{} `json:"aggs,omitempty"`
	StartOffset    int                    `json:"start_offset,omitempty"`
	SearchField    string                 `json:"search_field,omitempty"`
	StartTimestamp *int64                 `json:"start_timestamp,omitempty"`
	EndTimestamp   *int64                 `json:"end_timestamp,omitempty"`
}

type QuickwitSearchResponse struct {
	Hits              []map[string]interface{} `json:"hits"`
	NumHits           int                      `json:"num_hits"`
	ElapsedTimeMicros int64                    `json:"elapsed_time_micros"`
}

type CSVExportRequest struct {
	Index          string   `json:"index"`
	Query          string   `json:"query"`
	Columns        []string `json:"columns"`
	MaxDocs        int      `json:"max_docs"`
	StartTime      *int64   `json:"start_timestamp,omitempty"`
	EndTime        *int64   `json:"end_timestamp,omitempty"`
	TimestampField string   `json:"timestamp_field"`
}

var config Config

// httpClient disables keep-alives so each request gets a new TCP connection,
// ensuring proper load-balancing across Kubernetes service endpoints.
var httpClient = &http.Client{
	Transport: &http.Transport{
		DisableKeepAlives: true,
	},
}

func main() {
	// Load .env file if it exists
	_ = godotenv.Load()

	config = Config{
		Port:          getEnv("PORT", "8080"),
		QuickwitURL:   getEnv("QUICKWIT_URL", "http://localhost:7280"),
		MaxExportDocs: 10000,
		OIDCEnabled:   getEnv("OIDC_ENABLED", "false") == "true",
		OIDCClientID:  getEnv("OIDC_CLIENT_ID", ""),
		OIDCSecret:    getEnv("OIDC_CLIENT_SECRET", ""),
		OIDCIssuer:    getEnv("OIDC_ISSUER", ""),
		OIDCRedirect:  getEnv("OIDC_REDIRECT_URL", ""),
		LogLevel:      getEnv("LOG_LEVEL", "info"),
		Origin:        getEnv("ORIGIN", "*"),
	}

	// Set log level
	lv, err := zerolog.ParseLevel(config.LogLevel)
	if err != nil {
		log.Warn().Str("level", config.LogLevel).Msg("Invalid log level, using info")
		lv = zerolog.InfoLevel
	}

	// Configure zerolog to output ONLY JSON (no timestamp, level prefix, etc.)
	log.Logger = log.Output(os.Stdout)
	zerolog.SetGlobalLevel(lv)

	now := time.Now().UTC().Format(time.RFC3339Nano)
	if b, err := json.Marshal(map[string]interface{}{"type": "startup", "timestamp": now, "message": "Logging configured", "log_level": lv.String()}); err == nil {
		fmt.Println(string(b))
	}

	if b, err := json.Marshal(map[string]interface{}{"type": "startup", "timestamp": now, "message": "Starting server", "port": config.Port}); err == nil {
		fmt.Println(string(b))
	}
	if b, err := json.Marshal(map[string]interface{}{"type": "startup", "timestamp": now, "message": "Quickwit URL", "url": config.QuickwitURL}); err == nil {
		fmt.Println(string(b))
	}
	if b, err := json.Marshal(map[string]interface{}{"type": "startup", "timestamp": now, "message": "OIDC Enabled", "value": config.OIDCEnabled}); err == nil {
		fmt.Println(string(b))
	}

	// Parse Quickwit URL for reverse proxy
	quickwitURL, err := url.Parse(config.QuickwitURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Invalid QUICKWIT_URL")
	}

	// Test connection to Quickwit
	if err := testQuickwitConnection(); err != nil {
		log.Fatal().Err(err).Msg("Cannot connect to Quickwit")
	} else {
		now := time.Now().UTC().Format(time.RFC3339Nano)
		if b, err := json.Marshal(map[string]interface{}{"type": "startup", "timestamp": now, "message": "Successfully connected to Quickwit"}); err == nil {
			fmt.Println(string(b))
		}
	}

	// Initialize Gin without default logger
	r := gin.New()
	// Add custom logger that only logs at debug level
	r.Use(func(c *gin.Context) {
		startTime := time.Now()
		c.Next()
		duration := time.Since(startTime)

		// Only log HTTP requests at debug level
		log.Debug().
			Str("method", c.Request.Method).
			Str("path", c.Request.URL.Path).
			Int("status", c.Writer.Status()).
			Int64("duration_ms", duration.Milliseconds()).
			Msg("HTTP request")
	})
	r.Use(CORSMiddleware(config.Origin))

	// Setup Session Store
	sessionSecret := getEnv("SESSION_SECRET", "super-secret-key-must-be-32-bytes-long!")
	// Ensure 32 bytes
	if len(sessionSecret) < 32 {
		sessionSecret = fmt.Sprintf("%-32s", sessionSecret)[:32]
	}

	// Register types for session
	gob.Register(map[string]interface{}{})
	gob.Register(time.Time{})
	gob.Register(oauth2.Token{})
	// Register User struct
	type User struct {
		Email string `json:"email"`
		Name  string `json:"name"`
		Sub   string `json:"sub"`
	}
	gob.Register(User{})

	store := cookie.NewStore([]byte(sessionSecret))
	// Set cookie options
	store.Options(sessions.Options{
		Path:     "/",
		MaxAge:   86400 * 7,
		HttpOnly: true,
		Secure:   false, // Set to true if using HTTPS
		SameSite: http.SameSiteLaxMode,
	})

	r.Use(sessions.Sessions("qwui_session_v3", store))

	api := r.Group("/api")
	api.Use(CORSMiddleware(config.Origin))

	// Proxy handler with timing and structured logging
	proxy := httputil.NewSingleHostReverseProxy(quickwitURL)

	proxyHandler := func(c *gin.Context) {
		startTime := time.Now()
		originalPath := c.Request.URL.Path
		c.Request.URL.Path = strings.TrimPrefix(c.Request.URL.Path, "/quickwit")

		// Extract username from session
		username := "anonymous"
		session := sessions.Default(c)
		if userEmail, ok := session.Get("email").(string); ok && userEmail != "" {
			username = userEmail
		}

		var request QuickwitSearchRequest
		var requestParsed bool
		var queryIndex string

		// Extract index from path (format: /api/v1/{index}/search)
		pathParts := strings.Split(strings.TrimPrefix(c.Request.URL.Path, "/api/v1/"), "/")
		if len(pathParts) > 0 {
			queryIndex = pathParts[0]
		}

		if c.Request.Body != nil {
			bodyBytes, err := io.ReadAll(c.Request.Body)
			if err == nil {
				unmarshalErr := json.Unmarshal(bodyBytes, &request)
				if unmarshalErr == nil {
					requestParsed = true
					parts := splitQueryByPipe(request.Query)
					if len(parts) > 1 {
						request.Query = parts[0]
						// Re-marshal the modified request
						newBodyBytes, marshalErr := json.Marshal(request)
						if marshalErr == nil {
							bodyBytes = newBodyBytes
							// Update Content-Length header since body size changed
							c.Request.ContentLength = int64(len(bodyBytes))
							c.Request.Header.Set("Content-Length", strconv.Itoa(len(bodyBytes)))
						} else {
							log.Error().Err(marshalErr).Msg("Failed to re-marshal QuickwitSearchRequest")
						}
					}
				} else {
					log.Debug().Err(unmarshalErr).Msg("Could not unmarshal request body to QuickwitSearchRequest")
				}
				c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
			} else {
				log.Error().Err(err).Msg("Failed to read request body for proxy")
			}
		}

		// Wrap response writer to capture status and errors
		wrappedWriter := &responseWriter{ResponseWriter: c.Writer, statusCode: http.StatusOK}

		// Call the proxy
		proxy.ServeHTTP(wrappedWriter, c.Request)

		// Log query with timing in JSON format
		duration := time.Since(startTime)
		logEntry := map[string]interface{}{
			"type":           "quickwit_query",
			"timestamp":      startTime.Format(time.RFC3339Nano),
			"duration_ms":    duration.Milliseconds(),
			"status_code":    wrappedWriter.statusCode,
			"username":       username,
			"path":           originalPath,
			"method":         c.Request.Method,
		}

		if queryIndex != "" {
			logEntry["index"] = queryIndex
		}

		if requestParsed {
			logEntry["query"] = request.Query
			logEntry["max_hits"] = request.MaxHits
		}

		// Determine log level based on status code
		logEvent := log.Info()
		if wrappedWriter.statusCode >= 400 {
			logEvent = log.Error()
			logEntry["error"] = true
		}

		logEvent.Interface("query_log", logEntry).Send()
	}

	rproxy := r.Group("/quickwit")
	rproxy.Use(CORSMiddleware(config.Origin))
	rproxy.Any("/api/v1/*path", proxyHandler)

	// OIDC Setup
	if config.OIDCEnabled {
		if config.OIDCClientID == "" || config.OIDCSecret == "" || config.OIDCIssuer == "" || config.OIDCRedirect == "" {
			log.Fatal().Msg("OIDC is enabled but missing configuration (CLIENT_ID, SECRET, ISSUER, REDIRECT_URL)")
		}

		ctx := context.Background()
		provider, err := oidc.NewProvider(ctx, config.OIDCIssuer)
		if err != nil {
			log.Fatal().Err(err).Msg("Failed to get OIDC provider")
		}

		oauth2Config := oauth2.Config{
			ClientID:     config.OIDCClientID,
			ClientSecret: config.OIDCSecret,
			RedirectURL:  config.OIDCRedirect,
			Endpoint:     provider.Endpoint(),
			Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
		}

		verifier := provider.Verifier(&oidc.Config{ClientID: config.OIDCClientID})

		// Login endpoint
		r.GET("/login", func(c *gin.Context) {
			state, err := generateSecret(16)
			if err != nil {
				c.String(http.StatusInternalServerError, "Failed to generate state")
				return
			}
			stateStr := fmt.Sprintf("%x", state)

			session := sessions.Default(c)
			session.Set("oidc_state", stateStr)
			if err := session.Save(); err != nil {
				log.Error().Err(err).Msg("Failed to save session state")
				c.String(http.StatusInternalServerError, "Failed to save session")
				return
			}

			c.Redirect(http.StatusFound, oauth2Config.AuthCodeURL(stateStr))
		})

		// Callback endpoint
		r.GET("/auth/callback", func(c *gin.Context) {
			session := sessions.Default(c)
			state := session.Get("oidc_state")
			if state == nil {
				log.Warn().Msg("State not found in session during callback, redirecting to logout")
				c.Redirect(http.StatusFound, "/logout")
				return
			}

			if c.Query("state") != state.(string) {
				c.String(http.StatusBadRequest, "State mismatch")
				return
			}

			oauth2Token, err := oauth2Config.Exchange(c.Request.Context(), c.Query("code"))
			if err != nil {
				c.String(http.StatusInternalServerError, "Failed to exchange token: "+err.Error())
				return
			}

			rawIDToken, ok := oauth2Token.Extra("id_token").(string)
			if !ok {
				c.String(http.StatusInternalServerError, "No id_token field in oauth2 token")
				return
			}

			idToken, err := verifier.Verify(c.Request.Context(), rawIDToken)
			if err != nil {
				c.String(http.StatusInternalServerError, "Failed to verify ID Token: "+err.Error())
				return
			}

			var claims struct {
				Email string `json:"email"`
				Name  string `json:"name"`
				Sub   string `json:"sub"`
			}
			if err := idToken.Claims(&claims); err != nil {
				c.String(http.StatusInternalServerError, "Failed to parse claims: "+err.Error())
				return
			}

			user := User{
				Email: claims.Email,
				Name:  claims.Name,
				Sub:   claims.Sub,
			}

			session.Set("user", user)
			session.Delete("oidc_state") // Cleanup state
			if err := session.Save(); err != nil {
				log.Error().Err(err).Msg("Failed to save user in session")
				c.String(http.StatusInternalServerError, "Failed to save session")
				return
			}

			log.Info().Interface("user", user).Msg("User logged in successfully")
			c.Redirect(http.StatusFound, "/")
		})

		r.GET("/logout", func(c *gin.Context) {
			session := sessions.Default(c)
			session.Clear()
			session.Save()
			c.Redirect(http.StatusFound, "/")
		})

		// Public auth status endpoint
		api.GET("/auth/status", func(c *gin.Context) {
			session := sessions.Default(c)
			userVal := session.Get("user")

			status := gin.H{
				"oidc_enabled":  true,
				"authenticated": userVal != nil,
				"user":          nil,
				"features":      gin.H{"vrl": false},
			}

			if userVal != nil {
				if user, ok := userVal.(User); ok {
					status["user"] = gin.H{
						"email": user.Email,
						"name":  user.Name,
					}
				}
			}

			c.JSON(http.StatusOK, status)
		})

		r.GET("/user-info", func(c *gin.Context) {
			session := sessions.Default(c)
			userVal := session.Get("user")
			if userVal == nil {
				c.JSON(http.StatusOK, gin.H{
					"sub":  "anonymous",
					"name": "Anonymous User",
				})
				return
			}

			if user, ok := userVal.(User); ok {
				c.JSON(http.StatusOK, gin.H{
					"sub":   user.Sub,
					"name":  user.Name,
					"email": user.Email,
				})
			} else {
				c.Status(http.StatusInternalServerError)
			}
		})

		// Auth Middleware
		authMiddleware := func(c *gin.Context) {
			session := sessions.Default(c)
			user := session.Get("user")
			if user == nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
				return
			}
			c.Next()
		}

		// Protect all other API endpoints
		api.Use(authMiddleware)
		rproxy.Use(authMiddleware)

	} else {
		// OIDC Disabled - Public status endpoint
		api.GET("/auth/status", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"oidc_enabled":  false,
				"authenticated": true,
				"user": gin.H{
					"name":  "Anonymous User",
					"email": "anonymous@local",
				},
				"features": gin.H{"vrl": false},
			})
		})
	}

	api.POST("/export/csv", handleCSVExport)
	api.POST("/patterns", handlePatterns)

	// Serve static files with cache headers
	r.Use(CacheControlMiddleware())
	r.Static("/assets", "./dist/assets")
	r.StaticFile("/favicon.ico", "./dist/favicon.ico")
	r.NoRoute(func(c *gin.Context) {
		// Prevent caching of index.html
		c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
		c.Header("Pragma", "no-cache")
		c.Header("Expires", "0")
		c.File("./dist/index.html")
	})

	// Setup HTTP server
	srv := &http.Server{
		Addr:         ":" + config.Port,
		Handler:      r,
		ReadTimeout:  time.Minute * 10,
		WriteTimeout: time.Minute * 10,
		IdleTimeout:  time.Minute * 10,
	}

	// Run server in goroutine
	go func() {
		log.Info().
			Str("port", config.Port).
			Str("log_level", config.LogLevel).
			Msg("Starting HTTP server")

		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Failed to start server")
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Received shutdown signal")

	// Give server 10 seconds to finish current requests
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Shutdown HTTP server
	if err := srv.Shutdown(ctx); err != nil {
		log.Error().Err(err).Msg("Server forced to shutdown")
	}

	log.Info().Msg("Server exited gracefully")
}

func handleCSVExport(c *gin.Context) {
	var req CSVExportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// Validate request
	if req.Index == "" || len(req.Columns) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Index and columns are required"})
		return
	}

	// Limit max docs
	if req.MaxDocs > config.MaxExportDocs {
		req.MaxDocs = config.MaxExportDocs
	}

	log.Printf("CSV Export: index=%s, docs=%d, columns=%d", req.Index, req.MaxDocs, len(req.Columns))

	// Create a buffer to hold the CSV data
	var csvBuffer bytes.Buffer
	csvWriter := csv.NewWriter(&csvBuffer)

	// Write CSV header
	headers := append([]string{req.TimestampField}, req.Columns...)
	if err := csvWriter.Write(headers); err != nil {
		log.Printf("Error writing CSV header: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write CSV header"})
		return
	}

	// Fetch data in batches with parallel goroutines
	batchSize := 1000
	maxParallel := 5 // Maximum number of parallel requests
	totalFetched := 0

	// Calculate number of batches needed
	numBatches := (req.MaxDocs + batchSize - 1) / batchSize

	// Process batches in groups of maxParallel
	for batchGroup := 0; batchGroup < numBatches; batchGroup += maxParallel {
		// Calculate how many batches to fetch in this group
		batchesInGroup := maxParallel
		if batchGroup+batchesInGroup > numBatches {
			batchesInGroup = numBatches - batchGroup
		}

		// Structure to hold batch results
		type batchResult struct {
			index int
			hits  []map[string]interface{}
			err   error
		}

		results := make(chan batchResult, batchesInGroup)

		// Launch goroutines to fetch batches in parallel
		for i := 0; i < batchesInGroup; i++ {
			batchIndex := batchGroup + i
			offset := batchIndex * batchSize
			limit := batchSize
			if offset+limit > req.MaxDocs {
				limit = req.MaxDocs - offset
			}

			go func(idx, off, lim int) {
				hits, err := fetchBatch(req.Index, req.Query, off, lim, req.StartTime, req.EndTime)
				results <- batchResult{index: idx, hits: hits, err: err}
			}(batchIndex, offset, limit)
		}

		// Collect results and sort by index to maintain order
		batchData := make([][]map[string]interface{}, batchesInGroup)
		for i := 0; i < batchesInGroup; i++ {
			result := <-results
			if result.err != nil {
				log.Printf("Error fetching batch %d: %v", result.index, result.err)
				close(results)
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Error fetching batch: %v", result.err)})
				return
			}
			// Store in correct position based on batch index
			relativeIndex := result.index - batchGroup
			batchData[relativeIndex] = result.hits
		}
		close(results)

		// Write all batches to CSV in order
		for _, hits := range batchData {
			if len(hits) == 0 {
				break
			}

			for _, hit := range hits {
				row := make([]string, len(headers))

				for i, col := range headers {
					if val, ok := hit[col]; ok {
						row[i] = formatValue(val)
					}
				}

				if err := csvWriter.Write(row); err != nil {
					log.Printf("Error writing CSV row: %v", err)
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Error writing CSV row"})
					return
				}
			}

			totalFetched += len(hits)
		}

		log.Printf("Exported batch group: %d/%d documents", totalFetched, req.MaxDocs)
	}

	// Flush CSV writer to buffer
	csvWriter.Flush()
	if err := csvWriter.Error(); err != nil {
		log.Printf("Error flushing CSV: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate CSV"})
		return
	}

	// Create zip file
	var zipBuffer bytes.Buffer
	zipWriter := zip.NewWriter(&zipBuffer)

	// Add CSV to zip
	timestamp := time.Now().Format("20060102-150405")
	csvFilename := fmt.Sprintf("quickwit-export-%s-%s.csv", req.Index, timestamp)

	zipFile, err := zipWriter.Create(csvFilename)
	if err != nil {
		log.Printf("Error creating zip file entry: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create zip"})
		return
	}

	_, err = zipFile.Write(csvBuffer.Bytes())
	if err != nil {
		log.Printf("Error writing CSV to zip: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write CSV to zip"})
		return
	}

	// Close zip writer
	err = zipWriter.Close()
	if err != nil {
		log.Printf("Error closing zip writer: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to finalize zip"})
		return
	}

	// Set response headers
	zipFilename := fmt.Sprintf("quickwit-export-%s-%s.zip", req.Index, timestamp)
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", zipFilename))
	c.Header("Content-Length", strconv.Itoa(zipBuffer.Len()))

	// Write zip to response
	c.Writer.Write(zipBuffer.Bytes())

	log.Printf("CSV Export completed: %d documents exported, zip size: %d bytes", totalFetched, zipBuffer.Len())
}

func fetchBatch(index, query string, offset, limit int, startTime, endTime *int64) ([]map[string]interface{}, error) {
	searchReq := QuickwitSearchRequest{
		Query:       query,
		MaxHits:     limit,
		StartOffset: offset,
	}

	if startTime != nil {
		searchReq.StartTimestamp = startTime
	}
	if endTime != nil {
		searchReq.EndTimestamp = endTime
	}

	body, err := json.Marshal(searchReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/%s/search", config.QuickwitURL, index)
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept-Encoding", "gzip, deflate")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch from Quickwit: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("quickwit returned status %d", resp.StatusCode)
	}

	var searchResp QuickwitSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return searchResp.Hits, nil
}

// ── patterns (drain) ──────────────────────────────────────────────────────────

const (
	drainThreshold    = 0.4
	drainMaxClusters  = 1000
	drainMaxTokenLen  = 40
	drainMaxTokens    = 30
	patternBuckets    = 20
	patternBucketSize = 500
)

var (
	rePatIP     = regexp.MustCompile(`\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b`)
	rePatUUID   = regexp.MustCompile(`(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)
	rePatHex    = regexp.MustCompile(`(?i)\b[0-9a-f]{8,}\b`)
	rePatNumber = regexp.MustCompile(`^-?\d+(?:[.,]\d+)*(%|ms|s|m|h|kb|mb|gb)?$`)
)

type PatternRequest struct {
	Index          string  `json:"index"`
	Query          string  `json:"query"`
	Field          string  `json:"field"`
	TopN           int     `json:"top_n"`
	StartTimestamp *int64  `json:"start_timestamp,omitempty"`
	EndTimestamp   *int64  `json:"end_timestamp,omitempty"`
}

type PatternResult struct {
	Template   string  `json:"template"`
	Count      int     `json:"count"`
	Percentage float64 `json:"percentage"`
	Sample     string  `json:"sample"`
}

type PatternResponse struct {
	Patterns      []PatternResult `json:"patterns"`
	TotalLogs     int             `json:"total_logs"`
	TotalClusters int             `json:"total_clusters"`
}

type logCluster struct {
	tokens []string
	count  int
	sample string
}

type drainTree struct {
	byLen map[int][]*logCluster
	total int
}

func newDrainTree() *drainTree {
	return &drainTree{byLen: make(map[int][]*logCluster)}
}

func drainNormalizeToken(t string) string {
	if len(t) > drainMaxTokenLen {
		return "<*>"
	}
	if rePatIP.MatchString(t) || rePatUUID.MatchString(t) || rePatHex.MatchString(t) || rePatNumber.MatchString(t) {
		return "<*>"
	}
	return t
}

func drainTokenize(line string) []string {
	raw := strings.Fields(line)
	if len(raw) > drainMaxTokens {
		raw = raw[:drainMaxTokens]
	}
	toks := make([]string, len(raw))
	for i, t := range raw {
		toks[i] = drainNormalizeToken(t)
	}
	return toks
}

func drainSimilarity(template, tokens []string) float64 {
	if len(template) != len(tokens) {
		return 0
	}
	match := 0
	for i, t := range template {
		if t == "<*>" || t == tokens[i] {
			match++
		}
	}
	return float64(match) / float64(len(template))
}

func (d *drainTree) add(line string) {
	d.total++
	toks := drainTokenize(line)
	if len(toks) == 0 {
		return
	}
	candidates := d.byLen[len(toks)]
	bestSim := -1.0
	var best *logCluster
	for _, c := range candidates {
		if sim := drainSimilarity(c.tokens, toks); sim > bestSim {
			bestSim = sim
			best = c
		}
	}
	if best != nil && bestSim >= drainThreshold {
		for i := range best.tokens {
			if best.tokens[i] != "<*>" && best.tokens[i] != toks[i] {
				best.tokens[i] = "<*>"
			}
		}
		best.count++
	} else if len(d.byLen[len(toks)]) < drainMaxClusters {
		d.byLen[len(toks)] = append(d.byLen[len(toks)], &logCluster{tokens: append([]string(nil), toks...), count: 1, sample: line})
	}
}

func (d *drainTree) topN(n int) []*logCluster {
	all := make([]*logCluster, 0)
	for _, list := range d.byLen {
		all = append(all, list...)
	}
	sort.Slice(all, func(i, j int) bool { return all[i].count > all[j].count })
	if n > len(all) {
		n = len(all)
	}
	return all[:n]
}

func extractFieldText(hit map[string]interface{}, field string) string {
	if field == "_all" {
		keys := make([]string, 0, len(hit))
		for k := range hit {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(hit))
		for _, k := range keys {
			if s, ok := hit[k].(string); ok && s != "" {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, " ")
	}
	if v, ok := hit[field]; ok {
		if s, ok := v.(string); ok {
			return s
		}
		b, _ := json.Marshal(v)
		return string(b)
	}
	return ""
}

func fetchPatternBucket(index, query string, start, end int64) ([]map[string]interface{}, error) {
	req := QuickwitSearchRequest{
		Query:          query,
		MaxHits:        patternBucketSize,
		StartTimestamp: &start,
		EndTimestamp:   &end,
	}
	body, _ := json.Marshal(req)
	url := fmt.Sprintf("%s/api/v1/%s/search", config.QuickwitURL, index)
	resp, err := httpClient.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("quickwit status %d", resp.StatusCode)
	}
	var sr QuickwitSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&sr); err != nil {
		return nil, err
	}
	return sr.Hits, nil
}

func handlePatterns(c *gin.Context) {
	var req PatternRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if req.Field == "" {
		req.Field = "_all"
	}
	topN := req.TopN
	if topN <= 0 {
		topN = 10
	}

	var allHits []map[string]interface{}

	if req.StartTimestamp != nil && req.EndTimestamp != nil {
		bucketSize := (*req.EndTimestamp - *req.StartTimestamp) / int64(patternBuckets)
		if bucketSize < 1 {
			bucketSize = 1
		}
		type result struct {
			hits []map[string]interface{}
			err  error
		}
		results := make([]result, patternBuckets)
		var wg sync.WaitGroup
		for i := 0; i < patternBuckets; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				bStart := *req.StartTimestamp + int64(i)*bucketSize
				bEnd := bStart + bucketSize
				if i == patternBuckets-1 {
					bEnd = *req.EndTimestamp
				}
				hits, err := fetchPatternBucket(req.Index, req.Query, bStart, bEnd)
				results[i] = result{hits, err}
			}(i)
		}
		wg.Wait()
		for _, r := range results {
			if r.err != nil {
				c.JSON(500, gin.H{"error": r.err.Error()})
				return
			}
			allHits = append(allHits, r.hits...)
		}
	} else {
		hits, err := fetchBatch(req.Index, req.Query, 0, patternBuckets*patternBucketSize, nil, nil)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		allHits = hits
	}

	tree := newDrainTree()
	for _, hit := range allHits {
		if text := extractFieldText(hit, req.Field); text != "" {
			tree.add(text)
		}
	}

	top := tree.topN(topN)
	totalClusters := 0
	for _, list := range tree.byLen {
		totalClusters += len(list)
	}

	patterns := make([]PatternResult, len(top))
	for i, cl := range top {
		pct := 0.0
		if tree.total > 0 {
			pct = math.Round(float64(cl.count)/float64(tree.total)*10000) / 100
		}
		patterns[i] = PatternResult{
			Template:   strings.Join(cl.tokens, " "),
			Count:      cl.count,
			Percentage: pct,
			Sample:     cl.sample,
		}
	}

	c.JSON(200, PatternResponse{
		Patterns:      patterns,
		TotalLogs:     tree.total,
		TotalClusters: totalClusters,
	})
}

func formatValue(val interface{}) string {
	if val == nil {
		return ""
	}

	switch v := val.(type) {
	case string:
		return v
	case float64:
		// Check if it's an integer
		if v == float64(int64(v)) {
			return strconv.FormatInt(int64(v), 10)
		}
		return strconv.FormatFloat(v, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(v)
	case map[string]interface{}, []interface{}:
		// For nested objects/arrays, serialize to JSON
		b, _ := json.Marshal(v)
		return string(b)
	default:
		return fmt.Sprintf("%v", v)
	}
}

func testQuickwitConnection() error {
	// Try to fetch the cluster health/info endpoint
	healthURL := fmt.Sprintf("%s/api/v1/version", config.QuickwitURL)

	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	resp, err := client.Get(healthURL)
	if err != nil {
		return fmt.Errorf("connection failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health check returned status %d", resp.StatusCode)
	}

	return nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func generateSecret(length int) ([]byte, error) {
	b := make([]byte, length)
	_, err := rand.Read(b)
	if err != nil {
		return nil, fmt.Errorf("failed to generate secret: %w", err)
	}
	return b, nil
}

func CORSMiddleware(allowOrigin string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", allowOrigin)
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

func CacheControlMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path

		// Set cache headers based on file type
		if strings.HasSuffix(path, ".html") || path == "/" {
			// HTML files: no cache (always fetch fresh)
			c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
			c.Header("Pragma", "no-cache")
			c.Header("Expires", "0")
		} else if strings.Contains(path, "/assets/") || strings.HasSuffix(path, ".js") ||
			strings.HasSuffix(path, ".css") || strings.HasSuffix(path, ".woff") ||
			strings.HasSuffix(path, ".woff2") || strings.HasSuffix(path, ".ttf") {
			// Hashed assets (JS, CSS, fonts): long cache (1 year)
			c.Header("Cache-Control", "public, max-age=31536000, immutable")
		} else if !strings.HasPrefix(path, "/api/") && !strings.HasPrefix(path, "/quickwit/") &&
			!strings.HasPrefix(path, "/login") && !strings.HasPrefix(path, "/logout") &&
			!strings.HasPrefix(path, "/auth/") {
			// Other static files: moderate cache (1 day)
			c.Header("Cache-Control", "public, max-age=86400")
		}

		c.Next()
	}
}

func splitQueryByPipe(s string) []string {
	var parts []string
	var currentPart []rune
	inQuote := false
	var quoteChar rune
	isEscaping := false

	for _, r := range s {
		if isEscaping {
			isEscaping = false
			currentPart = append(currentPart, r)
			continue
		}

		if r == '\\' {
			isEscaping = true
			currentPart = append(currentPart, r)
			continue
		}

		if r == '"' || r == '\'' {
			if !inQuote {
				inQuote = true
				quoteChar = r
			} else if r == quoteChar {
				inQuote = false
			}
		}

		if r == '|' && !inQuote {
			parts = append(parts, string(currentPart))
			currentPart = []rune{}
		} else {
			currentPart = append(currentPart, r)
		}
	}
	parts = append(parts, string(currentPart))
	return parts
}
