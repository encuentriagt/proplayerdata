<?php

namespace Tests\Unit;

use App\Models\Season;
use PHPUnit\Framework\TestCase;

/** Ciclo guatemalteco / americano y avance de la temporada. */
class SeasonCycleTest extends TestCase
{
    public function test_ciclo_guatemalteco_y_avance(): void
    {
        $c = fn ($today) => Season::cycleInfo('2026-01-01', '2026-12-31', $today);
        $this->assertSame('guatemalan', $c('2026-01-02')['cycle']);
        $this->assertSame('Empieza y termina en 2026: es ciclo guatemalteco.', $c('2026-01-02')['cycle_message']);
        $this->assertSame(1, $c('2026-01-02')['progress']['percent']);
        $this->assertSame(50, $c('2026-06-30')['progress']['percent']);   // 181/365 = 49.6
        $this->assertSame(49.6, $c('2026-06-30')['progress']['percent_exact']);
        $this->assertSame(['upcoming', 0], [$c('2025-12-20')['progress']['status'], $c('2025-12-20')['progress']['percent']]);
        $this->assertSame(['finished', 100, 0], [$c('2027-01-05')['progress']['status'], $c('2027-01-05')['progress']['percent'], $c('2027-01-05')['progress']['days_left']]);
        $this->assertSame(365, $c('2026-03-01')['progress']['days_total']);
    }

    public function test_ciclo_americano_y_sin_fechas(): void
    {
        $i = Season::cycleInfo('2026-08-01', '2027-06-30', '2027-01-15');
        $this->assertSame('american', $i['cycle']);
        $this->assertSame('Ciclo americano', $i['cycle_label']);
        $this->assertSame('Empieza en 2026 y termina en 2027: es ciclo americano.', $i['cycle_message']);
        $this->assertSame('in_progress', $i['progress']['status']);
        $this->assertSame(['cycle' => null, 'cycle_label' => null, 'cycle_message' => null, 'progress' => null], Season::cycleInfo(null, '2027-01-01'));
    }
}
