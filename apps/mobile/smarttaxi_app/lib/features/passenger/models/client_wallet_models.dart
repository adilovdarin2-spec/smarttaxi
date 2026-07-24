int _intOf(dynamic value) {
  if (value is num) return value.round();
  return int.tryParse('$value') ?? 0;
}

DateTime _dateOf(dynamic value) {
  final raw = value?.toString();
  if (raw == null || raw.isEmpty) return DateTime.now();
  return DateTime.tryParse(raw) ?? DateTime.now();
}

// Mirrors driver_wallet_models.dart's WalletSummary shape — GET
// /clients/me/wallet (client-wallet.routes.js). cashback_balance is the only
// real spendable balance a client has today; a real prepaid top-up balance
// can be merged into this same field later without changing this contract.
class ClientWalletSummary {
  const ClientWalletSummary({required this.balanceKzt, required this.currency});

  final int balanceKzt;
  final String currency;

  factory ClientWalletSummary.fromJson(Map<String, dynamic> json) {
    return ClientWalletSummary(
      balanceKzt: _intOf(json['balanceKzt']),
      currency: '${json['currency'] ?? 'KZT'}',
    );
  }
}

// A saved card is store-only (see client-wallet.service.js) — never charged
// automatically, never tokenized with a real processor. The raw number is
// never sent back by the backend, only a masked display string.
class ClientCard {
  const ClientCard({
    required this.id,
    this.holderName,
    required this.maskedCardNumber,
    required this.isDefault,
    required this.createdAt,
  });

  final String id;
  final String? holderName;
  final String maskedCardNumber;
  final bool isDefault;
  final DateTime createdAt;

  factory ClientCard.fromJson(Map<String, dynamic> json) {
    return ClientCard(
      id: '${json['id']}',
      holderName: json['holderName']?.toString(),
      maskedCardNumber: '${json['maskedCardNumber'] ?? ''}',
      isDefault: json['isDefault'] == true,
      createdAt: _dateOf(json['createdAt']),
    );
  }
}

// Records top-up intent only — there is no payment gateway wired to wallet
// top-ups yet (Kaspi Pay integration is coming separately). Stays PENDING
// until that integration exists to move it to COMPLETED/FAILED.
class ClientTopupRequest {
  const ClientTopupRequest({
    required this.id,
    required this.amountKzt,
    required this.method,
    required this.status,
    this.providerReference,
    required this.createdAt,
  });

  final String id;
  final int amountKzt;
  final String method;
  final String status;
  final String? providerReference;
  final DateTime createdAt;

  bool get isPending => status == 'PENDING';
  bool get isCompleted => status == 'COMPLETED';
  bool get isFailed => status == 'FAILED';
  bool get isCancelled => status == 'CANCELLED';

  factory ClientTopupRequest.fromJson(Map<String, dynamic> json) {
    return ClientTopupRequest(
      id: '${json['id']}',
      amountKzt: _intOf(json['amountKzt']),
      method: '${json['method'] ?? 'KASPI_PAY'}',
      status: '${json['status'] ?? 'PENDING'}',
      providerReference: json['providerReference']?.toString(),
      createdAt: _dateOf(json['createdAt']),
    );
  }
}
