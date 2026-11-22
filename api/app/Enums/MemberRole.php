<?php

namespace App\Enums;

enum MemberRole: string
{
    case OrgAdmin = 'org_admin';
    case Director = 'director';
    case Coach = 'coach';

    public function label(): string
    {
        return match ($this) {
            self::OrgAdmin => 'Administrador',
            self::Director => 'Director deportivo',
            self::Coach => 'Coach',
        };
    }
}
