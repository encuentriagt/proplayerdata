import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/widgets/form_page.dart';
import '../../../core/widgets/loading_button.dart';
import '../../../core/widgets/message_banner.dart';
import '../application/session_controller.dart';
import '../data/auth_repository.dart';
import 'code_field.dart';

/// Verificación obligatoria del correo con el código de 6 dígitos.
class VerifyEmailScreen extends ConsumerStatefulWidget {
  const VerifyEmailScreen({super.key});

  @override
  ConsumerState<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends ConsumerState<VerifyEmailScreen> {
  /// La API permite reenviar una vez por minuto.
  static const resendWait = 60;

  final _formKey = GlobalKey<FormState>();
  final _code = TextEditingController();
  bool _sending = false;
  bool _resending = false;
  ApiException? _error;
  String? _info;
  int _wait = resendWait;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  void _startCountdown([int seconds = resendWait]) {
    _timer?.cancel();
    setState(() => _wait = seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted || _wait <= 1) {
        t.cancel();
        if (mounted) setState(() => _wait = 0);
        return;
      }
      setState(() => _wait--);
    });
  }

  Future<void> _verify() async {
    if (_sending || !_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _sending = true;
      _error = null;
      _info = null;
    });
    try {
      await ref.read(authRepositoryProvider).verifyEmail(_code.text.trim());
      await ref.read(sessionControllerProvider.notifier).emailVerified();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _resend() async {
    if (_resending || _wait > 0) return;
    setState(() {
      _resending = true;
      _error = null;
      _info = null;
    });
    try {
      final message = await ref
          .read(authRepositoryProvider)
          .resendVerification();
      _code.clear();
      if (mounted) {
        setState(
          () => _info = message ?? 'Le enviamos un código nuevo a su correo.',
        );
      }
      _startCountdown();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e);
      final retry = int.tryParse('${e.extra['retry_after'] ?? ''}');
      if (e.code == 'too_many_requests') _startCountdown(retry ?? resendWait);
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionControllerProvider);
    final email = session is SignedIn ? session.profile.user.email : '';
    final error = _error;
    final text = Theme.of(context).textTheme;

    return PopScope(
      canPop: false,
      child: FormPage(
        appBar: AppBar(
          title: const Text('Verifique su correo'),
          automaticallyImplyLeading: false,
        ),
        children: [
          Text.rich(
            TextSpan(
              children: [
                const TextSpan(text: 'Enviamos un código de 6 dígitos a '),
                TextSpan(
                  text: email,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const TextSpan(
                  text:
                      '. Ingréselo para activar su cuenta. Vence en 15 '
                      'minutos.',
                ),
              ],
            ),
            style: text.bodyLarge,
          ),
          const SizedBox(height: 24),
          if (_info != null) ...[
            MessageBanner(_info!, kind: BannerKind.info),
            const SizedBox(height: 16),
          ],
          if (error != null && error.code != 'code_invalid') ...[
            MessageBanner(error.message),
            const SizedBox(height: 16),
          ],
          Form(
            key: _formKey,
            child: CodeField(
              controller: _code,
              errorText: error?.code == 'code_invalid'
                  ? error!.message
                  : error?.fieldError('code'),
              onSubmitted: (_) => _verify(),
            ),
          ),
          const SizedBox(height: 24),
          LoadingButton(
            label: 'Verificar',
            loading: _sending,
            onPressed: _verify,
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: (_wait > 0 || _resending) ? null : _resend,
            child: Text(
              _wait > 0 ? 'Reenviar código en $_wait s' : 'Reenviar código',
            ),
          ),
          const SizedBox(height: 16),
          Text(
            '¿No le llega? Revise la carpeta de spam o correo no deseado.',
            style: text.bodySmall,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () =>
                ref.read(sessionControllerProvider.notifier).logout(),
            child: const Text('¿Correo equivocado? Cerrar sesión'),
          ),
        ],
      ),
    );
  }
}
