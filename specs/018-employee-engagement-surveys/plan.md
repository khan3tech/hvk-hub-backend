# Implementation Plan: Employee Engagement & Pulse Surveys

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New `surveys` module (`/api/surveys`) covering:

- HR sends eNPS + open-text surveys to the whole company or one department;
- employees answer anonymously, once;
- HR sees only aggregates, withheld below a minimum response count;
- a chronological eNPS trend with response rates.

Backend only.

## Technical Context

Existing `Survey`, `SurveyQuestion`, `SurveyParticipation` (who responded), `SurveyResponse`
and `SurveyAnswer` (what was said). Migration `engagement_surveys` adds Survey
`audienceEmployeeIds`, `audienceSize`, `minResponses` (default 5), `createdById`, `closedAt`.

## Research & decisions

- **R1 — Send = create (FR-006)**: there's no draft state. Creating a survey sends it, so its
  questions are never editable after sending; a correction means close and create a new one.
- **R2 — Audience snapshot (FR-002/010)**: the active employees (company or department) at send
  time are stored on the survey. Pending lists and submission rights use the snapshot, so later
  joiners never receive it, and response rate = responses ÷ snapshot size (FR-009).
- **R3 — Anonymity (FR-003, SC-003)**: two unlinked rows are written in one transaction.
  - "Who": a participation row `(survey, employee)` that is unique per pair, which also blocks a
    second submission (FR-004).
  - "What": a response row with no person column at all.
  - To stop either row being re-paired by inference, the response id is a random UUID (not a
    time-ordered cuid), and both rows store only the calendar day.
  - No submission is ever logged with the employee.

  The e2e checks this directly in the database.
- **R4 — Threshold (FR-005, SC-004)**: below `minResponses` the results endpoint returns only
  counts plus a "not enough responses" message. No per-question figures are returned, even to
  Admin, and the threshold never relaxes.
- **R5 — Scores (FR-007)**: eNPS = round(% scoring 9–10 − % scoring 0–6). Every eNPS question
  must be answered, while text is optional. Only explicit submissions count (no partial saves).
  Texts are returned shuffled, without ids or timestamps.
- **R6 — Trend (FR-008)**: every survey in send order, with status (OPEN/CLOSED), response rate,
  and eNPS (null while withheld).
- **R7 — Scope of a "group"**: responses carry no department, so a group is the survey's own
  audience. Department-level results come from a department-targeted survey.

## Constitution Check

I PASS (audience via 002's service) · II PASS · III PASS (HR/Admin-only admin and results) · IV
PASS by design (anonymity forbids attributing responses; survey creation is attributed) · VI PASS
· VII PASS (two question types, manual sends).
