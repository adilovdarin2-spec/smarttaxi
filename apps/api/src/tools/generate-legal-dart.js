import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Один договор — один файл, из которого он берётся.
//
// Тексты оферты лежали дважды: JSON для сайта и Dart внутри приложения.
// Человек принимает тот, который показан ему в приложении, а все проверки
// читали веб-версию. Копии уже успели разойтись: сайт называл домен
// smarttaxi.kz, приложение — onedriver.kz, в девятнадцати местах.
//
// Теперь Dart выводится из JSON. Править нужно только JSON; этот генератор
// пересобирает файл для приложения, а проверка рядом (legal-single-source-check)
// не даёт забыть его запустить.
//
// Запуск: node src/tools/generate-legal-dart.js

const SOURCE = fileURLToPath(new URL("../../../web/src/legal/legal-content.json", import.meta.url));
const TARGET = fileURLToPath(
  new URL("../../../mobile/smarttaxi_app/lib/core/legal/legal_content.g.dart", import.meta.url)
);

// Dart-строка в одинарных кавычках: экранируем то, что иначе сломает файл или
// подставит переменную ($ начинает интерполяцию).
function dartString(value) {
  const escaped = String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\$/g, "\\$")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "\\n");
  return `'${escaped}'`;
}

export function buildLegalDart(documents) {
  const lines = [];
  lines.push("// СГЕНЕРИРОВАННЫЙ ФАЙЛ — НЕ ПРАВИТЬ РУКАМИ.");
  lines.push("//");
  lines.push("// Источник: apps/web/src/legal/legal-content.json");
  lines.push("// Пересобрать: node apps/api/src/tools/generate-legal-dart.js");
  lines.push("//");
  lines.push("// Тексты юридических документов показываются и на сайте, и в приложении.");
  lines.push("// Человек принимает тот, который видит у себя, поэтому расходиться они не");
  lines.push("// должны. Правится только JSON.");
  lines.push("");
  lines.push("class LegalTextSection {");
  lines.push("  const LegalTextSection({required this.title, required this.body});");
  lines.push("");
  lines.push("  final String title;");
  lines.push("  final String body;");
  lines.push("}");
  lines.push("");
  lines.push("class LegalTextDocument {");
  lines.push("  const LegalTextDocument({");
  lines.push("    required this.id,");
  lines.push("    required this.title,");
  lines.push("    required this.lead,");
  lines.push("    required this.sections,");
  lines.push("  });");
  lines.push("");
  lines.push("  final String id;");
  lines.push("  final String title;");
  lines.push("  final String lead;");
  lines.push("  final List<LegalTextSection> sections;");
  lines.push("}");
  lines.push("");
  lines.push("const List<LegalTextDocument> legalDocumentTexts = <LegalTextDocument>[");
  for (const document of documents) {
    lines.push("  LegalTextDocument(");
    lines.push(`    id: ${dartString(document.id)},`);
    lines.push(`    title: ${dartString(document.title)},`);
    lines.push(`    lead: ${dartString(document.lead)},`);
    lines.push("    sections: <LegalTextSection>[");
    for (const section of document.sections) {
      lines.push("      LegalTextSection(");
      lines.push(`        title: ${dartString(section.title)},`);
      lines.push(`        body: ${dartString(section.body)},`);
      lines.push("      ),");
    }
    lines.push("    ],");
    lines.push("  ),");
  }
  lines.push("];");
  lines.push("");
  return lines.join("\n");
}

export function readLegalDocuments() {
  return JSON.parse(readFileSync(SOURCE, "utf8"));
}

export const GENERATED_PATH = TARGET;

// Запущен напрямую — переписываем файл.
if (process.argv[1] && fileURLToPath(new URL(`file://${process.argv[1].replace(/\\/g, "/")}`)).endsWith("generate-legal-dart.js")) {
  const documents = readLegalDocuments();
  const generated = buildLegalDart(documents);
  writeFileSync(TARGET, generated, "utf8");
  const sections = documents.reduce((total, document) => total + document.sections.length, 0);
  console.log(`legal_content.g.dart пересобран: ${documents.length} документов, ${sections} разделов`);
}
