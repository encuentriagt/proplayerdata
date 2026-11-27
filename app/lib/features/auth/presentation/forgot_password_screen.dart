import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/idempotency.dart';
import '../../../core/widgets/form_page.dart';
import '../../../core/widgets/loading_button.dart';
import '../../../core/widgets/message_banner.dart';
import '../../../core/widgets/password_field.dart';
import '../data/auth_repository.dart';
import 'code_field.dart';
import 'validators.dart';

/// Contraseña olvidada en dos pasos: 1) correo, 2) código + contraseña nueva.
/// También sirve para crear contraseña en cuentas hechas con Google.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  static const _defaultSent =
      'Si el correo tiene una cuenta, le enviamos un código de 6 dígitos. '
      'Vence en 15 minutos.';

  final _emailForm = GlobalKey<FormState>();
  final _resetForm = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _confirmation = TextEditingController();

  bool _sending = false;
  bool _codeStep = false;
  String? _sent;
  ApiException? _error;
  IdempotencyKey? _key;

  @override
  void dispose() {
    for (final c in [_email, _code, _password, _confirmation]) {
      c.dispose();
    }
    super.dispose();
  }

  void _edited(String _) => _key = null;

  Future<void> _requestCode() async {
    if (_sending || !_emailForm.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final message = await ref
          .read(authRepositoryProvider)
          .forgotPassword(_email.text);
      if (mounted) {
        setState(() {
          _sent = message ?? _defaultSent;
          _codeStep = true;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _reset() async {
    if (_sending || !_resetForm.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    final key = _key ??= IdempotencyKey();
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref
          .read(authRepositoryProvider)
          .resetPassword(
            email: _email.text,
            code: _code.text,
            password: _password.text,
            passwordConfirmation: _confirmation.text,
            key: key,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Su contraseña se cambió. Inicie sesión con la contraseña nueva.',
          ),
        ),
      );
      Navigator.of(context).maybePop();
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
    final showBanner =
        error != null && error.fields.isEmpty && error.code != 'code_invalid';

    return FormPage(
      appBar: AppBar(title: const Text('Recuperar contraseña')),
      children: [
        if (!_codeStep) ...[
          Text(
            'Ingrese el correo de su cuenta. Le enviaremos un código para '
            'crear una contraseña nueva.',
            style: text.bodyLarge,
          ),
          const SizedBox(height: 24),
          if (showBanner) ...[
            MessageBanner(error.message),
            const SizedBox(height: 16),
          ],
          Form(
            key: _emailForm,
            child: TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              textInputAction: TextInputAction.done,
              autofillHints: const [AutofillHints.email],
              onFieldSubmitted: (_) => _requestCode(),
              decoration: InputDecoration(
                labelText: 'Correo electrónico',
                errorText: error?.fieldError('email'),
              ),
              validator: Validators.email,
            ),
          ),
          const SizedBox(height: 24),
          LoadingButton(
            label: 'Enviar código',
            loading: _sending,
            onPressed: _requestCode,
          ),
        ] else ...[
          MessageBanner(_sent ?? _defaultSent, kind: BannerKind.info),
          const SizedBox(height: 16),
          if (showBanner) ...[
            MessageBanner(error.message),
            const SizedBox(height: 16),
          ],
          Form(
            key: _resetForm,
            child: AutofillGroup(
              child: Column(
                children: [
                  CodeField(
                    controller: _code,
                    textInputAction: TextInputAction.next,
                    onChanged: _edited,
                    errorText: error?.code == 'code_invalid'
                        ? error!.message
                        : error?.fieldError('code'),
                  ),
                  const SizedBox(height: 16),
                  PasswordField(
                    controller: _password,
                    label: 'Contraseña nueva',
                    errorText: error?.fieldError('password'),
                    autofillHints: const [AutofillHints.newPassword],
                    onChanged: _edited,
                    validator: Validators.newPassword,
                  ),
                  const SizedBox(height: 16),
                  PasswordField(
                    controller: _confirmation,
                    label: 'Confirme la contraseña nueva',
                    errorText: error?.fieldError('password_confirmation'),
                    autofillHints: const [AutofillHints.newPassword],
                    textInputAction: TextInputAction.done,
                    onChanged: _edited,
                    onSubmitted: (_) => _reset(),
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
            label: 'Guardar contraseña',
            loading: _sending,
            onPressed: _reset,
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _sending
                ? null
                : () => setState(() {
                    _codeStep = false;
                    _error = null;
                    _code.clear();
                  }),
            child: const Text('Enviar otro código'),
          ),
        ],
      ],
    );
  }
}
