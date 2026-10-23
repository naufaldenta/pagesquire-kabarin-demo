<?php
declare(strict_types=1);
// Explicit loopback-only browser QA fixture. NOT included by any production route.
if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) { http_response_code(403); exit; }
require dirname(__DIR__) . '/vendor/autoload.php';
require __DIR__ . '/SyntheticHttpClient.php';
use Kabarin\Assistant\Host;
use Kabarin\Assistant\PortalProvider;
use PageSquire\Server\ConversationEngine;
use PageSquire\Server\ProtocolValidator;
use PageSquire\Server\Http\ChatEndpoint;
use PageSquire\Server\Http\OpenAiCompatibleProvider;
use PageSquire\Server\Http\ConversationPrivacy;

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('~/(?:\.[^/]+|vendor|node_modules|integration|tests|scripts)(?:/|$)~', $path)) { http_response_code(403); exit; }
if (in_array($path, ['/api/assistant-session.php', '/api/assistant-chat.php', '/api/assistant-reset.php'], true)) {
    try {
        $settings = ['PAGESQUIRE_ORIGIN' => 'http://127.0.0.1:4187', 'PAGESQUIRE_ALLOW_REMOTE' => 'false', 'PAGESQUIRE_STORAGE_DIR' => sys_get_temp_dir() . '/kabarin-pagesquire-browser-qa'];
        Host::authorizeRequest($settings);
        $session = Host::session($settings);
        if ($path === '/api/assistant-session.php') { Host::json(['configured' => true, 'provider' => 'PROVIDER TIRUAN / UJI LOKAL', 'csrfToken' => $session['csrfToken'], 'endpoint' => '/api/assistant-chat.php', 'resetEndpoint' => '/api/assistant-reset.php']); exit; }
        Host::requirePost($session, $settings);
        if ($path === '/api/assistant-reset.php') { ConversationPrivacy::forget(Host::store($settings), $session['key'], $session['principal']); Host::json(['ok' => true]); exit; }
        $validator = new ProtocolValidator;
        $provider = new PortalProvider(new OpenAiCompatibleProvider($validator, 'https://ai.sumopod.com/v1/chat/completions', 'not-a-real-key', 'synthetic-test-model', new SyntheticHttpClient, options: ['provider' => 'sumopod']), static fn():array => (new \Kabarin\News\NewsRepository)->catalog());
        (new ChatEndpoint(new ConversationEngine($provider, $validator, Host::manifest()), $validator, Host::store($settings), $settings['PAGESQUIRE_ORIGIN'], 100))->serve($session);
    } catch (Throwable $error) { Host::error($error); }
    exit;
}
if ($path === '/' || $path === '/index.html') {
    header('Content-Type: text/html; charset=utf-8');
    echo str_replace('<body>', '<body><div style="background:#ffe8b7;padding:8px;text-align:center;font:11px Arial">UJI LOKAL — PROVIDER TIRUAN, TANPA PANGGILAN SUMOPOD</div>', file_get_contents(dirname(__DIR__) . '/index.html'));
    exit;
}
return false;
