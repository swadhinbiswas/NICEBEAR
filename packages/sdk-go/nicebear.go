// Package nicebear is the Go SDK for NiceBear Dynamic Avatar Infrastructure.
// It mirrors packages/openapi/spec.yaml. Standard library only.
package nicebear

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// APIError carries the HTTP status and parsed error body.
type APIError struct {
	Status int
	Body   map[string]any
}

func (e *APIError) Error() string {
	msg, _ := e.Body["error"].(string)
	if msg == "" {
		msg = "request failed"
	}
	return fmt.Sprintf("nicebear API %d: %s", e.Status, msg)
}

// Client talks to a NiceBear deployment.
type Client struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

// New creates a client. Empty apiKey means anonymous (public reads only).
func New(baseURL, apiKey string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

// ---------------------------------------------------------------- URL builders

func (c *Client) imageURL(path string, seed string, v any) string {
	q := url.Values{}
	if seed != "" {
		q.Set("seed", seed)
	}
	if v != nil {
		q.Set("v", fmt.Sprint(v))
	}
	u := c.baseURL + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	return u
}

// AvatarURL returns the current active avatar image URL.
func (c *Client) AvatarURL(id, seed string, v any) string {
	return c.imageURL("/api/avatar/"+id, seed, v)
}

// RandomURL returns the random-variant URL.
func (c *Client) RandomURL(id, seed string) string {
	return c.imageURL("/api/avatar/"+id+"/random", seed, nil)
}

// DailyURL returns the daily-variant URL.
func (c *Client) DailyURL(id string) string { return c.baseURL + "/api/avatar/" + id + "/daily" }

// WeeklyURL returns the weekly-variant URL.
func (c *Client) WeeklyURL(id string) string { return c.baseURL + "/api/avatar/" + id + "/weekly" }

// MonthlyURL returns the monthly-variant URL.
func (c *Client) MonthlyURL(id string) string { return c.baseURL + "/api/avatar/" + id + "/monthly" }

// RefreshURL returns the no-cache variant URL.
func (c *Client) RefreshURL(id string) string { return c.baseURL + "/api/avatar/" + id + "/refresh" }

// CustomURL returns the custom-schedule endpoint URL (POST).
func (c *Client) CustomURL(id string) string { return c.baseURL + "/api/avatar/" + id + "/custom" }

// ------------------------------------------------------------------ transport

func (c *Client) do(method, path string, body any) (map[string]any, error) {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.baseURL+path, rdr)
	if err != nil {
		return nil, err
	}
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var out map[string]any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out); err != nil {
			out = map[string]any{}
		}
	} else {
		out = map[string]any{}
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, &APIError{Status: res.StatusCode, Body: out}
	}
	return out, nil
}

func orgQS(orgID string) string {
	if orgID == "" {
		return ""
	}
	return "?org_id=" + url.QueryEscape(orgID)
}

// ------------------------------------------------------------------- avatars

// CreateAvatar creates a generated, uploaded, or external_url avatar.
func (c *Client) CreateAvatar(payload map[string]any) (map[string]any, error) {
	return c.do("POST", "/api/avatars", payload)
}

// GetAvatar returns avatar metadata.
func (c *Client) GetAvatar(id string) (map[string]any, error) {
	return c.do("GET", "/api/avatars/"+id, nil)
}

// DeleteAvatar soft-deletes an avatar.
func (c *Client) DeleteAvatar(id string) (map[string]any, error) {
	return c.do("DELETE", "/api/avatars/"+id, nil)
}

// RollbackAvatar pins an avatar back to a prior version (number or "latest").
func (c *Client) RollbackAvatar(id string, version any) (map[string]any, error) {
	return c.do("POST", "/api/avatars/"+id+"/rollback", map[string]any{"version": version})
}

// CustomAvatar resolves the custom-schedule variant (server-side).
func (c *Client) CustomAvatar(id string, body map[string]any) (map[string]any, error) {
	return c.do("POST", "/api/avatar/"+id+"/custom", body)
}

// --------------------------------------------------------------- collections

// CreateCollection creates a collection (orgID optional for org keys).
func (c *Client) CreateCollection(name, engine, orgID string) (map[string]any, error) {
	return c.do("POST", "/api/collections"+orgQS(orgID), map[string]any{"name": name, "engine_type": engine})
}

// ListCollections lists collections with member counts.
func (c *Client) ListCollections(orgID string) (map[string]any, error) {
	return c.do("GET", "/api/collections"+orgQS(orgID), nil)
}

// GetCollection returns a collection with member avatar ids.
func (c *Client) GetCollection(id string) (map[string]any, error) {
	return c.do("GET", "/api/collections/"+id, nil)
}

// AttachAvatar attaches an avatar to a collection.
func (c *Client) AttachAvatar(collectionID, avatarID string) (map[string]any, error) {
	return c.do("POST", "/api/collections/"+collectionID+"/avatars", map[string]any{"avatar_id": avatarID})
}

// -------------------------------------------------------------------- rules

// CreateRule creates a rotation rule.
func (c *Client) CreateRule(targetID, targetType string, rule map[string]any, priority int) (map[string]any, error) {
	return c.do("POST", "/api/rotation-rules", map[string]any{
		"target_id": targetID, "target_type": targetType, "rule": rule, "priority": priority,
	})
}

