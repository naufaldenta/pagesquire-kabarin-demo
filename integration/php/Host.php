<?php
declare(strict_types=1);

namespace Kabarin\Assistant;

use Dotenv\Dotenv;
use PageSquire\Server\AssistantException;
use PageSquire\Server\ConversationEngine;
use PageSquire\Server\ProtocolValidator;
use PageSquire\Server\ProviderConfiguration;
use PageSquire\Server\Http\ChatEndpoint;
use PageSquire\Server\Http\FileConversationStore;
use PageSquire\Server\Http\OpenAiCompatibleProvider;

final class Host
{
    public static function root(): string { return dirname(__DIR__, 2); }

    public static function settings(): array
    {
        $settings = Dotenv::createArrayBacked(self::root())->safeLoad();
        foreach (array_unique([...array_keys($settings), 'PAGESQUIRE_PROVIDER_URL', 'PAGESQUIRE_SYSTEM_ROLE', 'PAGESQUIRE_THINKING']) as $key) {
            $value = getenv($key);
            if ($value !== false) $settings[$key] = $value;
        }
        return $settings;
    }

    public static function origin(array $settings): string
    {
        $origin = $settings['PAGESQUIRE_ORIGIN'] ?? 'http://localhost';
        $parts = parse_url($origin);
        if (!is_array($parts) || !in_array($parts['scheme'] ?? '', ['http', 'https'], true) || empty($parts['host']) || isset($parts['path']) || isset($parts['query']) || isset($parts['fragment']) || isset($parts['user']) || isset($parts['pass'])) {
            throw new AssistantException('INVALID_HOST_CONFIG', 'Konfigurasi asal situs belum valid.', 503);
        }
        return $origin;
    }

    public static function authorizeRequest(array $settings): void
    {
        $remote = $_SERVER['REMOTE_ADDR'] ?? '';
        if (($settings['PAGESQUIRE_ALLOW_REMOTE'] ?? 'false') !== 'true' && !in_array($remote, ['127.0.0.1', '::1', '::ffff:127.0.0.1'], true)) {
            throw new AssistantException('ACCESS_DENIED', 'Asisten tersedia untuk akses lokal.', 403);
        }
        if (isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] !== self::origin($settings)) {
            throw new AssistantException('ORIGIN_DENIED', 'Asal permintaan tidak diizinkan.', 403);
        }
        if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
            throw new AssistantException('ORIGIN_DENIED', 'Asal permintaan tidak diizinkan.', 403);
        }
    }

    public static function session(array $settings): array
    {
        ini_set('session.use_strict_mode', '1');
        session_name('KABARIN_PAGESQUIRE');
        $basePath = str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/assistant-session.php')));
        session_set_cookie_params(['lifetime' => 0, 'path' => rtrim($basePath, '/') . '/', 'secure' => str_starts_with(self::origin($settings), 'https://'), 'httponly' => true, 'samesite' => 'Lax']);
        if (!session_start()) throw new AssistantException('SESSION_UNAVAILABLE', 'Sesi asisten belum tersedia.', 503);
        if (!isset($_SESSION['pagesquire_csrf'])) $_SESSION['pagesquire_csrf'] = bin2hex(random_bytes(32));
        $session = [
            'key' => hash('sha256', 'kabarin:' . session_id()),
            'principal' => 'local-reader-v1',
            'csrfToken' => $_SESSION['pagesquire_csrf'],
            'capabilityIds' => array_column(self::manifest()['capabilities'], 'id'),
        ];
        session_write_close();
        return $session;
    }

    public static function requirePost(array $session, array $settings): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') throw new AssistantException('METHOD_NOT_ALLOWED', 'Gunakan POST.', 405);
        if (($_SERVER['HTTP_ORIGIN'] ?? '') !== self::origin($settings)) throw new AssistantException('ORIGIN_DENIED', 'Asal permintaan tidak diizinkan.', 403);
        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (strlen($token) < 16 || strlen($token) > 256 || !hash_equals($session['csrfToken'], $token)) throw new AssistantException('CSRF_MISMATCH', 'Muat ulang halaman untuk memperbarui sesi.', 419);
    }

    public static function configured(array $settings): bool
    {
        try { ProviderConfiguration::fromEnvironment($settings); return true; }
        catch (AssistantException) { return false; }
    }

    public static function manifest(): array
    {
        return json_decode(file_get_contents(self::root() . '/integration/capabilities.json'), true, 64, JSON_THROW_ON_ERROR);
    }

    public static function store(array $settings): FileConversationStore
    {
        $directory = $settings['PAGESQUIRE_STORAGE_DIR'] ?? '';
        if ($directory === '' || !preg_match('~^(?:[A-Za-z]:[\\\\/]|/)~', $directory)) throw new AssistantException('INVALID_STORE', 'Direktori asisten privat belum diatur.', 503);
        $normalized = strtolower(str_replace('\\', '/', $directory));
        $public = strtolower(str_replace('\\', '/', realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: self::root()));
        if (str_contains($normalized, '/../') || $normalized === $public || str_starts_with($normalized, rtrim($public, '/') . '/')) throw new AssistantException('INVALID_STORE', 'Gunakan direktori privat di luar web root.', 503);
        if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) throw new AssistantException('INVALID_STORE', 'Penyimpanan asisten belum tersedia.', 503);
        $resolved = strtolower(str_replace('\\', '/', realpath($directory) ?: ''));
        if ($resolved === '' || $resolved === $public || str_starts_with($resolved, rtrim($public, '/') . '/')) throw new AssistantException('INVALID_STORE', 'Gunakan direktori privat di luar web root.', 503);
        return new FileConversationStore($directory);
    }

    public static function endpoint(array $settings): ChatEndpoint
    {
        $validator = new ProtocolValidator;
        $timeout = max(5, min(60, (int)($settings['PAGESQUIRE_TIMEOUT_SECONDS'] ?? 30)));
        $maximum = max(256, min(4096, (int)($settings['PAGESQUIRE_MAX_OUTPUT_TOKENS'] ?? 1600)));
        $provider = new PortalProvider(OpenAiCompatibleProvider::fromEnvironment($validator, $settings, timeoutSeconds: $timeout), static fn():array => (new \Kabarin\News\NewsRepository)->catalog());
        return new ChatEndpoint(new ConversationEngine($provider, $validator, self::manifest(), maxOutputTokens: $maximum), $validator, self::store($settings), self::origin($settings));
    }

    public static function json(array $body, int $status = 200): void
    {
        http_response_code($status);
        // mod_php otherwise maps the non-standard PageSquire/Laravel 419 code to 500.
        if ($status === 419) header('HTTP/1.1 419 Authentication Timeout', true, 419);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        if ($status === 405) header('Allow: POST');
        echo json_encode($body, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function error(\Throwable $error): void
    {
        if ($error instanceof AssistantException) self::json(['error' => ['code' => $error->errorCode, 'message' => $error->getMessage()]], $error->httpStatus);
        else self::json(['error' => ['code' => 'ASSISTANT_UNAVAILABLE', 'message' => 'Asisten belum tersedia. Coba lagi nanti.']], 503);
    }
}
