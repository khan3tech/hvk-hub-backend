# Tasks: Public Careers Page & Self-Apply

**Input**: plan.md, contracts/careers-api.md, quickstart.md. Backend only (page in the frontend repo).

- [X] T001 Migration `public_careers` (posting description, application reference hash)
- [X] T002 005 refactor: shared applyCandidate, findOrCreateCandidate, applyFromOutside, reference lookup, deleteCandidate + cleanup hook
- [X] T003 008: storeCandidateFile, deleteCandidateDocuments; storage `remove()`
- [X] T004 US1: public list/detail of OPEN postings per org slug (FR-001/002)
- [X] T005 US2: bot check (proof of work, fill time, honeypot, single use, rate limits) and self-apply (FR-003–007/011)
- [X] T006 US3: status by email + reference with generic misses (FR-008/009)
- [X] T007 HR candidate deletion with cascade (FR-010)
- [X] T008 Unit tests (7); `scripts/e2e/020-careers.mjs` (15 checks)
