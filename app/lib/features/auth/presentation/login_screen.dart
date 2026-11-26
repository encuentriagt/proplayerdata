import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/widgets/form_page.dart';
import '../../../core/widgets/message_banner.dart';
import '../../../core/widgets/password_field.dart';
import '../../../core/widgets/proplayer_logo.dart';
import '../application/session_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _sending = false;
  ApiException? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_sending || !_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref
          .read(sessionControllerProvider.notifier)
          .login(email: _email.text, password: _password.text);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionControllerProvider);
    final notice = session is SignedOut ? session.notice : null;
    final error = _error;
    final showBanner = error != null && error.fields.isEmpty;

    return FormPage(
      children: [
        const Center(child: ProPlayerLogo(size: 64)),
        const SizedBox(height: 32),
        Text(
          'Iniciar sesión',
          style: Theme.of(context).textTheme.headlineSmall
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 4),
        Text(
          'Siga los partidos, entrenos y estadísticas de sus hijos.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 24),
        if (notice != null && error == null) ...[
          MessageBanner(notice, kind: BannerKind.info),
          const SizedBox(height: 16),
        ],
        if (showBanner) ...[
          MessageBanner(error.message),
          const SizedBox(height: 16),
        ],
        Form(
          key: _formKey,
          child: AutofillGroup(
            child: Column(
              children: [
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.email],
                  decoration: InputDecoration(
                    labelText: 'Correo electrónico',
                    errorText: error?.fieldError('email'),
                  ),
                  validator: (v) => (v == null || !v.contains('@'))
                      ? 'Ingrese su correo electrónico.'
                      : null,
                ),
                const SizedBox(height: 16),
                PasswordField(
                  controller: _password,
                  label: 'Contraseña',
                  errorText: error?.fieldError('password'),
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                  validator: (v) => (v == null || v.isEmpty)
                      ? 'Ingrese su contraseña.'
                      : null,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
        FilledButton(
          onPressed: _sending ? null : _submit,
          child: _sending
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.5),
                )
              : const Text('Ingresar'),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: _sending ? null : () => context.push('/olvide-contrasena'),
          child: const Text('¿Olvidó su contraseña?'),
        ),
      ],
    );
  }
}
