<?php
declare(strict_types=1);

namespace Kabarin\Assistant;

/** Resolves explicit portal navigation only; it grants no new capabilities. */
final class NavigationIntent
{
    private const CATEGORIES = ['nasional' => 'Nasional', 'dunia' => 'Dunia', 'ekonomi' => 'Ekonomi', 'teknologi' => 'Teknologi', 'olahraga' => 'Olahraga', 'gaya-hidup' => 'Gaya Hidup', 'otomotif' => 'Otomotif', 'hiburan' => 'Hiburan', 'opini' => 'Opini'];
    private const COLLECTIONS = ['editor' => ['pilihan editor', 'editor'], 'populer' => ['terpopuler', 'paling populer', 'paling banyak dibaca', 'populer'], 'lensa' => ['lensa kabarin', 'lensa', 'cerita foto', 'galeri foto'], 'sorotan' => ['sorotan', 'headline']];

    public static function normalize(string $text): string
    {
        $text = mb_strtolower($text);
        $text = preg_replace('/\bbuka\s+kan\b/u', 'bukakan', $text);
        return trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $text));
    }

    /** Returns a safe action plan or a clarification; null delegates interpretation to AI. */
    public static function resolve(string $query, array $catalog, array $messages, string $pageUrl): ?array
    {
        $text = self::normalize($query);
        if (preg_match('/\b(?:jangan|jgn|tidak|nggak|gak|ga|batal|batalkan|bukan)\b/u', $text)) return null;
        if (!preg_match('/^(?:(?:tolong|mohon|oke|ok|ya|baik|coba|please|bisa|bisakah|boleh|aku mau|saya mau|aku ingin|saya ingin)\s+)*(?:buka|bukakan|bukain|open|tampilkan|lihat|perlihatkan|bawa|arahkan|pergi|go to)\b/u', $text)) return null;
        $byId = array_column($catalog, null, 'id');
        if (preg_match('~https?://[^\s<>"\x27]+|\#[^\s<>"\x27]+~ui', $query, $match)) {
            return self::fromUrl(rtrim($match[0], '.,!?)'), $pageUrl, $byId);
        }
        if (preg_match('/\b(?:news-[a-f0-9]{16}|(?:nasional|dunia|ekonomi|teknologi|olahraga|gaya-hidup|otomotif|hiburan|opini)-(?:[1-9]|1[0-9]|2[0-4]))\b/u', mb_strtolower($query), $match)) {
            return isset($byId[$match[0]]) ? self::article($byId[$match[0]]) : self::clarify('Artikel itu belum tersedia di Kabarin. Sebutkan judul atau kategori yang ingin dibuka.');
        }
        foreach (array_reverse($catalog) as $article) {
            if (str_contains($text, self::normalize($article['title']))) return self::article($article);
        }
        $categories = [];
        foreach (self::CATEGORIES as $id => $label) if (preg_match('/\b' . preg_quote(self::normalize($label), '/') . '\b/u', $text)) $categories[] = $id;
        if (count($categories) > 1) return self::clarify('Kamu ingin membuka kategori yang mana? Pilih satu kategori agar aku membuka halaman yang tepat.');
        if (preg_match('/\b(?:bagian|section|seksi)\b/u', $text)) {
            foreach (['opini' => 'opinion', 'editor' => 'editor', 'terbaru' => 'latest', 'lensa' => 'lens', 'perspektif' => 'perspectives', 'newsletter' => 'newsletter', 'sorotan' => 'headline'] as $alias => $section) {
                if (preg_match('/\b' . $alias . '\b/u', $text)) return self::action('news.section', ['section' => $section], 'Bagian yang kamu minta sudah ditampilkan.');
            }
        }

        $latest = preg_match('/\b(?:terbaru|terakhir|paling baru|latest|newest)\b/u', $text);
        if ($latest && preg_match('/\b(?:artikel|berita|news)\b/u', $text)) {
            if (preg_match('/\b(?:semua|daftar|beberapa|halaman|page)\b/u', $text) && !preg_match('/\b(?:1|satu|sebuah)\b/u', $text)) {
                return $categories ? self::category($categories[0]) : self::action('news.section', ['section' => 'latest'], 'Bagian Kabar Terbaru sudah ditampilkan.');
            }
            $items = array_values(array_filter($catalog, static fn (array $a): bool => !$categories || $a['category'] === $categories[0]));
            usort($items, static fn (array $a, array $b): int => ($a['ageMinutes'] ?? PHP_INT_MAX) <=> ($b['ageMinutes'] ?? PHP_INT_MAX));
            return $items ? self::article($items[0]) : null;
        }
        if (preg_match('/\b(?:artikel|berita|bacaan)\s+(?:itu|tersebut|tadi|ini|yang kamu sebut|yang tadi)\b/u', $text)) {
            if (str_contains($text, ' ini') && preg_match('~#artikel/([a-z0-9-]{1,70})$~', $pageUrl, $match) && isset($byId[$match[1]])) return self::article($byId[$match[1]]);
            foreach (array_reverse($messages) as $message) {
                if ($message['role'] !== 'assistant') continue;
                $content = json_decode($message['content'], true);
                foreach ($content['toolCalls'] ?? [] as $call) {
                    $id = $call['parameters']['articleId'] ?? null;
                    if ($call['capabilityId'] === 'news.open_article' && isset($byId[$id])) return self::article($byId[$id]);
                }
                $spoken = self::normalize(is_array($content) ? ($content['text'] ?? '') : $message['content']);
                $matches = array_values(array_filter($catalog, static fn (array $a): bool => str_contains($spoken, self::normalize($a['title']))));
                if (count($matches) === 1) return self::article($matches[0]);
                if (count($matches) > 1) return self::clarify('Tadi ada beberapa artikel yang disebut. Sebutkan judul artikel yang ingin kamu buka.');
            }
            return self::clarify('Artikel yang mana? Sebutkan judulnya, atau minta aku membuka satu berita terbaru.');
        }
        if (preg_match('/\b(?:tersimpan|bookmark|favorit)\b/u', $text)) return self::action('news.saved', [], 'Halaman Bacaan Tersimpan sudah dibuka.');
        foreach (self::COLLECTIONS as $id => $aliases) foreach ($aliases as $alias) {
            if (preg_match('/\b' . preg_quote($alias, '/') . '\b/u', $text)) return self::collection($id);
        }
        if ($categories) return self::category($categories[0]);
        if (preg_match('/\b(?:beranda|home|homepage|halaman utama)\b/u', $text)) return self::action('news.home', [], 'Beranda Kabarin sudah dibuka.');
        if (preg_match('/\b(?:halaman|page)\b/u', $text)) return self::clarify('Halaman mana yang ingin dibuka? Misalnya Beranda, Teknologi, Terpopuler, Pilihan Editor, Lensa Kabarin, atau Bacaan Tersimpan.');
        return null;
    }

    private static function fromUrl(string $url, string $pageUrl, array $byId): array
    {
        $current = parse_url($pageUrl);
        $destination = str_starts_with($url, '#') ? ['fragment' => substr($url, 1)] : parse_url($url);
        if (!is_array($destination) || isset($destination['user']) || isset($destination['pass']) || isset($destination['query'])) return self::clarify('Aku hanya bisa membuka halaman portal Kabarin yang terdaftar.');
        if (!str_starts_with($url, '#')) {
            foreach (['scheme', 'host', 'port'] as $key) if (($destination[$key] ?? null) !== ($current[$key] ?? null)) return self::clarify('Aku dapat menavigasi halaman di portal Kabarin. Tautan di luar portal belum termasuk aksi yang diizinkan.');
            $path = $current['path'] ?? '/';
            if (!in_array($destination['path'] ?? '/', [$path, rtrim($path, '/') . '/index.html'], true)) return self::clarify('Tautan itu bukan halaman Kabarin yang terdaftar.');
        }
        $route = trim(rawurldecode($destination['fragment'] ?? ''), '/');
        if ($route === '') return self::action('news.home', [], 'Beranda Kabarin sudah dibuka.');
        if ($route === 'tersimpan') return self::action('news.saved', [], 'Halaman Bacaan Tersimpan sudah dibuka.');
        if (str_starts_with($route, 'kategori/') && isset(self::CATEGORIES[substr($route, 9)])) return self::category(substr($route, 9));
        if (str_starts_with($route, 'koleksi/') && isset(self::COLLECTIONS[substr($route, 8)])) return self::collection(substr($route, 8));
        if (str_starts_with($route, 'artikel/') && isset($byId[substr($route, 8)])) return self::article($byId[substr($route, 8)]);
        if (str_starts_with($route, 'cari/') && strlen(trim(substr($route, 5))) > 0 && mb_strlen(substr($route, 5)) <= 120) return self::action('news.search', ['query' => substr($route, 5)], 'Hasil pencarian sudah ditampilkan.');
        return self::clarify('Halaman itu belum terdaftar. Sebutkan kategori, koleksi, atau judul artikel yang ingin dibuka.');
    }

    private static function article(array $article): array { return self::action('news.open_article', ['articleId' => $article['id']], 'Artikel “' . $article['title'] . '” sudah dibuka.'); }
    private static function category(string $id): array { return self::action('news.category', ['category' => $id], 'Halaman ' . self::CATEGORIES[$id] . ' sudah dibuka.'); }
    private static function collection(string $id): array { return self::action('news.collection', ['collection' => $id], 'Koleksi ' . ['sorotan' => 'Sorotan', 'editor' => 'Pilihan Editor', 'populer' => 'Terpopuler', 'lensa' => 'Lensa Kabarin'][$id] . ' sudah dibuka.'); }
    private static function action(string $id, array $parameters, string $confirmation): array { return ['capabilityId' => $id, 'parameters' => (object)$parameters, 'confirmation' => $confirmation]; }
    private static function clarify(string $text): array { return ['clarification' => $text]; }
}
