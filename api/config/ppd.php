<?php

return [
    // Nombre corto del producto.
    'name' => 'ppd',

    'idempotency' => [
        // Horas que se guarda una respuesta idempotente.
        'ttl_hours' => (int) env('PPD_IDEMPOTENCY_TTL_HOURS', 24),
        // Tamaño máximo (bytes) de respuesta que se guarda para repetirla.
        'max_body_bytes' => 256 * 1024,
    ],

    // URLs de los clientes (para enlaces en correos).
    'urls' => [
        'web' => env('PPD_WEB_URL', 'https://ppdguate.com'),
        'pc' => env('PPD_PC_URL', 'https://pc.ppdguate.com'),
        'admin' => env('PPD_ADMIN_URL', 'https://admin.ppdguate.com'),
    ],

    'invitations' => [
        'days_valid' => (int) env('PPD_INVITATION_DAYS', 7),
    ],

    // Plataformas aceptadas en el encabezado X-App-Platform.
    'platforms' => ['web', 'android', 'ios'],
];
