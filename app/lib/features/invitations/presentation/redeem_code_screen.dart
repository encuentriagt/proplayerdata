import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/idempotency.dart';
import '../../../core/widgets/form_page.dart';
import '../../../core/widgets/loading_button.dart';
import '../../../core/widgets/message_banner.dart';
import '../application/invitations_providers.dart';
import '../data/invitations_repository.dart';

/// Vincular a un hijo con el código corto del correo (`ABCD-2345`).
class RedeemCodeScreen extends ConsumerStatefulWidget {
  const RedeemCodeScreen({super.key});

  @override
  ConsumerState<RedeemCodeScreen> createState() => _RedeemCodeScreenState();
}

class _RedeemCodeScreenState extends ConsumerState<RedeemCodeScreen> {
  final _formKey = GlobalKey<FormState>();
  final _code = TextEditingController();
  bool _sending = false;
  ApiException? _error;
  IdempotencyKey? _key;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_sending || !_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    final key = _key ??= IdempotencyKey();
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final childId = await ref
          .read(invitationsRepositoryProvider)
          .redeem(_code.text, key);
      _key = null;
      if (!mounted) return;
      refreshFamily(ref);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Listo: se vinculó a su hijo.')),
      );
      if (childId != null) {
        context.go('/hijos/$childId');
      } else {
        context.pop();
      }
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
    final inline = error?.code == 'code_invalid'
        ? error!.message
        : error?.fieldError('code');
    return FormPage(
      appBar: AppBar(title: const Text('Tengo un código')),
      children: [
        Text(
          'Ingrese el código de vinculación que le envió el colegio por '
          'correo, por ejemplo ABCD-2345.',
          style: Theme.of(context).textTheme.bodyLarge,
        ),
        const SizedBox(height: 24),
        if (error != null && inline == null) ...[
          MessageBanner(error.message),
          const SizedBox(height: 16),
        ],
        Form(
          key: _formKey,
          child: TextFormField(
            controller: _code,
            autocorrect: false,
            enableSuggestions: false,
            textCapitalization: TextCapitalization.characters,
            textInputAction: TextInputAction.done,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9\- ]')),
              LengthLimitingTextInputFormatter(14),
              TextInputFormatter.withFunction(
                (_, v) => v.copyWith(text: v.text.toUpperCase()),
              ),
            ],
            style: const TextStyle(
              fontSize: 22,
              letterSpacing: 4,
              fontWeight: FontWeight.w600,
            ),
            onChanged: (_) => _key = null,
            onFieldSubmitted: (_) => _submit(),
            validator: (v) {
              final clean = (v ?? '').replaceAll(RegExp(r'[\s\-]'), '');
              return clean.length < 6 ? 'Ingrese el código completo.' : null;
            },
            decoration: InputDecoration(
              labelText: 'Código de vinculación',
              hintText: 'ABCD-2345',
              errorText: inline,
            ),
          ),
        ),
        const SizedBox(height: 24),
        LoadingButton(label: 'Vincular', loading: _sending, onPressed: _submit),
      ],
    );
  }
}
