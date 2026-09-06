// Imports reviewed exports from Kazakhstan's Address Register (RKA) without
// making the passenger search depend on a government API at request time.
//
// Drop a CSV, JSONL or GeoJSON file into data/official-addresses/ using the
// region code as its name, for example YNTYMAK.csv.  Each row needs a stable
// `rka` plus `lat` and `lng`; other useful fields are label/address, street,
// housenumber, name, kind and variants.  The loader rejects unlocated rows,
// non-RKA IDs and points outside the configured SmartTaxi service area.

import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { serviceRegionCode } from "../modules/routing/region-geo.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OFFICIAL_ADDRESS_DIR = path.resolve(HERE, "../../data/official-addresses");
export const OFFICIAL_ADDRESS_TYPE = "rka";
const VALID_KINDS = new Set(["housenumber", "street", "building", "poi"]);
const RKA_LENGTH = 16;

function cleanText(value, max = 240) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text && text.length <= max ? text : "";
}

function parseDelimitedLine(line, delimiter) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = parseDelimitedLine(lines[0].replace(/^\uFEFF/, ""), delimiter)
    .map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = parseDelimitedLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function rowsFromFile(file) {
  const extension = path.extname(file).toLowerCase();
  const text = fs.readFileSync(file, "utf8");
  if (extension === ".csv") return parseCsv(text);
  if (extension === ".jsonl") {
    return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`${path.basename(file)}:${index + 1} is not valid JSON`);
      }
    });
  }
  if (extension === ".geojson" || extension === ".json") {
    const parsed = JSON.parse(text);
    const features = parsed?.type === "FeatureCollection" ? parsed.features : Array.isArray(parsed) ? parsed : [parsed];
    return features.map((feature) => {
      const coordinates = feature?.geometry?.type === "Point" ? feature.geometry.coordinates : null;
      return { ...(feature?.properties || {}), lng: coordinates?.[0], lat: coordinates?.[1] };
    });
  }
  throw new Error(`${path.basename(file)} must be .csv, .jsonl, .json or .geojson`);
}

function variantsOf(row, street, name) {
  const supplied = Array.isArray(row.variants)
    ? row.variants
    : String(row.variants || "").split(/[|;]/);
  const unique = new Set();
  for (const value of [street, name, ...supplied]) {
    const text = cleanText(value);
    if (text) unique.add(text);
  }
  return [...unique];
}

function normalizeRow(row, regionCode, sourceName, lineNumber) {
  const rka = cleanText(row.rka || row.rka_id || row.address_code || row.registration_code, RKA_LENGTH);
  // The Kazakhstan Address Register defines RKA as a 16-digit registration
  // code. Accepting arbitrary numeric IDs would quietly make map-provider or
  // local surrogate IDs look official and defeat source traceability.
  if (!new RegExp(`^\\d{${RKA_LENGTH}}$`).test(rka)) {
    throw new Error(`${sourceName}:${lineNumber} has an invalid RKA`);
  }
  const lat = Number(row.lat ?? row.latitude);
  const lng = Number(row.lng ?? row.lon ?? row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error(`${sourceName}:${lineNumber} has no valid coordinates`);
  }
  if (serviceRegionCode(lat, lng) !== regionCode) {
    throw new Error(`${sourceName}:${lineNumber} is outside the ${regionCode} service area`);
  }
  const street = cleanText(row.street || row.road || row.geonym);
  const housenumber = cleanText(row.housenumber || row.house || row.house_number, 80);
  const name = cleanText(row.name || row.object_name);
  const label = cleanText(row.label || row.address || [street, housenumber].filter(Boolean).join(", ") || name);
  if (!label) throw new Error(`${sourceName}:${lineNumber} has no rider-visible address label`);
  const kind = VALID_KINDS.has(row.kind)
    ? row.kind
    : housenumber ? "housenumber" : name ? "poi" : "building";
  return { rka, label, street: street || null, housenumber: housenumber || null, name: name || null, kind, lat, lng, variants: variantsOf(row, street, name) };
}

