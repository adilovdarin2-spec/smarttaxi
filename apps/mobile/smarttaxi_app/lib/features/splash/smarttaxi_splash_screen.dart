import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/widgets/brand_logo.dart';

class SmartTaxiSplashScreen extends StatefulWidget {
  const SmartTaxiSplashScreen({super.key, required this.onFinished});

  final VoidCallback onFinished;

  @override
  State<SmartTaxiSplashScreen> createState() => _SmartTaxiSplashScreenState();
}

class _SmartTaxiSplashScreenState extends State<SmartTaxiSplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _intro;
  late final AnimationController _progress;

  @override
  void initState() {
    super.initState();
    _intro = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 850),
    )..forward();
    _progress = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1850),
    )..repeat();
    WidgetsBinding.instance.addPostFrameCallback((_) => _finish());
  }

  Future<void> _finish() async {
    await Future<void>.delayed(const Duration(milliseconds: 1650));
    if (!mounted) return;
    widget.onFinished();
  }

  @override
  void dispose() {
    _intro.dispose();
    _progress.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final compact = size.height < 720;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
        systemNavigationBarColor: const Color(0xFF05070A),
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: const Color(0xFF05070A),
        body: Stack(
          fit: StackFit.expand,
          children: [
            const _SplashPhotoLayer(),
            const _SplashTintLayer(),
            Positioned(
              left: -120,
              top: size.height * 0.10,
              child: _GoldGlow(size: size.width * 0.86),
            ),
            SafeArea(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  24,
                  compact ? 28 : 42,
                  24,
                  compact ? 24 : 36,
                ),
                child: Column(
                  children: [
                    const Spacer(flex: 4),
                    FadeTransition(
                      opacity: CurvedAnimation(
                        parent: _intro,
                        curve: Curves.easeOutCubic,
                      ),
                      child: SlideTransition(
                        position: Tween<Offset>(
                          begin: const Offset(0, 0.045),
                          end: Offset.zero,
                        ).animate(
                          CurvedAnimation(
                            parent: _intro,
                            curve: Curves.easeOutCubic,
                          ),
                        ),
                        child: _SplashBrandBlock(compact: compact),
                      ),
                    ),
                    const Spacer(flex: 8),
                    _SplashProgress(progress: _progress),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SplashPhotoLayer extends StatelessWidget {
  const _SplashPhotoLayer();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF080D12),
            Color(0xFF0B0D12),
            Color(0xFF050607),
          ],
        ),
      ),
    );
  }
}

class _SplashTintLayer extends StatelessWidget {
  const _SplashTintLayer();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0xF4080D12),
            Color(0x99080D12),
            Color(0x33080D12),
            Color(0xC9080D12),
            Color(0xF7080D12),
          ],
          stops: [0.0, 0.25, 0.52, 0.78, 1.0],
        ),
      ),
    );
  }
}

class _SplashBrandBlock extends StatelessWidget {
  const _SplashBrandBlock({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          width: compact ? 238 : 292,
          height: compact ? 74 : 92,
          child: BrandLogo.horizontal(large: !compact),
        ),
        SizedBox(height: compact ? 12 : 16),
        Text(
          'Ваш комфорт. Ваш город.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.80),
            fontSize: compact ? 16 : 18,
            height: 1.25,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _GoldGlow extends StatelessWidget {
  const _GoldGlow({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [
              const Color(0xFFD4AF37).withValues(alpha: 0.16),
              const Color(0xFFD4AF37).withValues(alpha: 0.035),
              Colors.transparent,
            ],
          ),
        ),
      ),
    );
  }
}

class _SplashProgress extends StatelessWidget {
  const _SplashProgress({required this.progress});

  final Animation<double> progress;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: progress,
      builder: (context, _) {
        final fill = 0.18 + (progress.value * 0.72);
        final shine = Alignment(-1.0 + progress.value * 2.0, 0);

        return Column(
          children: [
            Text(
              'Загрузка...',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.84),
                fontSize: 17,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 14),
            Container(
              width: 292,
              height: 8,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
              ),
              clipBehavior: Clip.antiAlias,
              child: Align(
                alignment: Alignment.centerLeft,
                child: FractionallySizedBox(
                  widthFactor: fill.clamp(0.18, 0.92),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.centerLeft,
                        end: Alignment.centerRight,
                        colors: const [
                          Color(0xFFFBE9A4),
                          Color(0xFFE6BE45),
                          Color(0xFFB97A18),
                        ],
                        stops: [
                          0,
                          (0.55 + progress.value * 0.2).clamp(0.55, 0.75),
                          1,
                        ],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color:
                              const Color(0xFFD4AF37).withValues(alpha: 0.45),
                          blurRadius: 14,
                        ),
                      ],
                    ),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: RadialGradient(
                          center: shine,
                          radius: 1.2,
                          colors: [
                            Colors.white.withValues(alpha: 0.36),
                            Colors.white.withValues(alpha: 0.0),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
