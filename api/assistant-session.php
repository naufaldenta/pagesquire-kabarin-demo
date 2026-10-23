<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require dirname(__DIR__) . '/vendor/autoload.php';
use Kabarin\Assistant\Host;

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') { header('Allow: GET'); Host::json(['error' => ['code' => 'METHOD_NOT_ALLOWED', 'message' => 'Gunakan GET.']], 405); exit; }
    $settings = Host::settings();
    Host::authorizeRequest($settings);
    $session = Host::session($settings);
    $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
    Host::json(['configured' => Host::configured($settings), 'provider' => 'SumoPod', 'csrfToken' => $session['csrfToken'], 'endpoint' => $base . '/assistant-chat.php', 'resetEndpoint' => $base . '/assistant-reset.php']);
} catch (Throwable $error) { Host::error($error); }
