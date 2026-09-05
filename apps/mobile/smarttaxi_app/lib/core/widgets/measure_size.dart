import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

/// Reports layout changes after the frame, without mutating state in layout.
class MeasureSize extends SingleChildRenderObjectWidget {
  const MeasureSize({super.key, required this.onChange, required super.child});

  final ValueChanged<Size> onChange;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _MeasureSizeRenderObject(onChange);

  @override
  void updateRenderObject(
      BuildContext context, covariant RenderObject renderObject) {
    (renderObject as _MeasureSizeRenderObject).onChange = onChange;
  }
}

class _MeasureSizeRenderObject extends RenderProxyBox {
  _MeasureSizeRenderObject(this.onChange);

  ValueChanged<Size> onChange;
  Size? _lastSize;

  @override
  void performLayout() {
    super.performLayout();
    final measured = size;
    if (measured == _lastSize) return;
    _lastSize = measured;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (attached && _lastSize == measured) onChange(measured);
    });
  }
}
