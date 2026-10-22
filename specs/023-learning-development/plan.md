# Implementation Plan: Learning & Development

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New `learning` module (`/api/learning`) covering:

- courses that link to external content;
- assignment to the company, a department or named employees, with a due date;
- self-completion, with a required proof upload where configured;
- a derived overdue status;
- a compliance dashboard over the active workforce.

Backend only.

## Technical Context

- **Migration `learning_development`**:
  - Course gains `createdById`, `createdAt`, `updatedAt`;
  - new `CourseAssignmentRule` (a group assignment: audience, department, due date);
  - CourseAssignment gains `ruleId`, `assignedById`, `assignedAt`.
- **Hooks**: `onEmployeeCreated(learning.onEmployeeCreated)` for FR-007.
- **Proof** is stored through 008's `uploadEmployeeDocument` as an employee document labelled
  "Course completion: <title>", using the same type/size checks as 008.

## Research & decisions

- **R1 — Assignment (FR-002)**: an assignment creates one CourseAssignment per active target.
  Group (COMPANY/DEPARTMENT) assignments are also stored as a rule.
- **R2 — Cycles (FR-010)**: only an open (not complete) assignment for the same course blocks a
  new one, and those people are reported as `alreadyAssigned`. Completed people get a new
  cycle. The dashboard uses each employee's latest cycle.
- **R3 — Overdue (FR-005)**: derived at read time (incomplete and `dueDate` < today), so it
  needs no job. The stored status is INCOMPLETE/COMPLETE.
- **R4 — New hires (FR-007, US1.3)**:
  - Only rules on non-archived compliance-required courses with a COMPANY audience, or the hire's
    department, enroll new hires, at most once per course.
  - If the rule's due date has already passed, the hire gets 30 days instead of being overdue on
    day one.
  - Ordinary courses are never retroactive; HR assigns them explicitly (EMPLOYEES audience).
- **R5 — Completion (FR-003/004, SC-005)**: only the assignee completes, via a conditional
  update. Proof-required courses reject completion without a file (400 `PROOF_REQUIRED`).
- **R6 — Retention (FR-009)**:
  - Archiving blocks new assignments (409 `COURSE_ARCHIVED`) but keeps every record.
  - Offboarded employees drop out of the dashboard counts; their assignments remain listable.
- **R7 — Access**: course management, tracking and compliance are HR/Admin. Employees see and
  complete only their own assignments, and get a 404 for anyone else's.

## Constitution Check

I PASS (hooks; documents via 008's service) · II PASS · III PASS · IV PASS (ActivityLog: course
created/updated/archived/assigned/auto-assigned/completed) · VI PASS · VII PASS (no LMS hosting).
