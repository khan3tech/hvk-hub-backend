# Implementation Plan: Interactive Org Chart

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New read-only `orgchart` module (`/api/org-chart`) that builds the company tree on each request
from 002's live reporting lines, so no copy is stored (FR-009). It offers:

- shallow initial expansion with lazy branches;
- search with the path to auto-expand;
- the caller's own path;
- an HR/Admin-only gap overlay for orphans, headless departments and cycles.

Backend only; drawing the tree is the frontend's job.

## Technical Context

No new tables. Migration `org_chart_top` adds `Organization.topEmployeeId` (the "intended top",
FR-008). 002 gains `PATCH /departments/:id {headEmployeeId}` (the column existed but nothing set
it) and `designationId` in employee summaries. The graph math is pure (`orgchart/compute.ts`).

## Research & decisions

- **R1 — Graph**: each employee has at most one manager, so the reporting lines form trees plus,
  only through bad data, cycles.
  - Roots are active employees with no manager, or whose manager isn't an active employee
    (offboarded reports surface as orphans — edge case).
  - Nodes unreachable from any root are walked upward with a visited set to extract each cycle.
    Every walk is bounded, so nothing loops (FR-007, SC-003).
  - Members of a cycle aren't rendered in the tree. HR sees them in `/gaps`, and search marks
    them `inCycle`.
- **R2 — Size (FR-006, SC-002)**: `GET /org-chart` expands roots to `depth` (default 2, max 6).
  Each node carries `directReportCount`/`hasChildren` (leaves get no expand control), and
  `/nodes/:id/children` expands one branch. Response size depends on depth, not headcount (unit
  test: a 5,051-person org returns under 20 KB). The O(n) in-memory build is one query.
- **R3 — Visibility (FR-003)**: every node has name, title and department (the 002 directory
  level). Email is only shown to HR/Admin, the person themself or their manager. Nothing
  sensitive is ever included. The `orphan` flag and `cycleCount` are HR/Admin only (US3.3).
- **R4 — Search (FR-004)**: case-insensitive name match (prefix matches first, 20 results),
  each with its root-to-node `path`. No matches returns `[]`.
- **R5 — Gaps (FR-008, SC-004)**: orphans are roots other than the designated top (with reason
  NO_MANAGER or MANAGER_OFFBOARDED_OR_MISSING). Headless departments have no head or an
  inactive one. Cycles are listed by member. `PUT /org-chart/top` designates the top.

## Constitution Check

I PASS (reads 002 + organizations through their services) · II PASS · III PASS (field-level
scoping and HR overlay in the service) · IV PASS (department head changes audited in 002) · VI
PASS (per-org; verified in a freshly provisioned org) · VII PASS (no stored chart; no export).
