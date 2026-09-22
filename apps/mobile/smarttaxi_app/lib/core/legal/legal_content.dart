import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'legal_content.g.dart';

/// Юридические документы, которые человек видит в приложении: правовой
/// раздел и согласие при регистрации. Русский текст — тот, который сами
/// документы называют главенствующим.
///
/// Сами тексты сюда не пишутся. Они живут в
/// apps/web/src/legal/legal-content.json и попадают в приложение через
/// legal_content.g.dart. Здесь остаётся только то, чего в JSON быть не
/// может: иконка документа и карточка раздела на экране.
///
/// Раньше тексты лежали здесь целиком, вторым экземпляром, и копии уже
/// разошлись: сайт называл один домен, приложение — другой, в девятнадцати
/// местах. Человек принимает тот договор, который показан ему, а проверялся
/// другой.
class LegalSection {
  const LegalSection({required this.title, required this.body});

  final String title;
  final String body;
}

class LegalDocument {
  const LegalDocument({
    required this.id,
    required this.title,
    required this.icon,
    required this.lead,
    required this.sections,
  });

  final String id;
  final String title;
  final IconData icon;
  final String lead;
  final List<LegalSection> sections;
}

// Иконка — единственное, что есть у документа в приложении и чего нет в
// договоре. По идентификатору из JSON.
const Map<String, IconData> _documentIcons = <String, IconData>{
  'termsOfUse': Icons.verified_user_outlined,
  'privacyPolicy': Icons.lock_outline_rounded,
  'paymentTerms': Icons.payments_outlined,
  'cancellationPolicy': Icons.event_busy_outlined,
  'safetyRules': Icons.shield_outlined,
};

final List<LegalDocument> legalDocuments = legalDocumentTexts
    .map(
      (LegalTextDocument document) => LegalDocument(
        id: document.id,
        title: document.title,
        icon: _documentIcons[document.id] ?? Icons.description_outlined,
        lead: document.lead,
        sections: document.sections
            .map(
              (LegalTextSection section) =>
                  LegalSection(title: section.title, body: section.body),
            )
            .toList(growable: false),
      ),
    )
    .toList(growable: false);

// Back-compat aliases: the registration-consent sheets (main.dart,
// driver_shell.dart) only ever show Terms + Privacy, not the full
// 5-document hub, so they keep addressing those two by name.
final String termsOfUseLead = legalDocuments[0].lead;
final List<LegalSection> termsOfUseSections = legalDocuments[0].sections;
final String privacyPolicyLead = legalDocuments[1].lead;
final List<LegalSection> privacyPolicySections = legalDocuments[1].sections;

class LegalSectionCard extends StatelessWidget {
  // dark: false (default) matches the auth flow's own always-static-light
  // presentation (main.dart's legal sheet, shown pre-login — every other
  // element there is the same fixed SmartTaxiColors.auth* set, on purpose).
  // Callers reached from a logged-in, theme-reactive context (driver/
  // passenger Settings) pass the real Theme.of(context).brightness instead,
  // so this card doesn't stay a stray light-cream box floating inside an
  // otherwise-dark settings sheet.
  const LegalSectionCard({super.key, required this.section, this.dark = false});

  final LegalSection section;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final palette = dark ? context.palette : null;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette?.cardWarm ?? const Color(0xfffbfcff),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: palette?.border ?? SmartTaxiColors.authBorder,
          width: 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            section.title,
            style: TextStyle(
              color: palette?.text ?? SmartTaxiColors.authInk,
              fontSize: 13.5,
              height: 1.25,
              fontWeight: FontWeight.w900,
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: 7),
          Text(
            section.body,
            style: TextStyle(
              color: palette?.textSecondary ?? SmartTaxiColors.authMuted,
              fontSize: 12.6,
              height: 1.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
