<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/** "Tarde" (late) deja de existir: la PC ya lo mostraba como "Asiste". Estados: present, excused, injured, absent. */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('attendances')->where('status', 'late')->update(['status' => 'present']);
    }

    public function down(): void
    {
        // Sin vuelta atrás: no se sabe cuáles eran "late".
    }
};
