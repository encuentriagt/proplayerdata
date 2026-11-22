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

    // Plataformas aceptadas en el encabezado X-App-Platform.
    'platforms' => ['web', 'android', 'ios'],
];
