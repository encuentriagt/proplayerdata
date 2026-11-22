<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class ChangePasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string', 'max:200', 'current_password:sanctum'],
            'password' => ['required', 'string', 'max:200', 'confirmed', 'different:current_password', Password::defaults()],
        ];
    }

    public function attributes(): array
    {
        return ['current_password' => 'contraseña actual', 'password' => 'nueva contraseña'];
    }
}
