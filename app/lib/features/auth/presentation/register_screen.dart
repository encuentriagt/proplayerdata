import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/idempotency.dart';
import '../../../core/widgets/form_page.dart';
import '../../../core/widgets/loading_button.dart';
import '../../../core/widgets/message_banner.dart';
import '../../../core/widgets/password_field.dart';
import '../../invitations/presentation/pending_link_banner.dart';
import '../application/session_controller.dart';
import 'validators.dart';

/// Registro del padre. Al terminar, la sesión queda abierta y el router
/// lleva a verificar el correo con el código.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _confirmation = TextEditingController();
  bool _sending = false;
  ApiException? _error;

  /// Misma clave mientras el usuario reintenta lo mismo; nueva si edita.
  IdempotencyKey? _key;

  @override
  void dispose() {
    for (final c in [_name, _email, _phone, _password, _confirmation]) {
      c.dispose();
    }
    super.dispose();
  }

  void _edited(String _) => _key = null;

  Future<void> _submit() async {
    if (_sending || !_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    final key = _key ??= IdempotencyKey();
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref
          .read(sessionControllerProvider.notifier)
          .register(
            name: _name.text,
            email: _email.text,
            phone: _phone.text,
            password: _password.text,
            passwordConfirmation: _confirmation.text,
            key: key,
          );
    } on ApiException catch (e) {
      if (!e.isNetwork) _key = null;
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final error = _error;
    final text = Theme.of(context).textTheme;
    return FormPage(
      appBar: AppBar(title: const Text('Crear cuenta')),
      children: [
        Text(
          'Cree su cuenta de padre o encargado. Cuando el colegio inscriba a '
          'su hijo con su correo, podrá vincularlo desde aquí.',
          style: text.bodyLarge,
        ),
        const SizedBox(height: 24),
        const PendingLinkBanner(
          'Al crear su cuenta y verificar su correo, se vinculará a su hijo.',
        ),
        if (error != null && error.fields.isEmpty) ...[
          MessageBanner(error.message),
          const SizedBox(height: 16),
        ],
        Form(
          key: _formKey,
          child: AutofillGroup(
            child: Column(
              children: [
                TextFormField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.name],
                  onChanged: _edited,
                  decoration: InputDecoration(
                    labelText: 'Nombre completo',
                    errorText: error?.fieldError('name'),
                  ),
                  validator: (v) =>
                      Validators.required(v, 'Ingrese su nombre.'),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.email],
                  onChanged: _edited,
                  decoration: InputDecoration(
                    labelText: 'Correo electrónico',
                    helperText: 'Le enviaremos un código para verificarlo.',
                    errorText: error?.fieldError('email'),
                  ),
                  validator: Validators.email,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.telephoneNumber],
                  onChanged: _edited,
                  decoration: InputDecoration(
                    labelText: 'Teléfono (opcional)',
                    errorText: error?.fieldError('phone'),
                  ),
                  validator: Validators.optionalPhone,
                ),
                const SizedBox(height: 16),
                PasswordField(
                  controller: _password,
                  label: 'Contraseña',
                  errorText: error?.fieldError('password'),
                  autofillHints: const [AutofillHints.newPassword],
                  onChanged: _edited,
                  validator: Validators.newPassword,
                ),
                const SizedBox(height: 16),
                PasswordField(
                  controller: _confirmation,
                  label: 'Confirme la contraseña',
                  errorText: error?.fieldError('password_confirmation'),
                  autofillHints: const [AutofillHints.newPassword],
                  textInputAction: TextInputAction.done,
                  onChanged: _edited,
                  onSubmitted: (_) => _submit(),
                  validator: (v) => v != _password.text
                      ? 'Las contraseñas no coinciden.'
                      : null,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Mínimo 10 caracteres, con letras y números.',
          style: text.bodySmall,
        ),
        const SizedBox(height: 24),
        LoadingButton(
          label: 'Crear cuenta',
          loading: _sending,
          onPressed: _submit,
        ),
      ],
    );
  }
}
