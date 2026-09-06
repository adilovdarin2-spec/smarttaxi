int _intOf(dynamic value) {
  if (value is num) return value.round();
  return int.tryParse('$value') ?? 0;
}

class WalletSummary {
  const WalletSummary({
    required this.balanceKzt,
    required this.debtKzt,
    required this.pendingPayoutKzt,
    required this.minPayoutKzt,
    required this.currency,
  });

  final int balanceKzt;
  final int debtKzt;
  final int pendingPayoutKzt;
  final int minPayoutKzt;
  final String currency;

  factory WalletSummary.fromJson(Map<String, dynamic> json) {
    return WalletSummary(
      balanceKzt: _intOf(json['balanceKzt']),
      debtKzt: _intOf(json['debtKzt']),
      pendingPayoutKzt: _intOf(json['pendingPayoutKzt']),
      minPayoutKzt: _intOf(json['minPayoutKzt'] ?? 3000),
      currency: '${json['currency'] ?? 'KZT'}',
    );
  }
}

/// EARNING — a KASPI trip credited the driver's balance.
/// CASH_TRIP_COMMISSION — a cash trip only added commission to debt.
/// ADJUSTMENT — a manual admin correction.
class WalletTransaction {
  const WalletTransaction({
    required this.id,
    required this.kind,
    required this.amountKzt,
    required this.paymentMethod,
    this.orderId,
    this.orderShortId,
    required this.currency,
    required this.createdAt,
  });

  final String id;
  final String kind;
  final int amountKzt;
  final String paymentMethod;
  final String? orderId;
  final String? orderShortId;
  final String currency;
  final DateTime createdAt;

  bool get isEarning => kind == 'EARNING';
  bool get isDebtCharge => kind == 'CASH_TRIP_COMMISSION';

  factory WalletTransaction.fromJson(Map<String, dynamic> json) {
    final createdAtRaw = json['createdAt']?.toString();
    return WalletTransaction(
      id: '${json['id']}',
      kind: '${json['kind'] ?? 'OTHER'}',
      amountKzt: _intOf(json['amountKzt']),
      paymentMethod: '${json['paymentMethod'] ?? 'UNKNOWN'}',
      orderId: json['orderId']?.toString(),
      orderShortId: json['orderShortId']?.toString(),
      currency: '${json['currency'] ?? 'KZT'}',
      createdAt: createdAtRaw == null
          ? DateTime.now()
          : DateTime.tryParse(createdAtRaw) ?? DateTime.now(),
    );
  }
}

/// The driver's saved payout destination (Settings -> "Способ выплаты"),
/// or the backend's fallback to whatever their last payout request carried
/// if they never explicitly saved one. `source` is 'saved' vs 'history' —
/// purely informational, not used for any branching in the UI today.
class PayoutDetailsStatus {
  const PayoutDetailsStatus({
    required this.hasDetails,
    this.method,
    this.cardNumber,
    this.phone,
  });

  final bool hasDetails;
  final String? method;
  final String? cardNumber;
  final String? phone;

  factory PayoutDetailsStatus.fromJson(Map<String, dynamic> json) {
    final details = json['lastPayoutDetails'] is Map
        ? Map<String, dynamic>.from(json['lastPayoutDetails'])
        : const <String, dynamic>{};
    return PayoutDetailsStatus(
      hasDetails: json['hasPayoutDetails'] == true,
      method: json['lastMethod']?.toString(),
      cardNumber: details['cardNumber']?.toString(),
      phone: details['phone']?.toString(),
    );
  }
}

class PayoutRequest {
  const PayoutRequest({
    required this.id,
    required this.amountKzt,
    required this.method,
    required this.status,
    this.rejectionReason,
    this.providerReference,
    this.reviewedAt,
    this.paidAt,
    required this.createdAt,
  });

  final String id;
  final int amountKzt;
  final String method;
  final String status;
  final String? rejectionReason;
  final String? providerReference;
  final DateTime? reviewedAt;
  final DateTime? paidAt;
  final DateTime createdAt;

  bool get isPending => status == 'PENDING';
  bool get isApproved => status == 'APPROVED';
  bool get isPaid => status == 'PAID';
  bool get isRejected => status == 'REJECTED';
  bool get isCancelled => status == 'CANCELLED';

  factory PayoutRequest.fromJson(Map<String, dynamic> json) {
    DateTime? parseDate(dynamic value) {
      final raw = value?.toString();
      if (raw == null || raw.isEmpty) return null;
      return DateTime.tryParse(raw);
    }

    return PayoutRequest(
      id: '${json['id']}',
      amountKzt: _intOf(json['amountKzt']),
      method: '${json['method'] ?? 'KASPI_TRANSFER'}',
      status: '${json['status'] ?? 'PENDING'}',
      rejectionReason: json['rejectionReason']?.toString(),
      providerReference: json['providerReference']?.toString(),
      reviewedAt: parseDate(json['reviewedAt']),
      paidAt: parseDate(json['paidAt']),
      createdAt: parseDate(json['createdAt']) ?? DateTime.now(),
    );
  }
}

/// Records top-up intent only -- there is no live payment gateway wired to
/// this yet (same scaffold as the client wallet's own topup requests). Stays
/// PENDING until an owner/finance user applies it via the existing
/// debt-adjustment admin action once the transfer is confirmed out-of-band.
class TopupRequest {
  const TopupRequest({
    required this.id,
    required this.amountKzt,
    required this.status,
    required this.createdAt,
  });

  final String id;
  final int amountKzt;
  final String status;
  final DateTime createdAt;

  bool get isPending => status == 'PENDING';

  factory TopupRequest.fromJson(Map<String, dynamic> json) {
    final raw = json['createdAt']?.toString();
    return TopupRequest(
      id: '${json['id']}',
      amountKzt: _intOf(json['amountKzt']),
      status: '${json['status'] ?? 'PENDING'}',
      createdAt: raw == null ? DateTime.now() : DateTime.tryParse(raw) ?? DateTime.now(),
    );
  }
}
