import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { buildLegalDart, readLegalDocuments, GENERATED_PATH } from "./generate-legal-dart.js";

// Договор, который человек принимает, и договор, который мы проверяем, — один.
//
// Тексты лежали дважды: JSON для сайта и Dart внутри приложения. Ничто их не
// сравнивало, и они разошлись: сайт называл домен smarttaxi.kz, приложение —
// onedriver.kz, в девятнадцати разделах из девяноста четырёх. Человек принимал
// один текст, а все денежные проверки читали другой.
//
// Теперь Dart выводится из JSON. Эта проверка пересобирает его в памяти и
// сравнивает с тем, что лежит на диске: забыть запустить генератор нельзя.

const SOURCE = new URL("../../../web/src/legal/legal-content.json", import.meta.url);

if (!existsSync(SOURCE) || !existsSync(GENERATED_PATH)) {
  console.warn("Legal single-source checks skipped: apps/web or apps/mobile is not present in this runtime image");
} else {
  const documents = readLegalDocuments();

  // --- Документы на месте ---
  assert(Array.isArray(documents) && documents.length >= 5, `документов всего ${documents.length}`);
  const sections = documents.reduce((total, document) => total + document.sections.length, 0);
  assert(sections >= 90, `разделов всего ${sections}`);
  for (const document of documents) {
    assert(document.id && document.title && document.lead, `документ без обязательных полей: ${document.id}`);
    for (const section of document.sections) {
      assert(section.title && section.title.trim(), `${document.id}: раздел без заголовка`);
      assert(section.body && section.body.trim(), `${document.id}: пустой раздел «${section.title}»`);
    }
  }

  // --- Приложение показывает ровно то, что лежит в источнике ---
  const expected = buildLegalDart(documents);
  const actual = readFileSync(GENERATED_PATH, "utf8").replace(/\r\n/g, "\n");
  assert.equal(
    actual,
    expected,
    "legal_content.g.dart отстал от legal-content.json — запустите node src/tools/generate-legal-dart.js"
  );

  // --- Ручной файл больше не хранит текстов ---
  const handWritten = readFileSync(
    new URL("../../../mobile/smarttaxi_app/lib/core/legal/legal_content.dart", import.meta.url),
    "utf8"
  );
  assert(
    !/LegalSection\(\s*title:\s*'/.test(handWritten),
    "тексты договора снова вписаны в legal_content.dart руками — это второй экземпляр"
  );
  assert.match(
    handWritten,
    /import 'legal_content\.g\.dart';/,
    "приложение должно брать тексты из сгенерированного файла"
  );

  // --- Один домен на оба экрана ---
  const domains = new Set(
    [...JSON.stringify(documents).matchAll(/([a-z0-9-]+\.kz)\b/g)].map(match => match[1])
  );
  assert.equal(
    domains.size,
    1,
    `в договоре названы разные сайты: ${[...domains].join(", ")}`
  );

  console.log(
    `Legal single-source checks ok: ${documents.length} documents, ${sections} sections, one source, site ${[...domains][0]}`
  );
}
