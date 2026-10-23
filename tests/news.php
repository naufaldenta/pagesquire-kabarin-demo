<?php
declare(strict_types=1);
require dirname(__DIR__).'/vendor/autoload.php';
use Kabarin\News\FeedParser;
use Kabarin\News\NewsRepository;
$count=0;function newsCheck(bool $pass,string $label):void{global$count;if(!$pass)throw new RuntimeException('FAIL: '.$label);$count++;echo 'PASS: '.$label.PHP_EOL;}
$feed=['id'=>'unit','publisher'=>'ANTARA News','category'=>'nasional','url'=>'https://www.antaranews.com/rss/politik.xml'];
function rss(string $slug='one'):string{return '<?xml version="1.0"?><rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><item><title>Judul &amp; berita '.$slug.'</title><link>https://www.antaranews.com/berita/101/'.$slug.'</link><pubDate>Fri, 23 Oct 2026 08:00:00 +0700</pubDate><description><![CDATA[<p>Cuplikan yang benar dari sumber. <script>private_script()</script></p>]]></description><media:content url="https://img.antaranews.com/cache/800x533/test.jpg"/><dc:creator>Penulis dari feed</dc:creator></item></channel></rss>';}
$article=FeedParser::parse(rss(),$feed)[0];
newsCheck($article['summary']==='Cuplikan yang benar dari sumber.','Feed markup/scripts never become executable content or prose');
newsCheck($article['author']==='Penulis dari feed'&&$article['authorProvided'],'Provided creator is preserved');
newsCheck($article['imageUrl']==='https://img.antaranews.com/cache/800x533/test.jpg'&&count($article['photos'])===1,'Namespaced media attributes become the real photo, with no extra images');
newsCheck($article['coverage']==='excerpt'&&$article['content']===$article['summary'],'Excerpt is not expanded into an invented article');
$nav=\Kabarin\Assistant\NavigationIntent::resolve('Buka artikel '.$article['id'],[$article],[],'http://localhost/tes_openclaw/#');
newsCheck($nav['parameters']->articleId===$article['id'],'New real-news identity works in the explicit navigation resolver');
$reference=\Kabarin\Assistant\NavigationIntent::resolve('Buka artikel ini',[$article],[],'http://localhost/tes_openclaw/#artikel/'.$article['id']);
newsCheck($reference['parameters']->articleId===$article['id'],'Current-article references support stable hash IDs');
$ambiguousTitle=[...$article,'title'=>'Ekonomi dan Teknologi Indonesia'];
$title=\Kabarin\Assistant\NavigationIntent::resolve('Buka '.$ambiguousTitle['title'],[$ambiguousTitle],[],'http://localhost/tes_openclaw/#');
newsCheck($title['parameters']->articleId===$article['id'],'A full real headline wins over category words inside its title');
$reordered=str_replace('<item>','<item><category>Other</category>',rss());
newsCheck(FeedParser::parse($reordered,$feed)[0]['id']===$article['id'],'Stable IDs depend on publisher URL, not feed ordering or category');
newsCheck(FeedParser::safeUrl('https://attacker.invalid/image.jpg',true)===''&&FeedParser::safeUrl('javascript:alert(1)')===''&&FeedParser::safeUrl('https://www.antaranews.com@127.0.0.1/secret')==='','Unapproved URLs, script schemes and userinfo are rejected');
try{FeedParser::parse('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss/>',$feed);newsCheck(false,'XXE');}catch(RuntimeException){newsCheck(true,'XML entities and doctypes fail closed');}
$withoutCreator=FeedParser::parse(str_replace('<dc:creator>Penulis dari feed</dc:creator>','',rss()),$feed)[0];
newsCheck(!$withoutCreator['authorProvided']&&$withoutCreator['author']==='ANTARA News','Missing bylines use publisher attribution, not a fictitious person');
$directory=sys_get_temp_dir().'/kabarin-news-tests-'.bin2hex(random_bytes(6));
try{
 $repository=new NewsRepository($directory);
 $fetch=static fn(array$feeds):array=>array_fill_keys(array_column($feeds,'id'),['status'=>200,'body'=>rss()]);
 $first=$repository->refresh(true,$fetch);newsCheck($first['successfulFeeds']===count(NewsRepository::sources()),'All configured feed slots accept the injected test transport');
 $snapshot=$repository->snapshot(false);newsCheck(count($snapshot['articles'])===1,'Repeated source links deduplicate across feeds');
 newsCheck(!$repository->refresh(false,static function(){throw new RuntimeException('Should not fetch');})['refreshed'],'Fresh cache avoids duplicate upstream requests');
 $second=$repository->refresh(true,static fn(array$feeds):array=>array_fill_keys(array_column($feeds,'id'),['status'=>200,'body'=>rss('two')]));
 newsCheck($repository->snapshot(false)['articles'][0]['id']!==$article['id']&&$repository->find([$article['id']])[0]['id']===$article['id'],'Expired feed items remain addressable for bookmarked/deep-linked articles');
 $before=$repository->snapshot(false)['articles'];
 $repository->refresh(true,static fn(array$feeds):array=>[]);
 newsCheck($repository->snapshot(false)['articles']===$before&&$repository->snapshot(false)['meta']['stale'],'Source outages retain the last real snapshot and expose stale status');
 newsCheck($repository->find(['news-0000000000000000'])===[],'Unknown archive IDs do not produce fabricated articles');
 $catalog=$repository->catalog();newsCheck(count($catalog)===2&&isset($catalog[0]['ageMinutes'])&&!isset($catalog[0]['photos']),'Assistant catalog follows cached actual metadata and archived identity');
}finally{unset($repository);foreach(glob($directory.'/*')?:[]as$file)if(is_file($file))unlink($file);if(is_dir($directory))rmdir($directory);}
echo PHP_EOL.$count.' news/cache checks passed. No network or model calls.'.PHP_EOL;
