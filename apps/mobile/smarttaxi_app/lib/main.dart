import 'package:flutter/material.dart';

import 'core/api/api_client.dart';
import 'core/auth/auth_store.dart';
import 'core/sockets/socket_service.dart';
import 'core/theme/app_theme.dart';
import 'core/widgets/brand_logo.dart';
import 'features/driver/driver_shell.dart';
import 'features/passenger/passenger_shell.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final authStore = AuthStore();
  final api = ApiClient(authStore);
  final sockets = SocketService(authStore);
  runApp(SmartTaxiApp(api: api, authStore: authStore, sockets: sockets));
}

class SmartTaxiApp extends StatefulWidget {
  const SmartTaxiApp({
    super.key,
    required this.api,
    required this.authStore,
    required this.sockets,
  });

  final ApiClient api;
  final AuthStore authStore;
  final SocketService sockets;

  @override
  State<SmartTaxiApp> createState() => _SmartTaxiAppState();
}

class _SmartTaxiAppState extends State<SmartTaxiApp> {
  AppSession _session = AppSession.splash;
  String _accountLabel = '';
  String _accountPhone = '';

  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    await Future<void>.delayed(const Duration(milliseconds: 450));
    final token = await widget.authStore.readToken();
    if (!mounted) return;
    if (token == null || token.isEmpty) {
      setState(() => _session = AppSession.auth);
      return;
    }
    try {
      final me = await widget.api.me();
      await _saveUserFromPayload(me);
      final savedMode = await widget.authStore.readMode();
      if (savedMode == 'driver' && await _canOpenDriver()) {
        setState(() => _session = AppSession.driver);
      } else {
        await widget.authStore.saveMode('passenger');
        setState(() => _session = AppSession.passenger);
      }
    } catch (_) {
      await widget.authStore.clear();
      if (mounted) setState(() => _session = AppSession.auth);
    }
  }

  Future<void> _handleLogin(Map<String, dynamic> authPayload) async {
    await _saveUserFromPayload(authPayload);
    await widget.authStore.saveMode('passenger');
    setState(() => _session = AppSession.passenger);
  }

  Future<void> _saveUserFromPayload(Map<String, dynamic> payload) async {
    final user = payload['user'];
    _accountLabel = _userLabel(user);
    _accountPhone = _userPhone(user);
    await widget.authStore.saveUser(
      label: _accountLabel,
      phone: _accountPhone,
      email: _userEmail(user),
      role: _userRole(user),
    );
  }

  Future<bool> _canOpenDriver() async {
    try {
      final regions = await widget.api.getDriverRegions();
      return regions
          .any((region) => region.status == 'APPROVED' && region.isActive);
    } catch (_) {
      return false;
    }
  }

  Future<bool> _openDriverMode() async {
    final allowed = await _canOpenDriver();
    if (!allowed) return false;
    await widget.authStore.saveMode('driver');
    if (mounted) setState(() => _session = AppSession.driver);
    return true;
  }

  Future<void> _openPassengerMode() async {
    await widget.authStore.saveMode('passenger');
    if (mounted) setState(() => _session = AppSession.passenger);
  }

  Future<void> _logout() async {
    widget.sockets.dispose();
    await widget.authStore.clear();
    if (mounted) {
      setState(() {
        _accountLabel = '';
        _accountPhone = '';
        _session = AppSession.auth;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SmartTaxi',
      debugShowCheckedModeBanner: false,
      theme: buildSmartTaxiTheme(),
      home: switch (_session) {
        AppSession.splash => const _SplashScreen(),
        AppSession.auth =>
          _AuthScreen(api: widget.api, onLoggedIn: _handleLogin),
        AppSession.passenger => PassengerShell(
            api: widget.api,
            authStore: widget.authStore,
            sockets: widget.sockets,
            accountLabel: _accountLabel,
            accountPhone: _accountPhone,
            onLogout: _logout,
            onOpenDriverMode: _openDriverMode,
          ),
        AppSession.driver => DriverShell(
            api: widget.api,
            authStore: widget.authStore,
            sockets: widget.sockets,
            accountLabel: _accountLabel,
            onLogout: _logout,
            onOpenPassengerMode: _openPassengerMode,
          ),
      },
    );
  }
}

enum AppSession { splash, auth, passenger, driver }

class _PremiumBackdrop extends StatelessWidget {
  const _PremiumBackdrop();

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        const Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(color: SmartTaxiColors.appBackground),
          ),
        ),
        Positioned(
          top: -120,
          right: -90,
          child: _SoftGlow(size: 260, opacity: 0.22),
        ),
        Positioned(
          bottom: 70,
          left: -120,
          child: _SoftGlow(size: 300, opacity: 0.16),
        ),
      ],
    );
  }
}

