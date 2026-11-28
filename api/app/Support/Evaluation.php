<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Evaluación del coach (decisión del dueño, 2026-11-27): 5 atributos de 0 a 100, iguales para todos los deportes,
 * guardados por jugador y deporte. Solo la última evaluación (se reemplaza al guardar).
 */
final class Evaluation
{
    public const ATTRIBUTES = [
        'attitude' => 'Actitud',
        'speed' => 'Velocidad',
        'technique' => 'Técnica',
        'physical' => 'Físico',
        'tactics' => 'Táctica',
    ];

    public static function catalog(): array
    {
        return array_map(fn ($c, $n) => ['code' => $c, 'name' => $n], array_keys(self::ATTRIBUTES), self::ATTRIBUTES);
    }

    /** {sport_id, attributes[{code,name,value}]|null, updated_at} */
    public static function payload(int $playerId, int $sportId): array
    {
        $row = DB::table('player_evaluations')->where('player_id', $playerId)->where('sport_id', $sportId)->first();
        $values = $row ? json_decode($row->attributes, true) : null;

        return [
            'sport_id' => $sportId,
            'attributes' => $values === null ? null : array_map(fn ($c, $n) => ['code' => $c, 'name' => $n, 'value' => (int) ($values[$c] ?? 0)], array_keys(self::ATTRIBUTES), self::ATTRIBUTES),
            'updated_at' => $row ? \Illuminate\Support\Carbon::parse($row->updated_at)->toIso8601String() : null,
        ];
    }
}
