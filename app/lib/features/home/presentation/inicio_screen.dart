import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/theme/brand_colors.dart';
import '../../../core/theme/typography.dart';
import '../../../core/time/guatemala_time.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/home_actions.dart';
import '../../../core/widgets/motion.dart';
import '../../../core/widgets/proplayer_logo.dart';
import '../../../core/widgets/sport_icon.dart';
import '../../../core/widgets/v3.dart';
import '../../auth/application/session_controller.dart';
import '../../calendar/application/calendar_providers.dart';
import '../../calendar/data/event_models.dart';
import '../../children/application/children_providers.dart';
import '../../children/data/children_models.dart';
import '../../children/presentation/child_avatar.dart';
import '../../invitations/application/invitations_providers.dart';
import '../../notifications/application/notifications_providers.dart';

/// Inicio: «hoy y lo que viene». El próximo partido o entreno de los hijos,
/// sus atletas y la agenda cercana.
class InicioScreen extends ConsumerWidget {
  const InicioScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    refreshFamily(ref);
    ref.invalidate(upcomingEventsProvider);
    ref.invalidate(notificationsProvider);
    await ref
        .read(upcomingEventsProvider.future)
        .catchError((_) => <CalendarEvent>[]);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);
    final name = session is SignedIn ? session.profile.user.name : '';
    final firstName = name.split(' ').first;
    final upcoming = ref.watch(upcomingEventsProvider);
    final children = ref.watch(childrenProvider).value ?? const <Child>[];
    final unread = ref.watch(unreadNotificationsProvider);

    final events = upcoming.value ?? const <CalendarEvent>[];
    final hero =
        events.firstWhereOrNull((e) => e.isMatch) ?? events.firstOrNull;
    final next = events.where((e) => e != hero).take(3).toList();

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () => _refresh(ref),
          child: ListView(
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 4, 8),
                child: Row(
                  children: [
                    const ProPlayerLogo(size: 34, reduced: true),
                    const Spacer(),
                    IconButton(
                      tooltip: unread > 0 ? 'Avisos, $unread nuevos' : 'Avisos',
                      onPressed: () => context.go('/avisos'),
                      icon: Badge(
                        isLabelVisible: unread > 0,
                        backgroundColor: PpdColors.star,
                        textColor: PpdColors.ink,
                        label: Text('$unread'),
                        child: const Icon(Icons.notifications_none),
                      ),
                    ),
                    const HomeActions(),
                  ],
                ),
              ),
              if (firstName.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                  child: Text(
                    'Hola, $firstName',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              switch (upcoming) {
                AsyncError(:final error) => Padding(
                  padding: const EdgeInsets.all(16),
                  child: ErrorView(
                    error: error,
                    onRetry: () => ref.invalidate(upcomingEventsProvider),
                  ),
                ),
                AsyncData() when hero == null => const _NothingSoon(),
                AsyncData() => _Hero(event: hero!),
                _ => const SizedBox(
                  height: 200,
                  child: Center(child: CircularProgressIndicator()),
                ),
              },
              if (children.isNotEmpty) _Athletes(children: children),
              if (next.isNotEmpty) ...[
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 20, 20, 4),
                  child: Text(
                    'LO QUE VIENE',
                    style: TextStyle(
                      fontFamily: PpdType.display,
                      fontWeight: FontWeight.w800,
                      fontSize: 26,
                    ),
                  ),
                ),
                for (final e in next) _NextRow(event: e),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Bloque grande del próximo evento: marcador, cuenta regresiva y silueta.
class _Hero extends StatelessWidget {
  const _Hero({required this.event});

  final CalendarEvent event;

  @override
  Widget build(BuildContext context) {
    final e = event;
    final code = e.sport?.code ?? 'soccer';
    final start = e.start;
    final today = GuatemalaTime.today();
    final isToday =
        start != null &&
        start.year == today.year &&
        start.month == today.month &&
        start.day == today.day;
    final names = e.calledChildren.map((c) => c.firstName).toList();
    final who = names.isEmpty
        ? ''
        : names.length == 1
        ? names.first
        : '${names.sublist(0, names.length - 1).join(', ')} y ${names.last}';
    final verb = e.isMatch
        ? (names.length > 1 ? 'juegan' : 'juega')
        : (names.length > 1 ? 'entrenan' : 'entrena');
    final when = isToday
        ? 'Hoy'
        : start == null
        ? 'Pronto'
        : GuatemalaTime.shortDate(start);
    final ids = e.calledChildren.map((c) => c.childId).join(',');

    return Semantics(
      button: true,
      label: '$when $verb $who. ${e.heading}',
      excludeSemantics: true,
      child: InkWell(
        onTap: () => context.push('/eventos/${e.id}?hijos=$ids', extra: e),
        child: Container(
          height: 370,
          decoration: const BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(.5, -.5),
              radius: 1.2,
              colors: [
                Color(0xFF2FA65B),
                PpdColors.greenText,
                Color(0xFF0E2618),
              ],
              stops: [0, .45, 1],
            ),
          ),
          child: Stack(
            clipBehavior: Clip.hardEdge,
            children: [
              Positioned(
                right: -30,
                top: 10,
                child: Opacity(
                  opacity: .28,
                  child: SportSilhouette(
                    code: code,
                    color: Colors.white,
                    size: 300,
                    fade: true,
                    mirror: true,
                  ),
                ),
              ),
              if (start != null && !e.hasResult)
                Positioned(top: 16, right: 20, child: _Countdown(start: start)),
              if (e.isMatch)
                Positioned(left: 20, top: 46, child: _Scoreboard(event: e)),
              Positioned(
                left: 20,
                right: 20,
                bottom: 20,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    PillTag(
                      [
                        e.sport?.name ?? e.typeLabel,
                        ?(e.team?.name ?? e.teamName),
                      ].join(' · '),
                      background: Colors.white,
                      foreground: PpdColors.greenText,
                      icon: Icon(
                        sportIcon(code),
                        size: 14,
                        color: PpdColors.greenText,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      '$when $verb'.toUpperCase(),
                      style: PpdType.headline(58, color: Colors.white),
                    ),
                    Text(
                      '$who.'.toUpperCase(),
                      style: PpdType.headline(58, color: PpdColors.gold),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Marcador: equipo del hijo (oro) VS rival. 0 – 0 hasta que haya resultado.
class _Scoreboard extends StatelessWidget {
  const _Scoreboard({required this.event});

  final CalendarEvent event;

  @override
  Widget build(BuildContext context) {
    Widget side(int score, String name, Color color) => SizedBox(
      width: 96,
      child: Column(
        children: [
          Text('$score', style: PpdType.headline(104, color: color)),
          const SizedBox(height: 6),
          Text(
            name,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        side(
          event.scoreUs ?? 0,
          event.team?.name ?? event.teamName ?? '',
          PpdColors.gold,
        ),
        Padding(
          padding: const EdgeInsets.only(top: 38),
          child: Text(
            'VS',
            style: PpdType.headline(
              28,
              color: Colors.white.withValues(alpha: .6),
            ),
          ),
        ),
        side(event.scoreThem ?? 0, event.opponentName ?? 'Rival', Colors.white),
      ],
    );
  }
}

/// «EMPIEZA EN 05:12:40» (se actualiza cada segundo).
class _Countdown extends StatefulWidget {
  const _Countdown({required this.start});

  final DateTime start;

  @override
  State<_Countdown> createState() => _CountdownState();
}

class _CountdownState extends State<_Countdown> {
  Timer? _timer;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _timer?.cancel();
    if (continuousMotion(context)) {
      _timer = Timer.periodic(
        const Duration(seconds: 1),
        (_) => setState(() {}),
      );
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final now = GuatemalaTime.toLocal(DateTime.now());
    final left = widget.start.difference(now);
    if (left.isNegative) {
      return Text('EN JUEGO', style: PpdType.label(color: PpdColors.gold));
    }
    String two(int n) => n.toString().padLeft(2, '0');
    final text = left.inHours >= 48
        ? '${left.inDays} días'
        : '${two(left.inHours)}:${two(left.inMinutes % 60)}:'
              '${two(left.inSeconds % 60)}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          'EMPIEZA EN',
          style: PpdType.label(
            size: 11,
            color: Colors.white.withValues(alpha: .8),
          ),
        ),
        Text(text, style: PpdType.headline(30, color: Colors.white)),
      ],
    );
  }
}

/// «MIS ATLETAS»: tarjeta por hijo con el color de su deporte.
class _Athletes extends StatelessWidget {
  const _Athletes({required this.children});

  final List<Child> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              const Expanded(
                child: Text(
                  'MIS ATLETAS',
                  style: TextStyle(
                    fontFamily: PpdType.display,
                    fontWeight: FontWeight.w800,
                    fontSize: 28,
                  ),
                ),
              ),
              TextButton(
                onPressed: () => context.go('/hijos'),
                child: const Text(
                  'Ver todos',
                  style: TextStyle(
                    decoration: TextDecoration.underline,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 10,
            childAspectRatio: .95,
            children: [for (final c in children) _AthleteCard(child: c)],
          ),
        ],
      ),
    );
  }
}

class _AthleteCard extends StatelessWidget {
  const _AthleteCard({required this.child});

  final Child child;

  @override
  Widget build(BuildContext context) {
    final team = child.teams.firstOrNull;
    final code = team?.sport.code ?? 'soccer';
    final p = sportPalette(code);
    final number = team?.jerseyNumber;
    return Semantics(
      button: true,
      label: child.fullName,
      excludeSemantics: true,
      child: InkWell(
        onTap: () => context.push('/hijos/${child.id}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(6),
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [p.main, p.deep],
                  ),
                ),
                clipBehavior: Clip.hardEdge,
                child: Stack(
                  children: [
                    Positioned(
                      right: -16,
                      top: -4,
                      child: Opacity(
                        opacity: .5,
                        child: SportSilhouette(
                          code: code,
                          color: Colors.white,
                          size: 120,
                          fade: true,
                          mirror: true,
                        ),
                      ),
                    ),
                    Positioned(
                      left: 10,
                      bottom: 8,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          ChildAvatar(child: child, radius: 18),
                          if (number != null) ...[
                            const SizedBox(width: 8),
                            Text(
                              '#$number',
                              style: PpdType.headline(22, color: p.onMain),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              child.fullName.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: PpdType.headline(22, italic: false),
            ),
            Text(
              [?team?.position?.name, child.organization.name].join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13, color: PpdColors.muted),
            ),
          ],
        ),
      ),
    );
  }
}

/// Fila de la agenda cercana: día grande, tipo y quién.
class _NextRow extends StatelessWidget {
  const _NextRow({required this.event});

  final CalendarEvent event;

  @override
  Widget build(BuildContext context) {
    final e = event;
    final start = e.start;
    final p = e.isMatch
        ? sportPalette('soccer')
        : sportPalette('baseball'); // verde partido, azul entreno
    final who = e.calledChildren.map((c) => c.firstName).join(' y ');
    final ids = e.calledChildren.map((c) => c.childId).join(',');
    return InkWell(
      onTap: () => context.push('/eventos/${e.id}?hijos=$ids', extra: e),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 20),
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: PpdColors.ink)),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 52,
              child: Text(
                start == null ? '—' : '${start.day}',
                style: PpdType.headline(40, color: p.text, italic: false),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  PillTag(
                    [
                      if (start != null) GuatemalaTime.shortDate(start),
                      e.typeLabel,
                    ].join(' · '),
                    background: p.soft,
                    foreground: p.text,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    [
                      ?e.sport?.name,
                      who,
                      if (start != null) GuatemalaTime.time(start),
                    ].where((s) => s.isNotEmpty).join(' · '),
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward),
          ],
        ),
      ),
    );
  }
}

class _NothingSoon extends StatelessWidget {
  const _NothingSoon();

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.symmetric(horizontal: 20),
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: PpdColors.paper,
      borderRadius: BorderRadius.circular(16),
    ),
    child: const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'SIN CONVOCATORIAS PRÓXIMAS',
          style: TextStyle(
            fontFamily: PpdType.display,
            fontWeight: FontWeight.w800,
            fontSize: 26,
          ),
        ),
        SizedBox(height: 6),
        Text(
          'Cuando el coach convoque a sus hijos a un partido o entreno, '
          'aparecerá aquí con su cuenta regresiva.',
        ),
      ],
    ),
  );
}

extension<T> on Iterable<T> {
  T? firstWhereOrNull(bool Function(T) test) {
    for (final e in this) {
      if (test(e)) return e;
    }
    return null;
  }
}
