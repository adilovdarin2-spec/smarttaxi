import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/auth/auth_store.dart';

/// Counts what actually reaches the Keystore, which is the whole point.
class _CountingStorage extends Fake implements FlutterSecureStorage {
  _CountingStorage({this.delay = Duration.zero});

  final Duration delay;
  final Map<String, String> values = {};
  int reads = 0;

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    reads++;
    if (delay > Duration.zero) await Future<void>.delayed(delay);
    return values[key];
  }

  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (value == null) {
      values.remove(key);
    } else {
      values[key] = value;
    }
  }

  @override
  Future<void> delete({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    values.remove(key);
  }
}

void main() {
  test('the token is read from the keystore once, not once per request', () async {
    final storage = _CountingStorage()..values['smarttaxi.auth.token'] = 'first';
    final store = AuthStore(storage: storage);

    expect(await store.readToken(), 'first');
    expect(await store.readToken(), 'first');
    expect(await store.readToken(), 'first');
    expect(storage.reads, 1,
        reason: 'every authenticated request calls this; on Android each '
            'uncached call is a Keystore round trip');
  });

  test('a burst of requests shares one read instead of queueing', () async {
    final storage = _CountingStorage(delay: const Duration(milliseconds: 20))
      ..values['smarttaxi.auth.token'] = 'first';
    final store = AuthStore(storage: storage);

    final answers = await Future.wait([
      store.readToken(),
      store.readToken(),
      store.readToken(),
    ]);
    expect(answers, ['first', 'first', 'first']);
    expect(storage.reads, 1);
  });

  test('signing in and out is visible immediately, with no stale token', () async {
    final storage = _CountingStorage()..values['smarttaxi.auth.token'] = 'first';
    final store = AuthStore(storage: storage);
    expect(await store.readToken(), 'first');

    await store.saveToken('second');
    expect(await store.readToken(), 'second',
        reason: 'a cache that outlives a login sends the old session\'s token');

    await store.clear();
    expect(await store.readToken(), isNull,
        reason: 'a cache that outlives a logout keeps the app signed in');
    expect(storage.values.containsKey('smarttaxi.auth.token'), isFalse);
  });

  test('a login that lands mid-read wins over the value being read', () async {
    final storage = _CountingStorage(delay: const Duration(milliseconds: 30))
      ..values['smarttaxi.auth.token'] = 'stale';
    final store = AuthStore(storage: storage);

    final inFlight = store.readToken();
    await store.saveToken('fresh');
    expect(await inFlight, 'fresh',
        reason: 'the read started first, but the login knows better');
    expect(await store.readToken(), 'fresh');
  });
}
