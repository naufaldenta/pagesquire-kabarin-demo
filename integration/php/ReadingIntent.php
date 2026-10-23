<?php
declare(strict_types=1);

namespace Kabarin\Assistant;

/** Keeps explicit open/read/summary goals across verified PageSquire rounds. */
final class ReadingIntent
{
    public static function resolve(string $query, string $pageUrl, ?array $navigation, array $results): ?array
    {
        $text = NavigationIntent::normalize($query);
        if (preg_match('/\b(?:jangan|jgn|tidak|nggak|gak|ga|batal|batalkan|bukan)\b/u', $text)) return null;
        $summary = (bool)preg_match('/\b(?:ringkas|ringkaskan|ringkasin|rangkum|rangkumkan|merangkum|ringkasan|summary|summarize)\b/u', $text);
        $read = $summary || preg_match('/\b(?:telusuri|pindai|scan|baca)\b/u', $text);
        $scroll = (bool)preg_match('/\b(?:scroll|gulir)\b/u', $text);
        $highlight = (bool)preg_match('/\b(?:sorot|tandai|highlight)\s+(?:artikel|halaman)(?:\s+ini)?\b/u', $text);
        $explicit = preg_match('/^(?:(?:tolong|mohon|oke|ok|ya|baik|coba|please|bisa|bisakah|boleh)\s+)*(?:ringkas|ringkaskan|ringkasin|rangkum|rangkumkan|buat ringkasan|summary|summarize|telusuri|pindai|scan|baca|scroll|gulir|sorot|tandai|highlight)\b/u', $text);
        if ((!$read && !$scroll && !$highlight) || (!$explicit && $navigation === null)) return null;
        if (isset($navigation['clarification'])) return $navigation;
        if ($navigation !== null) {
            $arrived = array_filter($results, static fn (array $r): bool => ($r['capabilityId'] ?? '') === $navigation['capabilityId'] && ($r['status'] ?? '') === 'success');
            if (!$arrived) return $navigation;
        }
        $article = (bool)preg_match('~#artikel/[a-z0-9-]{1,70}$~', $pageUrl);
        if (!$article && preg_match('/\b(?:artikel|berita ini|bacaan ini)\b/u', $text)) return ['clarification' => 'Buka sebuah artikel terlebih dahulu, atau minta “buka satu berita terbaru lalu rangkum isinya”.'];
        $scope = $article ? 'article' : 'page';
        if (!$read) {
            if ($scroll) {
                preg_match_all('/\b(?:atas|awal|start|bawah|akhir|end)\b/u', $text, $edges);
                $positions = array_values(array_unique(array_map(static fn (string $edge): string => in_array($edge, ['atas', 'awal', 'start'], true) ? 'start' : 'end', $edges[0])));
                if (!$positions) return ['clarification' => 'Ingin menggulir ke atas atau ke bawah?'];
                foreach ($positions as $position) {
                    if (!array_filter($results, static fn (array $r): bool => ($r['capabilityId'] ?? '') === 'page.scroll_to' && ($r['status'] ?? '') === 'success' && ($r['evidence']['scope'] ?? '') === $scope && ($r['evidence']['position'] ?? '') === $position)) return ['capabilityId' => 'page.scroll_to', 'parameters' => (object)['scope' => $scope, 'position' => $position]];
                }
            } elseif (!array_filter($results, static fn (array $r): bool => ($r['capabilityId'] ?? '') === 'page.highlight' && ($r['status'] ?? '') === 'success')) return ['capabilityId' => 'page.highlight', 'parameters' => (object)['scope' => $scope]];
            return ['summary' => false, 'confirmation' => $scroll ? 'Halaman sudah digulir ke posisi yang kamu minta.' : 'Bagian yang kamu minta sudah ditunjukkan.'];
        }
        $reads = array_values(array_filter($results, static fn (array $r): bool => ($r['capabilityId'] ?? '') === 'page.read' && ($r['status'] ?? '') === 'success' && ($r['evidence']['scope'] ?? '') === $scope && ($r['evidence']['url'] ?? '') === $pageUrl));
        $last = $reads ? $reads[array_key_last($reads)]['evidence'] : null;
        $offset = $last === null ? 0 : ($last['nextOffset'] ?? null);
        if ($last === null || (($last['truncated'] ?? false) && is_int($offset) && $offset > 0 && $offset <= 40000 && count($reads) < 3)) {
            return ['capabilityId' => 'page.read', 'parameters' => (object)['scope' => $scope, 'mode' => 'full', 'offset' => $offset], 'confirmation' => 'Isi halaman sudah ditelusuri.'];
        }
        return ['summary' => $summary, 'complete' => !($last['truncated'] ?? true), 'confirmation' => ($article ? 'Isi artikel' : 'Isi halaman') . ' sudah dibaca dan diverifikasi.' . (($last['truncated'] ?? false) ? ' Bacaan masih sebagian karena batas panjang teks.' : '')];
    }
}
