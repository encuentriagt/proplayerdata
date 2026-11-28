import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/brand_colors.dart';
import '../../../core/theme/typography.dart';
import '../../../core/widgets/pitch_background.dart';
import '../../../core/widgets/loading_button.dart';
import '../../../core/widgets/message_banner.dart';
import '../../../core/widgets/password_field.dart';
import '../../../core/widgets/proplayer_logo.dart';
import '../../invitations/presentation/pending_link_banner.dart';
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

    final form = <Widget>[
      Text(
        'Iniciar sesión',
        style: text.titleLarge?.copyWith(fontWeight: FontWeight.w700),
      ),
      const SizedBox(height: 12),
      const PendingLinkBanner(
        'Para vincular a su hijo, inicie sesión o cree su cuenta. Se vinculará al entrar.',
      ),
      if (notice != null && bannerText == null) ...[
        MessageBanner(notice, kind: BannerKind.info),
        const SizedBox(height: 12),
      ],
      if (bannerText != null) ...[
        MessageBanner(bannerText),
        const SizedBox(height: 12),
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
              const SizedBox(height: 10),
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
          style: TextButton.styleFrom(foregroundColor: PpdColors.goldText),
          child: const Text(
            '¿Olvidó su contraseña?',
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
      ),
      LoadingButton(label: 'Ingresar', loading: _sending, onPressed: _submit),
      if (googleAvailable) ...[
        const SizedBox(height: 14),
        const _OrDivider(),
        const SizedBox(height: 12),
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
                    color: Color(0xFF4285F4),
                  ),
                ),
          label: const Text('Continuar con Google'),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            foregroundColor: const Color(0xFF1F1F1F),
            side: const BorderSide(color: Color(0xFFDADCE0), width: 1.5),
          ),
        ),
      ],
      const SizedBox(height: 4),
      Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text('¿No tiene cuenta?', style: text.bodyMedium),
          TextButton(
            onPressed: _busy ? null : () => context.push('/crear-cuenta'),
            style: TextButton.styleFrom(foregroundColor: PpdColors.greenText),
            child: const Text(
              'Crear cuenta',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    ];

    return Scaffold(
      backgroundColor: PpdColors.surface,
      body: Stack(
        children: [
          const Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: 640,
            child: PitchBackground(),
          ),
          LayoutBuilder(
            builder: (context, box) => SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: box.maxHeight),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SafeArea(
                      bottom: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(24, 20, 24, 28),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const ProPlayerLogo(size: 64, negative: true),
                            const SizedBox(height: 28),
                            const _Headline(),
                            const SizedBox(height: 14),
                            for (final c in const [
                              PpdColors.green,
                              PpdColors.gold,
                              PpdColors.cyan,
                            ])
                              Container(
                                width: 150,
                                height: 6,
                                margin: const EdgeInsets.only(bottom: 4),
                                color: c,
                              ),
                          ],
                        ),
                      ),
                    ),
                    Container(
                      decoration: const BoxDecoration(
                        color: PpdColors.surface,
                        borderRadius: BorderRadius.vertical(
                          top: Radius.circular(28),
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Color(0x59000000),
                            blurRadius: 40,
                            offset: Offset(0, -18),
                          ),
                        ],
                      ),
                      padding: const EdgeInsets.fromLTRB(24, 20, 24, 12),
                      child: SafeArea(
                        top: false,
                        child: Center(
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 440),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: form,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// «SU ATLETA. / CADA JUGADA. / CADA LOGRO.» del tamaño que quepa.
class _Headline extends StatelessWidget {
  const _Headline();

  @override
  Widget build(BuildContext context) {
    Widget line(String t, Color c) => FittedBox(
      fit: BoxFit.scaleDown,
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(right: 10),
        child: Text(t, maxLines: 1, style: PpdType.headline(70, color: c)),
      ),
    );
    return Semantics(
      header: true,
      label: 'Su atleta. Cada jugada. Cada logro.',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          line('SU ATLETA.', Colors.white),
          line('CADA JUGADA.', PpdColors.greenBright),
          line('CADA LOGRO.', PpdColors.gold),
        ],
      ),
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
            'o continúe con',
            style: Theme.of(context).textTheme.bodySmall
                ?.copyWith(color: PpdColors.muted),
          ),
        ),
        const Expanded(child: Divider(color: PpdColors.line)),
      ],
    );
  }
}
