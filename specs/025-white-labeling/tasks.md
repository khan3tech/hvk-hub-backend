# Tasks: White-Labeling / Per-Tenant Branding

**Input**: plan.md, contracts/branding-api.md, quickstart.md. Backend only.

- [X] T001 Migration `white_labeling`; `pdfkit` dependency
- [X] T002 US1: Admin color (WCAG contrast reject/warn) and logo (PNG/JPEG, size, byte sniffing) (FR-001, FR-002, FR-008, FR-009)
- [X] T003 US1: branding for every user of the org, defaults otherwise, never cross-org (FR-003–005)
- [X] T004 US2: public by-slug branding + logo for the sign-in page; careers page header (US2.1, FR-007)
- [X] T005 US2: branded payslip PDFs via `setPayslipBrandingProvider` (FR-006)
- [X] T006 Removal: logo delete/reset, `onOrganizationDeleted` cleanup (FR-010)
- [X] T007 Unit tests (8); `scripts/e2e/025-branding.mjs` (15 checks); 015/020 e2e re-run
