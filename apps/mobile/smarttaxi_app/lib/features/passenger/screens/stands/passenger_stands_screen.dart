import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/config/app_config.dart';
import '../../../../core/sockets/socket_service.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../shared/models.dart';

/// The rider's side of a stand. A stand is a place people already know: the
/// cars by the bazaar that leave for Шымкент when they fill up. This shows
/// where those places are, which cars are loading right now, where they are
/// going and for how much — and gives the two ways a seat is actually taken:
/// call the driver, or claim a seat in the app and let them confirm it.
class PassengerStandsScreen extends StatefulWidget {
  const PassengerStandsScreen({
    super.key,
    required this.api,
    required this.socket,
    required this.regionId,
    this.regionCenter,
    this.initialStandId,
  });

  final ApiClient api;
  final SocketService socket;
  final String? regionId;
  final Coordinate? regionCenter;
  final String? initialStandId;

  @override
  State<PassengerStandsScreen> createState() => _PassengerStandsScreenState();
}

class _PassengerStandsScreenState extends State<PassengerStandsScreen> {
  static const _refreshInterval = Duration(seconds: 20);

  final _mapController = MapController();
  List<TaxiStand> _stands = const [];
  StandQueueView? _open;
  StandSeatReservation? _reservation;
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _actionError;
  Timer? _refreshTimer;
  String? _joinedRoom;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
    _refreshTimer =
        Timer.periodic(_refreshInterval, (_) => _load(silent: true));
    widget.socket.onStandQueueUpdate((_) => _load(silent: true));
    widget.socket.onStandPersonalEvent((_, __) => _load(silent: true));
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    final room = _joinedRoom;
    if (room != null) widget.socket.leaveStand(room);
    _mapController.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!mounted) return;
    if (!silent) setState(() => _loading = true);
    try {
      final stands = await widget.api.getStands(regionId: widget.regionId);
      final reservation = await widget.api.getMyStandReservation();
      StandQueueView? open;
      final openId = _open?.stand.id ?? widget.initialStandId;
      if (openId != null && stands.any((stand) => stand.id == openId)) {
        open = await widget.api.getStandQueue(openId);
      }
      if (!mounted) return;
      setState(() {
        _stands = stands;
        _reservation = reservation;
        if (open != null) _open = open;
        _loading = false;
        _error = null;
      });
      _syncRoom(_open?.stand.id);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (!silent) _error = _readError(error);
      });
    }
  }

  void _syncRoom(String? standId) {
    if (_joinedRoom == standId) return;
    final previous = _joinedRoom;
    if (previous != null) widget.socket.leaveStand(previous);
    _joinedRoom = standId;
    if (standId != null) widget.socket.joinStand(standId);
  }

  String _readError(Object error) {
    final text = error.toString();
    final match = RegExp(r'"message"\s*:\s*"([^"]+)"').firstMatch(text);
    if (match != null) return match.group(1)!;
    return AppLocalizations.of(context).standActionFailed;
  }

  Future<void> _openStand(TaxiStand stand) async {
    setState(() => _actionError = null);
    try {
      final view = await widget.api.getStandQueue(stand.id);
      if (!mounted) return;
      setState(() => _open = view);
      _syncRoom(stand.id);
      _mapController.move(stand.toLatLng(), 15);
      await _showStandSheet();
    } catch (error) {
      if (mounted) setState(() => _actionError = _readError(error));
    }
  }

  Future<void> _showStandSheet() {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => StatefulBuilder(
        builder: (context, _) => PassengerStandSheet(
          view: _open,
          reservation: _reservation,
          busy: _busy,
          onCall: _call,
          onReserve: _reserve,
          onCancelReservation: _cancelReservation,
          error: _actionError,
        ),
      ),
    );
  }

  Future<void> _call(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _reserve(StandQueueEntry entry) async {
    final seats = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => _SeatCountSheet(maxSeats: entry.freeSeats),
    );
    if (seats == null) return;
    setState(() {
      _busy = true;
      _actionError = null;
    });
    try {
      final reservation =
          await widget.api.reserveStandSeat(entry.id, seats: seats);
      if (!mounted) return;
      setState(() => _reservation = reservation);
      await _load(silent: true);
    } catch (error) {
      if (mounted) setState(() => _actionError = _readError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    if (mounted && Navigator.of(context).canPop()) Navigator.of(context).pop();
  }

  Future<void> _cancelReservation() async {
    final reservation = _reservation;
    if (reservation == null) return;
    setState(() {
      _busy = true;
      _actionError = null;
    });
    try {
      await widget.api.cancelStandReservation(reservation.id);
      if (!mounted) return;
      setState(() => _reservation = null);
      await _load(silent: true);
    } catch (error) {
      if (mounted) setState(() => _actionError = _readError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    final center = widget.regionCenter ??
        (_stands.isNotEmpty
            ? Coordinate(lat: _stands.first.lat, lng: _stands.first.lng)
            : const Coordinate(lat: 40.8444, lng: 68.509));
    return Scaffold(
      backgroundColor: palette.appBackground,
      appBar: AppBar(
        backgroundColor: palette.appBackground,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text(l10n.standsPassengerTitle),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              flex: 3,
              child: Stack(
                children: [
                  FlutterMap(
                    mapController: _mapController,
                    options: MapOptions(
                      initialCenter: LatLng(center.lat, center.lng),
                      initialZoom: 13,
                      interactionOptions: const InteractionOptions(
                        flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                      ),
                    ),
                    children: [
                      TileLayer(
                        urlTemplate: AppConfig.osmTileUrl,
                        subdomains: const ['a', 'b', 'c', 'd'],
                        retinaMode: true,
                        userAgentPackageName: 'kz.baisapar.app',
                      ),
                      MarkerLayer(
                        markers: [
                          for (final stand in _stands)
                            Marker(
                              point: stand.toLatLng(),
                              width: 44,
                              height: 52,
                              alignment: Alignment.topCenter,
                              child: _StandPin(
                                stand: stand,
                                selected: _open?.stand.id == stand.id,
                                onTap: () => unawaited(_openStand(stand)),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                  if (_loading)
                    const Positioned(
                      top: 12,
                      right: 12,
                      child: SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.4),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              flex: 2,
              child: _StandList(
                stands: _stands,
                reservation: _reservation,
                error: _error,
                busy: _busy,
                onOpen: _openStand,
                onCancelReservation: _cancelReservation,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StandPin extends StatelessWidget {
  const _StandPin({
    required this.stand,
    required this.selected,
    required this.onTap,
  });

  final TaxiStand stand;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    // The number on the pin is the thing a rider is actually looking for:
    // whether there is a car here that can take them right now.
    final free = stand.freeSeats;
    final colour = free > 0 ? palette.brand : palette.textMuted;
    return Semantics(
      button: true,
      label: '${stand.name}, ${stand.driversCount}',
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: colour,
                shape: BoxShape.circle,
                border: Border.all(
                  color: selected ? palette.brandDeep : Colors.white,
                  width: selected ? 3 : 2.5,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.22),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              child: free > 0
                  ? Text(
                      '$free',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    )
                  : const Icon(Icons.local_taxi_rounded,
                      color: Colors.white, size: 20),
            ),
            Container(
              width: 3,
              height: 10,
              color: colour,
            ),
          ],
        ),
      ),
    );
  }
}

class _StandList extends StatelessWidget {
  const _StandList({
    required this.stands,
    required this.reservation,
    required this.error,
    required this.busy,
    required this.onOpen,
    required this.onCancelReservation,
  });

  final List<TaxiStand> stands;
  final StandSeatReservation? reservation;
  final String? error;
  final bool busy;
  final Future<void> Function(TaxiStand stand) onOpen;
  final Future<void> Function() onCancelReservation;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    return Container(
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(top: BorderSide(color: palette.border)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
      child: ListView(
        children: [
          if (error != null) ...[
            _Notice(text: error!, danger: true),
            const SizedBox(height: 12),
          ],
          if (reservation != null) ...[
            PassengerStandReservationBanner(
              reservation: reservation!,
              busy: busy,
              onCancel: onCancelReservation,
            ),
            const SizedBox(height: 14),
          ],
          if (stands.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Column(
                children: [
                  Icon(Icons.local_taxi_outlined,
                      size: 36, color: palette.textMuted),
                  const SizedBox(height: 10),
                  Text(
                    l10n.standNoneTitle,
                    style: TextStyle(
                      color: palette.text,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    l10n.standNoneText,
                    textAlign: TextAlign.center,
                    style:
                        TextStyle(color: palette.textSecondary, fontSize: 13),
                  ),
                ],
              ),
            )
          else
            for (final stand in stands)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: InkWell(
                  onTap: () => onOpen(stand),
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
                                stand.name,
                                style: TextStyle(
                                  color: palette.text,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                '${stand.isIntercity ? l10n.standKindIntercity : l10n.standKindCity} · '
                                '${l10n.standCarsInLine(stand.driversCount)}',
                                style: TextStyle(
                                  color: palette.textSecondary,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (stand.freeSeats > 0)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: palette.successSoft,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              l10n.standSeatsFreeCount(stand.freeSeats),
                              style: TextStyle(
                                color: palette.success,
                                fontWeight: FontWeight.w700,
                                fontSize: 12.5,
                              ),
                            ),
                          ),
                        const SizedBox(width: 6),
                        Icon(Icons.chevron_right, color: palette.textMuted),
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

class PassengerStandReservationBanner extends StatelessWidget {
  const PassengerStandReservationBanner({
    super.key,
    required this.reservation,
    required this.busy,
    required this.onCancel,
  });

  final StandSeatReservation reservation;
  final bool busy;
  final Future<void> Function() onCancel;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    final confirmed = reservation.isConfirmed;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: confirmed ? palette.successSoft : palette.brandSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: confirmed ? palette.success : palette.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.standYourReservationTitle,
            style: TextStyle(
              color: palette.text,
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${reservation.standName} · ${l10n.standRequestSeats(reservation.seats)}',
            style: TextStyle(color: palette.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 2),
          Text(
            confirmed
                ? l10n.standReservationConfirmed
                : l10n.standReservationPending,
            style: TextStyle(
              color: confirmed ? palette.success : palette.brand,
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
          if (reservation.carLabel.isNotEmpty ||
              reservation.plate.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              [reservation.carLabel, reservation.plate]
                  .where((part) => part.isNotEmpty)
                  .join(' · '),
              style: TextStyle(color: palette.text, fontSize: 13.5),
            ),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              if (reservation.driverPhone.isNotEmpty)
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: busy
                        ? null
                        : () => launchUrl(
                            Uri(scheme: 'tel', path: reservation.driverPhone)),
                    icon: const Icon(Icons.phone_rounded, size: 18),
                    label: Text(l10n.callButton),
                  ),
                ),
              if (reservation.driverPhone.isNotEmpty) const SizedBox(width: 10),
              Expanded(
                child: TextButton(
                  onPressed: busy ? null : onCancel,
                  child: Text(l10n.standReservationCancel),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class PassengerStandSheet extends StatelessWidget {
  const PassengerStandSheet({
    super.key,
    required this.view,
    required this.reservation,
    required this.busy,
    required this.onCall,
    required this.onReserve,
    required this.onCancelReservation,
    required this.error,
  });

  final StandQueueView? view;
  final StandSeatReservation? reservation;
  final bool busy;
  final Future<void> Function(String phone) onCall;
  final Future<void> Function(StandQueueEntry entry) onReserve;
  final Future<void> Function() onCancelReservation;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    final current = view;
    if (current == null) return const SizedBox.shrink();
    // Only cars that are actually loading can take a passenger — the rest of
    // the line is waiting its turn, and offering a seat in one would promise
    // something the driver cannot deliver.
    final boarding = current.boarding;
    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.35,
      maxChildSize: 0.92,
      expand: false,
      builder: (context, controller) => Container(
        decoration: BoxDecoration(
          color: palette.card,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
        child: ListView(
          controller: controller,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: palette.border,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Text(
              current.stand.name,
              style: TextStyle(
                color: palette.text,
                fontSize: 21,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              current.stand.isIntercity
                  ? l10n.standKindIntercity
                  : l10n.standKindCity,
              style: TextStyle(color: palette.textSecondary, fontSize: 13.5),
            ),
            if (current.stand.note.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                current.stand.note,
                style: TextStyle(color: palette.textMuted, fontSize: 12.5),
              ),
            ],
            if (error != null) ...[
              const SizedBox(height: 12),
              _Notice(text: error!, danger: true),
            ],
            const SizedBox(height: 18),
            Text(
              l10n.standSheetCars,
              style: TextStyle(
                color: palette.text,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),
            if (boarding.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text(
                  l10n.standSheetEmpty,
                  style:
                      TextStyle(color: palette.textSecondary, fontSize: 13.5),
                ),
              )
            else
              for (final entry in boarding)
                PassengerStandCarCard(
                  entry: entry,
                  busy: busy,
                  alreadyReserved: reservation != null,
                  onCall: onCall,
                  onReserve: onReserve,
                ),
            const SizedBox(height: 10),
            Text(
              l10n.standCallToConfirm,
              style: TextStyle(color: palette.textMuted, fontSize: 12.5),
            ),
          ],
        ),
      ),
    );
  }
}

class PassengerStandCarCard extends StatelessWidget {
  const PassengerStandCarCard({
    super.key,
    required this.entry,
    required this.busy,
    required this.alreadyReserved,
    required this.onCall,
    required this.onReserve,
  });

  final StandQueueEntry entry;
  final bool busy;
  final bool alreadyReserved;
  final Future<void> Function(String phone) onCall;
  final Future<void> Function(StandQueueEntry entry) onReserve;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    final canReserve = !busy && !alreadyReserved && entry.freeSeats > 0;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Destination, price and free seats sit on one line when they fit
          // and stack when they do not: at 1.6 text scale on a 320px phone the
          // seat count alone is wider than half the card.
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 10,
            runSpacing: 8,
            children: [
              ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 140),
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
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      entry.pricePerSeat == null
                          ? l10n.standNoPriceYet
                          : l10n
                              .standPricePerSeatValue('${entry.pricePerSeat}'),
                      style: TextStyle(
                        color: palette.brand,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: entry.freeSeats > 0
                      ? palette.successSoft
                      : palette.cardWarm,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  l10n.standSeatsFreeCount(entry.freeSeats),
                  style: TextStyle(
                    color: entry.freeSeats > 0
                        ? palette.success
                        : palette.textMuted,
                    fontWeight: FontWeight.w700,
                    fontSize: 12.5,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            [entry.driverName, entry.carLabel, entry.plate]
                .where((part) => part.isNotEmpty)
                .join(' · '),
            style: TextStyle(color: palette.textSecondary, fontSize: 13.5),
          ),
          if (entry.comment.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              entry.comment,
              style: TextStyle(color: palette.textMuted, fontSize: 12.5),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: entry.driverPhone.isEmpty || busy
                      ? null
                      : () => onCall(entry.driverPhone),
                  icon: const Icon(Icons.phone_rounded, size: 18),
                  label: Text(l10n.callButton),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  onPressed: canReserve ? () => onReserve(entry) : null,
                  child: Text(l10n.standReserveSeat),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SeatCountSheet extends StatelessWidget {
  const _SeatCountSheet({required this.maxSeats});

  final int maxSeats;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    final options =
        List<int>.generate(maxSeats.clamp(1, 8), (index) => index + 1);
    return Container(
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      // The gesture bar sits over the bottom of a bottom sheet, and these
      // chips are the only thing on this one — without the safe area the
      // rider taps the system navigation instead of a seat.
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: palette.border,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                l10n.standReserveSeatsTitle,
                style: TextStyle(
                  color: palette.text,
                  fontSize: 19,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final value in options)
                    SizedBox(
                      width: 56,
                      height: 52,
                      child: OutlinedButton(
                        onPressed: () => Navigator.of(context).pop(value),
                        style: OutlinedButton.styleFrom(
                          padding: EdgeInsets.zero,
                          textStyle: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        child: Text('$value'),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 4),
            ],
          ),
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text, this.danger = false});

  final String text;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: danger ? palette.dangerSoft : palette.brandSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color:
              danger ? palette.danger.withValues(alpha: 0.3) : palette.border,
        ),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: danger ? palette.danger : palette.textSecondary,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}
