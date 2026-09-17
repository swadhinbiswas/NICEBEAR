package nicebear

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func stubServer(t *testing.T, calls *[]*http.Request, status int, body string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*calls = append(*calls, r)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
}

func TestURLBuilders(t *testing.T) {
	c := New("https://api.nicebear.dev/", "")
	if got := c.AvatarURL("av_1", "", nil); got != "https://api.nicebear.dev/api/avatar/av_1" {
		t.Fatalf("avatar url: %s", got)
	}
	u := c.AvatarURL("av_1", "john", 2)
	if !strings.Contains(u, "seed=john") || !strings.Contains(u, "v=2") {
		t.Fatalf("params: %s", u)
	}
	for _, tc := range [][2]string{
		{c.RandomURL("a", ""), "/random"},
		{c.DailyURL("a"), "/daily"},
		{c.WeeklyURL("a"), "/weekly"},
		{c.MonthlyURL("a"), "/monthly"},
		{c.RefreshURL("a"), "/refresh"},
		{c.CustomURL("a"), "/custom"},
	} {
		if !strings.Contains(tc[0], tc[1]) {
			t.Fatalf("missing %s in %s", tc[1], tc[0])
		}
	}
}

func TestAuthHeaderAndErrors(t *testing.T) {
	var calls []*http.Request
	srv := stubServer(t, &calls, 200, `{"ok":true}`)
	defer srv.Close()

	c := New(srv.URL, "nb_live_abc")
	if _, err := c.ListKeys(); err != nil {
		t.Fatal(err)
	}
	if got := calls[0].Header.Get("Authorization"); got != "Bearer nb_live_abc" {
		t.Fatalf("auth header: %q", got)
	}

	anon := New(srv.URL, "")
	if _, err := anon.ListKeys(); err != nil {
		t.Fatal(err)
	}
	if got := calls[1].Header.Get("Authorization"); got != "" {
		t.Fatalf("anon must not send auth: %q", got)
	}

	errSrv := stubServer(t, &calls, 400, `{"error":"nope"}`)
	defer errSrv.Close()
	ec := New(errSrv.URL, "k")
	if _, err := ec.ListKeys(); err == nil {
		t.Fatal("expected error")
	} else if apiErr, ok := err.(*APIError); !ok || apiErr.Status != 400 {
		t.Fatalf("typed error: %v", err)
	}
}

func TestCRUDPaths(t *testing.T) {
	var calls []*http.Request
	srv := stubServer(t, &calls, 201, `{"id":"x"}`)
	defer srv.Close()
	c := New(srv.URL, "k")
	last := func() *http.Request { return calls[len(calls)-1] }

	if _, err := c.CreateAvatar(map[string]any{"type": "generated"}); err != nil {
		t.Fatal(err)
	}
	if p := last().URL.Path; p != "/api/avatars" {
		t.Fatalf("create avatar path: %s", p)
	}
	if ct := last().Header.Get("Content-Type"); ct != "application/json" {
		t.Fatalf("content type: %s", ct)
	}

	if _, err := c.RollbackAvatar("av_1", 2); err != nil {
		t.Fatal(err)
	}
	if p := last().URL.Path; p != "/api/avatars/av_1/rollback" {
		t.Fatalf("rollback path: %s", p)
	}

	if _, err := c.CreateCollection("team", "pixel-art", "org_1"); err != nil {
		t.Fatal(err)
	}
	if got := last().URL.String(); !strings.HasSuffix(got, "/api/collections?org_id=org_1") {
		t.Fatalf("collection qs: %s", got)
	}

	if _, err := c.RotateKey("key_1"); err != nil {
		t.Fatal(err)
	}
	if p := last().URL.Path; p != "/api/api-keys/key_1/rotate" {
		t.Fatalf("rotate path: %s", p)
	}

	if _, err := c.Analytics("summary", 7); err != nil {
		t.Fatal(err)
	}
	if q := last().URL.Query(); q.Get("metric") != "summary" || q.Get("days") != "7" {
		t.Fatalf("analytics qs: %s", last().URL.String())
	}

	if _, err := c.TeamRemove("org_1", "u_1"); err != nil {
		t.Fatal(err)
	}
	if q := last().URL.Query(); q.Get("org_id") != "org_1" || q.Get("user_id") != "u_1" {
		t.Fatalf("team qs: %s", last().URL.String())
	}

	var decoded map[string]any
	if err := json.Unmarshal([]byte(`{"id":"x"}`), &decoded); err != nil || decoded["id"] != "x" {
		t.Fatal("sanity")
	}
}
