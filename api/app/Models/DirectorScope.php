<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DirectorScope extends Model
{
    protected $fillable = ['organization_id', 'user_id', 'sport_id', 'team_id'];
}
