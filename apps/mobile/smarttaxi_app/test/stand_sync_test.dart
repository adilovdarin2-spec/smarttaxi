import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/features/shared/stand_sync.dart';

StandSync ready() {
  final sync = StandSync();
  sync.settleRead(sync.beginRead()!, true);
  return sync;
}

void main() {
  test('stand writes require a confirmed initial snapshot', () {
    final sync = StandSync();
    expect(sync.beginWrite(), isNull);
    sync.settleRead(sync.beginRead()!, false);
    expect(sync.beginWrite(), isNull);
    sync.settleRead(sync.beginRead()!, true);
    expect(sync.beginWrite(), isNotNull);
  });
  test('seat write is single-flight and rejects an earlier poll', () {
    final sync = ready();
    final old = sync.beginRead()!;
    expect(sync.beginWrite(), isNotNull);
    expect(sync.beginWrite(), isNull);
    expect(sync.beginRead(), isNull);
    expect(sync.settleRead(old, true), isFalse);
    expect(sync.blocked, isTrue);
  });
  test('lost response reconciles without replaying a write', () {
    final sync = ready();
    final write = sync.beginWrite()!;
    expect(sync.currentWrite(write), isTrue);
    sync.settleRead(sync.beginRead(reconcile: true)!, true);
    expect(sync.beginWrite(), isNull);
    expect(sync.finishWrite(write), isTrue);
    expect(sync.blocked, isFalse);
    expect(sync.beginWrite(), isNotNull);
  });
  test('failed read-back stays locked until fresh confirmation', () {
    final sync = ready();
    final write = sync.beginWrite()!;
    sync.settleRead(sync.beginRead(reconcile: true)!, false);
    sync.finishWrite(write);
    expect(sync.beginWrite(), isNull);
    sync.settleRead(sync.beginRead()!, true);
    expect(sync.beginWrite(), isNotNull);
  });
  test('late successful read cannot hide a newer failure', () {
    final sync = ready();
    final old = sync.beginRead()!;
    sync.settleRead(sync.beginRead()!, false);
    expect(sync.settleRead(old, true), isFalse);
    expect(sync.blocked, isTrue);
  });
  test('disposed screen ignores pending reads and writes', () {
    final sync = ready();
    final write = sync.beginWrite()!;
    final read = sync.beginRead(reconcile: true)!;
    sync.dispose();
    expect(sync.settleRead(read, true), isFalse);
    expect(sync.finishWrite(write), isFalse);
    expect(sync.beginRead(), isNull);
  });
}
