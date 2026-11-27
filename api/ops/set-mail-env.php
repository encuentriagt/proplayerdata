<?php

/**
 * Configura el envío de correo (SMTP) en .env sin mostrar la contraseña.
 * Uso (lo corre el workflow "Configurar correo"): printf '%s' "$PASS" | php ops/set-mail-env.php HOST PORT USUARIO
 * - Lee la contraseña de la entrada estándar (no queda en la línea de comandos ni en los logs).
 * - Respalda .env en ~/ppdback antes de cambiarlo y conserva los permisos 600.
 */
if (PHP_SAPI !== 'cli' || $argc < 4) {
    fwrite(STDERR, "Uso: php ops/set-mail-env.php HOST PORT USUARIO < contraseña\n");
    exit(2);
}
[$_, $host, $port, $user] = $argv;
$pass = stream_get_contents(STDIN);
if ($pass === false || $pass === '') {
    fwrite(STDERR, "Falta la contraseña (entrada estándar vacía).\n");
    exit(3);
}
if (! preg_match('/^[a-z0-9.-]+$/i', $host) || ! ctype_digit($port) || ! filter_var($user, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Host, puerto o usuario no válidos.\n");
    exit(4);
}

$envPath = __DIR__.'/../.env';
$env = file_get_contents($envPath);
if ($env === false) {
    fwrite(STDERR, "No se pudo leer .env\n");
    exit(5);
}
$backupDir = getenv('HOME').'/ppdback';
@mkdir($backupDir, 0700, true);
$backup = $backupDir.'/env-ppd-api-'.date('Ymd-His').'-antes-correo';
file_put_contents($backup, $env);
chmod($backup, 0600);

$q = fn (string $v) => '"'.str_replace(['\\', '"', '$'], ['\\\\', '\\"', '\\$'], $v).'"';
$values = [
    'MAIL_MAILER' => 'smtp',
    'MAIL_SCHEME' => $port === '465' ? 'smtps' : 'smtp',
    'MAIL_HOST' => $host,
    'MAIL_PORT' => $port,
    'MAIL_USERNAME' => $q($user),
    'MAIL_PASSWORD' => $q($pass),
    'MAIL_FROM_ADDRESS' => $q($user),
    'MAIL_FROM_NAME' => $q('ProPlayer Data'),
];
foreach ($values as $k => $v) {
    $line = $k.'='.$v;
    $env = preg_match('/^'.$k.'=.*$/m', $env)
        ? preg_replace_callback('/^'.$k.'=.*$/m', fn () => $line, $env)
        : rtrim($env, "\n")."\n".$line."\n";
}
file_put_contents($envPath, $env);
chmod($envPath, 0600);
echo "OK: correo configurado (respaldo de .env en ~/ppdback).\n";
