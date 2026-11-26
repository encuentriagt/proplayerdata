import 'package:flutter/material.dart';

import '../theme/brand_colors.dart';

enum BannerKind { error, info }

/// Mensaje destacado (errores de la API o avisos).
class MessageBanner extends StatelessWidget {
  const MessageBanner(this.message, {super.key, this.kind = BannerKind.error});

  final String message;
  final BannerKind kind;

  @override
  Widget build(BuildContext context) {
    final isError = kind == BannerKind.error;
    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isError ? PpdColors.errorBg : PpdColors.infoBg,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              isError ? Icons.error_outline : Icons.info_outline,
              color: isError ? PpdColors.error : PpdColors.infoInk,
              size: 20,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                message,
                style: TextStyle(
                  color: isError ? PpdColors.error : PpdColors.infoInk,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
