<?php

declare(strict_types=1);

namespace NiceBear;

/**
 * NiceBear PHP SDK — Dynamic Avatar Infrastructure.
 * Mirrors packages/openapi/spec.yaml. Requires the cURL extension.
 *
 * NOTE: not yet executed in this repo's CI sandbox (no PHP runtime here);
 * syntax is covered by `php -l` in CI. Keep changes conservative.
 */
class ApiError extends \RuntimeException
{
    public int $status;
    /** @var mixed */
    public $body;

    /** @param mixed $body */
    public function __construct(int $status, $body)
    {
        $this->status = $status;
        $this->body = $body;
        $detail = is_array($body) && isset($body['error']) ? (string) $body['error'] : 'request failed';
        parent::__construct("NiceBear API {$status}: {$detail}");
    }
}

class Client
{
    private string $baseUrl;
    private ?string $apiKey;
    private int $timeout;

    public function __construct(string $baseUrl = 'https://api.nicebear.dev', ?string $apiKey = null, int $timeout = 30)
    {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->apiKey = $apiKey;
        $this->timeout = $timeout;
    }

    // ------------------------------------------------------------ URL builders

    public function avatarUrl(string $id, ?string $seed = null, $v = null): string
    {
        return $this->imageUrl("/api/avatar/{$id}", $seed, $v);
    }

    public function randomUrl(string $id, ?string $seed = null): string
    {
        return $this->imageUrl("/api/avatar/{$id}/random", $seed, null);
    }

    public function dailyUrl(string $id): string
    {
        return "{$this->baseUrl}/api/avatar/{$id}/daily";
    }

    public function weeklyUrl(string $id): string
    {
        return "{$this->baseUrl}/api/avatar/{$id}/weekly";
    }

    public function monthlyUrl(string $id): string
    {
        return "{$this->baseUrl}/api/avatar/{$id}/monthly";
    }

    public function refreshUrl(string $id): string
    {
        return "{$this->baseUrl}/api/avatar/{$id}/refresh";
    }

    public function customUrl(string $id): string
    {
        return "{$this->baseUrl}/api/avatar/{$id}/custom";
    }

    /** @param mixed $v */
    private function imageUrl(string $path, ?string $seed, $v): string
    {
        $qs = [];
        if ($seed !== null) {
            $qs['seed'] = $seed;
        }
        if ($v !== null) {
            $qs['v'] = (string) $v;
        }
        $url = $this->baseUrl . $path;
        return $qs ? $url . '?' . http_build_query($qs) : $url;
    }

    // ------------------------------------------------------------------ core

