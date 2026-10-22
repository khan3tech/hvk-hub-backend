# Implementation Plan: White-Labeling / Per-Tenant Branding

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New `branding` module covering:

- an Admin-managed logo (PNG/JPEG, size-limited) and a primary color with a WCAG contrast check;
- TeamLoom defaults when an organization hasn't set its own;
- public by-slug endpoints for the sign-in page and the careers page.

004 payslips gain a branded PDF and 020 gains a careers-page header. Branding files are removed
when an organization is deleted. Backend only.

## Technical Context

- **Migration `white_labeling`**: OrganizationBranding gains `logoContentType`, `logoUpdatedAt`,
  `updatedById`, `updatedAt`. `logoUrl` holds the internal storage key.
- **Dependency**: `pdfkit` 0.17 (+ `@types/pdfkit`), used for payslip PDFs.
- **Hooks**:
  - `payroll.setPayslipBrandingProvider`: payroll renders a default look without 025.
  - `organizations.onOrganizationDeleted`: runs before any organization deletion. Today that is
    015's rollback of a half-provisioned organization; any future deprovisioning should go
    through the same path.

## Research & decisions

- **R1 — Scope (FR-003/004)**: `GET /api/branding` always resolves the caller's organization
  from the token. Public reads take a slug, and only for active organizations (suspended or
  unknown → 404). No custom domains (per the spec's Assumptions).
- **R2 — Logo (FR-001/008)**:
  - PNG and JPEG only. SVG is excluded because it can carry script.
  - Files are checked by declared type and leading bytes; the default limit is 512 KB
    (`BRANDING_LOGO_MAX_BYTES`), enforced while streaming (413).
  - Stored under `branding/<orgId>/` and served from `/api/public/branding/:slug/logo` with
    `nosniff`. The returned `logoUrl` carries a version for cache-busting.
  - Replacing a logo deletes the old file.
- **R3 — Color (FR-002/009, SC-004)**: `#RRGGBB`, stored uppercase. The primary color sits behind
  white text, so the check is the WCAG contrast ratio against white:
  - below 3:1 → rejected (400 `LOW_CONTRAST`);
  - from 3:1 up to 4.5:1 → accepted with a `warnings[]` entry;
  - otherwise clean.

  Responses include `onPrimaryColor` and `contrastRatio`.
- **R4 — Defaults (FR-005)**: product "TeamLoom", primary `#4F46E5` (6.3:1), and `logoUrl:
  null` (the client shows its built-in logo). `isDefault` tells the client nothing is
  configured. `DELETE /api/branding` resets to the defaults.
- **R5 — Payslip PDF (FR-006, SC-003)**:
  - `GET /payroll/payslips/me/:id/pdf` (owner) and `GET /payroll/payslips/:id/pdf` (HR/Admin).
  - A header band in the brand color with the logo and organization name, then earnings,
    deductions, statutory lines and net pay in the payslip currency.
  - A logo that can't be embedded is skipped, not fatal.
- **R6 — Careers (FR-007)**: `GET /api/public/careers/:org` returns the organization name, its
  branding and the open role count.
- **R7 — Removal (FR-010)**: `clearBranding` deletes the stored logo, then the row. It is
  registered as the organization-deleted hook and reused by reset.

## Constitution Check

I PASS (hooks into payroll and organizations; careers reads branding via its service) · II PASS
· III PASS · IV PASS (only Admin changes; storage keys never exposed) · VI PASS · VII PASS
(logo + one color; no theming engine).
