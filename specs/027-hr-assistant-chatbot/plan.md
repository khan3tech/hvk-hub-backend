# Implementation Plan: HR Assistant Chatbot

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New `assistant` module (`/api/assistant`): a read-only, text-based assistant. Each question is
split into parts, and each part is classified, then either answered from a grounded source with
links or explicitly declined. The grounded sources are:

- the asker's own records (leave balances, payslips, expense claims, helpdesk tickets) through
  the owning modules' services;
- configured settings (leave types, holidays);
- HR-authored knowledge articles, optionally tied to a published 008 policy.

HR/Admin get an anonymized topic overview with an unanswered rate. Backend only.

## Technical Context

- **Migration `hr_assistant`**: new `AssistantKnowledgeArticle` (title, body, keywords,
  optional policyId). `AssistantInteraction` stores only topic, wasAnswered, groundingType and a
  day-truncated timestamp: no text and no identity (the schema TODO's anonymity pattern,
  mirroring 018).
- **Files**:
  - `intents.ts` (pure): splitting, keyword classifier, third-party detection, topic labels,
    article scoring;
  - `service.ts`: grounding handlers, logging, articles, overview;
  - `routes.ts`.

## Research & decisions

- **R1 — No generative model (FR-002/004/005, SC-003)**:
  - Answers are assembled only from retrieved records and verbatim article text, so the
    assistant cannot invent a figure or a policy.
  - Understanding is a keyword/phrase classifier behind `IntentClassifier`
    (`setIntentClassifier`). A language-model classifier can replace it later without touching
    grounding or RBAC; it would only choose the intent, never write the answer.
- **R2 — RBAC (FR-003, SC-002)**:
  - Personal handlers call the owning modules' "my …" services with the asker's own employee id,
    so there is no code path to anyone else's data.
  - Additionally, personal questions that name someone else (a possessive, "of/for <Name>",
    "colleague", "her", …) are refused with `OUT_OF_SCOPE` before any lookup.
- **R3 — Policies (FR-004/006/009)**:
  - 008 policies are file uploads (PDF/DOCX) whose text the system doesn't parse. HR therefore
    writes knowledge articles: the plain-language answer plus keywords, linked to the source
    policy document.
  - An article matches on one of its keywords or phrases, or on two title words.
  - The answer quotes the article and cites both the article and the policy download link.
  - Articles are read on every question, with no cache.
  - A policy whose title matches but has no article is offered as a pointer in a decline,
    never as an answer.
- **R4 — Leave kinds**: a leave question naming a kind that isn't a configured leave type
  (e.g. parental) is routed to the policy lookup instead of being answered with the generic
  leave-type list.
- **R5 — Multi-part (FR-010)**: questions are split on `?`, `;`, sentence breaks, and
  "and/also/plus" followed by a question word (max 5 parts). Each part is answered or declined
  on its own, and `allAnswered` summarizes.
- **R6 — Overview (FR-007/008, SC-004)**:
  - One interaction row per part, with a topic label: the intent, or for policy questions a
    coarse HR vocabulary label (remote work, parental leave, benefits, …, else "other").
  - Unanswered topics still show where documentation is missing.
  - Filter by `from`/`to`, default the last 30 days. HR/Admin only.
- **R7 — Limits**: 30 questions a minute per client; questions of 3–1000 characters. The
  assistant is read-only (no actions taken).

## Constitution Check

I PASS (reads other modules only through their exported services) · II PASS · III PASS (RBAC by
construction + refusal) · IV PASS (no identity or question text retained) · VI PASS · VII PASS
(no model vendor needed; deterministic and testable).
