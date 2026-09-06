/// Mirrors the backend's driver_documents.type CHECK constraint
/// (apps/api/src/db/schema.sql).
class DriverDocumentType {
  static const licenseFront = 'DRIVER_LICENSE_FRONT';
  static const licenseBack = 'DRIVER_LICENSE_BACK';
  static const idCardFront = 'ID_CARD_FRONT';
  static const idCardBack = 'ID_CARD_BACK';
  static const vehicleRegistration = 'VEHICLE_REGISTRATION';
  static const insurancePolicy = 'INSURANCE_POLICY';
  static const profilePhoto = 'PROFILE_PHOTO';
  static const other = 'OTHER';

  static const required = [
    licenseFront,
    licenseBack,
    idCardFront,
    idCardBack,
    vehicleRegistration,
  ];
}

class DriverDocument {
  const DriverDocument({
    required this.id,
    this.driverId,
    this.driverApplicationId,
    required this.type,
    required this.originalFilename,
    required this.mimeType,
    required this.sizeBytes,
    required this.status,
    this.rejectionReason,
    this.reviewedAt,
    required this.createdAt,
  });

  final String id;
  final String? driverId;
  final String? driverApplicationId;
  final String type;
  final String originalFilename;
  final String mimeType;
  final int sizeBytes;
  final String status;
  final String? rejectionReason;
  final DateTime? reviewedAt;
  final DateTime createdAt;

  bool get isPending => status == 'PENDING';
  bool get isApproved => status == 'APPROVED';
  bool get isRejected => status == 'REJECTED';

  factory DriverDocument.fromJson(Map<String, dynamic> json) {
    DateTime? parseDate(dynamic value) {
      final raw = value?.toString();
      if (raw == null || raw.isEmpty) return null;
      return DateTime.tryParse(raw);
    }

    return DriverDocument(
      id: '${json['id']}',
      driverId: json['driverId']?.toString(),
      driverApplicationId: json['driverApplicationId']?.toString(),
      type: '${json['type'] ?? DriverDocumentType.other}',
      originalFilename: '${json['originalFilename'] ?? ''}',
      mimeType: '${json['mimeType'] ?? ''}',
      sizeBytes: json['sizeBytes'] is num
          ? (json['sizeBytes'] as num).round()
          : int.tryParse('${json['sizeBytes']}') ?? 0,
      status: '${json['status'] ?? 'PENDING'}',
      rejectionReason: json['rejectionReason']?.toString(),
      reviewedAt: parseDate(json['reviewedAt']),
      createdAt: parseDate(json['createdAt']) ?? DateTime.now(),
    );
  }
}
