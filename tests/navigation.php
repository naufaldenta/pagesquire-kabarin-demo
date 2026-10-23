<?php
declare(strict_types=1);
require dirname(__DIR__) . '/vendor/autoload.php';

use Kabarin\Assistant\Host;
use Kabarin\Assistant\NavigationIntent;
use Kabarin\Assistant\PortalProvider;
use PageSquire\Server\ConversationEngine;
use PageSquire\Server\ProtocolValidator;
use PageSquire\Server\Provider;

$checks = 0;
function navCheck(bool $condition, string $label): void { global $checks; if (!$condition) throw new RuntimeException('FAIL: ' . $label); $checks++; echo 'PASS: ' . $label . PHP_EOL; }
$catalog = json_decode(file_get_contents(dirname(__DIR__) . '/tests/fixtures/articles.json'), true, 32, JSON_THROW_ON_ERROR);
$byId = array_column($catalog, null, 'id');
$url = 'http://localhost/tes_openclaw/#';
$history = [['role' => 'assistant', 'content' => json_encode(['text' => 'Artikel terbaru berjudul "' . $byId['nasional-1']['title'] . '" ditulis oleh Aditya Pratama.', 'finished' => true, 'toolCalls' => []], JSON_THROW_ON_ERROR)]];
$cases = [
    ['buka kan aku 1 berita terbaru', 'news.open_article', ['articleId' => 'nasional-1']],
    ['oke buka kan artikel itu', 'news.open_article', ['articleId' => 'nasional-1']],
    ['tolong bukakan satu berita teknologi terbaru', 'news.open_article', ['articleId' => 'teknologi-1']],
    ['buka halaman teknologi', 'news.category', ['category' => 'teknologi']],
    ['buka page olahraga', 'news.category', ['category' => 'olahraga']],
    ['buka halaman gaya hidup', 'news.category', ['category' => 'gaya-hidup']],
    ['buka artikel nasional-24', 'news.open_article', ['articleId' => 'nasional-24']],
    ['buka halaman tersimpan', 'news.saved', []],
    ['tampilkan berita terpopuler', 'news.collection', ['collection' => 'populer']],
    ['bukakan pilihan editor', 'news.collection', ['collection' => 'editor']],
    ['buka lensa kabarin', 'news.collection', ['collection' => 'lensa']],
    ['buka beranda', 'news.home', []],
    ['buka halaman berita terbaru', 'news.section', ['section' => 'latest']],
    ['buka bagian opini', 'news.section', ['section' => 'opinion']],
    ['bawa aku ke bagian terbaru', 'news.section', ['section' => 'latest']],
    ['buka #kategori/dunia', 'news.category', ['category' => 'dunia']],
    ['buka http://localhost/tes_openclaw/#artikel/teknologi-1', 'news.open_article', ['articleId' => 'teknologi-1']],
    ['buka ' . $byId['gaya-hidup-3']['title'], 'news.open_article', ['articleId' => 'gaya-hidup-3']],
];
foreach ($cases as [$query, $id, $params]) {
    $plan = NavigationIntent::resolve($query, $catalog, $history, $url);
    navCheck(($plan['capabilityId'] ?? '') === $id && (array)($plan['parameters'] ?? null) === $params, $query);
}
foreach (['jangan buka teknologi', 'jelaskan cara membuka halaman teknologi', 'kalau saya bilang buka page nasional', 'apa isi berita terbaru'] as $query) navCheck(NavigationIntent::resolve($query, $catalog, $history, $url) === null, 'No automatic action: ' . $query);
navCheck(isset(NavigationIntent::resolve('buka artikel itu', $catalog, [], $url)['clarification']), 'Unknown reference asks for clarification');
$multiple = [['role' => 'assistant', 'content' => json_encode(['text' => $byId['nasional-1']['title'] . ' dan ' . $byId['teknologi-1']['title']], JSON_THROW_ON_ERROR)]];
navCheck(isset(NavigationIntent::resolve('buka artikel itu', $catalog, $multiple, $url)['clarification']), 'Multiple referenced articles do not silently select one');
navCheck(isset(NavigationIntent::resolve('buka https://example.com/#artikel/nasional-1', $catalog, $history, $url)['clarification']), 'External URL is not a portal navigation action');
navCheck(isset(NavigationIntent::resolve('buka http://localhost/tes_openclaw/api/assistant-reset.php', $catalog, $history, $url)['clarification']), 'API paths cannot be opened as pages');
navCheck(isset(NavigationIntent::resolve('buka halaman rahasia', $catalog, [], $url)['clarification']), 'Unknown page asks for a supported destination');

