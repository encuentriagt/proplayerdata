<?php

use Illuminate\Support\Facades\Route;

// api.ppdguate.com no sirve páginas: solo la API.
Route::get('/', fn () => response()->json(['app' => 'ppd api']));
