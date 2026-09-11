class DriverRatingTag {
  const DriverRatingTag({required this.tag, required this.count});

  final String tag;
  final int count;

  factory DriverRatingTag.fromJson(Map<String, dynamic> json) {
    return DriverRatingTag(
      tag: '${json['tag'] ?? ''}',
      count: json['count'] is num
          ? (json['count'] as num).round()
          : int.tryParse('${json['count']}') ?? 0,
    );
  }
}

class DriverReviewItem {
  const DriverReviewItem({
    required this.rating,
    required this.tags,
    this.comment,
    required this.createdAt,
    this.orderShortId,
  });

  final int rating;
  final List<String> tags;
  final String? comment;
  final DateTime createdAt;
  final String? orderShortId;

  factory DriverReviewItem.fromJson(Map<String, dynamic> json) {
    final createdAtRaw = json['createdAt']?.toString();
    return DriverReviewItem(
      rating: json['rating'] is num
          ? (json['rating'] as num).round()
          : int.tryParse('${json['rating']}') ?? 0,
      tags: (json['tags'] is List)
          ? List<String>.from((json['tags'] as List).map((e) => '$e'))
          : const [],
      comment: (json['comment']?.toString().isEmpty ?? true)
          ? null
          : json['comment'].toString(),
      createdAt: createdAtRaw == null
          ? DateTime.now()
          : DateTime.tryParse(createdAtRaw) ?? DateTime.now(),
      orderShortId: json['orderShortId']?.toString(),
    );
  }
}

class DriverRatingSummary {
  const DriverRatingSummary({
    required this.rating,
    required this.reviewCount,
    required this.breakdown,
    required this.topTags,
    required this.recent,
  });

  final double rating;
  final int reviewCount;

  /// Star (1-5) -> review count.
  final Map<int, int> breakdown;
  final List<DriverRatingTag> topTags;
  final List<DriverReviewItem> recent;

  int get maxBreakdownCount =>
      breakdown.values.fold(0, (max, value) => value > max ? value : max);

  factory DriverRatingSummary.fromJson(Map<String, dynamic> json) {
    final breakdownRaw = json['breakdown'] is Map
        ? Map<String, dynamic>.from(json['breakdown'])
        : <String, dynamic>{};
    final breakdown = <int, int>{
      for (var star = 1; star <= 5; star++)
        star: breakdownRaw['$star'] is num
            ? (breakdownRaw['$star'] as num).round()
            : int.tryParse('${breakdownRaw['$star']}') ?? 0,
    };
    final tags = (json['topTags'] is List)
        ? (json['topTags'] as List)
            .whereType<Map>()
            .map((item) => DriverRatingTag.fromJson(Map<String, dynamic>.from(item)))
            .toList(growable: false)
        : const <DriverRatingTag>[];
    final recent = (json['recent'] is List)
        ? (json['recent'] as List)
            .whereType<Map>()
            .map((item) => DriverReviewItem.fromJson(Map<String, dynamic>.from(item)))
            .toList(growable: false)
        : const <DriverReviewItem>[];
    return DriverRatingSummary(
      rating: json['rating'] is num ? (json['rating'] as num).toDouble() : 0,
      reviewCount: json['reviewCount'] is num
          ? (json['reviewCount'] as num).round()
          : int.tryParse('${json['reviewCount']}') ?? 0,
      breakdown: breakdown,
      topTags: tags,
      recent: recent,
    );
  }
}
