# Implementation Plan: HR Helpdesk & Ticketing

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New `helpdesk` module (`/api/helpdesk`) covering:

- HR-configurable categories;
- self-service tickets visible only to the requester and HR/Admin;
- an HR queue with overdue and unassigned flags;
- assignment to HR team members, threaded replies, resolve and requester reopen;
- a per-category summary with average resolution time.

Backend only.

## Technical Context

Existing `TicketCategory`, `Ticket`, `TicketReply`. Migration `helpdesk` adds:

- TicketCategory `active`, `createdAt`;
- Ticket `subject`, `resolvedAt`, `awaitingHrSince`, `updatedAt`;
- TicketReply `fromHr`;
- new `HelpdeskSettings` (per-org `overdueHours`, default 48).

## Research & decisions

- **R1 — Overdue clock (FR-009, SC-003)**: `awaitingHrSince` is set on create, reopen and every
  requester reply, and cleared by an HR reply or resolution. A ticket is overdue when it's not
  resolved and has waited longer than the org's threshold. `unassigned` is flagged separately so
  untriaged tickets stand out (edge case).
- **R2 — Visibility (FR-007/008, SC-005)**: only the requester and HR/Admin can read a ticket;
  anyone else gets 404. Tickets join nothing from other modules — only their own text — so they
  can't be used to bypass access control.
- **R3 — Assignment (FR-004)**: only to active employees whose login role is HR or Admin.
  Assigning OPEN moves it to ASSIGNED; REOPENED keeps its status.
- **R4 — Lifecycle (FR-006)**: OPEN/ASSIGNED/REOPENED → RESOLVED (HR), and RESOLVED → REOPENED
  (requester only). Both are conditional transitions, and replies on resolved tickets are refused.
- **R5 — Retention (FR-011)**: tickets are never deleted. An offboarded requester loses access
  through 001, and HR still sees everything.
- **R6 — Summary (FR-010)**: open (not resolved) and resolved counts per category; average
  `resolvedAt − createdAt` in hours across resolved tickets.
- **R7 — Notifications**: new ticket → HR; assignment → assignee; HR reply and resolution →
  requester; reopen → the assignee.

## Constitution Check

I PASS (HR team via auth/employee services) · II PASS · III PASS · IV PASS (replies are the
thread; transitions conditional) · VI PASS · VII PASS (no live chat, no automated actions).
