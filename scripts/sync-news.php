<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit;
require dirname(__DIR__).'/vendor/autoload.php';
$news=new \Kabarin\News\NewsRepository;
echo json_encode($news->refresh(in_array('--force',$argv,true)),JSON_UNESCAPED_SLASHES).PHP_EOL;
$snapshot=$news->snapshot(false);
file_put_contents(dirname(__DIR__).'/.build/news-snapshot.json',json_encode($snapshot,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
foreach(array_count_values(array_column($snapshot['articles'],'category')) as$category=>$count)echo "$category: $count\n";
echo 'Total: '.count($snapshot['articles']).' real news articles.'.PHP_EOL;
