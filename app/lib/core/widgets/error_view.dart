import 'package:material_ui/material_ui.dart';

import '../network/api_exception.dart';
import '../theme/brand_colors.dart';

/// Error al cargar, con botón para reintentar.
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final e = error;
    final message = e is ApiException ? e.message : ApiException.unknownMessage;
    final offline = e is ApiException && e.isNetwork;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            offline ? Icons.wifi_off : Icons.error_outline,
            size: 40,
            color: PpdColors.muted,
          ),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          OutlinedButton(onPressed: onRetry, child: const Text('Reintentar')),
        ],
      ),
    );
  }
}