// ListRules lists rules for a target.
func (c *Client) ListRules(targetID, targetType string) (map[string]any, error) {
	return c.do("GET", "/api/rotation-rules?target_type="+url.QueryEscape(targetType)+"&target_id="+url.QueryEscape(targetID), nil)
}

// UpdateRule updates a rule's DSL and/or priority.
func (c *Client) UpdateRule(id string, body map[string]any) (map[string]any, error) {
	return c.do("PUT", "/api/rotation-rules/"+id, body)
}

// CreateSchedule attaches a cron schedule to a rule.
func (c *Client) CreateSchedule(ruleID, cronExpr, timezone string) (map[string]any, error) {
	body := map[string]any{"rotation_rule_id": ruleID, "timezone": timezone}
	if cronExpr != "" {
		body["cron_expr"] = cronExpr
	}
	return c.do("POST", "/api/schedules", body)
}

// ListSchedules lists schedules for a rule.
func (c *Client) ListSchedules(ruleID string) (map[string]any, error) {
	return c.do("GET", "/api/schedules?rotation_rule_id="+url.QueryEscape(ruleID), nil)
}

// ------------------------------------------------------------------ api keys

// CreateKey mints a sub-key (plaintext returned once).
func (c *Client) CreateKey(scope string, rateLimitPerMin int) (map[string]any, error) {
	return c.do("POST", "/api/api-keys", map[string]any{"scope": scope, "rate_limit_per_min": rateLimitPerMin})
}

// ListKeys lists own key metadata (hashes never returned).
func (c *Client) ListKeys() (map[string]any, error) { return c.do("GET", "/api/api-keys", nil) }

// DeleteKey revokes a key.
func (c *Client) DeleteKey(id string) (map[string]any, error) {
	return c.do("DELETE", "/api/api-keys/"+id, nil)
}

// RotateKey swaps a key's hash, returning fresh plaintext.
func (c *Client) RotateKey(id string) (map[string]any, error) {
	return c.do("POST", "/api/api-keys/"+id+"/rotate", nil)
}

// Whoami returns the calling key identity.
func (c *Client) Whoami() (map[string]any, error) { return c.do("GET", "/api/api-keys/self", nil) }

// ----------------------------------------------------------------- webhooks

// CreateWebhook creates a webhook (orgID optional for org keys).
func (c *Client) CreateWebhook(url, secret string, events []string, orgID string) (map[string]any, error) {
	return c.do("POST", "/api/webhooks"+orgQS(orgID), map[string]any{"url": url, "secret": secret, "events": events})
}

// ListWebhooks lists webhooks (secrets never returned).
func (c *Client) ListWebhooks(orgID string) (map[string]any, error) {
	return c.do("GET", "/api/webhooks"+orgQS(orgID), nil)
}

// Deliveries returns a webhook's delivery log.
func (c *Client) Deliveries(webhookID string, limit int) (map[string]any, error) {
	return c.do("GET", fmt.Sprintf("/api/webhooks/%s/deliveries?limit=%d", webhookID, limit), nil)
}

// ProcessWebhooks drains pending deliveries.
func (c *Client) ProcessWebhooks(limit int) (map[string]any, error) {
	return c.do("POST", "/api/webhooks/process", map[string]any{"limit": limit})
}

// ---------------------------------------------------------------- analytics

// Analytics reads aggregated metrics.
func (c *Client) Analytics(metric string, days int) (map[string]any, error) {
	return c.do("GET", fmt.Sprintf("/api/analytics?metric=%s&days=%d", url.QueryEscape(metric), days), nil)
}

// Rollup aggregates complete hour/day buckets.
func (c *Client) Rollup() (map[string]any, error) { return c.do("POST", "/api/analytics/rollup", nil) }

// --------------------------------------------------------------------- misc

// Report opens a content/rights report (public).
func (c *Client) Report(avatarID, reason, contact string) (map[string]any, error) {
	body := map[string]any{"avatar_id": avatarID, "reason": reason}
	if contact != "" {
		body["reporter_contact"] = contact
	}
	return c.do("POST", "/api/report", body)
}

// MyOrgs lists orgs the caller belongs to.
func (c *Client) MyOrgs() (map[string]any, error) { return c.do("GET", "/api/orgs/mine", nil) }

// Team lists members of an org.
func (c *Client) Team(orgID string) (map[string]any, error) {
	return c.do("GET", "/api/team"+orgQS(orgID), nil)
}

// TeamAdd adds an existing user by email.
func (c *Client) TeamAdd(orgID, email, role string) (map[string]any, error) {
	return c.do("POST", "/api/team", map[string]any{"org_id": orgID, "email": email, "role": role})
}

// TeamRole changes a member's role.
func (c *Client) TeamRole(orgID, userID, role string) (map[string]any, error) {
	return c.do("PUT", "/api/team", map[string]any{"org_id": orgID, "user_id": userID, "role": role})
}

// TeamRemove removes a member.
func (c *Client) TeamRemove(orgID, userID string) (map[string]any, error) {
	return c.do("DELETE", "/api/team?org_id="+url.QueryEscape(orgID)+"&user_id="+url.QueryEscape(userID), nil)
}
