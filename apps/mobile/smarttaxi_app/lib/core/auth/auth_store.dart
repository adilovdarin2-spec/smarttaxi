import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthStore {
  AuthStore({FlutterSecureStorage? storage}) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _tokenKey = 'smarttaxi.auth.token';
  static const _modeKey = 'smarttaxi.app.mode';
  static const _phoneKey = 'smarttaxi.user.phone';
  static const _emailKey = 'smarttaxi.user.email';
  static const _roleKey = 'smarttaxi.user.role';
  static const _labelKey = 'smarttaxi.user.label';

  Future<String?> readToken() => _storage.read(key: _tokenKey);

  Future<void> saveToken(String token) => _storage.write(key: _tokenKey, value: token);

  Future<String?> readMode() => _storage.read(key: _modeKey);

  Future<void> saveMode(String mode) => _storage.write(key: _modeKey, value: mode);

  Future<void> clearMode() => _storage.delete(key: _modeKey);

  Future<void> saveUser({
    required String label,
    required String phone,
    required String email,
    required String role,
  }) async {
    await _storage.write(key: _labelKey, value: label);
    await _storage.write(key: _phoneKey, value: phone);
    await _storage.write(key: _emailKey, value: email);
    await _storage.write(key: _roleKey, value: role);
  }

  Future<Map<String, String>> readUser() async {
    return {
      'label': await _storage.read(key: _labelKey) ?? '',
      'phone': await _storage.read(key: _phoneKey) ?? '',
      'email': await _storage.read(key: _emailKey) ?? '',
      'role': await _storage.read(key: _roleKey) ?? '',
    };
  }

  Future<void> clear() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _modeKey);
    await _storage.delete(key: _phoneKey);
    await _storage.delete(key: _emailKey);
    await _storage.delete(key: _roleKey);
    await _storage.delete(key: _labelKey);
  }
}
