<?php

use App\Http\Controllers\Public\HealthController;
use Illuminate\Support\Facades\Route;

/*
| Rutas de la API de ppd. Prefijos (docs/ARQUITECTURA.md, sección 7):
|   /api/public/*  sin sesión
|   /api/auth/*    login / sesión
|   /api/pc/*      coach, director, org_admin
|   /api/app/*     padres
|   /api/admin/*   super admin
*/

Route::prefix('public')->middleware('throttle:public')->group(function () {
    Route::get('health', HealthController::class);
});
