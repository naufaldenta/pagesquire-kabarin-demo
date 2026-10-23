<?php
declare(strict_types=1);
ini_set('display_errors','0');
require dirname(__DIR__).'/vendor/autoload.php';
header('Content-Type: application/json; charset=utf-8');header('X-Content-Type-Options: nosniff');
if(($_SERVER['REQUEST_METHOD']??'')!=='GET'){http_response_code(405);header('Allow: GET');echo '{"error":"METHOD_NOT_ALLOWED"}';exit;}
try{
    $repository=new \Kabarin\News\NewsRepository;
    if(isset($_GET['ids'])){
        if(!is_string($_GET['ids'])){http_response_code(422);echo '{"error":"INVALID_IDS"}';exit;}
        $ids=explode(',',(string)$_GET['ids']);
        if(count($ids)>100 || array_filter($ids,static fn(string $id):bool=>!preg_match('/^news-[a-f0-9]{16}$/',$id))) {http_response_code(422);echo '{"error":"INVALID_IDS"}';exit;}
        $payload=['schemaVersion'=>1,'articles'=>$repository->find($ids)];
    }else{$payload=$repository->snapshot();if(!$payload['articles'])http_response_code(503);}
    header('Cache-Control: '.(http_response_code()>=400?'no-store':'public, max-age=60, stale-while-revalidate=120'));
    echo json_encode($payload,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_HEX_TAG);
}catch(Throwable){http_response_code(503);header('Cache-Control: no-store');echo '{"error":"NEWS_UNAVAILABLE","articles":[]}';}
