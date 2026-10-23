<?php
declare(strict_types=1);

use PageSquire\Server\Http\HttpClient;

/** Deterministic TEST ONLY transport. Production never imports this file. */
final class SyntheticHttpClient implements HttpClient
{
    public int $calls = 0;
    public ?array $lastRequest = null;
    public bool $invalidResponse = false;

    public function post(string $url, array $headers, string $body, int $timeoutSeconds, int $maxBytes): string
    {
        $this->calls++;
        $request = json_decode($body, true, 64, JSON_THROW_ON_ERROR);
        $this->lastRequest = ['url' => $url, 'headers' => $headers, 'body' => $request];
        if ($this->invalidResponse) return '{"choices":[]}';
        $query = '';
        $result = null;
        $pageUrl = '';
        foreach ($request['messages'] as $message) {
            if ($message['role'] !== 'user') continue;
            $decoded = json_decode($message['content'], true);
            if (!is_array($decoded)) { $query = mb_strtolower($message['content']); $result = null; }
            elseif (isset($decoded['browserResult'])) $result = $decoded['browserResult'];
            elseif (isset($decoded['untrustedPage']['url'])) $pageUrl = $decoded['untrustedPage']['url'];
        }
        $draft = ['text' => 'Ini respons provider tiruan untuk pengujian lokal, bukan respons SumoPod.', 'emotion' => 'happy', 'finished' => true, 'toolCalls' => []];
        if ($result !== null) {
            $draft['text'] = 'Aksi sudah diverifikasi oleh PageSquire. (Provider tiruan untuk uji lokal.)';
            if (($result['capabilityId'] ?? '') === 'page.read') {
                $text = $result['evidence']['text'] ?? '';
                $draft['text'] = "Ringkasan uji lokal dari isi yang dibaca:\n" . mb_substr($text, 0, 430) . "\n\nRespons ini disimulasikan provider uji, bukan SumoPod. Data berita mengikuti sumber yang sedang diuji.";
            }
        }
        else {
            $call = match (true) {
                str_contains($query, 'terlarang') => ['news.delete', new stdClass],
                str_contains($query, 'parameter salah') => ['news.theme', (object)['theme' => 'purple']],
                str_contains($query, 'kategori') => ['news.category', (object)['category' => 'teknologi']],
                str_contains($query, 'buka artikel') => ['news.open_article', (object)['articleId' => 'teknologi-1']],
                str_contains($query, 'simpan artikel') => ['news.bookmark', (object)['articleId' => preg_match('~#artikel/([a-z-]+-\d+)$~', $pageUrl, $m) ? $m[1] : 'teknologi-1', 'saved' => !str_contains($query, 'batalkan')]],
                str_contains($query, 'perbesar') => ['news.reading_size', (object)['size' => 'large']],
                str_contains($query, 'mode gelap') => ['news.theme', (object)['theme' => 'dark']],
                str_contains($query, 'mode terang') => ['news.theme', (object)['theme' => 'light']],
                str_contains($query, 'terpopuler') => ['news.collection', (object)['collection' => 'populer']],
                str_contains($query, 'tersimpan') => ['news.saved', new stdClass],
                str_contains($query, 'bagian opini') => ['news.section', (object)['section' => 'opinion']],
                str_contains($query, 'beranda') => ['news.home', new stdClass],
                str_contains($query, 'cari') => ['news.search', (object)['query' => 'kota']],
                default => null,
            };
            if (str_contains($query, 'lambat')) usleep(1500000);
            if ($call !== null) { $draft['finished'] = false; $draft['text'] = 'Mengusulkan satu aksi untuk uji lokal.'; $draft['toolCalls'] = [['capabilityId' => $call[0], 'parameters' => $call[1]]]; }
            if (str_contains($query, 'ringkas')) $draft['text'] = 'Ringkasan simulasi: artikel ini membahas teknologi AI dalam keseharian. Semua artikel Kabarin adalah dummy. Ini hasil provider tiruan, bukan SumoPod.';
        }
        return json_encode(['choices' => [['finish_reason' => 'stop', 'message' => ['role' => 'assistant', 'content' => json_encode($draft, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)]]]], JSON_THROW_ON_ERROR);
    }
}
