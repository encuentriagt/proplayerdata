<?php

/*
| Planes de los padres (docs/ARQUITECTURA.md, sección 3). Nunca se muestran precios en la App.
| Gratis: todas las funciones con límites. Pro: sin límites para 1 hijo. Premium: sin límites, todos los hijos.
| Los valores de Gratis están POR DEFINIR con el dueño; se cambian aquí sin tocar código.
*/

return [
    'levels' => [
        'free' => [
            'label' => 'Gratis',
            'history_days' => (int) env('PPD_FREE_HISTORY_DAYS', 30),       // calendario/resultados pasados visibles
            'stats_last_matches' => (int) env('PPD_FREE_STATS_MATCHES', 5), // estadísticas acumuladas: últimos N partidos
        ],
        'pro' => ['label' => 'Pro', 'history_days' => null, 'stats_last_matches' => null],
        'premium' => ['label' => 'Premium', 'history_days' => null, 'stats_last_matches' => null],
    ],

    // Días mínimos entre cambios del hijo elegido en plan Pro.
    'pro_child_change_days' => 30,
];
