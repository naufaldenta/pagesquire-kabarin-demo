<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require dirname(__DIR__) . '/vendor/autoload.php';
use Kabarin\Assistant\Host;
use PageSquire\Server\AssistantException;

try {
    $settings = Host::settings();
    Host::authorizeRequest($settings);
    $session = Host::session($settings);
    Host::requirePost($session, $settings);
    if (!Host::configured($settings)) throw new AssistantException('PROVIDER_NOT_CONFIGURED', 'Chat AI belum diaktifkan. API key dan model perlu diatur oleh pemilik situs.', 503);
    Host::endpoint($settings)->serve($session);
} catch (Throwable $error) { Host::error($error); }
