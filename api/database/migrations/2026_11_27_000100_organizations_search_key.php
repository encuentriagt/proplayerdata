<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/** Nombre y slug normalizados (minúsculas, sin tildes) para el buscador público de instituciones. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->string('search_key', 300)->nullable()->after('slug')->index();
        });
        foreach (DB::table('organizations')->select('id', 'name', 'slug')->get() as $o) {
            DB::table('organizations')->where('id', $o->id)->update(['search_key' => Str::lower(Str::ascii($o->name.' '.$o->slug))]);
        }
    }

    public function down(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropIndex(['search_key']);
            $table->dropColumn('search_key');
        });
    }
};
