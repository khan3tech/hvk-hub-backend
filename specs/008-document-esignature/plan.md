# Implementation Plan: Document Management & e-Signature

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New `documents` module with three routers: `/api/documents` (versioned storage, visibility,
signature requests), `/api/policies` (publish, acknowledge, track) and `/api/public/signatures`
(candidate signing by private link). Backend only.

## Technical Context

- **New dependency**: `multer` 2.x for `multipart/form-data` uploads (memory storage, one file,
  size-limited).
- **Storage**: `src/lib/storage.ts` `FileStorage` interface. The default is local disk under
  `STORAGE_DIR` (gitignored), and S3 can be plugged in with `setStorage()`.
- **Migrations**: `document_esignature` adds Document `contentType/sizeBytes/originalName/
  uploadedById/managerVisible` and SignatureRequest `sentById/signedByUserId/applicationId/
  accessTokenHash (unique)`. `document_owner_organization` adds owner type ORGANIZATION for
  policy files.

## Research & decisions

- **R1 — Storage keys**: generated server-side (`prefix/uuid`), never derived from client
  filenames. `Document.fileUrl` holds the key, which is never returned to clients; downloads
  stream through an authorized endpoint with `Cache-Control: private, no-store`.
- **R2 — File checks (FR-012)**: max `DOCUMENT_MAX_BYTES` (default 10 MB) → 413
  `FILE_TOO_LARGE`. Accepted: PDF, PNG, JPEG, DOCX, checked by declared MIME type *and*
  leading bytes → 415 `UNSUPPORTED_FILE_TYPE`.
- **R3 — Versions (FR-004)**: an upload under an existing owner+label becomes version n+1 in one
  transaction that unsets the previous `isCurrent`.
- **R4 — Visibility (FR-002/003, SC-005)**: owner and HR/Admin see everything. The owner's direct
  Manager sees only documents uploaded with `managerVisible=true`. Policy files are readable by
  every signed-in user, and a signature recipient can read the document sent to them.
- **R5 — Signing (FR-006/007)**: a typed full name while authenticated is the signature
  (Assumptions). The `AWAITING → SIGNED` conditional update means the first signature wins and a
  signed request can never change (409 `ALREADY_SIGNED`). Corrections go through a new version
  and a new request.
- **R6 — Candidates**: they have no login, so a 32-byte random token is emailed and returned
  once as `signingUrl` (`PUBLIC_APP_URL/sign/<token>`). Only its SHA-256 hash is stored. Public
  routes are rate-limited. `applicationId` links the signed offer to the application (US2.4).
- **R7 — Not actionable**: an offboarded employee recipient, or a candidate whose application was
  REJECTED, makes a request `actionable: false` and signing returns 409 `NOT_ACTIONABLE`.
- **R8 — Policies (FR-009–011)**: acknowledgment is one idempotent action (unique
  policy+employee). Tracking is computed against *current* active employees, so later joiners
  appear as pending and offboarded employees drop out.

## Constitution Check

I PASS (reads 002/005 via their services; documents owns Document/SignatureRequest/Policy
tables) · II PASS · III PASS (role gates on routes, owner/manager/recipient checks in service) ·
IV PASS (ActivityLog on upload/request/sign/publish/acknowledge) · VI PASS · VII PASS
(click-to-sign, single signer, local disk by default).
