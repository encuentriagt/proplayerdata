<?php

/*
| CORS de ppd: solo los dominios propios (ver docs/ARQUITECTURA.md, sección 12).
| CORS_ALLOWED_ORIGINS en .env: lista separada por comas.
*/

$origins = array_values(array_filter(array_map('trim', explode(',', (string) env(
    'CORS_ALLOWED_ORIGINS',
    'https://ppdguate.com,https://pc.ppdguate.com,https://admin.ppdguate.com'
)))));

return [
    'paths' => ['api/*'],
    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    'allowed_origins' => $origins,
    'allowed_origins_patterns' => [],
    'allowed_headers' => [
        'Accept', 'Authorization', 'Content-Type', 'X-Requested-With',
        'Idempotency-Key', 'X-App-Platform', 'If-None-Match',
    ],
    'exposed_headers' => ['ETag', 'Idempotency-Replayed', 'Retry-After'],
    'max_age' => 3600,
    'supports_credentials' => false,
];
