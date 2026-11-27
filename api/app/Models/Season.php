<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Season extends Model
{
    protected $fillable = ['organization_id', 'name', 'starts_on', 'ends_on', 'is_current'];

    protected function casts(): array
    {
        return ['starts_on' => 'date', 'ends_on' => 'date', 'is_current' => 'boolean'];
    }

    public function payload(): array
    {
        return [
            'id' => $this->id, 'name' => $this->name,
            'starts_on' => $this->starts_on?->toDateString(), 'ends_on' => $this->ends_on?->toDateString(),
            'is_current' => $this->is_current,
        ] + self::cycleInfo($this->starts_on, $this->ends_on);
    }

    /**
     * Ciclo y avance de una temporada (decisión del dueño, 2026-11-26):
     * - Empieza y termina en el mismo año → ciclo guatemalteco (p. ej. 1 ene – 31 dic).
     * - Empieza en un año y termina en otro → ciclo americano (p. ej. ago 2026 – jun 2027).
     * Avance: días transcurridos (contando hoy) / días totales, con la fecha de Guatemala.
     */
    public static function cycleInfo($start, $end, $today = null): array
    {
        if (! $start || ! $end) {
            return ['cycle' => null, 'cycle_label' => null, 'cycle_message' => null, 'progress' => null];
        }
        $start = \Carbon\CarbonImmutable::parse($start)->startOfDay();
        $end = \Carbon\CarbonImmutable::parse($end)->startOfDay();
        $today = \Carbon\CarbonImmutable::parse($today ?? now('America/Guatemala')->toDateString())->startOfDay();
        $american = $start->year !== $end->year;
        $total = (int) $start->diffInDays($end) + 1;
        $elapsed = $today->lt($start) ? 0 : ($today->gt($end) ? $total : (int) $start->diffInDays($today) + 1);
        $exact = $total > 0 ? round($elapsed * 100 / $total, 1) : 0.0;

        return [
            'cycle' => $american ? 'american' : 'guatemalan',
            'cycle_label' => $american ? 'Ciclo americano' : 'Ciclo guatemalteco',
            'cycle_message' => $american
                ? "Empieza en {$start->year} y termina en {$end->year}: es ciclo americano."
                : "Empieza y termina en {$start->year}: es ciclo guatemalteco.",
            'progress' => [
                'status' => $today->lt($start) ? 'upcoming' : ($today->gt($end) ? 'finished' : 'in_progress'),
                'percent' => (int) min(100, max($elapsed > 0 ? 1 : 0, round($exact))),
                'percent_exact' => $exact,
                'days_total' => $total,
                'days_elapsed' => $elapsed,
                'days_left' => $total - $elapsed,
            ],
        ];
    }
}
