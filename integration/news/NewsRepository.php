<?php
declare(strict_types=1);
namespace Kabarin\News;

/** Single-host JSON cache for Laragon. Vercel uses server/news.mjs, never this file store. */
final class NewsRepository
{
    private string $directory;
    private array $seed;
    public function __construct(?string $directory=null,private readonly int $ttl=600)
    {
        $this->directory=$directory??(getenv('LOCALAPPDATA')?:sys_get_temp_dir()).'/Kabarin/News';
        $public=str_replace('\\','/',realpath($_SERVER['DOCUMENT_ROOT']??'')?:realpath(dirname(__DIR__,2)));
        $target=str_replace('\\','/',$this->directory);
        if(str_contains($target,'..')||strtolower(rtrim($target,'/'))===strtolower($public)||str_starts_with(strtolower($target),strtolower($public).'/'))throw new \RuntimeException('News cache must stay outside the web root.');
        if(!is_dir($this->directory)&&!mkdir($this->directory,0700,true)&&!is_dir($this->directory))throw new \RuntimeException('News cache is unavailable.');
        $this->seed=['articles'=>[],'feedItems'=>[],'feeds'=>[],'checked'=>0,'updated'=>0];
        if($directory===null&&is_file(__DIR__.'/seed.json')){
            $seed=json_decode(file_get_contents(__DIR__.'/seed.json'),true,32,JSON_THROW_ON_ERROR);
            $sources=array_column(self::sources(),null,'url');
            foreach($seed['articles'] as$a){$this->seed['articles'][$a['id']]=$a;$feed=$sources[$a['feedUrl']]??null;if($feed)$this->seed['feedItems'][$feed['id']][]=$a['id'];}
            $this->seed['feeds']=$seed['meta']['feeds']??[];$this->seed['updated']=strtotime($seed['meta']['updatedAt']??'')?:0;
        }
    }
    public static function sources():array{return json_decode(file_get_contents(__DIR__.'/sources.json'),true,16,JSON_THROW_ON_ERROR)['feeds'];}
    private function load():array
    {
        $file=$this->directory.'/news.json';if(!is_file($file))return $this->seed;
        $cache=json_decode(file_get_contents($file),true,32,JSON_THROW_ON_ERROR);
        if(!isset($cache['articles'],$cache['feedItems'],$cache['feeds'],$cache['checked'],$cache['updated']))throw new \RuntimeException('Invalid news cache.');
        return $cache;
    }
    private function save(array $cache):void
    {
        $temp=$this->directory.'/news-'.bin2hex(random_bytes(8)).'.tmp';
        try{if(file_put_contents($temp,json_encode($cache,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),LOCK_EX)===false)throw new \RuntimeException('News write failed.');chmod($temp,0600);if(!rename($temp,$this->directory.'/news.json'))throw new \RuntimeException('News write failed.');}
        finally{if(is_file($temp))unlink($temp);}
    }
    public function refresh(bool $force=false,?\Closure $fetch=null):array
    {
        if(!$force&&time()-$this->load()['checked']<$this->ttl)return ['refreshed'=>false];
        $lock=fopen($this->directory.'/refresh.lock','c');if(!$lock||!flock($lock,LOCK_EX|LOCK_NB)){if($lock)fclose($lock);return ['refreshed'=>false];}
        try{
            $cache=$this->load();if(!$force&&time()-$cache['checked']<$this->ttl)return ['refreshed'=>false];
            $feeds=self::sources();$responses=$fetch?$fetch($feeds):self::fetch($feeds);$ok=0;$fail=0;$health=array_column($cache['feeds'],null,'id');
            foreach($feeds as$feed){
                try{$response=$responses[$feed['id']]??[];if(($response['status']??0)!==200)throw new \RuntimeException('Feed unavailable.');$items=FeedParser::parse($response['body'],$feed);$ids=[];
                    foreach($items as$a){$cache['articles'][$a['id']]=$a;$ids[]=$a['id'];}$cache['feedItems'][$feed['id']]=$ids;
                    $health[$feed['id']]=['id'=>$feed['id'],'checked'=>time(),'success'=>time(),'error'=>null,'count'=>count($items)];$ok++;
                }catch(\Throwable){$previous=$health[$feed['id']]??['id'=>$feed['id'],'success'=>0,'count'=>0];$health[$feed['id']]=[...$previous,'checked'=>time(),'error'=>'SOURCE_UNAVAILABLE'];$fail++;}
            }
            uasort($cache['articles'],static fn(array$a,array$b):int=>strcmp($b['date'],$a['date']));
            $active=array_fill_keys(array_merge(...array_values($cache['feedItems']?:[[]])),true);
            $kept=0;foreach($cache['articles']as$id=>$a)if(++$kept>6000&&!isset($active[$id]))unset($cache['articles'][$id]);
            $cache['feeds']=array_values($health);$cache['checked']=time();if($ok)$cache['updated']=time();$this->save($cache);
            return ['refreshed'=>true,'successfulFeeds'=>$ok,'failedFeeds'=>$fail];
        }finally{flock($lock,LOCK_UN);fclose($lock);}
    }
    private static function fetch(array$feeds):array
    {
        $responses=[];
        foreach(array_chunk($feeds,6)as$batch){$multi=curl_multi_init();$handles=[];
            foreach($batch as$feed){$handle=curl_init($feed['url']);curl_setopt_array($handle,[CURLOPT_RETURNTRANSFER=>false,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>10,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_USERAGENT=>'Kabarin/1.0 (public RSS reader; cached 10 minutes)',CURLOPT_ENCODING=>'']);
                $buffer=(object)['text'=>''];curl_setopt($handle,CURLOPT_WRITEFUNCTION,static function($ch,string$chunk)use($buffer):int{if(strlen($buffer->text)+strlen($chunk)>2000000)return 0;$buffer->text.=$chunk;return strlen($chunk);});curl_multi_add_handle($multi,$handle);$handles[]=[$feed['id'],$handle,$buffer];}
            do{$status=curl_multi_exec($multi,$active);if($active)curl_multi_select($multi,0.5);}while($active&&$status===CURLM_OK);
            foreach($handles as[$id,$handle,$buffer]){$responses[$id]=['status'=>curl_errno($handle)?0:curl_getinfo($handle,CURLINFO_RESPONSE_CODE),'body'=>$buffer->text];curl_multi_remove_handle($multi,$handle);curl_close($handle);}curl_multi_close($multi);
        }return $responses;
    }
    public function snapshot(bool$refresh=true):array
    {
        if($refresh)$this->refresh();$cache=$this->load();$ids=array_fill_keys(array_merge(...array_values($cache['feedItems']?:[[]])),true);
        $articles=array_values(array_filter($cache['articles'],static fn(array$a):bool=>isset($ids[$a['id']])));usort($articles,static fn(array$a,array$b):int=>strcmp($b['date'],$a['date'])?:strcmp($a['id'],$b['id']));
        return ['schemaVersion'=>1,'articles'=>$articles,'meta'=>['updatedAt'=>$cache['updated']?gmdate('c',$cache['updated']):null,'checkedAt'=>$cache['checked'],'stale'=>!$cache['updated']||time()-$cache['updated']>$this->ttl*2||(bool)array_filter($cache['feeds'],static fn(array$f):bool=>$f['error']!==null),'feeds'=>$cache['feeds'],'publishers'=>['ANTARA News','CNN Indonesia','CNBC Indonesia'],'coverage'=>'excerpt','storage'=>'json']];
    }
    public function find(array$ids):array{$cache=$this->load();return array_values(array_intersect_key($cache['articles'],array_fill_keys(array_slice(array_unique($ids),0,100),true)));}
    public function catalog():array
    {
        $articles=array_values($this->load()['articles']);usort($articles,static fn(array$a,array$b):int=>strcmp($b['date'],$a['date']));
        return array_map(static function(array$a):array{$a['ageMinutes']=max(0,(int)floor((time()-strtotime($a['date']))/60));$a['readTime']=1;unset($a['content'],$a['photos'],$a['imageCaption']);return $a;},array_slice($articles,0,6000));
    }
}