class _SoftGlow extends StatelessWidget {
  const _SoftGlow({required this.size, required this.opacity});

  final double size;
  final double opacity;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: SmartTaxiColors.goldSoft.withValues(alpha: opacity),
      ),
    );
  }
}

class _GoldLoader extends StatelessWidget {
  const _GoldLoader();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 42,
      height: 42,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: SmartTaxiColors.border),
        shape: BoxShape.circle,
        boxShadow: const [
          BoxShadow(
              color: Color(0x16785a14), blurRadius: 24, offset: Offset(0, 10))
        ],
      ),
      child: const CircularProgressIndicator(
          strokeWidth: 3, color: SmartTaxiColors.gold),
    );
  }
}

class _ButtonLoader extends StatelessWidget {
  const _ButtonLoader({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(
              strokeWidth: 2.2, color: SmartTaxiColors.text),
        ),
        const SizedBox(width: 10),
        Text(text),
      ],
    );
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SmartTaxiColors.appBackground,
      body: Stack(
        children: [
          const _PremiumBackdrop(),
          Center(
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0.92, end: 1),
              duration: const Duration(milliseconds: 520),
              curve: Curves.easeOutCubic,
              builder: (context, value, child) => Transform.scale(
                scale: value,
                child: Opacity(opacity: value.clamp(0.0, 1.0), child: child),
              ),
              child: const Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  BrandLogo(large: true),
                  SizedBox(height: 24),
                  Text('SmartTaxi',
                      style: TextStyle(
                          fontSize: 36,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.6)),
                  SizedBox(height: 8),
                  Text('Региональное такси',
                      style: TextStyle(
                          color: SmartTaxiColors.textSecondary,
                          fontSize: 15,
                          fontWeight: FontWeight.w700)),
                  SizedBox(height: 28),
                  _GoldLoader(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AuthScreen extends StatefulWidget {
  const _AuthScreen({required this.api, required this.onLoggedIn});

  final ApiClient api;
  final Future<void> Function(Map<String, dynamic>) onLoggedIn;

  @override
  State<_AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<_AuthScreen> {
  bool _registerMode = false;
  bool _loading = false;
  bool _showPassword = false;
  bool _showPasswordRepeat = false;
  String _name = '';
  String _phone = '';
  String _password = '';
  String _passwordRepeat = '';
  String? _error;

  Future<void> _submit() async {
    final phone = _normalizePhone(_phone);
    if (_phoneDigits(phone).length < 10) {
      setState(() => _error = 'Введите корректный номер телефона');
      return;
    }
    if (_password.length < 6) {
      setState(() => _error = 'Пароль должен быть не короче 6 символов');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final payload = _registerMode
          ? await _register()
          : await widget.api.login(phone: phone, password: _password);
      await widget.onLoggedIn(payload);
    } catch (error) {
      setState(() => _error = _authError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<Map<String, dynamic>> _register() async {
    if (_name.trim().length < 2) throw const FormatException('NAME_REQUIRED');
    final phone = _normalizePhone(_phone);
    if (_phoneDigits(phone).length < 10) {
      throw const FormatException('PHONE_REQUIRED');
    }
    if (_password.length < 6) throw const FormatException('PASSWORD_TOO_SHORT');
    if (_password != _passwordRepeat) {
      throw const FormatException('PASSWORD_MISMATCH');
    }
    return widget.api.register(
      name: _name.trim(),
      phone: phone,
      password: _password,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SmartTaxiColors.appBackground,
      body: Stack(
        children: [
          const _PremiumBackdrop(),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(22, 28, 22, 22),
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 430),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const BrandLogo(large: true),
                      const SizedBox(height: 20),
                      const Text('SmartTaxi',
                          style: TextStyle(
                              fontSize: 34,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.5)),
                      const SizedBox(height: 8),
                      const Text('Региональное такси рядом с вами',
                          style: TextStyle(
                              color: SmartTaxiColors.textSecondary,
                              fontSize: 15,
                              fontWeight: FontWeight.w700)),
                      const SizedBox(height: 24),
                      _PremiumCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _AuthModeSwitch(
                              registerMode: _registerMode,
                              onChanged: (value) => setState(() {
                                _registerMode = value;
                                _error = null;
                              }),
                            ),
                            const SizedBox(height: 18),
                            AnimatedSwitcher(
                              duration: const Duration(milliseconds: 220),
                              switchInCurve: Curves.easeOutCubic,
                              switchOutCurve: Curves.easeInCubic,
                              child: _registerMode
                                  ? Column(
                                      key: const ValueKey('register'),
                                      children: [
                                        TextField(
                                          decoration: const InputDecoration(
                                              labelText: 'Имя'),
                                          textInputAction: TextInputAction.next,
                                          onChanged: (value) =>
                                              _name = value.trim(),
                                        ),
                                        const SizedBox(height: 12),
                                        TextField(
                                          decoration: const InputDecoration(
                                            labelText: 'Номер телефона',
                                            hintText: '+7 ___ ___ __ __',
                                          ),
                                          keyboardType: TextInputType.phone,
                                          textInputAction: TextInputAction.next,
                                          onChanged: (value) => _phone = value,
                                        ),
                                      ],
                                    )
                                  : TextField(
                                      key: const ValueKey('login'),
                                      decoration: const InputDecoration(
                                        labelText: 'Номер телефона',
                                        hintText: '+7 ___ ___ __ __',
                                      ),
                                      keyboardType: TextInputType.phone,
                                      textInputAction: TextInputAction.next,
                                      onChanged: (value) => _phone = value,
                                    ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              decoration: InputDecoration(
                                labelText: 'Пароль',
                                suffixIcon: IconButton(
                                  tooltip: _showPassword
                                      ? 'Скрыть пароль'
                                      : 'Показать пароль',
                                  icon: Icon(_showPassword
                                      ? Icons.visibility_off_outlined
                                      : Icons.visibility_outlined),
                                  onPressed: () => setState(
                                      () => _showPassword = !_showPassword),
                                ),
                              ),
                              obscureText: !_showPassword,
                              textInputAction: _registerMode
                                  ? TextInputAction.next
                                  : TextInputAction.done,
                              onChanged: (value) => _password = value,
                            ),
                            if (_registerMode) ...[
                              const SizedBox(height: 12),
                              TextField(
                                decoration: InputDecoration(
                                  labelText: 'Повторите пароль',
                                  suffixIcon: IconButton(
                                    tooltip: _showPasswordRepeat
                                        ? 'Скрыть пароль'
                                        : 'Показать пароль',
                                    icon: Icon(_showPasswordRepeat
                                        ? Icons.visibility_off_outlined
                                        : Icons.visibility_outlined),
                                    onPressed: () => setState(() =>
                                        _showPasswordRepeat =
                                            !_showPasswordRepeat),
                                  ),
                                ),
                                obscureText: !_showPasswordRepeat,
                                textInputAction: TextInputAction.done,
                                onChanged: (value) => _passwordRepeat = value,
                              ),
                            ],
                            AnimatedSwitcher(
                              duration: const Duration(milliseconds: 180),
                              child: _error == null
                                  ? const SizedBox(height: 12)
                                  : Padding(
                                      padding: const EdgeInsets.only(top: 12),
                                      child: _InlineMessage(
                                          text: _error!, danger: true),
                                    ),
                            ),
                            const SizedBox(height: 6),
                            ElevatedButton(
                              onPressed: _loading ? null : _submit,
                              child: _loading
                                  ? const _ButtonLoader(text: 'Проверяем...')
                                  : Text(_registerMode
                                      ? 'Создать аккаунт'
                                      : 'Войти'),
                            ),
                            const SizedBox(height: 14),
                            const Text(
                              'Продолжая, вы соглашаетесь с правилами сервиса',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                  color: SmartTaxiColors.textSecondary,
                                  fontSize: 13,
                                  height: 1.35),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Водителем можно стать после регистрации в профиле',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                  color: SmartTaxiColors.textSecondary,
                                  fontSize: 13,
                                  height: 1.35),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AuthModeSwitch extends StatelessWidget {
  const _AuthModeSwitch({required this.registerMode, required this.onChanged});

  final bool registerMode;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
          color: SmartTaxiColors.goldSurface,
          borderRadius: BorderRadius.circular(18)),
      child: Row(
        children: [
          Expanded(
              child: _ModeButton(
                  label: 'Вход',
                  active: !registerMode,
                  onTap: () => onChanged(false))),
          Expanded(
              child: _ModeButton(
                  label: 'Регистрация',
                  active: registerMode,
                  onTap: () => onChanged(true))),
        ],
      ),
    );
  }
}

class _ModeButton extends StatelessWidget {
  const _ModeButton(
      {required this.label, required this.active, required this.onTap});

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(14),
          boxShadow: active
              ? const [
                  BoxShadow(
                      color: Color(0x16785a14),
                      blurRadius: 16,
                      offset: Offset(0, 8))
                ]
              : null,
        ),
        child: Text(label,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
      ),
    );
  }
}

class _PremiumCard extends StatelessWidget {
  const _PremiumCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(28),
        boxShadow: const [
          BoxShadow(
              color: Color(0x18785a14), blurRadius: 38, offset: Offset(0, 18))
        ],
      ),
      child: child,
    );
  }
}

class _InlineMessage extends StatelessWidget {
  const _InlineMessage({required this.text, this.danger = false});

  final String text;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: danger ? const Color(0xfffff1f1) : SmartTaxiColors.goldSurface,
        border: Border.all(
            color: danger ? const Color(0xfffecaca) : SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(text,
          style: TextStyle(
              color: danger
                  ? SmartTaxiColors.danger
                  : SmartTaxiColors.textSecondary,
              fontWeight: FontWeight.w700)),
    );
  }
}

String _userLabel(dynamic user) {
  if (user is! Map) return 'Аккаунт SmartTaxi';
  return (user['phone'] ?? user['email'] ?? user['name'] ?? 'Аккаунт SmartTaxi')
      .toString();
}

String _userPhone(dynamic user) {
  if (user is! Map) return '';
  return (user['phone'] ?? '').toString();
}

String _userEmail(dynamic user) {
  if (user is! Map) return '';
  return (user['email'] ?? '').toString();
}

String _userRole(dynamic user) {
  if (user is! Map) return '';
  return (user['role'] ?? '').toString();
}

String _phoneDigits(String value) => value.replaceAll(RegExp(r'\D'), '');

String _normalizePhone(String value) {
  final raw = value.trim();
  final digits = _phoneDigits(raw);
  if (digits.isEmpty) return raw;
  if (digits.length == 10) return '+7$digits';
  if (digits.length == 11 && digits.startsWith('8')) {
    return '+7${digits.substring(1)}';
  }
  if (digits.startsWith('7')) return '+$digits';
  if (raw.startsWith('+')) return '+$digits';
  return raw;
}

String _authError(Object error) {
  final message = error.toString();
  if (message.contains('SocketException') ||
      message.contains('Connection') ||
      message.contains('connection') ||
      message.contains('timed out')) {
    return 'Сервер недоступен. Проверьте подключение';
  }
  if (message.contains('INVALID_CREDENTIALS')) {
    return 'Неверный телефон или пароль';
  }
  if (message.contains('PHONE_EXISTS')) return 'Этот номер уже зарегистрирован';
  if (message.contains('USER_ALREADY_EXISTS')) {
    return 'Этот номер уже зарегистрирован';
  }
  if (message.contains('DRIVER_BLOCKED')) {
    return 'Аккаунт водителя заблокирован';
  }
  if (message.contains('NAME_REQUIRED')) return 'Введите имя';
  if (message.contains('PHONE_REQUIRED')) return 'Введите телефон';
  if (message.contains('PASSWORD_TOO_SHORT')) {
    return 'Пароль должен быть не короче 6 символов';
  }
  if (message.contains('PASSWORD_MISMATCH')) return 'Пароли не совпадают';
  return 'Проверьте заполненные данные';
}
