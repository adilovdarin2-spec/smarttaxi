import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/sockets/socket_service.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../shared/models.dart';
import '../../../shared/stand_sync.dart';
import '../../../shared/stand_location.dart';
import '../../widgets/driver_common_widgets.dart';

/// The driver's side of a stand: the lines nearby, their own place in one, and
/// everything they do from it — advertise where they are going and for how
/// much, take seats from riders who called or walked up, hand their turn to
/// the car next to them, and leave when the car is full.
///
/// A full-screen route rather than a fourth tab, for the same reason the
/// navigator is: standing in a line is a mode a driver is in, not a panel they
/// glance at.
class DriverStandScreen extends StatefulWidget {
  const DriverStandScreen({
    super.key,
    required this.api,
    required this.socket,
    required this.regionId,
    required this.isOnline,
    this.initialPosition,
  });

  final ApiClient api;
  final SocketService socket;
  final String? regionId;
  final bool isOnline;
  final Coordinate? initialPosition;

  @override
  State<DriverStandScreen> createState() => _DriverStandScreenState();
}

class _DriverStandScreenState extends State<DriverStandScreen> {
  // The place in the line is a claim about where the car physically is, so the
  // app keeps saying so while the screen is open. The server's own sweeper
  // uses a much longer grace period; this is only what keeps the driver's own
  // warning honest.
  static const _presenceInterval = Duration(seconds: 25);
  static const _refreshInterval = Duration(seconds: 20);

  List<TaxiStand> _stands = const [];
  MyStandPlace _place = const MyStandPlace();
  Coordinate? _position;
  Position? _sensorFix;
  Future<void>? _locationRefresh;
  bool _publishingPresence = false;
  Coordinate? get _freshPosition =>
      freshStandPosition(_sensorFix, DateTime.now());
  StandPresence? _presence;
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _actionError;
  Timer? _presenceTimer;
  Timer? _refreshTimer;
  String? _joinedStandRoom;
  final _sync = StandSync();
  final _unsubscribe = <VoidCallback>[];

  @override
  void initState() {
    super.initState();
    _position = widget.initialPosition;
    unawaited(_bootstrap());
  }

  @override
  void dispose() {
    _sync.dispose();
    for (final unsubscribe in _unsubscribe) {
      unsubscribe();
    }
    _presenceTimer?.cancel();
    _refreshTimer?.cancel();
    final room = _joinedStandRoom;
    if (room != null) widget.socket.leaveStand(room);
    super.dispose();
  }

  Future<void> _bootstrap() async {
    await _refreshPosition();
    await _load();
    if (!mounted) return;
    _presenceTimer =
        Timer.periodic(_presenceInterval, (_) => _publishPresence());
    _refreshTimer =
        Timer.periodic(_refreshInterval, (_) => _load(silent: true));
    _unsubscribe.add(widget.socket.onDriverStandQueueUpdate(_onQueueEvent));
    _unsubscribe.add(
        widget.socket.onStandPersonalEvent((_, __) => _load(silent: true)));
  }

  void _onQueueEvent(dynamic data) {
    // The payload carries the whole line, but the driver's own place carries
    // reservations the broadcast deliberately does not include for everyone —
    // so a push is a signal to re-read, not the read itself.
    if (!mounted) return;
    unawaited(_load(silent: true));
  }

  Future<void> _refreshPosition() {
    if (!mounted) return Future.value();
    // Joining must await an already-running GPS check too, not fall through
    // with the old fix while that check is about to report lost permission.
    return _locationRefresh ??=
        _readPosition().whenComplete(() => _locationRefresh = null);
  }

