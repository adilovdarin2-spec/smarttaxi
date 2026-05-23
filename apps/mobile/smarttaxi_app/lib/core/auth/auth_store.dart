import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthStore {
  AuthStore({FlutterSecureStorage? storage}) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _tokenKey = 'smarttaxi.auth.token';

  Future<String?> readToken() => _storage.read(key: _tokenKey);

  Future<void> saveToken(String token) => _storage.write(key: _tokenKey, value: token);

  Future<void> clear() => _storage.delete(key: _tokenKey);
}
