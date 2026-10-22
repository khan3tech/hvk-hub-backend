// specs/025-white-labeling/quickstart.md, API side.
import { call, check, show, upload, download, login, platformToken, RUN } from "./lib.mjs";

const PNG = { bytes: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"), name: "logo.png", type: "image/png" };
const hasImage = (pdf) => pdf.toString("latin1").includes("/Subtype /Image");

export default async function ({ tok, hire }) {
  // A second organization that never configures branding.
  const pt = await platformToken();
  const prov = await call("POST", "/platform/organizations", { token: pt, body: { name: `Brand B ${RUN}`, slug: `brand-b-${RUN}`, adminName: "Bri Admin", adminEmail: `bri.${RUN}@brandb.test` } });
  const bt = (await login(`bri.${RUN}@brandb.test`, prov.json.admin.temporaryPassword)).json.accessToken;
  const bSlug = prov.json.organization.slug;

  // US1 — logo and color
  const hrColor = await call("PUT", "/branding/color", { token: tok.hr, body: { primaryColor: "#1E3A8A" } });
  check("025 only an Admin changes branding", hrColor.status === 403, show(hrColor));
  const tooLight = await call("PUT", "/branding/color", { token: tok.admin, body: { primaryColor: "#FFEB3B" } });
  check("025 an illegible color is rejected (FR-009, SC-004)", tooLight.status === 400 && tooLight.json.error?.code === "LOW_CONTRAST", show(tooLight));
  const borderline = await call("PUT", "/branding/color", { token: tok.admin, body: { primaryColor: "#E0662F" } });
  check("025 a borderline color is accepted with a warning", borderline.status === 200 && borderline.json.warnings?.length === 1, show(borderline));
  const color = await call("PUT", "/branding/color", { token: tok.admin, body: { primaryColor: "#1e3a8a" } });
  check("025 Admin sets the primary color (FR-002)", color.json.primaryColor === "#1E3A8A" && color.json.warnings.length === 0, show(color));
  const svg = await upload("/branding/logo", { token: tok.admin, file: { bytes: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), name: "logo.svg", type: "image/svg+xml" } });
  const huge = await upload("/branding/logo", { token: tok.admin, file: { bytes: Buffer.concat([PNG.bytes, Buffer.alloc(600 * 1024)]), name: "big.png", type: "image/png" } });
  check("025 wrong type or oversized logo rejected before storing (FR-008)", svg.status === 415 && huge.status === 413, `${show(svg)} | ${show(huge)}`);
  const logo = await upload("/branding/logo", { token: tok.admin, file: PNG });
  check("025 Admin uploads a logo (FR-001)", logo.status === 200 && logo.json.logoUrl?.startsWith("/api/public/branding/"), show(logo));
  const asEmployee = await call("GET", "/branding", { token: tok.employee });
  check("025 every user in the org sees it (FR-003)", asEmployee.json.primaryColor === "#1E3A8A" && asEmployee.json.logoUrl === logo.json.logoUrl && asEmployee.json.isDefault === false, show(asEmployee));
  const asB = await call("GET", "/branding", { token: bt });
  check("025 another org sees its own (default) branding, never ours (FR-004, FR-005, SC-002)", asB.json.isDefault === true && asB.json.logoUrl === null && asB.json.primaryColor !== "#1E3A8A" && asB.json.organizationName === `Brand B ${RUN}`, show(asB));

  // US2 — external touchpoints
  const pub = await call("GET", "/public/branding/default", {});
  const img = await download(logo.json.logoUrl.replace(/^\/api/, ""));
  check("025 sign-in entry point shows the logo before signing in (US2.1)", pub.status === 200 && pub.json.logoUrl === logo.json.logoUrl && img.status === 200 && img.type === "image/png" && img.body.equals(PNG.bytes), `${show(pub)} | ${img.status} ${img.type}`);
  const bLogo = await download(`/public/branding/${bSlug}/logo`);
  check("025 unbranded org has no logo, not a broken one", bLogo.status === 404, String(bLogo.status));
  const careers = await call("GET", "/public/careers/default", {});
  check("025 careers page carries the branding (FR-007)", careers.status === 200 && careers.json.branding?.primaryColor === "#1E3A8A" && careers.json.branding.logoUrl === logo.json.logoUrl, show(careers));

  const emp = await hire(`BrandEmp ${RUN}`);
  await call("POST", `/payroll/salary-structures/${emp.id}`, { token: tok.hr, body: { basic: 30000, hra: 5000, allowances: {}, effectiveFrom: "2020-01-01" } });
  const Y = 2071 + (parseInt(RUN, 36) % 8);
  await call("POST", "/payroll/runs", { token: tok.hr, body: { periodMonth: 3, periodYear: Y } });
  const slip = (await call("GET", "/payroll/payslips/me", { token: emp.token })).json.find((p) => p.periodYear === Y && p.periodMonth === 3);
  const pdf = await download(`/payroll/payslips/me/${slip?.id}/pdf`, emp.token);
  check("025 payslip PDF carries the organization's logo (FR-006, SC-003)", pdf.status === 200 && pdf.type === "application/pdf" && pdf.body.subarray(0, 5).toString() === "%PDF-" && hasImage(pdf.body), `${pdf.status} ${pdf.type}`);
  const other = await download(`/payroll/payslips/me/${slip?.id}/pdf`, tok.employee);
  const hrPdf = await download(`/payroll/payslips/${slip?.id}/pdf`, tok.hr);
  check("025 payslip PDFs: owner or HR only", other.status === 403 && hrPdf.status === 200, `${other.status}/${hrPdf.status}`);

  // Removal
  const removed = await call("DELETE", "/branding/logo", { token: tok.admin });
  const gone = await download(logo.json.logoUrl.replace(/^\/api/, ""));
  const pdfAfter = await download(`/payroll/payslips/me/${slip?.id}/pdf`, emp.token);
  check("025 removing the logo deletes it everywhere", removed.json.logoUrl === null && gone.status === 404 && pdfAfter.status === 200 && !hasImage(pdfAfter.body), `${show(removed)} | ${gone.status}`);
  const reset = await call("DELETE", "/branding", { token: tok.admin });
  check("025 reset returns to the default branding (FR-005)", reset.json.isDefault === true, show(reset));
}
