import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/widgets/form_page.dart';
import '../../../core/widgets/message_banner.dart';
import '../data/auth_repository.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  static const _defaultSent =
      'Si el correo está registrado, le enviamos un enlace para crear una '
      'nueva contraseña. El enlace vence en 60 minutos.';

  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _sending = false;
  String? _sent;
  ApiException? _error;

  @override
  void dispose() {
    _email.dispose();
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
      final message = await ref
          .read(authRepositoryProvider)
          .forgotPassword(_email.text);
      if (mounted) setState(() => _sent = message ?? _defaultSent);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final error = _error;
    return FormPage(
      appBar: AppBar(title: const Text('Recuperar contraseña')),
      children: [
        Text(
          'Ingrese el correo con el que entra a la App. Le enviaremos un '
          'enlace para crear una nueva contraseña.',
          style: Theme.of(context).textTheme.bodyLarge,
        ),
        const SizedBox(height: 24),
        if (_sent != null) ...[
          MessageBanner(_sent!, kind: BannerKind.info),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () => Navigator.of(context).maybePop(),
            child: const Text('Volver a iniciar sesión'),
          ),
        ] else ...[
          if (error != null && error.fields.isEmpty) ...[
            MessageBanner(error.message),
            const SizedBox(height: 16),
          ],
          Form(
            key: _formKey,
            child: TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              textInputAction: TextInputAction.done,
              onFieldSubmitted: (_) => _submit(),
              decoration: InputDecoration(
                labelText: 'Correo electrónico',
                errorText: error?.fieldError('email'),
              ),
              validator: (v) => (v == null || !v.contains('@'))
                  ? 'Ingrese su correo electrónico.'
                  : null,
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
                : const Text('Enviar enlace'),
          ),
        ],
      ],
    );
  }
}
