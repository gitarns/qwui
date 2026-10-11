package main

import (
	"strings"
	"testing"
)

func TestSafeReturnPathKeepsASearchLink(t *testing.T) {
	for _, link := range []string{
		"/?index=logs&query=level:error&from=now-15m&to=now&filters=%5B%5D",
		"/",
		// A backslash in the query string is data, not a path separator.
		`/?query=a\b`,
	} {
		if got := safeReturnPath(link); got != link {
			t.Errorf("safeReturnPath(%q) = %q, want it kept", link, got)
		}
	}
}

func TestSafeReturnPathRefusesOtherOrigins(t *testing.T) {
	for _, hostile := range []string{
		"https://evil.example/",
		"//evil.example",
		`/\evil.example`,
		"/\t/evil.example",
		"/\n/evil.example",
		"evil.example",
		"",
		"/café",
	} {
		if got := safeReturnPath(hostile); got != "" {
			t.Errorf("safeReturnPath(%q) = %q, want it refused", hostile, got)
		}
	}
}

func TestSafeReturnPathIsCapped(t *testing.T) {
	long := "/?query=" + strings.Repeat("a", maxReturnPathLen)
	if got := safeReturnPath(long); got != "" {
		t.Errorf("safeReturnPath accepted a %d-byte path", len(long))
	}
}

func TestStateStoreCarriesReturnToOnce(t *testing.T) {
	store := NewStateStore()
	store.Save("state-1", "/?query=x")

	returnTo, ok := store.Verify("state-1")
	if !ok || returnTo != "/?query=x" {
		t.Fatalf("Verify = (%q, %v), want (\"/?query=x\", true)", returnTo, ok)
	}
	if _, ok := store.Verify("state-1"); ok {
		t.Fatal("a state verified twice")
	}
	if _, ok := store.Verify("never-issued"); ok {
		t.Fatal("an unknown state verified")
	}
}