  Future<void> _readPosition() async {
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      if (!mounted) return;
      setState(() {
        _sensorFix = position;
        _position = _freshPosition ?? _position;
      });
    } catch (_) {
      if (mounted) setState(() => _sensorFix = null);
    }
  }

  Future<void> _load({bool silent = false, bool reconcile = false}) async {
    if (!mounted) return;
    final ticket = _sync.beginRead(reconcile: reconcile);
    if (ticket == null) return;
    if (!silent) setState(() => _loading = true);
    try {
      final place = await widget.api.getMyStandPlace();
      if (!_sync.currentRead(ticket)) return;
      final stands = await widget.api.getDriverStands(
        regionId: widget.regionId,
        at: _position,
      );
      if (!_sync.settleRead(ticket, true)) return;
      setState(() {
        if (_place.entry?.id != place.entry?.id) _presence = null;
        _place = place;
        _stands = stands;
        _loading = false;
        _error = null;
      });
      _syncStandRoom(place.stand?.id);
    } catch (error) {
      if (!_sync.settleRead(ticket, false)) return;
      setState(() {
        _loading = false;
        _error = _readError(error);
      });
    }
  }

  void _syncStandRoom(String? standId) {
    if (_joinedStandRoom == standId) return;
    final previous = _joinedStandRoom;
    if (previous != null) widget.socket.leaveStand(previous);
    _joinedStandRoom = standId;
    if (standId != null) widget.socket.joinStand(standId);
  }

  Future<void> _publishPresence() async {
    if (!mounted || _publishingPresence) return;
    _publishingPresence = true;
    try {
      await _refreshPosition();
      if (!mounted || !_place.isInLine) return;
      final entryId = _place.entry?.id;
      final presence = await widget.api.publishStandPresence(_freshPosition);
      if (!mounted || _place.entry?.id != entryId) return;
      setState(() => _presence = presence);
    } catch (_) {
      // A missed heartbeat is not evidence the car left. The server's own
      // longer timeout is what decides that; showing a scary warning off one
      // failed request would be worse than showing nothing.
    } finally {
      _publishingPresence = false;
    }
  }

  String _readError(Object error) {
    final text = error.toString();
    final match = RegExp(r'"message"\s*:\s*"([^"]+)"').firstMatch(text);
    if (match != null) return match.group(1)!;
    return AppLocalizations.of(context).standActionFailed;
  }

  Future<void> _run(Future<void> Function() action) async {
    if (!mounted) return;
    final ticket = _sync.beginWrite();
    if (ticket == null) return;
    setState(() {
      _busy = true;
      _actionError = null;
    });
    try {
      await action();
    } catch (error) {
      if (mounted) setState(() => _actionError = _readError(error));
    } finally {
      if (_sync.currentWrite(ticket)) {
        await _load(silent: true, reconcile: true);
        if (_sync.finishWrite(ticket)) setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    return Scaffold(
      backgroundColor: palette.appBackground,
      appBar: AppBar(
        backgroundColor: palette.appBackground,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text(l10n.standScreenTitle),
        actions: [
          IconButton(
            onPressed: _busy
                ? null
                : () async {
                    await _refreshPosition();
                    await _load();
                  },
            icon: const Icon(Icons.refresh),
            tooltip: l10n.retry,
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            await _refreshPosition();
            await _load();
          },
          // Always a scrollable list, never a bare Center: pull-to-refresh has
          // to work on an empty screen too, which is exactly the screen a
          // driver is looking at when something is wrong.
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              if (_loading) ...[
                const Center(
                  child: Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: CircularProgressIndicator(),
                  ),
                ),
              ],
              if (_error != null) ...[
                InlineMessage(text: _error!, danger: true),
                const SizedBox(height: 12),
              ],
              if (_actionError != null) ...[
                InlineMessage(text: _actionError!, danger: true),
                const SizedBox(height: 12),
              ],
              if (_sync.blocked && !_busy && !_loading) ...[
                InlineMessage(text: l10n.standRefreshRequired, danger: true),
                const SizedBox(height: 12),
              ],
              if (_place.isInLine && _freshPosition == null) ...[
                InlineMessage(
                    text: l10n.standPresenceNeedsLocation, danger: true),
                const SizedBox(height: 12),
              ],
              if (_place.isInLine)
                DriverStandPlaceSection(
                  place: _place,
                  presence: _freshPosition == null ? null : _presence,
                  busy: _busy || _sync.blocked,
                  onAddSeat: _addSeat,
                  onReleaseSeat: _releaseSeat,
                  onEditOffer: _editOffer,
                  onDepart: _depart,
                  onLeave: _leave,
                  onGiveTurn: _giveTurn,
                  onRespond: _respondToReservation,
                )
              else
                DriverStandListSection(
                  stands: _stands,
                  position: _freshPosition,
                  isOnline: widget.isOnline,
                  busy: _busy || _sync.blocked,
                  onJoin: _join,
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _join(TaxiStand stand) async {
    if (_freshPosition == null) return;
    final offer = await _askOffer(stand: stand);
    if (offer == null || !mounted) return;
    // The offer sheet may have been open for minutes. Do not reuse the fix
    // from before the driver filled it in or before they lost permission.
    await _refreshPosition();
    if (!mounted) return;
    final position = _freshPosition;
    if (position == null) {
      setState(() =>
          _actionError = AppLocalizations.of(context).standJoinNeedsLocation);
      return;
    }
    await _run(() async {
      await widget.api.joinStandQueue(
        stand.id,
        at: position,
        destinationLabel: offer.destination,
        pricePerSeat: offer.pricePerSeat,
        totalSeats: offer.totalSeats,
        comment: offer.comment,
      );
    });
  }

  Future<void> _editOffer() async {
    final entry = _place.entry;
    final stand = _place.stand;
    if (entry == null || stand == null) return;
    final offer = await _askOffer(stand: stand, entry: entry);
    if (offer == null) return;
    await _run(() async {
      await widget.api.updateStandOffer(
        entry.id,
        destinationLabel: offer.destination,
        pricePerSeat: offer.pricePerSeat,
        totalSeats: offer.totalSeats,
        comment: offer.comment,
      );
    });
  }

  Future<_StandOffer?> _askOffer({
    required TaxiStand stand,
    StandQueueEntry? entry,
  }) {
    return showModalBottomSheet<_StandOffer>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _StandOfferSheet(stand: stand, entry: entry),
    );
  }

  Future<void> _addSeat() async {
    final entry = _place.entry;
    if (entry == null || entry.isFull) return;
    final source = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => const _SeatSourceSheet(),
    );
    if (source == null) return;
    await _run(() => widget.api.addStandSeats(entry.id, source: source));
  }

  Future<void> _releaseSeat() async {
    final entry = _place.entry;
    if (entry == null || entry.takenSeats <= 0) return;
    await _run(() => widget.api.releaseStandSeats(entry.id));
  }

  Future<void> _depart() async {
    final entry = _place.entry;
    if (entry == null) return;
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.standDepartConfirmTitle),
        content: Text(l10n.standDepartConfirmText),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.standDepartButton),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _run(() => widget.api.departStandQueue(entry.id));
  }

  Future<void> _leave() async {
    final entry = _place.entry;
    if (entry == null) return;
    await _run(() => widget.api.leaveStandQueue(entry.id));
  }

  Future<void> _giveTurn() async {
    final entry = _place.entry;
    if (entry == null) return;
    final l10n = AppLocalizations.of(context);
    if (entry.takenSeats > 0) {
      setState(() => _actionError = l10n.standGiveTurnHasSeats);
      return;
    }
    final others = _place.queue
        .where((row) => row.driverId != entry.driverId)
        .toList(growable: false);
    final targetId = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => _GiveTurnSheet(candidates: others),
    );
    if (targetId == null) return;
    await _run(() => widget.api.handOverStandTurn(entry.id, targetId));
  }

  Future<void> _respondToReservation(
      StandSeatReservation reservation, bool accept) async {
    await _run(() =>
        widget.api.respondToStandReservation(reservation.id, accept: accept));
  }
}

