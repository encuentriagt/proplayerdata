<?php

namespace App\Support;

use App\Models\Organization;
use App\Models\Sport;
use App\Models\SportPosition;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Posiciones por organización. El catálogo de ppd (organization_id NULL) es la plantilla:
 * al activar un deporte, la organización recibe su copia y desde ahí la edita libremente.
 */
final class Positions
{
    /** Activa deportes en la organización y les copia las posiciones del catálogo (solo la primera vez). */
    public static function enableSports(Organization $org, array $sportIds): void
    {
        $now = now();
        foreach (array_unique(array_map('intval', $sportIds)) as $sid) {
            DB::table('organization_sports')->insertOrIgnore([
                'organization_id' => $org->id, 'sport_id' => $sid, 'created_at' => $now, 'updated_at' => $now,
            ]);
            $has = SportPosition::withTrashed()->where('organization_id', $org->id)->where('sport_id', $sid)->exists();
            if ($has) {
                continue;
            }
            foreach (SportPosition::whereNull('organization_id')->where('sport_id', $sid)->orderBy('sort')->get() as $p) {
                SportPosition::create([
                    'sport_id' => $sid, 'organization_id' => $org->id, 'code' => $p->code, 'name' => $p->name, 'sort' => $p->sort,
                ]);
            }
        }
    }

    /** Posiciones vigentes de la organización para esos deportes, agrupadas por sport_id. */
    public static function forOrg(int $orgId, array $sportIds): Collection
    {
        return SportPosition::where('organization_id', $orgId)->whereIn('sport_id', $sportIds ?: [0])
            ->orderBy('sort')->orderBy('id')->get()->groupBy('sport_id');
    }

    /** Pone en $sport->positions las de la organización (en lugar del catálogo). */
    public static function apply(Sport $sport, int $orgId): Sport
    {
        return $sport->setRelation('positions', self::forOrg($orgId, [$sport->id])->get($sport->id, collect()));
    }

    /** ¿La posición es de la organización y del deporte? */
    public static function valid(?int $positionId, int $orgId, int $sportId, bool $withTrashed = false): bool
    {
        if (! $positionId) {
            return true;
        }
        $q = $withTrashed ? SportPosition::withTrashed() : SportPosition::query();

        return $q->whereKey($positionId)->where('organization_id', $orgId)->where('sport_id', $sportId)->exists();
    }
}
