// Mechanically extracts the lawyer-approved legal text from the mobile
// app's legal_content.dart into a JSON file the public web app can render.
// This is a one-shot dev script, not part of the build — it exists so the
// legal text is never hand-retyped (risk of transcription errors in
// legally-sensitive text), only copied byte-for-byte out of its single
// source of truth. Re-run and re-copy the output whenever legal_content.dart
// changes.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dartPath = join(__dirname, "../../mobile/smarttaxi_app/lib/core/legal/legal_content.dart");
const src = readFileSync(dartPath, "utf8");

function unescapeDart(str) {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

// Each `const List<LegalSection> _xxxSections = [ ... ];` block.
const sectionListRe = /const List<LegalSection>\s+(_\w+)\s*=\s*\[([\s\S]*?)\n\];/g;
const sectionLists = {};
let m;
while ((m = sectionListRe.exec(src))) {
  const [, varName, body] = m;
  const sections = [];
  const sectionRe = /LegalSection\(\s*title:\s*'((?:[^'\\]|\\.)*)',\s*body:\s*'((?:[^'\\]|\\.)*)',?\s*\)/g;
  let sm;
  while ((sm = sectionRe.exec(body))) {
    sections.push({
      title: unescapeDart(sm[1]),
      body: unescapeDart(sm[2])
    });
  }
  sectionLists[varName] = sections;
}

// The `legalDocuments` list of `LegalDocument(...)` entries.
const docsBlockMatch = src.match(/final List<LegalDocument> legalDocuments = \[([\s\S]*?)\n\];/);
if (!docsBlockMatch) throw new Error("Could not find legalDocuments list");
const docsBlock = docsBlockMatch[1];
const docRe = /LegalDocument\(\s*id:\s*'((?:[^'\\]|\\.)*)',\s*title:\s*'((?:[^'\\]|\\.)*)',\s*icon:\s*[\w.]+,\s*lead:\s*'((?:[^'\\]|\\.)*)',\s*sections:\s*(_\w+),?\s*\)/g;
const documents = [];
let dm;
while ((dm = docRe.exec(docsBlock))) {
  const [, id, title, lead, sectionsVar] = dm;
  const sections = sectionLists[sectionsVar];
  if (!sections) throw new Error(`Unknown sections var ${sectionsVar} for document ${id}`);
  documents.push({
    id,
    title: unescapeDart(title),
    lead: unescapeDart(lead),
    sections
  });
}

if (documents.length !== 5) {
  throw new Error(`Expected 5 legal documents, extracted ${documents.length}`);
}

const outPath = join(__dirname, "../src/legal/legal-content.json");
writeFileSync(outPath, JSON.stringify(documents, null, 2) + "\n", "utf8");
console.log(`Extracted ${documents.length} legal documents (${documents.map(d => d.sections.length).join(", ")} sections) to ${outPath}`);
