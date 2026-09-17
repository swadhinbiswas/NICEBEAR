# nicebear-php

NiceBear PHP SDK — Dynamic Avatar Infrastructure. Requires PHP 8.1+ with
`ext-curl` and `ext-json`.

```bash
composer require nicebear/nicebear-php
```

```php
<?php
require 'vendor/autoload.php';

$nb = new \NiceBear\Client('https://api.nicebear.dev', 'nb_live_...');

echo $nb->avatarUrl('av_123', 'john'), "\n";
echo $nb->dailyUrl('av_123'), "\n";

$col = $nb->createCollection('team-avatars', 'pixel-art');
$av = $nb->createAvatar([
    'collection_id' => $col['id'],
    'type' => 'generated',
    'engine' => 'pixel-art',
]);
echo $av['id'], "\n";

try {
    $nb->report('av_123', 'test probe');
} catch (\NiceBear\ApiError $e) {
    echo $e->status, ' ', $e->getMessage(), "\n";
}
```

Mirrors `packages/openapi/spec.yaml`. Version tracks the API, not the app.
