import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/api/api_client.dart';
import 'api_transport_test.dart'
    show MemoryAuthStore, TestAdapter, jsonResponse;

void main() {
  test(
      'application status is authoritative, authenticated and rejects malformed data',
      () async {
    dynamic payload = {'application': null};
    final adapter = TestAdapter((request) async {
      expect(request.headers['Authorization'], 'Bearer applicant');
      expect(request.path, '/api/admin/driver-applications/mine');
      return jsonResponse(payload);
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    addTearDown(() => dio.close(force: true));
    final api = ApiClient(MemoryAuthStore('applicant'), dio: dio);
    expect(await api.getMyDriverApplication(), isNull);
    for (final status in ['PENDING', 'NEEDS_INFO', 'APPROVED', 'REJECTED']) {
      payload = {
        'application': {'id': 'own', 'status': status}
      };
      expect((await api.getMyDriverApplication())!['status'], status);
    }
    for (final value in [
      {},
      {
        'application': {'id': 1, 'status': 'PENDING'}
      },
      {
        'application': {'id': 'a', 'status': 'UNKNOWN'}
      }
    ]) {
      payload = value;
      await expectLater(api.getMyDriverApplication(), throwsFormatException);
    }
  });
  test(
      'application submission attaches the account token, without a generated identity or password',
      () async {
    final adapter = TestAdapter((request) async {
      expect(request.headers['Authorization'], 'Bearer applicant');
      expect(request.data.containsKey('password'), false);
      expect(request.data.containsKey('userId'), false);
      return jsonResponse({
        'application': {'id': 'own', 'status': 'PENDING'}
      }, 201);
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    addTearDown(() => dio.close(force: true));
    final api = ApiClient(MemoryAuthStore('applicant'), dio: dio);
    expect(
        await api.submitDriverApplication(
            fullName: 'QA',
            phone: '+77001234567',
            carModel: 'QA',
            carColor: '',
            plateNumber: 'QA'),
        'own');
    expect(adapter.requests, hasLength(1));
  });
  test('reopening application documents uses the authenticated owner endpoint',
      () async {
    final adapter = TestAdapter((request) async {
      expect(request.headers['Authorization'], 'Bearer applicant');
      expect(request.path, '/api/driver-applications/own/documents');
      return jsonResponse({'documents': []});
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    addTearDown(() => dio.close(force: true));
    final api = ApiClient(MemoryAuthStore('applicant'), dio: dio);
    expect(await api.getDriverApplicationDocuments('own'), isEmpty);
  });
}