class _StandOffer {
  const _StandOffer({
    required this.destination,
    required this.pricePerSeat,
    required this.totalSeats,
    required this.comment,
  });

  final String destination;
  final int? pricePerSeat;
  final int totalSeats;
  final String comment;
}

class DriverStandListSection extends StatelessWidget {
  const DriverStandListSection({
    super.key,
    required this.stands,
    required this.position,
    required this.isOnline,
    required this.busy,
    required this.onJoin,
  });

  final List<TaxiStand> stands;
  final Coordinate? position;
  final bool isOnline;
  final bool busy;
  final Future<void> Function(TaxiStand stand) onJoin;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (stands.isEmpty) {
      return PremiumCard(
        child: TitleBlock(title: l10n.standNoneTitle, text: l10n.standNoneText),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeading(text: l10n.standNearbyTitle),
        const SizedBox(height: 10),
        for (final stand in stands) ...[
          _StandCard(
            stand: stand,
            position: position,
            isOnline: isOnline,
            busy: busy,
            onJoin: () => onJoin(stand),
          ),
          const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _StandCard extends StatelessWidget {
  const _StandCard({
    required this.stand,
    required this.position,
    required this.isOnline,
    required this.busy,
    required this.onJoin,
  });

  final TaxiStand stand;
  final Coordinate? position;
  final bool isOnline;
  final bool busy;
  final VoidCallback onJoin;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    final distance = position == null ? null : stand.distanceFrom(position!);
    final inside = position != null && stand.containsPoint(position!);
    // The button is only offered when the driver is actually standing there
    // and on the line: the server refuses otherwise, and a button that only
    // ever produces a refusal is worse than no button.
    final canJoin = isOnline && inside && !busy;
    final blockedReason = !isOnline
        ? l10n.standJoinNeedsOnline
        : position == null
            ? l10n.standJoinNeedsLocation
            : !inside
                ? l10n.standJoinTooFar
                : null;
    return PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                stand.isIntercity
                    ? Icons.alt_route_rounded
                    : Icons.local_taxi_rounded,
                color: palette.brand,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  stand.name,
                  style: TextStyle(
                    color: palette.text,
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (distance != null)
                Text(
                  l10n.standDistanceMeters(distance),
                  style: TextStyle(
                    color: inside ? palette.success : palette.textSecondary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 12,
            runSpacing: 4,
            children: [
              _Chip(
                text: stand.isIntercity
                    ? l10n.standKindIntercity
                    : l10n.standKindCity,
              ),
              _Chip(text: l10n.standCarsInLine(stand.driversCount)),
              if (stand.driversCount > 0)
                _Chip(text: l10n.standFreeSeatsShort(stand.freeSeats)),
            ],
          ),
          if (stand.note.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              stand.note,
              style: TextStyle(color: palette.textSecondary, fontSize: 13),
            ),
          ],
          const SizedBox(height: 14),
          DriverGradientButton(
            text: l10n.standJoinButton,
            enabled: canJoin,
            onTap: canJoin ? onJoin : null,
            height: 50,
          ),
          if (blockedReason != null) ...[
            const SizedBox(height: 8),
            Text(
              blockedReason,
              style: TextStyle(color: palette.textMuted, fontSize: 12.5),
            ),
          ],
        ],
      ),
    );
  }
}

class DriverStandPlaceSection extends StatelessWidget {
  const DriverStandPlaceSection({
    super.key,
    required this.place,
    required this.presence,
    required this.busy,
    required this.onAddSeat,
    required this.onReleaseSeat,
    required this.onEditOffer,
    required this.onDepart,
    required this.onLeave,
    required this.onGiveTurn,
    required this.onRespond,
  });

