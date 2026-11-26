<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Suscripciones opcionales del staff a avisos (por ahora solo "match_published").
 * Solo admin de la organización y super admin. organization_id NULL = todas las organizaciones (solo super admin).
 */
final class StaffAlerts
{
    public const MATCH_PUBLISHED = 'match_published';

    /** Usuarios que deben recibir el aviso de la organización (admins activos suscritos + super admins suscritos). */
    public static function recipients(int $orgId, string $kind = self::MATCH_PUBLISHED): array
    {
        $rows = DB::table('notification_subscriptions as s')
            ->join('users as u', 'u.id', '=', 's.user_id')
            ->where('s.kind', $kind)->where('u.status', 'active')->whereNull('u.deleted_at')
            ->where(function ($q) use ($orgId) {
                // Super admin: todas o esta organización.
                $q->where(fn ($w) => $w->where('u.is_super_admin', true)->where(fn ($o) => $o->whereNull('s.organization_id')->orWhere('s.organization_id', $orgId)))
                // Admin: sigue siendo admin activo de esta organización.
                    ->orWhere(fn ($w) => $w->where('s.organization_id', $orgId)->whereExists(fn ($e) => $e->from('organization_members as m')
                        ->whereColumn('m.user_id', 's.user_id')->where('m.organization_id', $orgId)->where('m.role', 'org_admin')->where('m.status', 'active')));
            })
            ->distinct()->pluck('s.user_id');

        return $rows->map(fn ($i) => (int) $i)->all();
    }

    public static function isSubscribed(User $user, ?int $orgId, string $kind = self::MATCH_PUBLISHED): bool
    {
        return DB::table('notification_subscriptions')->where('user_id', $user->id)->where('kind', $kind)
            ->where(fn ($q) => $orgId === null ? $q->whereNull('organization_id') : $q->where('organization_id', $orgId))->exists();
    }

    /** Reemplaza las suscripciones del usuario para ese tipo dentro del conjunto dado (null = todas). */
    public static function set(User $user, array $orgIds, string $kind = self::MATCH_PUBLISHED, ?array $onlyWithin = null): void
    {
        DB::transaction(function () use ($user, $orgIds, $kind, $onlyWithin) {
            $q = DB::table('notification_subscriptions')->where('user_id', $user->id)->where('kind', $kind);
            if ($onlyWithin !== null) {
                $q->whereIn('organization_id', $onlyWithin);
            }
            $q->delete();
            $now = now();
            foreach ($orgIds as $oid) {
                DB::table('notification_subscriptions')->insertOrIgnore([
                    'user_id' => $user->id, 'organization_id' => $oid, 'kind' => $kind, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        });
    }
}
