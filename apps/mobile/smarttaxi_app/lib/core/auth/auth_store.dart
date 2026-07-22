import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthStore {
  AuthStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _tokenKey = 'smarttaxi.auth.token';
  static const _modeKey = 'smarttaxi.app.mode';
  static const _phoneKey = 'smarttaxi.user.phone';
  static const _emailKey = 'smarttaxi.user.email';
  static const _roleKey = 'smarttaxi.user.role';
  static const _labelKey = 'smarttaxi.user.label';
  static const _idKey = 'smarttaxi.user.id';
  static const _localeKey = 'smarttaxi.app.locale';
  static const _themeModeKey = 'smarttaxi.app.themeMode';
  static const _voiceEnabledKey = 'smarttaxi.app.voiceEnabled';
  static const _driverApplicationSubmittedKey =
      'smarttaxi.user.driverApplicationSubmitted';

  Future<String?> readToken() => _storage.read(key: _tokenKey);

  // Device-level display preferences, not account data — deliberately not
  // cleared by clear() on logout.
  Future<String?> readLocale() => _storage.read(key: _localeKey);

  Future<void> saveLocale(String languageCode) =>
      _storage.write(key: _localeKey, value: languageCode);

  // Stores one of 'light', 'dark', 'system'.
  Future<String?> readThemeMode() => _storage.read(key: _themeModeKey);

  Future<void> saveThemeMode(String mode) =>
      _storage.write(key: _themeModeKey, value: mode);

  // Driver navigator voice call-outs (camera/sign/speeding) — on by default,
  // a device preference like theme/locale so it isn't cleared on logout.
  Future<bool> readVoiceEnabled() async {
    final value = await _storage.read(key: _voiceEnabledKey);
    return value != '0';
  }

  Future<void> saveVoiceEnabled(bool enabled) =>
      _storage.write(key: _voiceEnabledKey, value: enabled ? '1' : '0');

  Future<void> saveToken(String token) =>
      _storage.write(key: _tokenKey, value: token);

  Future<String?> readMode() => _storage.read(key: _modeKey);

  Future<void> saveMode(String mode) =>
      _storage.write(key: _modeKey, value: mode);

  Future<void> clearMode() => _storage.delete(key: _modeKey);

  Future<void> saveUser({
    required String label,
    required String phone,
    required String email,
    required String role,
    String id = '',
  }) async {
    await _storage.write(key: _labelKey, value: label);
    await _storage.write(key: _phoneKey, value: phone);
    await _storage.write(key: _emailKey, value: email);
    await _storage.write(key: _roleKey, value: role);
    await _storage.write(key: _idKey, value: id);
  }

  Future<Map<String, String>> readUser() async {
    return {
      'label': await _storage.read(key: _labelKey) ?? '',
      'phone': await _storage.read(key: _phoneKey) ?? '',
      'email': await _storage.read(key: _emailKey) ?? '',
      'role': await _storage.read(key: _roleKey) ?? '',
      'id': await _storage.read(key: _idKey) ?? '',
    };
  }

  // Lets the driver-application screen restore the "заявка отправлена"
  // success state after the app is closed/reopened, instead of silently
  // showing the empty form again with no record the user already applied.
  Future<bool> readDriverApplicationSubmitted() async {
    return (await _storage.read(key: _driverApplicationSubmittedKey)) == '1';
  }

  Future<void> saveDriverApplicationSubmitted() =>
      _storage.write(key: _driverApplicationSubmittedKey, value: '1');

  Future<void> clear() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _modeKey);
    await _storage.delete(key: _phoneKey);
    await _storage.delete(key: _emailKey);
    await _storage.delete(key: _roleKey);
    await _storage.delete(key: _labelKey);
    await _storage.delete(key: _idKey);
    await _storage.delete(key: _driverApplicationSubmittedKey);
  }
}