  final MyStandPlace place;
  final StandPresence? presence;
  final bool busy;
  final Future<void> Function() onAddSeat;
  final Future<void> Function() onReleaseSeat;
  final Future<void> Function() onEditOffer;
  final Future<void> Function() onDepart;
  final Future<void> Function() onLeave;
  final Future<void> Function() onGiveTurn;
  final Future<void> Function(StandSeatReservation reservation, bool accept)
      onRespond;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    final entry = place.entry!;
    final stand = place.stand;
    final position = entry.position ?? 1;
    final ahead = (position - 1).clamp(0, 99).toInt();
    final boarding = entry.isBoarding;
    final pending = entry.pendingReservations;
    final live = presence;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (live != null && live.isOutside)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: InlineMessage(
              text: l10n.standOutsideWarning(
                live.distanceM ?? 0,
                live.graceMinutes ?? 5,
              ),
              danger: true,
            ),
          ),
        PremiumCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                stand?.name ?? l10n.standScreenTitle,
                style: TextStyle(
                  color: palette.text,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                boarding
                    ? l10n.standYourTurnTitle
                    : l10n.standPositionLabel(position),
                style: TextStyle(
                  color: boarding ? palette.success : palette.brand,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                boarding
                    ? l10n.standYourTurnText
                    : l10n.standWaitTurnText(ahead),
                style: TextStyle(color: palette.textSecondary, fontSize: 13.5),
              ),
              const SizedBox(height: 16),
              _SeatCounter(
                entry: entry,
                busy: busy,
                enabled: boarding,
                onAdd: onAddSeat,
                onRelease: onReleaseSeat,
              ),
              const SizedBox(height: 16),
              _OfferSummary(entry: entry, onEdit: busy ? null : onEditOffer),
              const SizedBox(height: 16),
              DriverGradientButton(
                text: l10n.standDepartButton,
                enabled: boarding && !busy,
                onTap: boarding && !busy ? onDepart : null,
                icon: Icons.directions_car_filled_rounded,
                highlighted: entry.isFull,
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: busy ? null : onGiveTurn,
                      child: Text(l10n.standGiveTurnButton),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: busy ? null : onLeave,
                      child: Text(l10n.standLeaveButton),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        if (pending.isNotEmpty) ...[
          const SizedBox(height: 18),
          _SectionHeading(text: l10n.standRequestsTitle),
          const SizedBox(height: 10),
          for (final reservation in pending) ...[
            _ReservationCard(
              reservation: reservation,
              busy: busy,
              onRespond: onRespond,
            ),
            const SizedBox(height: 10),
          ],
        ],
        const SizedBox(height: 18),
        _SectionHeading(text: l10n.standQueueTitle),
        const SizedBox(height: 10),
        for (final row in place.queue)
          _QueueRow(entry: row, isMe: row.id == entry.id),
      ],
    );
  }
}

