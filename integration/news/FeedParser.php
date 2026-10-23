<?php
declare(strict_types=1);
namespace Kabarin\News;

final class FeedParser
{
    private const ARTICLE_HOSTS = ['www.antaranews.com','antaranews.com','otomotif.antaranews.com','www.cnnindonesia.com','cnnindonesia.com','www.cnbcindonesia.com','cnbcindonesia.com'];
    private const IMAGE_HOSTS = ['img.antaranews.com','akcdn.detik.net.id','awsimages.detik.net.id','cdn.cnnindonesia.com','cdn.cnbcindonesia.com'];

    public static function safeUrl(string $url, bool $image = false): string
    {
        $url = html_entity_decode(trim($url), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $p = parse_url($url);
        if (!is_array($p) || ($p['scheme'] ?? '') !== 'https' || isset($p['user']) || isset($p['pass']) || isset($p['port']) || !in_array(strtolower($p['host'] ?? ''), $image ? self::IMAGE_HOSTS : self::ARTICLE_HOSTS, true)) return '';
        return preg_replace('/[\x00-\x20<>"\x27]/', '', $url);
    }
    public static function text(string $html, int $limit = 6000): string
    {
        $html = preg_replace('~<(script|style|iframe|object)\b[^>]*>.*?</\1>~is', '', $html);
        return mb_substr(trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'))), 0, $limit);
    }
    public static function parse(string $body, array $feed): array
    {
        if (strlen($body) > 2000000 || preg_match('/<!DOCTYPE|<!ENTITY/i', $body)) throw new \RuntimeException('Unsafe or oversized feed.');
        $previous = libxml_use_internal_errors(true);
        try { $xml = simplexml_load_string($body, \SimpleXMLElement::class, LIBXML_NONET | LIBXML_NOCDATA); }
        finally { libxml_clear_errors(); libxml_use_internal_errors($previous); }
        if (!$xml || !isset($xml->channel->item)) throw new \RuntimeException('Invalid RSS feed.');
        $articles = [];
        foreach ($xml->channel->item as $item) {
            $url = self::safeUrl((string)$item->link);
            $title = self::text((string)$item->title, 500);
            $published = strtotime((string)$item->pubDate);
            if (!$url || !$title || $published === false || $published > time() + 86400) continue;
            // The canonical publisher link, never its position in a changing feed, defines identity.
            $url = preg_replace('/[?#].*$/', '', $url);
            $description = (string)$item->description;
            $content = (string)($item->children('http://purl.org/rss/1.0/modules/content/')->encoded ?? '');
            $summary = self::text($content !== '' ? $content : $description);
            $media = $item->children('http://search.yahoo.com/mrss/');
            $mediaAttributes = isset($media->content) ? $media->content->attributes() : null;
            $enclosureAttributes = isset($item->enclosure) ? $item->enclosure->attributes() : null;
            $image = self::safeUrl((string)($mediaAttributes['url'] ?? $enclosureAttributes['url'] ?? ''), true);
            if (!$image && preg_match('~<img\b[^>]*\bsrc=["\x27]([^"\x27]+)~i', $description, $match)) $image = self::safeUrl($match[1], true);
            $caption = self::text((string)($media->content->children('http://search.yahoo.com/mrss/')->description ?? ''), 1500);
            $creator = self::text((string)($item->children('http://purl.org/dc/elements/1.1/')->creator ?? $item->author ?? ''), 200);
            $category = $feed['category'];
            if (($feed['kind'] ?? '') === 'photo') {
                $caption = $summary;
                foreach (['olahraga'=>'liga|sepak bola|panahan|medali|atlet|pertandingan|timnas','ekonomi'=>'ekonomi|kur|umkm|pasar|kredit|bank|investasi','hiburan'=>'film|musik|konser|penyanyi','dunia'=>'gaza|palestina|ukraina|israel|amerika','otomotif'=>'mobil|otomotif|kendaraan','teknologi'=>'teknologi|digital|internet'] as $id => $words) if (preg_match('/\b(?:' . $words . ')\b/iu', $title)) { $category = $id; break; }
            }
            $articles[] = ['id'=>'news-'.substr(hash('sha256',$url),0,16),'category'=>$category,'title'=>$title,'summary'=>$summary,'content'=>$summary,'coverage'=>'excerpt','date'=>gmdate('c',$published),'source'=>$feed['publisher'],'sourceUrl'=>$url,'feedUrl'=>$feed['url'],'author'=>$creator ?: $feed['publisher'],'authorProvided'=>$creator !== '', 'imageUrl'=>$image,'imageCaption'=>$caption ?: ('Foto dari feed '.$feed['publisher'].'. Hak foto mengikuti sumber.'),'photos'=>$image ? [['url'=>$image,'caption'=>$caption ?: $summary,'credit'=>$feed['publisher']]] : [],'isPhoto'=>($feed['kind']??'')==='photo','tags'=>array_values(array_unique([$feed['publisher'], $category]))];
            if (count($articles) >= 40) break;
        }
        if (!$articles) throw new \RuntimeException('No usable RSS items.');
        return $articles;
    }
}
