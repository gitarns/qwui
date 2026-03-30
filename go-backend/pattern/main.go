package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// ── config ────────────────────────────────────────────────────────────────────

const (
	quickwitURL    = "http://localhost:7280"
	index          = "logs"
	windowMin      = 15  // minutes to look back
	numBuckets     = 20  // time buckets to split the window into
	eventsPerBucket = 500 // max events fetched per bucket
	topN           = 10  // patterns to print
)

// ── quickwit client ───────────────────────────────────────────────────────────

type searchRequest struct {
	Query          string `json:"query"`
	MaxHits        int    `json:"max_hits"`
	StartTimestamp *int64 `json:"start_timestamp,omitempty"`
	EndTimestamp   *int64 `json:"end_timestamp,omitempty"`
}

func fetchBucket(start, end int64) ([]map[string]interface{}, error) {
	body := searchRequest{
		Query:          "*",
		MaxHits:        eventsPerBucket,
		StartTimestamp: &start,
		EndTimestamp:   &end,
	}
	data, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/api/v1/%s/search", quickwitURL, index)
	resp, err := http.Post(url, "application/json", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("quickwit %d: %s", resp.StatusCode, raw)
	}
	var result struct {
		Hits []map[string]interface{} `json:"hits"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	return result.Hits, nil
}

// fetchAll divides [start, end] into numBuckets equal slices and fetches each in parallel.
func fetchAll(start, end int64) ([]map[string]interface{}, error) {
	bucketSize := (end - start) / int64(numBuckets)
	if bucketSize == 0 {
		bucketSize = 1
	}

	type result struct {
		hits []map[string]interface{}
		err  error
	}
	results := make([]result, numBuckets)
	var wg sync.WaitGroup

	for i := 0; i < numBuckets; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			bStart := start + int64(i)*bucketSize
			bEnd := bStart + bucketSize
			if i == numBuckets-1 {
				bEnd = end
			}
			hits, err := fetchBucket(bStart, bEnd)
			results[i] = result{hits, err}
		}(i)
	}
	wg.Wait()

	var all []map[string]interface{}
	for _, r := range results {
		if r.err != nil {
			return nil, r.err
		}
		all = append(all, r.hits...)
	}
	return all, nil
}

// ── log text extraction ───────────────────────────────────────────────────────

// extractText joins all string leaf values in sorted key order.
// This mirrors Splunk's raw event — variable content, no field names.
func extractText(hit map[string]interface{}) string {
	keys := make([]string, 0, len(hit))
	for k := range hit {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0)
	for _, k := range keys {
		if s, ok := hit[k].(string); ok && s != "" {
			parts = append(parts, s)
		}
	}
	return strings.Join(parts, " ")
}

// ── drain algorithm ───────────────────────────────────────────────────────────

const (
	wildcard    = "<*>"
	maxClusters = 1000
	threshold   = 0.4 // similarity threshold (lower = more permissive)
)

var (
	reIP     = regexp.MustCompile(`\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b`)
	reUUID   = regexp.MustCompile(`(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)
	reHex    = regexp.MustCompile(`(?i)\b[0-9a-f]{8,}\b`)
	reNumber = regexp.MustCompile(`^-?\d+(?:[.,]\d+)*(%|ms|s|m|h|kb|mb|gb)?$`)
)

const maxTokenLen = 40  // tokens longer than this are too variable to be constants
const maxTokens   = 30  // cap line length to avoid URL query strings blowing up token counts

func normalizeToken(t string) string {
	if len(t) > maxTokenLen {
		return wildcard
	}
	if reIP.MatchString(t) || reUUID.MatchString(t) || reHex.MatchString(t) || reNumber.MatchString(t) {
		return wildcard
	}
	return t
}

func tokenize(line string) []string {
	raw := strings.Fields(line)
	if len(raw) > maxTokens {
		raw = raw[:maxTokens]
	}
	toks := make([]string, len(raw))
	for i, t := range raw {
		toks[i] = normalizeToken(t)
	}
	return toks
}

type cluster struct {
	tokens []string
	count  int
	sample string
}

// similarity: fraction of matching tokens (wildcards always match).
func similarity(template, tokens []string) float64 {
	if len(template) != len(tokens) {
		return 0
	}
	match := 0
	for i, t := range template {
		if t == wildcard || t == tokens[i] {
			match++
		}
	}
	return float64(match) / float64(len(template))
}

// merge updates the template in place: positions that differ become wildcards.
func merge(template, tokens []string) {
	for i := range template {
		if template[i] != wildcard && template[i] != tokens[i] {
			template[i] = wildcard
		}
	}
}

type drainTree struct {
	// byLen groups clusters by token count for fast lookup
	byLen map[int][]*cluster
	total int
}

func newTree() *drainTree {
	return &drainTree{byLen: make(map[int][]*cluster)}
}

func (d *drainTree) add(line string) {
	d.total++
	toks := tokenize(line)
	if len(toks) == 0 {
		return
	}
	candidates := d.byLen[len(toks)]

	// find best matching cluster
	bestSim := -1.0
	var best *cluster
	for _, c := range candidates {
		sim := similarity(c.tokens, toks)
		if sim > bestSim {
			bestSim = sim
			best = c
		}
	}

	if best != nil && bestSim >= threshold {
		merge(best.tokens, toks)
		best.count++
	} else if len(d.byLen[len(toks)]) < maxClusters {
		newC := &cluster{tokens: append([]string(nil), toks...), count: 1, sample: line}
		d.byLen[len(toks)] = append(d.byLen[len(toks)], newC)
	}
}

func (d *drainTree) topN(n int) []*cluster {
	all := make([]*cluster, 0)
	for _, list := range d.byLen {
		all = append(all, list...)
	}
	sort.Slice(all, func(i, j int) bool { return all[i].count > all[j].count })
	if n > len(all) {
		n = len(all)
	}
	return all[:n]
}

// ── main ──────────────────────────────────────────────────────────────────────

func main() {
	field := "_all"
	if len(os.Args) > 1 {
		field = os.Args[1]
	}

	now := time.Now().Unix()
	start := now - int64(windowMin*60)

	fmt.Printf("Fetching last %d minutes from index %q (field: %s)...\n", windowMin, index, field)
	hits, err := fetchAll(start, now)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
	fmt.Printf("Got %d events\n\n", len(hits))

	tree := newTree()
	for _, hit := range hits {
		var text string
		if field == "_all" {
			text = extractText(hit)
		} else {
			if v, ok := hit[field]; ok {
				switch s := v.(type) {
				case string:
					text = s
				default:
					b, _ := json.Marshal(v)
					text = string(b)
				}
			}
		}
		if text != "" {
			tree.add(text)
		}
	}

	top := tree.topN(topN)
	totalClusters := 0
	for _, list := range tree.byLen {
		totalClusters += len(list)
	}

	fmt.Printf("Top %d patterns  (%d total clusters, %d events processed)\n", len(top), totalClusters, tree.total)
	fmt.Println(strings.Repeat("─", 80))
	for i, c := range top {
		pct := math.Round(float64(c.count)/float64(tree.total)*10000) / 100
		template := strings.Join(c.tokens, " ")
		fmt.Printf("\n#%d  %.2f%%  count=%d\n", i+1, pct, c.count)
		fmt.Printf("  %s\n", template)
	}
}
