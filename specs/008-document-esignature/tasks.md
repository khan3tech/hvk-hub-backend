# Tasks: Document Management & e-Signature

**Input**: plan.md, contracts/documents-api.md, quickstart.md. Backend only.

## Phase 1: Setup
- [X] T001 Add `multer`; `lib/storage.ts` (LocalDiskStorage, `STORAGE_DIR`); `.gitignore`/`.dockerignore` storage
- [X] T002 Migrations `document_esignature`, `document_owner_organization`
- [X] T003 Helpers: employee `listActiveEmployeeSummaries`, recruitment `getApplicationSummary`

## Phase 2: US1 — Store documents (P1)
- [X] T004 Upload middleware: size limit + MIME and magic-byte checks (FR-012)
- [X] T005 Versioned upload for employees/candidates (FR-001/004); list/history; authorized download
- [X] T006 Visibility: owner, HR/Admin, manager-visible for direct Manager (FR-002/003, SC-005)

## Phase 3: US2 — e-Signature (P1)
- [X] T007 Signature requests for employees (notified) and candidates (hashed private link, emailed)
- [X] T008 Sign: recipient only, conditional first-wins, immutable; actionable checks (offboarded/rejected)
- [X] T009 Public token routes (rate-limited); `applicationId` link for offers (US2.4)

## Phase 4: US3 — Policies (P2)
- [X] T010 Publish (optional file), list with my acknowledgment, idempotent acknowledge, HR status

## Phase 5: Polish
- [X] T011 Unit tests `documents/service.test.ts` (10)
- [X] T012 `scripts/e2e/008-documents.mjs` (30 checks); routes + OpenAPI (multipart) + contract
