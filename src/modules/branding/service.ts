// Per-organization branding (specs/025-white-labeling): logo + primary color, with
// TeamLoom defaults, served to the app shell, sign-in, careers page and payslip PDFs.
import type { Readable } from "node:stream";
import { DomainError } from "../../middleware/errorHandler.js";
import { getStorage } from "../../lib/storage.js";
import { logger } from "../../lib/logger.js";
import { getOrganizationIdentity, organizationDirectory } from "../organizations/service.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";

// FR-005: what an organization without its own branding gets.
export const DEFAULT_BRANDING = { productName: "TeamLoom", primaryColor: "#4F46E5" } as const;
// FR-008: PNG/JPEG only (no SVG: scriptable), small enough for every page load.
export const LOGO_TYPES: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};
export const LOGO_MAX_BYTES = Number(process.env.BRANDING_LOGO_MAX_BYTES ?? 512 * 1024);
// FR-009: the primary color sits behind white text (buttons, nav). WCAG 2.x: 4.5:1 for normal
// text; below 3:1 even large text/UI fails, so that's rejected and anything between warns.
export const MIN_CONTRAST_REJECT = 3;
export const MIN_CONTRAST_AA = 4.5;

export interface LogoFile { buffer: Buffer; mimetype: string; size: number }

// --- Contrast (FR-009, SC-004) ---

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastWithWhite(hex: string) {
  return Math.round((1.05 / (luminance(hex) + 0.05)) * 100) / 100;
}

// --- Reading ---

type Branding = Awaited<ReturnType<typeof repo.findBranding>>;

function present(org: { name: string; slug: string }, b: Branding) {
  const primaryColor = b?.primaryColor ?? DEFAULT_BRANDING.primaryColor;
  return {
    organizationName: org.name,
    slug: org.slug,
    productName: DEFAULT_BRANDING.productName,
    primaryColor,
    onPrimaryColor: "#FFFFFF",
    contrastRatio: contrastWithWhite(primaryColor),
    // Versioned so clients refetch after a change; the storage key itself is never exposed.
    logoUrl: b?.logoUrl ? `/api/public/branding/${encodeURIComponent(org.slug)}/logo?v=${b.logoUpdatedAt?.getTime() ?? 0}` : null,
    isDefault: !b?.primaryColor && !b?.logoUrl,
  };
}

async function identity(orgId: string) {
  const org = await getOrganizationIdentity(orgId);
  if (!org) throw new DomainError("NOT_FOUND", "Organization not found.", 404);
  return org;
}

// FR-003/FR-004: always the caller's own organization (from the token).
export async function getBranding(orgId: string) {
  return present(await identity(orgId), await repo.findBranding(orgId));
}

const notFound = () => new DomainError("NOT_FOUND", "Organization not found.", 404);

async function orgForSlug(slug: string) {
  const orgId = await organizationDirectory.idForSlug(slug);
  if (!orgId || !(await organizationDirectory.isActive(orgId))) throw notFound();
  return orgId;
}

// US2.1: the sign-in page reached through an organization's entry point (its slug).
export async function getPublicBranding(slug: string) {
  return getBranding(await orgForSlug(slug));
}

export async function openPublicLogo(slug: string): Promise<{ stream: Readable; contentType: string }> {
  const b = await repo.findBranding(await orgForSlug(slug));
  if (!b?.logoUrl) throw new DomainError("NOT_FOUND", "This organization has no logo.", 404);
  return { stream: await getStorage().open(b.logoUrl), contentType: b.logoContentType ?? "application/octet-stream" };
}

// For 004 payslip PDFs (FR-006) and other server-rendered surfaces: the logo bytes, if any.
export async function brandingAssets(orgId: string) {
  const [org, b] = await Promise.all([getOrganizationIdentity(orgId), repo.findBranding(orgId)]);
  let logo: Buffer | null = null;
  if (b?.logoUrl) {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of await getStorage().open(b.logoUrl)) chunks.push(Buffer.from(chunk));
      logo = Buffer.concat(chunks);
    } catch (err) {
      logger.warn({ err, orgId }, "branding logo unreadable; rendering without it");
    }
  }
  return { organizationName: org?.name ?? DEFAULT_BRANDING.productName, primaryColor: b?.primaryColor ?? DEFAULT_BRANDING.primaryColor, logo };
}

// --- Admin changes (FR-001, FR-002) ---

export async function setPrimaryColor(orgId: string, color: string, actor: AccessTokenPayload) {
  const hex = color.toUpperCase();
  const ratio = contrastWithWhite(hex);
  if (ratio < MIN_CONTRAST_REJECT) {
    throw new DomainError("LOW_CONTRAST", `White text on ${hex} has a contrast ratio of ${ratio}:1; choose a darker color (at least ${MIN_CONTRAST_REJECT}:1, ideally ${MIN_CONTRAST_AA}:1).`, 400, { primaryColor: [`Contrast ${ratio}:1 is below ${MIN_CONTRAST_REJECT}:1.`] });
  }
  await repo.upsertBranding(orgId, { primaryColor: hex, updatedById: actor.employeeId });
  const warnings = ratio < MIN_CONTRAST_AA
    ? [`White text on ${hex} is ${ratio}:1, below the ${MIN_CONTRAST_AA}:1 recommended for normal-size text. It will pass for large text and buttons only.`]
    : [];
  return { ...(await getBranding(orgId)), warnings };
}

export async function setLogo(orgId: string, file: LogoFile | undefined, actor: AccessTokenPayload) {
  if (!file) throw new DomainError("FILE_REQUIRED", "Attach the logo in the 'file' field.", 400);
  if (file.size > LOGO_MAX_BYTES) throw new DomainError("FILE_TOO_LARGE", `Logos must be ${Math.floor(LOGO_MAX_BYTES / 1024)} KB or smaller.`, 413);
  const sniff = LOGO_TYPES[file.mimetype];
  if (!sniff) throw new DomainError("UNSUPPORTED_FILE_TYPE", `Unsupported logo type ${file.mimetype}. Accepted: PNG, JPEG.`, 415);
  if (!sniff(file.buffer)) throw new DomainError("UNSUPPORTED_FILE_TYPE", "The file's contents don't match its declared type.", 415);
  const previous = await repo.findBranding(orgId);
  const key = await getStorage().put(file.buffer, { contentType: file.mimetype, prefix: `branding/${orgId}` });
  await repo.upsertBranding(orgId, { logoUrl: key, logoContentType: file.mimetype, logoUpdatedAt: new Date(), updatedById: actor.employeeId });
  if (previous?.logoUrl) await getStorage().remove(previous.logoUrl);
  return getBranding(orgId);
}

export async function removeLogo(orgId: string, actor: AccessTokenPayload) {
  const previous = await repo.findBranding(orgId);
  if (previous?.logoUrl) {
    await repo.upsertBranding(orgId, { logoUrl: null, logoContentType: null, logoUpdatedAt: null, updatedById: actor.employeeId });
    await getStorage().remove(previous.logoUrl);
  }
  return getBranding(orgId);
}

// Back to the TeamLoom defaults.
export async function resetBranding(orgId: string) {
  await clearBranding(orgId);
  return getBranding(orgId);
}

// Files, then the row. Registered with organizations.onOrganizationDeleted() in app.ts (FR-010).
export async function clearBranding(orgId: string) {
  const b = await repo.findBranding(orgId);
  if (b?.logoUrl) await getStorage().remove(b.logoUrl);
  await repo.deleteBranding(orgId);
}
