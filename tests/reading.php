<?php
declare(strict_types=1);
require dirname(__DIR__) . '/vendor/autoload.php';
use Kabarin\Assistant\Host;
use Kabarin\Assistant\PortalProvider;
use Kabarin\Assistant\ReadingIntent;
use PageSquire\Server\ConversationEngine;
use PageSquire\Server\ProtocolValidator;
use PageSquire\Server\Provider;
use PageSquire\Server\AssistantException;

$checks = 0;
function readCheck(bool $ok, string $label): void { global $checks; if (!$ok) throw new RuntimeException('FAIL: ' . $label); $checks++; echo 'PASS: ' . $label . PHP_EOL; }
$root = dirname(__DIR__);
foreach (['ConversationEngine.php', 'ProtocolValidator.php'] as $file) readCheck(hash_file('sha256', "$root/.vendor/pagesquire/packages/php/src/$file") === hash_file('sha256', "$root/vendor/pagesquire/server/src/$file"), 'Installed PHP matches new upstream: ' . $file);
$probe = new class implements Provider {
    public int $calls = 0;
    public array $messages = [];
    public function complete(array $messages, array $capabilities, int $maxOutputTokens): array {
        $this->calls++; $this->messages = $messages;
        return ['text' => 'Ringkasan uji dari bacaan terverifikasi.', 'emotion' => 'happy', 'finished' => true, 'toolCalls' => []];
    }
};
$validator = new ProtocolValidator;
$manifest = Host::manifest(); $ids = array_column($manifest['capabilities'], 'id');
$engine = new ConversationEngine(new PortalProvider($probe, "$root/tests/fixtures/articles.json"), $validator, $manifest);
$context = ['schemaVersion' => 1, 'fields' => [['name' => 'view', 'value' => 'home']], 'availability' => [['capabilityId' => 'news.reading_size', 'status' => 'not_applicable']]];
$snapshot = ['protocolVersion' => '0.1', 'id' => 'reading-home', 'url' => 'http://localhost/tes_openclaw/#', 'title' => 'Kabarin', 'text' => 'Kabar Terbaru', 'targets' => [], 'truncated' => ['text' => false, 'targets' => false]];
$request = ['protocolVersion' => '0.1', 'requestId' => 'reading-1', 'message' => 'Buka satu berita terbaru lalu telusuri dan rangkum isinya', 'snapshot' => $snapshot, 'capabilityIds' => $ids, 'appContext' => $context];
$one = $engine->handle($request, null, $ids); $call = $one['reply']['response']['toolCalls'][0];
readCheck($call['capabilityId'] === 'news.open_article' && !$one['reply']['response']['finished'], 'Compound goal starts with article navigation');
readCheck($probe->calls === 0, 'Navigation does not need an inference');
$arrived = [...$snapshot, 'id' => 'reading-article', 'url' => 'http://localhost/tes_openclaw/#artikel/nasional-1'];
$context['fields'][0]['value'] = 'article'; $context['availability'][0]['status'] = 'available';
$follow = ['protocolVersion' => '0.1', 'requestId' => 'reading-2', 'conversationId' => $one['reply']['conversationId'], 'snapshot' => $arrived, 'capabilityIds' => $ids, 'appContext' => $context, 'result' => ['protocolVersion' => '0.1', 'callId' => $call['callId'], 'capabilityId' => $call['capabilityId'], 'status' => 'success', 'code' => 'VERIFIED', 'message' => 'Article verified', 'evidence' => (object)['route' => 'artikel/nasional-1']]];
$two = $engine->handle($follow, $one['state'], $ids); $read = $two['reply']['response']['toolCalls'][0];
readCheck($read['capabilityId'] === 'page.read' && $read['parameters']->scope === 'article' && $read['parameters']->mode === 'full', 'Verified arrival preserves summary goal and requests actual article text');
readCheck($probe->calls === 0 && !$two['reply']['response']['finished'], 'Navigation confirmation does not prematurely finish a compound goal');
$evidence = ['scope' => 'article', 'url' => $arrived['url'], 'text' => 'PUBLIC READING MARKER: Trotoar lebar dan taman membantu warga bertemu.', 'truncated' => false, 'nextOffset' => null, 'complete' => true];
$finish = [...$follow, 'requestId' => 'reading-3', 'result' => [...$follow['result'], 'callId' => $read['callId'], 'capabilityId' => 'page.read', 'evidence' => (object)$evidence]];
$three = $engine->handle($finish, $two['state'], $ids);
readCheck($three['reply']['response']['finished'] && $probe->calls === 1, 'Only the final summary invokes the configured provider once');
readCheck(str_contains($three['reply']['response']['text'], 'cuplikan sumber'), 'Excerpt coverage remains present even if model omits it');
readCheck(str_contains(json_encode($probe->messages), 'PUBLIC READING MARKER'), 'Provider receives verified DOM reading, not just article metadata');
readCheck(str_contains($probe->messages[0]['content'], 'evidence.text') && str_contains($probe->messages[0]['content'], 'finished=true'), 'Final summary instructions preserve evidence and terminate the completed goal');
readCheck(!str_contains(json_encode($three['state']['messages']), 'untrustedAppContext'), 'Raw app context is not persisted into durable history');
$standalone = $engine->handle([...$request, 'requestId' => 'reading-standalone', 'message' => 'Rangkum artikel ini', 'snapshot' => $arrived], null, $ids);
readCheck($standalone['reply']['response']['toolCalls'][0]['capabilityId'] === 'page.read', 'Summary request on an article reads before answering');
$missing = $engine->handle([...$request, 'requestId' => 'reading-missing', 'message' => 'Ringkas artikel ini'], null, $ids);
readCheck($missing['reply']['response']['finished'] && str_contains($missing['reply']['response']['text'], 'Buka sebuah artikel'), 'Article reference on the homepage asks for a real article');
$truncated = ['capabilityId' => 'page.read', 'status' => 'success', 'evidence' => [...$evidence, 'truncated' => true, 'nextOffset' => 24000, 'complete' => false]];
$next = ReadingIntent::resolve('Rangkum artikel ini', $arrived['url'], null, [$truncated]);
readCheck($next['parameters']->offset === 24000, 'Truncated reading follows the supported next offset');
$end = ReadingIntent::resolve('Rangkum artikel ini', $arrived['url'], null, [[...$truncated, 'evidence' => [...$truncated['evidence'], 'nextOffset' => null]]]);
readCheck($end['summary'] && !$end['complete'], 'Uncontinuable reading retains explicit partial coverage');
readCheck(ReadingIntent::resolve('Jangan rangkum artikel ini', $arrived['url'], null, []) === null, 'Negation does not start a hidden reading');
$scroll = ReadingIntent::resolve('Gulir artikel ini ke bawah lalu atas', $arrived['url'], null, []);
readCheck($scroll['capabilityId'] === 'page.scroll_to' && $scroll['parameters']->position === 'end', 'Explicit scroll follows the first requested edge');
$scrollNext = ReadingIntent::resolve('Gulir artikel ini ke bawah lalu atas', $arrived['url'], null, [['capabilityId' => 'page.scroll_to', 'status' => 'success', 'evidence' => ['scope' => 'article', 'position' => 'end']]]);
readCheck($scrollNext['parameters']->position === 'start', 'Compound scroll preserves the second requested edge');
$highlight = ReadingIntent::resolve('Sorot artikel ini', $arrived['url'], null, []);
readCheck($highlight['capabilityId'] === 'page.highlight', 'Explicit highlight uses the configured public article scope');
$withoutReader = $engine->handle([...$request, 'requestId' => 'reading-unregistered', 'message' => 'Rangkum artikel ini', 'snapshot' => $arrived, 'capabilityIds' => array_values(array_diff($ids, ['page.read']))], null, $ids);
readCheck($withoutReader['reply']['response']['finished'] && !$withoutReader['reply']['response']['toolCalls'] && $probe->calls === 1, 'Missing reader does not substitute catalog metadata or call the model');
$bad = $context; $bad['fields'][] = $bad['fields'][0];
try { $validator->validate('appContext', $bad); readCheck(false, 'Duplicate context'); } catch (AssistantException $error) { readCheck($error->errorCode === 'INVALID_PAYLOAD', 'Duplicate context identities fail closed with new PHP validator'); }
$restricted = new class implements Provider { public function complete(array $m, array $c, int $n): array { return ['text' => 'Change font', 'emotion' => 'idle', 'finished' => false, 'toolCalls' => [['capabilityId' => 'news.reading_size', 'parameters' => (object)['size' => 'large']]]]; } };
try { (new ConversationEngine($restricted, $validator, $manifest))->handle([...$request, 'requestId' => 'reading-unavailable'], null, $ids); readCheck(false, 'Unavailable context'); } catch (AssistantException $error) { readCheck($error->errorCode === 'CAPABILITY_UNAVAILABLE', 'Context suppresses new actions that are unavailable on the homepage'); }
echo PHP_EOL . $checks . ' reading/context checks passed. No live inference requested.' . PHP_EOL;
