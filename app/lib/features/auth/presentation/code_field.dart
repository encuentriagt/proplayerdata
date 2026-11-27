import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import 'validators.dart';

/// Campo para el código de 6 dígitos que llega al correo.
class CodeField extends StatelessWidget {
  const CodeField({
    super.key,
    required this.controller,
    this.errorText,
    this.onChanged,
    this.onSubmitted,
    this.textInputAction = TextInputAction.done,
  });

  final TextEditingController controller;
  final String? errorText;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final TextInputAction textInputAction;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: TextInputType.number,
      textInputAction: textInputAction,
      autofillHints: const [AutofillHints.oneTimeCode],
      inputFormatters: [
        FilteringTextInputFormatter.digitsOnly,
        LengthLimitingTextInputFormatter(6),
      ],
      style: const TextStyle(
        fontSize: 24,
        letterSpacing: 8,
        fontWeight: FontWeight.w600,
      ),
      onChanged: onChanged,
      onFieldSubmitted: onSubmitted,
      validator: Validators.code,
      decoration: InputDecoration(
        labelText: 'Código de 6 dígitos',
        errorText: errorText,
      ),
    );
  }
}
