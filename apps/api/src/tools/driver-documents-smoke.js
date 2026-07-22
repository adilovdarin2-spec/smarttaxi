// Live smoke test for driver document upload + admin review. Requires a
// running API (npm run dev) against a seeded database (npm run seed) — hits
// real HTTP endpoints, real disk storage under apps/api/uploads/, and a real
// DB, so it is not part of `npm test`. Run with: npm run smoke:driver-documents
import assert from "node:assert/strict";

const API_URL = (process.env.API_URL || "http://127.0.0.1:4000").replace(/\/$/, "");

function bearer(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...bearer(token) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(data)}`);
  return data;
}

async function uploadFile(path, { token, type, mimeType = "image/jpeg", filename = "document.jpg" } = {}) {
  const form = new FormData();
  form.set("type", type);
  form.set("file", new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01, 0x02, 0x03])], { type: mimeType }), filename);
  const response = await fetch(`${API_URL}${path}`, { method: "POST", headers: { ...bearer(token) }, body: form });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  return { status: response.status, data };
}

async function login(phone, password) {
  return request("/api/auth/login/password", { method: "POST", body: { phone, password } });
}

const ownerLogin = await login("+77000000099", "123456");
const ownerToken = ownerLogin.token;
const driverLogin = await login("+77000000000", "123456");
const driverToken = driverLogin.token;

// --- unauthenticated application-scoped flow ---
const suffix = String(Date.now()).slice(-8);
const application = await request("/api/admin/driver-applications", {
  method: "POST",
  body: {
    fullName: "Smoke Test Applicant",
    phone: `+7707${suffix}`,
    carModel: "Toyota Camry",
    plateNumber: `SMK${suffix}`.slice(0, 10)
  }
});
assert.ok(application.application?.id, "driver application is created");
const applicationId = application.application.id;

const uploadedAppDoc = await uploadFile(`/api/driver-applications/${applicationId}/documents`, {
  type: "DRIVER_LICENSE_FRONT"
});
assert.equal(uploadedAppDoc.status, 201, "unauthenticated applicant can upload a document for their application");
assert.equal(uploadedAppDoc.data.document.status, "PENDING", "uploaded document starts pending review");

const rejectedMime = await uploadFile(`/api/driver-applications/${applicationId}/documents`, {
  type: "DRIVER_LICENSE_BACK",
  mimeType: "text/plain",
  filename: "not-a-photo.txt"
});
assert.equal(rejectedMime.status, 400, "unsupported mime types are rejected");

const appDocsAsApplicant = await request(`/api/driver-applications/${applicationId}/documents`);
assert.equal(appDocsAsApplicant.documents.length, 1, "the application-scoped list only shows successfully uploaded documents");

const appDocsAsAdmin = await request(`/api/admin/driver-applications/${applicationId}/documents`, { token: ownerToken });
assert.equal(appDocsAsAdmin.documents.length, 1, "admin can see the same application documents");

const appDocId = appDocsAsAdmin.documents[0].id;
const approvedAppDoc = await request(`/api/admin/driver-documents/${appDocId}`, {
  method: "PATCH",
  token: ownerToken,
  body: { status: "APPROVED" }
});
assert.equal(approvedAppDoc.document.status, "APPROVED", "admin can approve an application document");

// --- authenticated driver-owned flow ---
const uploadedDriverDoc = await uploadFile("/api/drivers/me/documents", {
  token: driverToken,
  type: "PROFILE_PHOTO"
});
assert.equal(uploadedDriverDoc.status, 201, "an authenticated driver can upload their own document");
const driverDocId = uploadedDriverDoc.data.document.id;

const ownDocs = await request("/api/drivers/me/documents", { token: driverToken });
assert.ok(ownDocs.documents.some(d => d.id === driverDocId), "driver sees their own uploaded document");

const fileResponse = await fetch(`${API_URL}/api/drivers/me/documents/${driverDocId}/file`, { headers: bearer(driverToken) });
assert.equal(fileResponse.status, 200, "driver can download their own uploaded file back");
assert.equal(fileResponse.headers.get("content-type"), "image/jpeg", "stored file content-type is preserved");

const rejectedDriverDoc = await request(`/api/admin/driver-documents/${driverDocId}`, {
  method: "PATCH",
  token: ownerToken,
  body: { status: "REJECTED", reason: "Смоук-тест: переснимите фото" }
});
assert.equal(rejectedDriverDoc.document.status, "REJECTED", "admin can reject a driver document with a reason");

const ownDocsAfterReview = await request("/api/drivers/me/documents", { token: driverToken });
const reviewed = ownDocsAfterReview.documents.find(d => d.id === driverDocId);
assert.equal(reviewed.status, "REJECTED", "driver sees the reviewed status");
assert.equal(reviewed.rejectionReason, "Смоук-тест: переснимите фото", "driver sees the rejection reason");

console.log("Driver documents smoke ok");