class _SeatCounter extends StatelessWidget {
  const _SeatCounter({
    required this.entry,
    required this.busy,
    required this.enabled,
    required this.onAdd,
    required this.onRelease,
  });

  final StandQueueEntry entry;
  final bool busy;
  final bool enabled;
  final Future<void> Function() onAdd;
  final Future<void> Function() onRelease;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.cardWarm,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: palette.border),
      ),
      // The count above, the two controls below: this app's buttons are
      // full-width by theme (minimumSize Size.fromHeight(56)), so one placed
      // beside anything else in a Row forces an infinite width and takes the
      // whole screen's layout down with it. Every button here is either
      // Expanded or given a width of its own.
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.standSeatsLabel,
            style: TextStyle(color: palette.textSecondary, fontSize: 12.5),
          ),
          const SizedBox(height: 2),
          Text(
            l10n.standSeatsValue(entry.takenSeats, entry.totalSeats),
            style: TextStyle(
              color: palette.text,
              fontSize: 26,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              SizedBox(
                width: 56,
                height: 52,
                child: OutlinedButton(
                  onPressed: !busy && enabled && entry.takenSeats > 0
                      ? onRelease
                      : null,
                  style: OutlinedButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(56, 52),
                  ),
                  child: Semantics(
                    label: l10n.standReleaseSeat,
                    button: true,
                    child: const Icon(Icons.remove),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: SizedBox(
                  height: 52,
                  child: FilledButton.icon(
                    onPressed: !busy && enabled && !entry.isFull ? onAdd : null,
                    icon: const Icon(Icons.person_add_alt_1_rounded),
                    label: Text(l10n.standAddSeat),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _OfferSummary extends StatelessWidget {
  const _OfferSummary({required this.entry, required this.onEdit});

  final StandQueueEntry entry;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    return InkWell(
      onTap: onEdit,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: palette.border),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.destinationLabel.isEmpty
                        ? l10n.standDestinationUnknown
                        : entry.destinationLabel,
                    style: TextStyle(
                      color: palette.text,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    entry.pricePerSeat == null
                        ? l10n.standNoPriceYet
                        : l10n.standPricePerSeatValue('${entry.pricePerSeat}'),
                    style:
                        TextStyle(color: palette.textSecondary, fontSize: 13.5),
                  ),
                  if (entry.comment.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      entry.comment,
                      style:
                          TextStyle(color: palette.textMuted, fontSize: 12.5),
                    ),
                  ],
                ],
              ),
            ),
            Icon(Icons.edit_outlined, color: palette.textSecondary),
          ],
        ),
      ),
    );
  }
}

