<?php
declare(strict_types=1);
// Explicit opt-in only. Makes one real paid provider completion using a public QA article.
if (PHP_SAPI !== 'cli' || !in_array('--live', $argv ?? [], true)) { fwrite(STDERR, "Opt-in required: php tests/live-summary.php --live\n"); exit(2); }
require dirname(__DIR__) . '/vendor/autoload.php';
use Kabarin\Assistant\Host;
use Kabarin\Assistant\PortalProvider;
use PageSquire\Server\ProtocolValidator;
use PageSquire\Server\ConversationEngine;
use PageSquire\Server\Http\OpenAiCompatibleProvider;

try {
    $input = json_decode(file_get_contents(dirname(__DIR__) . '/.build/live-summary-input.json'), true, 8, JSON_THROW_ON_ERROR);
    if (!is_string($input['text'] ?? null) || mb_strlen($input['text']) < 200 || mb_strlen($input['text']) > 24000 || !preg_match('~^http://(?:localhost|127\.0\.0\.1)(?::\d+)?/.*#artikel/[a-z0-9-]{1,70}$~', $input['url'] ?? '')) throw new RuntimeException('Public QA article input is missing or invalid.');
    $settings = Host::settings(); if (!Host::configured($settings)) throw new RuntimeException('Provider is not configured.');
    $validator = new ProtocolValidator;
    $provider = new PortalProvider(OpenAiCompatibleProvider::fromEnvironment($validator, $settings), static fn():array => (new \Kabarin\News\NewsRepository)->catalog());
    $manifest = Host::manifest(); $ids = array_column($manifest['capabilities'], 'id');
    $engine = new ConversationEngine($provider, $validator, $manifest, maxOutputTokens: 800);
    $snapshot = ['protocolVersion' => '0.1', 'id' => 'live-summary-article', 'url' => $input['url'], 'title' => $input['title'], 'text' => 'Artikel publik sudah terbuka.', 'targets' => [], 'truncated' => ['text' => false, 'targets' => false]];
    $request = ['protocolVersion' => '0.1', 'requestId' => 'live-summary-start', 'message' => 'Telusuri artikel ini lalu rangkum isinya', 'snapshot' => $snapshot, 'capabilityIds' => $ids];
    $first = $engine->handle($request, null, $ids);
    $call = $first['reply']['response']['toolCalls'][0] ?? null;
    if (($call['capabilityId'] ?? '') !== 'page.read') throw new RuntimeException('Reading was not requested before summary.');
    $result = ['protocolVersion' => '0.1', 'callId' => $call['callId'], 'capabilityId' => 'page.read', 'status' => 'success', 'code' => 'VERIFIED', 'message' => 'Public QA DOM text', 'evidence' => (object)['scope' => 'article', 'url' => $input['url'], 'text' => $input['text'], 'complete' => true, 'truncated' => false, 'nextOffset' => null]];
    $last = $engine->handle(['protocolVersion' => '0.1', 'requestId' => 'live-summary-finish', 'conversationId' => $first['reply']['conversationId'], 'snapshot' => $snapshot, 'capabilityIds' => $ids, 'result' => $result], $first['state'], $ids);
    $response = $last['reply']['response'];
    if (!$response['finished'] || $response['toolCalls'] || mb_strlen($response['text']) < 60) throw new RuntimeException('Provider did not return a final summary.');
    file_put_contents(dirname(__DIR__) . '/.build/live-summary-result.json', json_encode(['provider' => 'SumoPod', 'model' => $settings['PAGESQUIRE_MODEL'], 'text' => $response['text'], 'finished' => true], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    echo "PASS: one live SumoPod completion after explicit article reading.\n" . $response['text'] . PHP_EOL;
} catch (Throwable $error) {
    // Never print raw provider bodies, transport errors, settings or credentials.
    fwrite(STDERR, 'Live summary did not pass: ' . ($error instanceof \PageSquire\Server\AssistantException ? $error->errorCode : 'CHECK_FAILED') . PHP_EOL); exit(1);
}
