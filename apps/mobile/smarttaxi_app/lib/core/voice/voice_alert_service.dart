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
      // A hair above neutral -- on Android's on-device engine this reads as
      // warmer/friendlier without the "chipmunk" effect a bigger bump gives.
      await _tts.setPitch(1.05);
      await _tts.awaitSpeakCompletion(true);
      await _selectBestAvailableVoice();
      _ready = true;
    } catch (_) {
      _ready = false;
    }
  }

  // On-device TTS engines (Android's Google Speech Services, in particular)
  // often ship several ru-RU voices side by side -- older compact/robotic
  // ones alongside newer "network"/neural ones that sound noticeably more
  // natural. flutter_tts defaults to whatever the engine picks first, which
  // isn't necessarily the best-sounding one. Best-effort: if the engine
  // exposes a voice list, prefer a network/neural voice over a local one,
  // and prefer a female voice (the two engines seen on this project's test
  // devices ship it as smoother-sounding for this rate/pitch than the male
  // counterpart) -- never throws, since a missing/odd voice list must not
  // block the rest of initialization.
  Future<void> _selectBestAvailableVoice() async {
    try {
      final dynamic raw = await _tts.getVoices;
      if (raw is! List) return;
      final ruVoices = raw
          .whereType<Map>()
          .map((v) => v.map((key, value) => MapEntry(key.toString(), value.toString())))
          .where((v) => (v['locale'] ?? '').toLowerCase().startsWith('ru'))
          .toList();
      if (ruVoices.isEmpty) return;
      int score(Map<String, String> v) {
        final name = (v['name'] ?? '').toLowerCase();
        var s = 0;
        if (name.contains('network') || name.contains('neural')) s += 2;
        if (name.contains('female') || RegExp(r'ruf\b').hasMatch(name)) s += 1;
        return s;
      }
      ruVoices.sort((a, b) => score(b).compareTo(score(a)));
      await _tts.setVoice({'name': ruVoices.first['name']!, 'locale': ruVoices.first['locale']!});
    } catch (_) {
      // Keep whatever voice the engine already defaulted to.
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
