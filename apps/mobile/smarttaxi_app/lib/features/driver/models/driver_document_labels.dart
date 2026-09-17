import '../../../l10n/app_localizations.dart';
import 'driver_document_models.dart';

String documentTypeLabel(AppLocalizations l10n, String type) {
  switch (type) {
    case DriverDocumentType.licenseFront:
      return l10n.driverDocumentTypeLicenseFront;
    case DriverDocumentType.licenseBack:
      return l10n.driverDocumentTypeLicenseBack;
    case DriverDocumentType.idCardFront:
      return l10n.driverDocumentTypeIdCardFront;
    case DriverDocumentType.idCardBack:
      return l10n.driverDocumentTypeIdCardBack;
    case DriverDocumentType.vehicleRegistration:
      return l10n.driverDocumentTypeVehicleRegistration;
    case DriverDocumentType.insurancePolicy:
      return l10n.driverDocumentTypeInsurancePolicy;
    case DriverDocumentType.profilePhoto:
      return l10n.driverDocumentTypeProfilePhoto;
    default:
      return l10n.driverDocumentTypeOther;
  }
}