export function normalizeOfficialAddressRows(sourceRows, regionCode, sourceName = "official-addresses") {
  const code = String(regionCode || "").trim().toUpperCase();
  if (!sourceRows.length) throw new Error(`${sourceName} is empty; refusing to delete a prior official catalogue`);
  const seen = new Set();
  return sourceRows.map((row, index) => normalizeRow(row, code, sourceName, index + 1)).filter((row) => {
    if (seen.has(row.rka)) return false;
    seen.add(row.rka);
    return true;
  });
}

export function validateOfficialSnapshotPassport({ metadata, regionCode, sourceChecksum, acceptedRows, sourceName = "official snapshot" }) {
  const code = String(metadata.region_code || metadata.regionCode || "").trim().toUpperCase();
  if (code !== regionCode) {
    throw new Error(`${sourceName} must declare region_code=${regionCode}`);
  }
  const sourceDataset = cleanText(metadata.source_dataset || metadata.sourceDataset, 120);
  const sourceVersion = cleanText(metadata.source_version || metadata.sourceVersion, 120);
  const downloadedAt = cleanText(metadata.downloaded_at || metadata.downloadedAt, 80);
  const sourceRecordCount = Number(metadata.source_record_count || metadata.sourceRecordCount);
  const declaredAccepted = Number(metadata.accepted_record_count || metadata.acceptedRecordCount);
  const checksum = cleanText(metadata.sha256, 64).toLowerCase();
  if (!sourceDataset || !sourceVersion || !downloadedAt || !Number.isSafeInteger(sourceRecordCount) || sourceRecordCount < acceptedRows) {
    throw new Error(`${sourceName} is missing source dataset/version/date/count`);
  }
  if (!Number.isSafeInteger(declaredAccepted) || declaredAccepted !== acceptedRows) {
    throw new Error(`${sourceName} accepted_record_count must equal ${acceptedRows}`);
  }
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw new Error(`${sourceName} must contain a SHA-256 checksum`);
  }
  if (checksum !== sourceChecksum) {
    throw new Error(`${sourceName} checksum does not match its address file`);
  }
  if (Number.isNaN(Date.parse(downloadedAt))) {
    throw new Error(`${sourceName} downloaded_at must be an ISO date`);
  }
  return { sourceDataset, sourceVersion, downloadedAt, sourceRecordCount, acceptedRecordCount: acceptedRows, checksum };
}

/// Reads an official snapshot only with its auditable sidecar passport.
///
/// The address file and `<REGION>.meta.json` are an atomic deployment unit:
/// no source file is trusted just because it happens to have RKA-shaped IDs.
export function readOfficialAddressSnapshot(regionCode) {
  if (!fs.existsSync(OFFICIAL_ADDRESS_DIR)) return null;
  const code = String(regionCode || "").trim().toUpperCase();
  const files = fs.readdirSync(OFFICIAL_ADDRESS_DIR)
    .filter((name) => new RegExp(`^${code}\\.(csv|jsonl|json|geojson)$`, "i").test(name));
  if (files.length > 1) throw new Error(`${code}: keep exactly one official address file per region`);
  if (!files.length) return null;
  const sourceFile = path.join(OFFICIAL_ADDRESS_DIR, files[0]);
  const rows = normalizeOfficialAddressRows(rowsFromFile(sourceFile), code, files[0]);
  const metadataFile = path.join(OFFICIAL_ADDRESS_DIR, `${code}.meta.json`);
  if (!fs.existsSync(metadataFile)) {
    throw new Error(`${code}: missing ${code}.meta.json snapshot passport`);
  }
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
  } catch {
    throw new Error(`${path.basename(metadataFile)} is not valid JSON`);
  }
  const sourceChecksum = createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex");
  return {
    rows,
    metadata: validateOfficialSnapshotPassport({
      metadata,
      regionCode: code,
      sourceChecksum,
      acceptedRows: rows.length,
      sourceName: path.basename(metadataFile),
    }),
  };
}

export function readOfficialAddressRows(regionCode) {
  return readOfficialAddressSnapshot(regionCode)?.rows ?? null;
}
