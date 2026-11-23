# Implementation Plan: Activity & Presence

**Branch**: `029-activity-presence` | **Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)

## Summary

New `activity` module (`/api/activity`):

- a heartbeat endpoint that merges state reports into stretches and updates presence;
- presence, daily timeline and team views, RBAC-scoped like 028;
- per-org settings (enabled flag, idle threshold);
- a nightly 90-day purge.

Plus one addition to 028: `POST /api/time/timer/trim {minutes}`, which removes idle minutes from a running timer.

Backend only; the frontend repo builds detection and UI against [contracts/activity-api.md](./contracts/activity-api.md).

## Technical Context

- **Stack and layering**: same as 028.
- **New tables** (migration `activity_presence`): `ActivitySpan`, `ActivityPresence`, `ActivitySettings`. See [data-model.md](./data-model.md).
- **Reuses**:
  - `employee/service` for status and scope (`getEmployeeSummary`, `listDirectReportIds`, `listActiveEmployeeSummaries`);
  - `timetracking/week.ts` for org-local dates;
  - `lib/scheduler.registerJob` for the purge.

## Constitution Check

- I **PASS**: one module; it reaches 028 only through its service (`trimTimer` lives in timetracking).
- II **PASS**.
- III **PASS**: scope is enforced in the service.
- IV **PASS**: server-side timestamps only.
- VI **PASS**: tenant-scoped.
- VII **PASS**: no desktop agent and no content capture (FR-012).

## Research & decisions

See [research.md](./research.md).

## Project Structure

```text
src/modules/activity/{schema,repository,service,controller,routes}.ts
src/modules/timetracking/  + trimTimer (service/controller/routes/schema)
prisma/migrations/<ts>_activity_presence/migration.sql
```

Mounted at `/api/activity`. The purge job is registered in `app.ts`.
