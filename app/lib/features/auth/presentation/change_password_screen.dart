import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/idempotency.dart';
import '../../../core/widgets/form_page.dart';
import '../../../core/widgets/loading_button.dart';
import '../../../core/widgets/message_banner.dart';
import '../../../core/widgets/password_field.dart';
import '../application/session_controller.dart';
import '../data/auth_repository.dart';
import 'validators.dart';

/// Cambio de contraseña. Si [mandatory], el usuario no puede salir de aquí
/// (contraseña temporal) salvo cerrando sesión.
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key, this.mandatory = false});

  final bool mandatory;

  @override
  ConsumerState<ChangePasswordScreen> createState() =>
      _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _password = TextEditingController();
  final _confirmation = TextEditingController();
  bool _sending = false;
  ApiException? _error;

  /// Misma clave mientras el usuario reintenta lo mismo; nueva si edita.
  IdempotencyKey? _key;

  @override
  void dispose() {
    _current.dispose();
    _password.dispose();
    _confirmation.dispose();
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
          .read(authRepositoryProvider)
          .changePassword(
            currentPassword: _current.text,
            password: _password.text,
            passwordConfirmation: _confirmation.text,
            key: key,
          );
      _key = null;
      await ref.read(sessionControllerProvider.notifier).passwordChanged();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Su contraseña se cambió correctamente.')),
      );
      if (!widget.mandatory) Navigator.of(context).maybePop();
    } on ApiException catch (e) {
      // Solo se conserva la clave si la falla fue de red (reintento idéntico).
      if (!e.isNetwork) _key = null;
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final error = _error;
    return PopScope(
      canPop: !widget.mandatory,
      child: FormPage(
        appBar: AppBar(
          title: const Text('Cambiar contraseña'),
          automaticallyImplyLeading: !widget.mandatory,
        ),
        children: [
          if (widget.mandatory) ...[
            const MessageBanner(
              'Por seguridad, cambie la contraseña temporal antes de continuar.',
              kind: BannerKind.info,
            ),
            const SizedBox(height: 16),
          ],
          if (error != null && error.fields.isEmpty) ...[
            MessageBanner(error.message),
            const SizedBox(height: 16),
          ],
          Form(
            key: _formKey,
            child: AutofillGroup(
              child: Column(
                children: [
                  PasswordField(
                    controller: _current,
                    label: widget.mandatory
                        ? 'Contraseña temporal'
                        : 'Contraseña actual',
                    errorText: error?.fieldError('current_password'),
                    onChanged: _edited,
                    validator: (v) => (v == null || v.isEmpty)
                        ? 'Ingrese su contraseña actual.'
                        : null,
                  ),
                  const SizedBox(height: 16),
                  PasswordField(
                    controller: _password,
                    label: 'Nueva contraseña',
                    errorText: error?.fieldError('password'),
                    autofillHints: const [AutofillHints.newPassword],
                    onChanged: _edited,
                    validator: Validators.newPassword,
                  ),
                  const SizedBox(height: 16),
                  PasswordField(
                    controller: _confirmation,
                    label: 'Confirme la nueva contraseña',
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
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 24),
          LoadingButton(
            label: 'Guardar contraseña',
            loading: _sending,
            onPressed: _submit,
          ),
          if (widget.mandatory) ...[
            const SizedBox(height: 8),
            TextButton(
              onPressed: _sending
                  ? null
                  : () => ref.read(sessionControllerProvider.notifier).logout(),
              child: const Text('Cerrar sesión'),
            ),
          ],
        ],
      ),
    );
  }
}