class _ReservationCard extends StatelessWidget {
  const _ReservationCard({
    required this.reservation,
    required this.busy,
    required this.onRespond,
  });

  final StandSeatReservation reservation;
  final bool busy;
  final Future<void> Function(StandSeatReservation reservation, bool accept)
      onRespond;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    return PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            reservation.clientName.isEmpty ? '—' : reservation.clientName,
            style: TextStyle(
              color: palette.text,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            '${l10n.standRequestSeats(reservation.seats)} · ${reservation.clientPhone}',
            style: TextStyle(color: palette.textSecondary, fontSize: 13),
          ),
          if (reservation.pickupLabel.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              reservation.pickupLabel,
              style: TextStyle(color: palette.textMuted, fontSize: 12.5),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: busy ? null : () => onRespond(reservation, false),
                  child: Text(l10n.standDeclineRequest),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  onPressed: busy ? null : () => onRespond(reservation, true),
                  child: Text(l10n.standAcceptRequest),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _QueueRow extends StatelessWidget {
  const _QueueRow({required this.entry, required this.isMe});

  final StandQueueEntry entry;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: isMe ? palette.brandSurface : palette.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: isMe ? palette.brand : palette.border),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 28,
            child: Text(
              '${entry.position ?? '—'}',
              style: TextStyle(
                color:
                    entry.isBoarding ? palette.success : palette.textSecondary,
                fontWeight: FontWeight.w800,
                fontSize: 16,
              ),
            ),
          ),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.carLabel.isEmpty ? entry.driverName : entry.carLabel,
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  entry.plate,
                  style: TextStyle(color: palette.textMuted, fontSize: 12.5),
                ),
              ],
            ),
          ),
          Text(
            l10n.standSeatsValue(entry.takenSeats, entry.totalSeats),
            style: TextStyle(
              color: palette.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        color: context.palette.text,
        fontSize: 17,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: palette.cardWarm,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: palette.textSecondary,
          fontSize: 12.5,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _StandOfferSheet extends StatefulWidget {
  const _StandOfferSheet({required this.stand, this.entry});

  final TaxiStand stand;
  final StandQueueEntry? entry;

  @override
  State<_StandOfferSheet> createState() => _StandOfferSheetState();
}

class _StandOfferSheetState extends State<_StandOfferSheet> {
  late final TextEditingController _destination;
  late final TextEditingController _price;
  late final TextEditingController _comment;
  late int _seats;

  @override
  void initState() {
    super.initState();
    _destination =
        TextEditingController(text: widget.entry?.destinationLabel ?? '');
    _price = TextEditingController(
        text: widget.entry?.pricePerSeat == null
            ? ''
            : '${widget.entry!.pricePerSeat}');
    _comment = TextEditingController(text: widget.entry?.comment ?? '');
    _seats = widget.entry?.totalSeats ?? widget.stand.defaultSeats;
  }

  @override
  void dispose() {
    _destination.dispose();
    _price.dispose();
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    // The seat floor is whatever is already taken: lowering the total below
    // it would strand a rider who is already counted in.
    final minSeats = (widget.entry?.takenSeats ?? 0).clamp(1, 20).toInt();
    return Padding(
      // Two different things eat the bottom of this sheet: the keyboard while
      // the driver types a price, and the gesture bar once it closes. The
      // save button has to clear both.
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom +
            MediaQuery.of(context).viewPadding.bottom,
      ),
      child: Container(
        decoration: BoxDecoration(
          color: palette.card,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SheetHandle(),
              const SizedBox(height: 8),
              Text(
                l10n.standOfferTitle,
                style: TextStyle(
                  color: palette.text,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _destination,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  labelText: l10n.standDestinationLabel,
                  hintText: l10n.standDestinationHint,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _price,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(labelText: l10n.standPriceLabel),
              ),
              const SizedBox(height: 16),
              Text(
                l10n.standTotalSeatsLabel,
                style: TextStyle(color: palette.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  for (var value = 1; value <= 8; value++)
                    ChoiceChip(
                      label: Text('$value'),
                      selected: _seats == value,
                      onSelected: value < minSeats
                          ? null
                          : (_) => setState(() => _seats = value),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _comment,
                textInputAction: TextInputAction.done,
                decoration: InputDecoration(
                  labelText: l10n.standCommentLabel,
                  hintText: l10n.standCommentHint,
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () {
                    Navigator.of(context).pop(
                      _StandOffer(
                        destination: _destination.text.trim(),
                        pricePerSeat: int.tryParse(_price.text.trim()),
                        totalSeats: _seats,
                        comment: _comment.text.trim(),
                      ),
                    );
                  },
                  child: Text(
                      widget.entry == null ? l10n.standJoinButton : l10n.save),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SeatSourceSheet extends StatelessWidget {
  const _SeatSourceSheet();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    return Container(
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SheetHandle(),
            const SizedBox(height: 8),
            Text(
              l10n.standSeatSourceTitle,
              style: TextStyle(
                color: palette.text,
                fontSize: 19,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 14),
            ListTile(
              leading: const Icon(Icons.phone_in_talk_rounded),
              title: Text(l10n.standSeatSourcePhone),
              onTap: () => Navigator.of(context).pop('PHONE'),
            ),
            ListTile(
              leading: const Icon(Icons.directions_walk_rounded),
              title: Text(l10n.standSeatSourceWalkIn),
              onTap: () => Navigator.of(context).pop('WALK_IN'),
            ),
          ],
        ),
      ),
    );
  }
}

class _GiveTurnSheet extends StatelessWidget {
  const _GiveTurnSheet({required this.candidates});

  final List<StandQueueEntry> candidates;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    return Container(
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SheetHandle(),
            const SizedBox(height: 8),
            Text(
              l10n.standGiveTurnTitle,
              style: TextStyle(
                color: palette.text,
                fontSize: 19,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            if (candidates.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  l10n.standGiveTurnEmpty,
                  style: TextStyle(color: palette.textSecondary),
                ),
              )
            else
              ...candidates.map(
                (entry) => ListTile(
                  leading: CircleAvatar(
                    backgroundColor: palette.brandSurface,
                    child: Text('${entry.position ?? '—'}'),
                  ),
                  title: Text(entry.carLabel.isEmpty
                      ? entry.driverName
                      : entry.carLabel),
                  subtitle: Text(entry.plate),
                  onTap: () => Navigator.of(context).pop(entry.driverId),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
