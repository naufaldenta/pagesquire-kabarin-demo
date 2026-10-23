<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require dirname(__DIR__) . '/vendor/autoload.php';
use Kabarin\Assistant\Host;
use PageSquire\Server\Http\ConversationPrivacy;

try {
    $settings = Host::settings();
    Host::authorizeRequest($settings);
    $session = Host::session($settings);
    Host::requirePost($session, $settings);
    ConversationPrivacy::forget(Host::store($settings), $session['key'], $session['principal']);
    Host::json(['ok' => true]);
} catch (Throwable $error) { Host::error($error); }