    /** @param mixed $body @return mixed */
    private function request(string $method, string $path, $body = null)
    {
        $ch = curl_init();
        $headers = [];
        if ($this->apiKey !== null && $this->apiKey !== '') {
            $headers[] = 'Authorization: Bearer ' . $this->apiKey;
        }
        $payload = null;
        if ($body !== null) {
            $payload = json_encode($body);
            $headers[] = 'Content-Type: application/json';
        }
        curl_setopt_array($ch, [
            CURLOPT_URL => $this->baseUrl . $path,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_POSTFIELDS => $payload,
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            throw new \RuntimeException('NiceBear transport error: ' . $err);
        }
        $decoded = $raw !== '' ? json_decode((string) $raw, true) : [];
        if (!is_array($decoded)) {
            $decoded = [];
        }
        if ($status < 200 || $status >= 300) {
            throw new ApiError($status, $decoded);
        }
        return $decoded;
    }

    /** @return mixed */
    private function get(string $path)
    {
        return $this->request('GET', $path);
    }

    /** @param mixed $body @return mixed */
    private function post(string $path, $body = null)
    {
        return $this->request('POST', $path, $body);
    }

    /** @param mixed $body @return mixed */
    private function put(string $path, $body = null)
    {
        return $this->request('PUT', $path, $body);
    }

    /** @return mixed */
    private function del(string $path)
    {
        return $this->request('DELETE', $path);
    }

    private static function orgQs(?string $orgId): string
    {
        return $orgId ? '?org_id=' . urlencode($orgId) : '';
    }

    // ---------------------------------------------------------------- avatars

    /** @param array<string,mixed> $payload @return mixed */
    public function createAvatar(array $payload)
    {
        return $this->post('/api/avatars', $payload);
    }

    /** @return mixed */
    public function getAvatar(string $id)
    {
        return $this->get("/api/avatars/{$id}");
    }

    /** @return mixed */
    public function deleteAvatar(string $id)
    {
        return $this->del("/api/avatars/{$id}");
    }

    /** @param mixed $version @return mixed */
    public function rollbackAvatar(string $id, $version)
    {
        return $this->post("/api/avatars/{$id}/rollback", ['version' => $version]);
    }

    /** @param array<string,mixed> $body @return mixed */
    public function customAvatar(string $id, array $body)
    {
        return $this->post("/api/avatar/{$id}/custom", $body);
    }

    // ------------------------------------------------------------ collections

    /** @return mixed */
    public function createCollection(string $name, string $engine, ?string $orgId = null)
    {
        return $this->post('/api/collections' . self::orgQs($orgId), ['name' => $name, 'engine_type' => $engine]);
    }

    /** @return mixed */
    public function listCollections(?string $orgId = null)
    {
        return $this->get('/api/collections' . self::orgQs($orgId));
    }

    /** @return mixed */
    public function getCollection(string $id)
    {
        return $this->get("/api/collections/{$id}");
    }

    /** @return mixed */
    public function attachAvatar(string $collectionId, string $avatarId)
    {
        return $this->post("/api/collections/{$collectionId}/avatars", ['avatar_id' => $avatarId]);
    }

    // ----------------------------------------------------------------- rules

    /** @param array<string,mixed> $rule @return mixed */
    public function createRule(string $targetId, string $targetType, array $rule, int $priority = 0)
    {
        return $this->post('/api/rotation-rules', [
            'target_id' => $targetId, 'target_type' => $targetType, 'rule' => $rule, 'priority' => $priority,
        ]);
    }

    /** @return mixed */
    public function listRules(string $targetId, string $targetType)
    {
        return $this->get('/api/rotation-rules?target_type=' . urlencode($targetType) . '&target_id=' . urlencode($targetId));
    }

    /** @param array<string,mixed> $body @return mixed */
    public function updateRule(string $id, array $body)
    {
        return $this->put("/api/rotation-rules/{$id}", $body);
    }

    /** @return mixed */
    public function createSchedule(string $ruleId, ?string $cronExpr = null, string $timezone = 'UTC')
    {
        $body = ['rotation_rule_id' => $ruleId, 'timezone' => $timezone];
        if ($cronExpr !== null) {
            $body['cron_expr'] = $cronExpr;
        }
        return $this->post('/api/schedules', $body);
    }

    /** @return mixed */
    public function listSchedules(string $ruleId)
    {
        return $this->get('/api/schedules?rotation_rule_id=' . urlencode($ruleId));
    }

    // --------------------------------------------------------------- api keys

    /** @return mixed */
    public function createKey(string $scope = 'read', int $rateLimitPerMin = 60)
    {
        return $this->post('/api/api-keys', ['scope' => $scope, 'rate_limit_per_min' => $rateLimitPerMin]);
    }

    /** @return mixed */
    public function listKeys()
    {
        return $this->get('/api/api-keys');
    }

    /** @return mixed */
    public function deleteKey(string $id)
    {
        return $this->del("/api/api-keys/{$id}");
    }

    /** @return mixed */
    public function rotateKey(string $id)
    {
        return $this->post("/api/api-keys/{$id}/rotate");
    }

    /** @return mixed */
    public function whoami()
    {
        return $this->get('/api/api-keys/self');
    }

    // --------------------------------------------------------------- webhooks

    /** @param string[] $events @return mixed */
    public function createWebhook(string $url, string $secret, array $events, ?string $orgId = null)
    {
        return $this->post('/api/webhooks' . self::orgQs($orgId), ['url' => $url, 'secret' => $secret, 'events' => $events]);
    }

    /** @return mixed */
    public function listWebhooks(?string $orgId = null)
    {
        return $this->get('/api/webhooks' . self::orgQs($orgId));
    }

    /** @return mixed */
    public function deliveries(string $webhookId, int $limit = 25)
    {
        return $this->get("/api/webhooks/{$webhookId}/deliveries?limit={$limit}");
    }

    /** @return mixed */
    public function processWebhooks(int $limit = 25)
    {
        return $this->post('/api/webhooks/process', ['limit' => $limit]);
    }

    // -------------------------------------------------------------- analytics

    /** @return mixed */
    public function analytics(string $metric = 'summary', int $days = 30)
    {
        return $this->get('/api/analytics?metric=' . urlencode($metric) . '&days=' . $days);
    }

    /** @return mixed */
    public function rollup()
    {
        return $this->post('/api/analytics/rollup');
    }

    // ------------------------------------------------------------------- misc

    /** @return mixed */
    public function report(string $avatarId, string $reason, ?string $contact = null)
    {
        $body = ['avatar_id' => $avatarId, 'reason' => $reason];
        if ($contact !== null) {
            $body['reporter_contact'] = $contact;
        }
        return $this->post('/api/report', $body);
    }

    /** @return mixed */
    public function myOrgs()
    {
        return $this->get('/api/orgs/mine');
    }

    /** @return mixed */
    public function team(?string $orgId = null)
    {
        return $this->get('/api/team' . self::orgQs($orgId));
    }

    /** @return mixed */
    public function teamAdd(string $orgId, string $email, string $role)
    {
        return $this->post('/api/team', ['org_id' => $orgId, 'email' => $email, 'role' => $role]);
    }

    /** @return mixed */
    public function teamRole(string $orgId, string $userId, string $role)
    {
        return $this->put('/api/team', ['org_id' => $orgId, 'user_id' => $userId, 'role' => $role]);
    }

    /** @return mixed */
    public function teamRemove(string $orgId, string $userId)
    {
        return $this->del('/api/team?org_id=' . urlencode($orgId) . '&user_id=' . urlencode($userId));
    }
}
