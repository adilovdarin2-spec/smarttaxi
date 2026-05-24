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
  ErrorWidget.builder = (details) => const _RuntimeFallbackScreen();
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
      if (!mounted) return;
      if (savedMode == 'driver' && await _canOpenDriver()) {
        if (!mounted) return;
        setState(() => _session = AppSession.driver);
      } else {
        await widget.authStore.saveMode('passenger');
        if (!mounted) return;
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
    if (!mounted) return;
    setState(() => _session = AppSession.passenger);
  }

  Future<void> _saveUserFromPayload(Map<String, dynamic> payload) async {
    final user = payload['user'];
    _accountLabel = _userLabel(user);
    _accountPhone = _userPhone(user);
    await widget.authStore.saveUser(
      label: _accountLabel,
      phone: _accountPhone,
      email: _userMail(user),
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

class _RuntimeFallbackScreen extends StatelessWidget {
  const _RuntimeFallbackScreen();

  @override
  Widget build(BuildContext context) {
    return Material(
      color: SmartTaxiColors.appBackground,
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: _PremiumCard(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const _RuntimeFallbackLogo(),
                  const SizedBox(height: 18),
                  const Text(
                    'SmartTaxi',
                    style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Не удалось открыть экран. Перезапустите приложение или попробуйте войти снова.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: SmartTaxiColors.textSecondary,
                      height: 1.4,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      child: const Text('Вернуться на главную'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RuntimeFallbackLogo extends StatelessWidget {
  const _RuntimeFallbackLogo();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 88,
      height: 88,
      decoration: BoxDecoration(
        color: SmartTaxiColors.gold,
        shape: BoxShape.circle,
        border: Border.all(color: SmartTaxiColors.goldDeep, width: 6),
      ),
      child: const Icon(
        Icons.near_me_rounded,
        color: SmartTaxiColors.text,
        size: 46,
      ),
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
        Text(text, maxLines: 1, overflow: TextOverflow.ellipsis),
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
  final _loginController = TextEditingController();
  final _nameController = TextEditingController();
  final _surnameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _passwordRepeatController = TextEditingController();

  bool _registerMode = false;
  bool _loading = false;
  bool _showPassword = false;
  bool _showPasswordRepeat = false;
  String? _error;

  @override
  void dispose() {
    _loginController.dispose();
    _nameController.dispose();
    _surnameController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _passwordRepeatController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final validationError = _validate();
    if (validationError != null) {
      setState(() => _error = validationError);
      return;
    }
    final phone = _normalizePhone(_phoneController.text);
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final payload = _registerMode
          ? await _register()
          : await widget.api.login(
              phone: phone,
              password: _passwordController.text,
            );
      await widget.onLoggedIn(payload);
    } catch (error) {
      setState(() => _error = _authError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<Map<String, dynamic>> _register() async {
    final phone = _normalizePhone(_phoneController.text);
    final login = _loginController.text.trim();
    final fullName =
        '${_nameController.text.trim()} ${_surnameController.text.trim()}'
            .trim();
    final payload = await widget.api.register(
      name: fullName,
      phone: phone,
      password: _passwordController.text,
    );
    final user = payload['user'];
    if (user is Map) {
      payload['user'] = {
        ...Map<String, dynamic>.from(user),
        'login': login,
        'name': fullName,
      };
    }
    return payload;
  }

  String? _validate() {
    final phone = _phoneController.text;
    final password = _passwordController.text;
    final phoneDigits = _phoneDigits(phone);
    if (_registerMode && _loginController.text.trim().length < 3) {
      return 'Введите логин';
    }
    if (_registerMode && _nameController.text.trim().isEmpty) {
      return 'Введите имя';
    }
    if (_registerMode && _surnameController.text.trim().isEmpty) {
      return 'Введите фамилию';
    }
    if (phone.trim().isEmpty) return 'Введите номер телефона';
    if (phoneDigits.length < 10) return 'Введите корректный номер';
    if (password.isEmpty) return 'Введите пароль';
    if (password.length < 6) {
      return 'Пароль должен быть не короче 6 символов';
    }
    if (_registerMode && password != _passwordRepeatController.text) {
      return 'Пароли не совпадают';
    }
    return null;
  }

  void _switchMode(bool registerMode) {
    setState(() {
      _registerMode = registerMode;
      _error = null;
      _loginController.clear();
      _surnameController.clear();
      _passwordController.clear();
      _passwordRepeatController.clear();
      _showPassword = false;
      _showPasswordRepeat = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final title = _registerMode ? 'Регистрация' : 'Вход';
    final subtitle = _registerMode
        ? 'Создайте аккаунт для заказа поездок'
        : 'Введите номер телефона, чтобы продолжить';
    final size = MediaQuery.sizeOf(context);
    final compact = size.height < 720;
    final denseAuth = compact || _registerMode;
    final fieldGap = denseAuth ? 10.0 : 12.0;
    return Scaffold(
      backgroundColor: SmartTaxiColors.appBackground,
      body: Stack(
        children: [
          const _PremiumBackdrop(),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(
                  denseAuth ? 18 : 22,
                  denseAuth ? 16 : 28,
                  denseAuth ? 18 : 22,
                  denseAuth ? 18 : 22,
                ),
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 430),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _AuthBrandHeader(compact: denseAuth),
                      SizedBox(height: denseAuth ? 14 : 24),
                      _PremiumCard(
                        padding: denseAuth ? 18 : 22,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              title,
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: denseAuth ? 28 : 30,
                                height: 1.08,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.3,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              subtitle,
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: SmartTaxiColors.textSecondary,
                                fontSize: denseAuth ? 14 : 15,
                                height: 1.35,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            SizedBox(height: denseAuth ? 16 : 24),
                            AutofillGroup(
                              child: Column(
                                children: [
                                  AnimatedSwitcher(
                                    duration: const Duration(milliseconds: 220),
                                    switchInCurve: Curves.easeOutCubic,
                                    switchOutCurve: Curves.easeInCubic,
                                    child: _registerMode
                                        ? Column(
                                            key: const ValueKey('register'),
                                            children: [
                                              TextField(
                                                controller: _loginController,
                                                decoration:
                                                    const InputDecoration(
                                                        labelText: 'Логин'),
                                                autofillHints: const [
                                                  AutofillHints.username
                                                ],
                                                textInputAction:
                                                    TextInputAction.next,
                                              ),
                                              SizedBox(height: fieldGap),
                                              TextField(
                                                controller: _nameController,
                                                decoration:
                                                    const InputDecoration(
                                                        labelText: 'Имя'),
                                                autofillHints: const [
                                                  AutofillHints.name
                                                ],
                                                keyboardType:
                                                    TextInputType.name,
                                                textCapitalization:
                                                    TextCapitalization.words,
                                                textInputAction:
                                                    TextInputAction.next,
                                              ),
                                              SizedBox(height: fieldGap),
                                              TextField(
                                                controller: _surnameController,
                                                decoration:
                                                    const InputDecoration(
                                                        labelText: 'Фамилия'),
                                                autofillHints: const [
                                                  AutofillHints.familyName
                                                ],
                                                keyboardType:
                                                    TextInputType.name,
                                                textCapitalization:
                                                    TextCapitalization.words,
                                                textInputAction:
                                                    TextInputAction.next,
                                              ),
                                              SizedBox(height: fieldGap),
                                              TextField(
                                                controller: _phoneController,
                                                decoration:
                                                    const InputDecoration(
                                                  labelText: 'Номер телефона',
                                                  hintText: '+7 ___ ___ __ __',
                                                ),
                                                autofillHints: const [
                                                  AutofillHints.telephoneNumber
                                                ],
                                                keyboardType:
                                                    TextInputType.phone,
                                                textInputAction:
                                                    TextInputAction.next,
                                              ),
                                            ],
                                          )
                                        : TextField(
                                            key: const ValueKey('login'),
                                            controller: _phoneController,
                                            decoration: const InputDecoration(
                                              labelText: 'Номер телефона',
                                              hintText: '+7 ___ ___ __ __',
                                            ),
                                            autofillHints: const [
                                              AutofillHints.telephoneNumber
                                            ],
                                            keyboardType: TextInputType.phone,
                                            textInputAction:
                                                TextInputAction.next,
                                          ),
                                  ),
                                  SizedBox(height: fieldGap),
                                  TextField(
                                    controller: _passwordController,
                                    decoration: InputDecoration(
                                      labelText: 'Пароль',
                                      suffixIcon: IconButton(
                                        tooltip: _showPassword
                                            ? 'Скрыть пароль'
                                            : 'Показать пароль',
                                        icon: Icon(_showPassword
                                            ? Icons.visibility_off_outlined
                                            : Icons.visibility_outlined),
                                        onPressed: () => setState(() =>
                                            _showPassword = !_showPassword),
                                      ),
                                    ),
                                    autofillHints: _registerMode
                                        ? const [AutofillHints.newPassword]
                                        : const [AutofillHints.password],
                                    obscureText: !_showPassword,
                                    textInputAction: _registerMode
                                        ? TextInputAction.next
                                        : TextInputAction.done,
                                    onSubmitted: _registerMode || _loading
                                        ? null
                                        : (_) => _submit(),
                                  ),
                                  if (_registerMode) ...[
                                    SizedBox(height: fieldGap),
                                    TextField(
                                      controller: _passwordRepeatController,
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
                                      autofillHints: const [
                                        AutofillHints.newPassword
                                      ],
                                      obscureText: !_showPasswordRepeat,
                                      textInputAction: TextInputAction.done,
                                      onSubmitted:
                                          _loading ? null : (_) => _submit(),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            AnimatedSwitcher(
                              duration: const Duration(milliseconds: 180),
                              child: _error == null
                                  ? SizedBox(height: denseAuth ? 8 : 12)
                                  : Padding(
                                      padding: const EdgeInsets.only(top: 12),
                                      child: Column(
                                        children: [
                                          _InlineMessage(
                                              text: _error!, danger: true),
                                          if (_isConnectionError(_error!)) ...[
                                            const SizedBox(height: 8),
                                            const _ConnectionHint(),
                                          ],
                                        ],
                                      ),
                                    ),
                            ),
                            SizedBox(height: denseAuth ? 4 : 6),
                            ElevatedButton(
                              onPressed: _loading ? null : _submit,
                              child: _loading
                                  ? const _ButtonLoader(text: 'Проверяем...')
                                  : Text(_registerMode
                                      ? 'Создать аккаунт'
                                      : 'Войти'),
                            ),
                            SizedBox(height: denseAuth ? 14 : 18),
                            _AuthSwitchLink(
                              registerMode: _registerMode,
                              onSwitch: () => _switchMode(!_registerMode),
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

class _AuthBrandHeader extends StatelessWidget {
  const _AuthBrandHeader({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final logo = compact
        ? SizedBox(
            width: 72,
            height: 72,
            child: FittedBox(child: BrandLogo(large: true)),
          )
        : BrandLogo(large: true);
    return Column(
      children: [
        logo,
        SizedBox(height: compact ? 12 : 18),
        Text(
          'SmartTaxi',
          style: TextStyle(
            fontSize: compact ? 30 : 34,
            fontWeight: FontWeight.w900,
            letterSpacing: -0.5,
          ),
        ),
        SizedBox(height: compact ? 5 : 8),
        Text(
          'Региональное такси рядом с вами',
          textAlign: TextAlign.center,
          style: TextStyle(
              color: SmartTaxiColors.textSecondary,
              fontSize: compact ? 14 : 15,
              fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}

class _AuthSwitchLink extends StatelessWidget {
  const _AuthSwitchLink({required this.registerMode, required this.onSwitch});

  final bool registerMode;
  final VoidCallback onSwitch;

  @override
  Widget build(BuildContext context) {
    final text = registerMode ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?';
    final action = registerMode ? 'Войти' : 'Зарегистрируйтесь';
    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 6,
      runSpacing: 0,
      children: [
        Text(
          text,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: SmartTaxiColors.textSecondary,
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
        InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onSwitch,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 6),
            child: Text(
              action,
              style: const TextStyle(
                color: SmartTaxiColors.goldDeep,
                fontSize: 14,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _PremiumCard extends StatelessWidget {
  const _PremiumCard({required this.child, this.padding = 20});

  final Widget child;
  final double padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(padding),
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

class _ConnectionHint extends StatelessWidget {
  const _ConnectionHint();

  @override
  Widget build(BuildContext context) {
    return const Text(
      'Проверьте адрес сервера в настройках запуска приложения.',
      textAlign: TextAlign.center,
      style: TextStyle(
        color: SmartTaxiColors.textSecondary,
        fontSize: 12,
        height: 1.35,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

String _userLabel(dynamic user) {
  if (user is! Map) return 'Аккаунт SmartTaxi';
  return (user['login'] ?? user['name'] ?? user['phone'] ?? 'Аккаунт SmartTaxi')
      .toString();
}

String _userPhone(dynamic user) {
  if (user is! Map) return '';
  return (user['phone'] ?? '').toString();
}

String _userMail(dynamic user) {
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
  if (message.contains('INVALID_CREDENTIALS') ||
      message.contains('401') ||
      message.contains('403')) {
    return 'Неверный номер или пароль';
  }
  if (message.contains('PHONE_EXISTS')) return 'Этот номер уже зарегистрирован';
  if (message.contains('USER_ALREADY_EXISTS')) {
    return 'Этот номер уже зарегистрирован';
  }
  if (message.contains('DRIVER_BLOCKED')) {
    return 'Аккаунт водителя заблокирован';
  }
  if (message.contains('NAME_REQUIRED')) return 'Введите имя';
  if (message.contains('PHONE_REQUIRED')) return 'Введите номер телефона';
  if (message.contains('PASSWORD_TOO_SHORT')) {
    return 'Пароль должен быть не короче 6 символов';
  }
  if (message.contains('PASSWORD_MISMATCH')) return 'Пароли не совпадают';
  if (message.contains('SocketException') ||
      message.contains('DioException') ||
      message.contains('DioError') ||
      message.contains('connection error') ||
      message.contains('Connection error') ||
      message.contains('Connection') ||
      message.contains('connection') ||
      message.contains('Failed host lookup') ||
      message.contains('Connection refused') ||
      message.contains('timed out') ||
      message.contains('Network is unreachable')) {
    return 'Сервер недоступен. Проверьте подключение.';
  }
  return 'Проверьте заполненные данные';
}

bool _isConnectionError(String error) =>
    error == 'Сервер недоступен. Проверьте подключение.';