// Reproduce a model that always summarizes instead of calling tools.
$summaryOnly = new class implements Provider {
    public int $calls = 0;
    public function complete(array $messages, array $capabilities, int $maxOutputTokens): array { $this->calls++; return ['text' => 'Ini hanya ringkasan, tanpa aksi navigasi.', 'emotion' => 'idle', 'finished' => true, 'toolCalls' => []]; }
};
$provider = new PortalProvider($summaryOnly, dirname(__DIR__) . '/tests/fixtures/articles.json');
$engine = new ConversationEngine($provider, new ProtocolValidator, Host::manifest());
$ids = array_column(Host::manifest()['capabilities'], 'id');
$snapshot = ['protocolVersion' => '0.1', 'id' => 'nav-snapshot-1', 'url' => $url, 'title' => 'Kabarin', 'text' => 'Kabar Terbaru', 'targets' => [], 'truncated' => ['text' => false, 'targets' => false]];
$request = ['protocolVersion' => '0.1', 'requestId' => 'nav-request-1', 'message' => 'buka kan aku 1 berita terbaru', 'snapshot' => $snapshot, 'capabilityIds' => $ids];
$first = $engine->handle($request, null, $ids);
$call = $first['reply']['response']['toolCalls'][0] ?? null;
navCheck($first['reply']['response']['finished'] === false && $call['capabilityId'] === 'news.open_article' && $call['parameters']->articleId === 'nasional-1', 'Original request produces an authorized action, even if model would only summarize');
navCheck($summaryOnly->calls === 0, 'Unambiguous navigation requires no paid inference');
$follow = ['protocolVersion' => '0.1', 'requestId' => 'nav-request-2', 'conversationId' => $first['reply']['conversationId'], 'snapshot' => [...$snapshot, 'id' => 'nav-snapshot-2', 'url' => 'http://localhost/tes_openclaw/#artikel/nasional-1'], 'capabilityIds' => $ids, 'result' => ['protocolVersion' => '0.1', 'callId' => $call['callId'], 'capabilityId' => $call['capabilityId'], 'status' => 'success', 'code' => 'VERIFIED', 'message' => 'Verified article route', 'evidence' => (object)['route' => 'artikel/nasional-1']]];
$second = $engine->handle($follow, $first['state'], $ids);
navCheck($second['reply']['response']['finished'] && str_contains($second['reply']['response']['text'], 'sudah dibuka') && $summaryOnly->calls === 0, 'Success is acknowledged only after verified browser result');
$third = $engine->handle([...$request, 'requestId' => 'nav-request-3', 'conversationId' => $second['reply']['conversationId'], 'message' => 'oke buka kan artikel itu', 'snapshot' => $follow['snapshot']], $second['state'], $ids);
navCheck(($third['reply']['response']['toolCalls'][0]['parameters']->articleId ?? null) === 'nasional-1', 'Original follow-up resolves the referenced article through server-owned history');
$fallback = $provider->complete([['role' => 'user', 'content' => 'Apa yang bisa kamu bantu?']], Host::manifest()['capabilities'], 1000);
navCheck($fallback['finished'] && $summaryOnly->calls === 1, 'General discussion still uses the configured AI provider');
echo PHP_EOL . $checks . ' navigation checks passed. No live inference was requested.' . PHP_EOL;
