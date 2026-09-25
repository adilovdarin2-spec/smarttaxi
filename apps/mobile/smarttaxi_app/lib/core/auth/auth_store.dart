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
  static const _mapStyleKey = 'smarttaxi.app.mapStyle';
  static const _confirmedRegionIdKey =
      'smarttaxi.app.confirmedPassengerRegionId';
  static const _driverApplicationSubmittedKey =
      'smarttaxi.user.driverApplicationSubmitted';

  // The session token, kept in memory after the first read.
  //
  // Every authenticated request calls this (ApiClient._attachToken), and on
  // Android each call went all the way to the Keystore: measured at 113ms
  // and 233ms for two consecutive reads on an emulator, and the phones our
  // drivers use are slower than an emulator. That is a fixed tax on every
  // screen in both apps, and it is paid for a value the app already has in
  // memory the moment it builds the request.
  //
  // Only saveToken() and clear() ever change it, and both keep this in step,
  // so a cached read cannot outlive the token it describes. A token that the
  // server rejects is handled where it already was — the transport guard's
  // SESSION_SUPERSEDED/TOKEN_EXPIRED path calls clear().
  String? _cachedToken;
  bool _tokenIsCached = false;
  Future<String?>? _tokenRead;

  Future<String?> readToken() async {
    if (_tokenIsCached) return _cachedToken;
    // A screen opening fires several requests at once; without this they each
    // start their own keystore read and queue behind one another.
    final pending = _tokenRead ??= _storage.read(key: _tokenKey);
    try {
      final token = await pending;
      // A login or a logout that landed while this read was in flight owns
      // the answer — it wrote the newer value.
      if (!_tokenIsCached) {
        _cachedToken = token;
        _tokenIsCached = true;
      }
      return _cachedToken;
    } finally {
      if (identical(_tokenRead, pending)) _tokenRead = null;
    }
  }

  // Device-level display preferences, not account data — deliberately not
  // cleared by clear() on logout.
  Future<String?> readLocale() => _storage.read(key: _localeKey);

  Future<void> saveLocale(String languageCode) =>
      _storage.write(key: _localeKey, value: languageCode);

  // Stores one of 'light', 'dark', 'system'.
  Future<String?> readThemeMode() => _storage.read(key: _themeModeKey);

  Future<void> saveThemeMode(String mode) =>
      _storage.write(key: _themeModeKey, value: mode);

  // How the map is drawn: volume, plan or imagery. A device preference like
  // theme and locale — it describes this phone and this screen, not the
  // account, so it survives logout and a switch between rider and driver.
  Future<String?> readMapStyle() => _storage.read(key: _mapStyleKey);

  Future<void> saveMapStyle(String value) =>
      _storage.write(key: _mapStyleKey, value: value);

  // Driver navigator voice call-outs (camera/sign/speeding) — on by default,
  // a device preference like theme/locale so it isn't cleared on logout.
  Future<bool> readVoiceEnabled() async {
    final value = await _storage.read(key: _voiceEnabledKey);
    return value != '0';
  }

  Future<void> saveVoiceEnabled(bool enabled) =>
      _storage.write(key: _voiceEnabledKey, value: enabled ? '1' : '0');

  // Device-level passenger preference. A matching GPS region should not ask
  // the same confirmation on every cold launch, while a different detected
  // region must still be confirmed. Deliberately survives logout like locale,
  // theme and navigator voice preferences.
  Future<String?> readConfirmedPassengerRegionId() =>
      _storage.read(key: _confirmedRegionIdKey);

  Future<void> saveConfirmedPassengerRegionId(String regionId) =>
      _storage.write(key: _confirmedRegionIdKey, value: regionId);

  Future<void> saveToken(String token) {
    _cachedToken = token;
    _tokenIsCached = true;
    _tokenRead = null;
    return _storage.write(key: _tokenKey, value: token);
  }

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
    _cachedToken = null;
    _tokenIsCached = true;
    _tokenRead = null;
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
