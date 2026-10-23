<?php
declare(strict_types=1);
require dirname(__DIR__) . '/vendor/autoload.php';
require __DIR__ . '/SyntheticHttpClient.php';

use Kabarin\Assistant\Host;
use Kabarin\Assistant\PortalProvider;
use PageSquire\Server\ConversationEngine;
use PageSquire\Server\ProtocolValidator;
use PageSquire\Server\Http\ChatEndpoint;
use PageSquire\Server\Http\FileConversationStore;
use PageSquire\Server\Http\ConversationPrivacy;
use PageSquire\Server\Http\OpenAiCompatibleProvider;

$checks = 0;
function check(bool $condition, string $name): void { global $checks; if (!$condition) throw new RuntimeException('FAIL: ' . $name); $checks++; echo "PASS: $name\n"; }
$validator = new ProtocolValidator;
$http = new SyntheticHttpClient;
$settings = ['PAGESQUIRE_PROVIDER' => 'sumopod', 'PAGESQUIRE_API_KEY' => 'synthetic-test-key-not-a-real-secret', 'PAGESQUIRE_MODEL' => 'synthetic-test-model'];
$provider = new PortalProvider(OpenAiCompatibleProvider::fromEnvironment($validator, $settings, $http), dirname(__DIR__) . '/tests/fixtures/articles.json');
$directory = sys_get_temp_dir() . '/kabarin-pagesquire-test-' . bin2hex(random_bytes(8));
mkdir($directory, 0700, true);
$store = new FileConversationStore($directory);
$endpoint = new ChatEndpoint(new ConversationEngine($provider, $validator, Host::manifest()), $validator, $store, 'http://localhost', 20);
$session = ['key' => 'synthetic-session', 'principal' => 'synthetic-reader', 'csrfToken' => str_repeat('a', 32), 'capabilityIds' => array_column(Host::manifest()['capabilities'], 'id')];
$headers = ['Origin' => 'http://localhost', 'Content-Type' => 'application/json', 'X-CSRF-Token' => $session['csrfToken']];
$snapshot = ['protocolVersion' => '0.1', 'id' => 'snapshot-1', 'url' => 'http://localhost/tes_openclaw/#', 'title' => 'Kabarin', 'text' => 'Konten publik demo portal Kabarin.', 'targets' => [], 'truncated' => ['text' => false, 'targets' => false]];
$request = ['protocolVersion' => '0.1', 'requestId' => 'request-1', 'message' => 'Pilih kategori yang sesuai dengan topik komputasi', 'snapshot' => $snapshot, 'capabilityIds' => $session['capabilityIds']];
$encode = static fn (array $value): string => json_encode($value, JSON_THROW_ON_ERROR);
try {
    check(!Host::configured([...$settings, 'PAGESQUIRE_API_KEY' => '']), 'Empty key disables live AI');
    check(Host::configured($settings), 'SumoPod configuration resolves without a paid call');
    check($endpoint->handle('POST', [...$headers, 'Origin' => 'https://attacker.invalid'], $encode($request), $session)['status'] === 403, 'Foreign origin rejected');
    check($endpoint->handle('POST', [...$headers, 'X-CSRF-Token' => 'incorrect-token-that-is-long'], $encode($request), $session)['status'] === 419, 'Invalid CSRF rejected');
    check($endpoint->handle('POST', $headers, $encode($request), null)['status'] === 403, 'Unauthenticated session rejected');
    check($endpoint->handle('GET', $headers, '', $session)['status'] === 405, 'Non-POST chat rejected');
    check($endpoint->handle('POST', $headers, '{bad json', $session)['status'] === 422, 'Malformed JSON rejected');
    check($http->calls === 0, 'Invalid requests never reach the provider');
    $first = $endpoint->handle('POST', $headers, $encode($request), $session);
    check($first['status'] === 200 && $first['body']['response']['finished'] === false, 'Real PageSquire engine accepts synthetic provider action');
    $call = $first['body']['response']['toolCalls'][0];
    check($call['capabilityId'] === 'news.category' && $call['snapshotId'] === $snapshot['id'], 'Action is bound to current snapshot');
    check($http->lastRequest['url'] === 'https://ai.sumopod.com/v1/chat/completions', 'Official SumoPod preset uses expected endpoint');
    check($http->lastRequest['body']['model'] === 'synthetic-test-model' && $http->lastRequest['body']['response_format']['type'] === 'json_object', 'Owner model and JSON response mode reach transport');
    check(!str_contains(json_encode($http->lastRequest['body']), $settings['PAGESQUIRE_API_KEY']), 'Provider key never appears in prompt/body');
    check(str_contains($http->lastRequest['body']['messages'][0]['content'], 'Bahasa Indonesia') && str_contains($http->lastRequest['body']['messages'][0]['content'], 'teknologi-1'), 'Portal instructions and relevant article catalog reach provider');
    $same = $endpoint->handle('POST', $headers, $encode($request), $session);
    check($encode($same['body']) === $encode($first['body']) && $http->calls === 1, 'Identical retry is idempotent and does not repeat inference');
    $pending = $endpoint->handle('POST', $headers, $encode([...$request, 'requestId' => 'request-pending', 'conversationId' => $first['body']['conversationId']]), $session);
    check($pending['status'] === 409, 'New message cannot bypass pending action');
    $follow = ['protocolVersion' => '0.1', 'requestId' => 'request-2', 'conversationId' => $first['body']['conversationId'], 'snapshot' => [...$snapshot, 'id' => 'snapshot-2', 'url' => 'http://localhost/tes_openclaw/#kategori/teknologi'], 'capabilityIds' => $session['capabilityIds'], 'result' => ['protocolVersion' => '0.1', 'callId' => $call['callId'], 'capabilityId' => 'news.category', 'status' => 'success', 'code' => 'VERIFIED', 'message' => 'Verified category route', 'evidence' => (object)['route' => 'kategori/teknologi']]];
    $second = $endpoint->handle('POST', $headers, $encode($follow), $session);
    check($second['status'] === 200 && $second['body']['response']['finished'] === true && $http->calls === 2, 'Verified browser result completes the conversation');
    $denied = $endpoint->handle('POST', $headers, $encode([...$request, 'requestId' => 'request-denied', 'message' => 'aksi terlarang']), $session);
    check($denied['status'] === 403, 'Unregistered model capability denied');
    $invalid = $endpoint->handle('POST', $headers, $encode([...$request, 'requestId' => 'request-invalid', 'message' => 'parameter salah']), $session);
    check($invalid['status'] === 502 || $invalid['status'] === 422, 'Out-of-schema model parameters denied');
    $http->invalidResponse = true;
    $bad = $endpoint->handle('POST', $headers, $encode([...$request, 'requestId' => 'request-bad']), $session);
    check($bad['status'] === 502, 'Malformed provider output fails closed');
    $before = $store->transaction($session['key'], static fn ($value, $save) => $value);
    check(ConversationPrivacy::forget($store, $session['key'], $session['principal']), 'Authorized reset erases server transcript');
    $after = $store->transaction($session['key'], static fn ($value, $save) => $value);
    check($after['state'] === null && $after['rate']['count'] === $before['rate']['count'], 'Reset preserves request budget');
    echo "\n$checks checks passed. No live provider/network calls were made.\n";
} finally {
    foreach (glob($directory . '/*') ?: [] as $file) if (is_file($file) && !is_link($file)) unlink($file);
    rmdir($directory);
}
