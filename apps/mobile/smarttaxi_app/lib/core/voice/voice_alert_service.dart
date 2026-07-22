import 'package:flutter_tts/flutter_tts.dart';

/// Quiet, on-device text-to-speech for driver navigator alerts (camera
/// distance, passed road signs, speeding) — no cloud API, no per-call cost,
/// works offline like the rest of the OSM-based navigator layer.
///
/// Every step is wrapped in try/catch: a missing TTS engine, unsupported
/// language pack, or platform quirk must silently disable speech, never
/// crash the app or block the rest of the navigator (same defensive pattern
/// as the push-notification service).
class VoiceAlertService {
  final FlutterTts _tts = FlutterTts();
  bool _ready = false;
  bool enabled = true;
  final Map<String, DateTime> _lastSpokenAt = {};
  // Serializes concurrent announce() calls so a camera and a sign firing in
  // the same GPS tick get spoken one after another instead of the later
  // call's speak() cutting the earlier one off mid-word.
  Future<void> _queue = Future.value();

  Future<void> initialize() async {
    try {
      await _tts.setLanguage('ru-RU');
      await _tts.setVolume(0.55); // quiet by request — a hint, not a shout
      await _tts.setSpeechRate(0.45);
      await _tts.setPitch(1.0);
      await _tts.awaitSpeakCompletion(true);
      _ready = true;
    } catch (_) {
      _ready = false;
    }
  }

  /// Speaks [text] unless voice is disabled, the engine failed to init, or
  /// the same [dedupeKey] was announced within [cooldown] — keeps a string
  /// of cameras/signs from turning into a wall of repeated speech. Queued
  /// rather than interrupting, so overlapping calls play in order.
  Future<void> announce(
    String text, {
    String? dedupeKey,
    Duration cooldown = const Duration(seconds: 8),
  }) {
    if (!enabled || !_ready) return Future.value();
    final key = dedupeKey ?? text;
    final last = _lastSpokenAt[key];
    final now = DateTime.now();
    if (last != null && now.difference(last) < cooldown) return Future.value();
    _lastSpokenAt[key] = now;
    _queue = _queue.then((_) async {
      if (!enabled) return;
      try {
        await _tts.speak(text);
      } catch (_) {
        // Best-effort — a failed announcement must not disrupt driving.
      }
    });
    return _queue;
  }

  void setEnabled(bool value) {
    enabled = value;
    if (!value) {
      _tts.stop().catchError((_) {});
    }
  }

  void dispose() {
    _tts.stop().catchError((_) {});
  }
}
