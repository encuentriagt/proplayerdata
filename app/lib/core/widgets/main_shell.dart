import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../features/invitations/application/invitations_providers.dart';
import '../../features/notifications/application/notifications_providers.dart';
import '../theme/brand_colors.dart';

/// Pestañas principales: Inicio, Calendario, Deportes, Avisos y Atletas.
/// La pestaña activa se marca con una barra dorada (versión 3).
class MainShell extends ConsumerWidget {
  const MainShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(invitationsProvider).value?.length ?? 0;
    final unread = ref.watch(unreadNotificationsProvider);
    const tabs = [
      (Icons.home_outlined, Icons.home, 'Inicio'),
      (Icons.calendar_month_outlined, Icons.calendar_month, 'Calendario'),
      (Icons.sports_outlined, Icons.sports, 'Deportes'),
      (Icons.notifications_none, Icons.notifications, 'Avisos'),
      (Icons.star_outline, Icons.star, 'Atletas'),
    ];
    final badges = [0, 0, 0, unread, pending];

    return Scaffold(
      body: shell,
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(
          color: PpdColors.surface,
          border: Border(top: BorderSide(color: PpdColors.hairline)),
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 64,
            child: Row(
              children: [
                for (var i = 0; i < tabs.length; i++)
                  Expanded(
                    child: _Tab(
                      icon: tabs[i].$1,
                      selectedIcon: tabs[i].$2,
                      label: tabs[i].$3,
                      badge: badges[i],
                      selected: shell.currentIndex == i,
                      onTap: () => shell.goBranch(
                        i,
                        initialLocation: i == shell.currentIndex,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.badge,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final int badge;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? PpdColors.ink : PpdColors.muted;
    return Semantics(
      selected: selected,
      button: true,
      label: badge > 0 ? '$label, $badge nuevos' : label,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Badge(
              isLabelVisible: badge > 0,
              backgroundColor: PpdColors.star,
              textColor: PpdColors.ink,
              label: Text('$badge'),
              child: Icon(selected ? selectedIcon : icon, color: color),
            ),
            const SizedBox(height: 3),
            Text(
              label,
              maxLines: 1,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
            const SizedBox(height: 3),
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: selected ? 18 : 0,
              height: 4,
              decoration: BoxDecoration(
                color: PpdColors.star,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
