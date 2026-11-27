import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/brand_colors.dart';
import '../../../core/widgets/form_page.dart';
import '../../../core/widgets/loading_button.dart';
import '../../../core/widgets/message_banner.dart';
import '../../../core/widgets/password_field.dart';
import '../../../core/widgets/proplayer_logo.dart';
import '../application/session_controller.dart';
import '../data/google_auth.dart';
import 'validators.dart';

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
  bool _google = false;
  ApiException? _error;
  String? _googleError;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  bool get _busy => _sending || _google;

  Future<void> _submit() async {
    if (_busy || !_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _sending = true;
      _error = null;
      _googleError = null;
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

  Future<void> _continueWithGoogle() async {
    if (_busy) return;
    setState(() {
      _google = true;
      _error = null;
      _googleError = null;
    });
    try {
      await ref.read(sessionControllerProvider.notifier).continueWithGoogle();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } on GoogleAuthException catch (e) {
      if (mounted) setState(() => _googleError = e.message);
    } finally {
      if (mounted) setState(() => _google = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionControllerProvider);
    final notice = session is SignedOut ? session.notice : null;
    final error = _error;
    final bannerText =
        _googleError ??
        (error?.fields.isEmpty ?? false ? error!.message : null);
    final googleAvailable = ref.watch(googleAuthProvider).available;
    final text = Theme.of(context).textTheme;

    return FormPage(
      children: [
        const Center(child: ProPlayerLogo(size: 64)),
        const SizedBox(height: 32),
        Text(
          'Iniciar sesión',
          style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 4),
        Text(
          'Siga los partidos, entrenos y estadísticas de sus hijos.',
          style: text.bodyMedium,
        ),
        const SizedBox(height: 24),
        if (notice != null && bannerText == null) ...[
          MessageBanner(notice, kind: BannerKind.info),
          const SizedBox(height: 16),
        ],
        if (bannerText != null) ...[
          MessageBanner(bannerText),
          const SizedBox(height: 16),
        ],
        if (googleAvailable) ...[
          OutlinedButton.icon(
            onPressed: _busy ? null : _continueWithGoogle,
            icon: _google
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text(
                    'G',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 18,
                      color: PpdColors.ink,
                    ),
                  ),
            label: const Text('Continuar con Google'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              foregroundColor: PpdColors.ink,
              side: const BorderSide(color: PpdColors.line),
              shape: const RoundedRectangleBorder(
                borderRadius: BorderRadius.all(Radius.circular(10)),
              ),
            ),
          ),
          const SizedBox(height: 16),
          const _OrDivider(),
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
                  validator: Validators.email,
                ),
                const SizedBox(height: 16),
                PasswordField(
                  controller: _password,
                  label: 'Contraseña',
                  errorText: error?.fieldError('password'),
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                  validator: (v) =>
                      Validators.required(v, 'Ingrese su contraseña.'),
                ),
              ],
            ),
          ),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: _busy ? null : () => context.push('/olvide-contrasena'),
            child: const Text('¿Olvidó su contraseña?'),
          ),
        ),
        const SizedBox(height: 8),
        LoadingButton(label: 'Ingresar', loading: _sending, onPressed: _submit),
        const SizedBox(height: 24),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('¿No tiene cuenta?', style: text.bodyMedium),
            TextButton(
              onPressed: _busy ? null : () => context.push('/crear-cuenta'),
              child: const Text(
                'Crear cuenta',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _OrDivider extends StatelessWidget {
  const _OrDivider();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(child: Divider(color: PpdColors.line)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            'o con su correo',
            style: Theme.of(context).textTheme.bodySmall
                ?.copyWith(color: PpdColors.muted),
          ),
        ),
        const Expanded(child: Divider(color: PpdColors.line)),
      ],
    );
  }
}
