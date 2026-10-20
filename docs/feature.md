# TeamLoom — Consolidated Feature Reference

Generated from the 27 specs in [`specs/`](../specs) plus [`.specify/memory/constitution.md`](../.specify/memory/constitution.md).
For each feature: what triggers it (Inputs), what it produces (Outputs), what it needs to
already exist (Dependencies), its primary flow (see the matching diagram in
[`flows.md`](./flows.md)), the data it owns (Key Entities — matching
[`prisma/schema.prisma`](../prisma/schema.prisma)), and any gap or ambiguity
the spec left open, flagged as `TODO`.

**Nothing below states behavior beyond what its spec.md says.** Where a spec is silent or
explicitly defers a detail, that's recorded as a `TODO`, not filled in.

## How to read "Dependencies"

- **Hard** — the feature cannot function without this spec already working.
- **Soft / optional** — the specs explicitly say this pairing is valuable but not required; the
  feature degrades gracefully without it.

## Build-sequence note

The numeric spec order (001 → 027) is dependency-safe — see the dependency graph and the
**⚠️ flagged gap on 015** in [`flows.md`](./flows.md#dependency-graph-build-order-validation).
That gap (015's isolation guarantee/tests predate 016–027) is the one place "an upcoming
feature" could silently break an earlier one's stated guarantee; it's called out once there and
referenced again under § 015 below rather than repeated in every affected feature.

---

## v0.1 — Core MVP

### 001 — Authentication & Role-Based Access

- **Roles**: all (this is the gate every other feature sits behind)
- **Inputs**: email + password submission; an existing Employee/User record (created by 002)
- **Outputs**: a session (access token + refresh mechanism); a sign-in audit trail; role-scoped
  access enforced on every other module's requests
- **Depends on (hard)**: none — this is the foundation
- **Primary flow**: see [flows.md § 001](./flows.md#001--authentication--role-based-access)
- **Key entities**: `User`, `Role` (enum), `Session` (not a stored table — see TODO)
- **Gaps / TODO**:
  - `TODO`: the spec's "Session" entity has no dedicated schema table (the current
    `schema.prisma` has no `Session` model) — session state is assumed to live in the JWT
    itself per the original system-design doc, not a database row. Confirm this during 001's
    `/speckit-plan` rather than assuming.
  - `TODO`: password-reset flow is explicitly deferred to "its own follow-up spec" (see 001's
    Assumptions) — **no spec number 028+ exists for it yet**. This is a real product gap, not
    just a documentation one.
  - `TODO`: the RBAC matrix in 001's Assumptions only covers the five v0.1 modules. Specs
    006–027 each define their own role scoping inline (e.g., "HR/Admin only") but there is no
    single consolidated matrix across all 27 features. Recommend building one during whichever
    `/speckit-plan` pass tackles 001, or as a standalone doc.

### 002 — Employee Management

- **Roles**: HR/Admin (create/edit), Manager (team view), Employee (self + directory)
- **Inputs**: new-employee form (name, email, department, designation, manager, joining date)
- **Outputs**: `Employee` + linked `User` record; department/designation lookups; a
  role-scoped directory
- **Depends on (hard)**: 001 (the login account provisioned alongside the employee record)
- **Primary flow**: see [flows.md § 002](./flows.md#002--employee-management)
- **Key entities**: `Employee`, `Department`, `Designation`
- **Gaps / TODO**:
  - `TODO`: **rehire conflict** — 009's Assumptions say "a returning employee is treated as a
    new hire" (a new `Employee` record), but this schema scopes `Employee.email` and
    `Employee.employeeCode` uniqueness to `[orgId, email]` / `[orgId, employeeCode]`. A former
    employee's *offboarded* record still occupies that email/code in the same org, so a literal
    "new record" for a rehire would collide. Needs a product decision (reactivate the old
    record vs. relax the unique constraint to exclude `OFFBOARDED` rows) before 009 is
    implemented for any company with real rehires.
  - `TODO`: bulk import (CSV) is explicitly out of scope for v0.1 — flagged in case "adoption"
    pressure makes this come up before it's planned.

### 003 — Attendance & Leave

- **Roles**: all (check-in/out, leave request), Manager (approve direct reports), HR/Admin
  (approve anyone, configure leave types/holidays)
- **Inputs**: check-in/check-out taps; leave request (type, date range); Manager/HR decision
- **Outputs**: `Attendance` rows; `LeaveRequest` status changes; `LeaveBalance` decrements (only
  on approval)
- **Depends on (hard)**: 001 (auth/roles), 002 (employee + reporting-line data)
- **Primary flow**: see [flows.md § 003](./flows.md#003--attendance--leave) (two diagrams:
  check-in/out, and leave request → approval)
- **Key entities**: `Attendance`, `LeaveType`, `LeaveBalance`, `LeaveRequest`, `Holiday`
- **Gaps / TODO**:
  - `TODO`: half-day leave, accrual/carry-over rules, and shift schedules are explicitly out of
    scope for v0.1 (see Assumptions) — flagged here since "adoption"-driven feedback often asks
    for these early.

### 004 — Payroll

- **Roles**: HR/Admin (structure + run), Employee (own payslips), Manager (team view-only)
- **Inputs**: salary structure definition; a triggered payroll run for a period
- **Outputs**: `SalaryStructure` versions; `Payslip` rows (one per active employee per period,
  idempotent on re-run)
- **Depends on (hard)**: 001, 002 (active employee status, joining/offboarding dates), 003
  (unpaid-leave days for proration)
- **Primary flow**: see [flows.md § 004](./flows.md#004--payroll)
- **Key entities**: `SalaryStructure`, `Payslip`
- **Gaps / TODO**:
  - `TODO`: 004's Assumptions explicitly exclude statutory tax — **superseded in part by 010**;
    see 010's own gaps below for what that supersession does and doesn't cover.
  - `TODO`: no bank-transfer/disbursement integration by design (produces records, doesn't move
    money) — worth restating to stakeholders who might assume "payroll" means payment.

### 005 — Recruitment / ATS

- **Roles**: HR/Admin (full), Manager (own department), any authenticated user (view open
  postings only)
- **Inputs**: job posting; candidate + resume; stage-change actions; interview scheduling +
  result
- **Outputs**: `JobPosting`, `Candidate`, `Application` (with stage history), `InterviewRound`
- **Depends on (hard)**: 001, 002 (interviewer must be an internal employee)
- **Primary flow**: see [flows.md § 005](./flows.md#005--recruitment--ats)
- **Key entities**: `JobPosting`, `Candidate`, `Application`, `InterviewRound`
- **Gaps / TODO**:
  - `TODO`: no public careers site or self-application in v0.1 by design — see 020 for the
    counterpart.
  - `TODO`: offer-letter generation/e-signature explicitly excluded — see 008 for the
    counterpart.

---

## v1.1 — Startup-grade additions

### 006 — Notifications

- **Roles**: all (recipients); events sourced from 003/004/005 actions
- **Inputs**: leave decisions, payroll-run completion, interview scheduling/results
- **Outputs**: `Notification` rows (always created); best-effort email (skipped for offboarded
  users or missing email)
- **Depends on (hard)**: 001 (user/employee link for routing)
- **Depends on (soft)**: 003, 004, 005 as event sources — the feature has no events without them
- **Primary flow**: see [flows.md § 006](./flows.md#006--notifications)
- **Key entities**: `Notification`
- **Gaps / TODO**:
  - `TODO`: per-user notification preferences (opt-out) are explicitly out of scope for v1.1 —
    flag if early adopters push back on notification volume.
  - `TODO`: push notifications are out of scope here — see 019 for the mobile counterpart.

### 007 — Employee Onboarding Workflow

- **Roles**: HR/Admin (checklist admin), Manager/IT/Employee (task owners)
- **Inputs**: new employee record creation (auto-trigger); manual attach for existing employees
- **Outputs**: `OnboardingChecklist` + `OnboardingTask` rows; an HR progress overview
- **Depends on (hard)**: 002 (the employee record it attaches to)
- **Depends on (soft)**: 006 (nudging task owners — "not itself a functional requirement"), 008
  (auto-completing a document-upload task — "nice-to-have, not required")
- **Primary flow**: see [flows.md § 007](./flows.md#007--employee-onboarding-workflow)
- **Key entities**: `OnboardingTaskTemplate`, `OnboardingChecklist`, `OnboardingTask`
- **Gaps / TODO**:
  - `TODO`: **the standard default task list itself is never enumerated** in the spec (it says
    "a standard, configurable set of default tasks" without naming them). This is a genuine
    content gap that must be resolved during `/speckit-plan`, not assumed.
  - `TODO`: only one checklist template exists for v1.1 — per-employee-type (contractor vs.
    full-time) templates are deferred.

### 008 — Document Management & E-Signature

- **Roles**: HR/Admin (upload/send), Employee/Candidate (own documents only), Manager
  (restricted — no default access to personal documents)
- **Inputs**: document upload (label + file); signature request; policy publication
- **Outputs**: `Document` (versioned), `SignatureRequest` (immutable once signed), `Policy` +
  `PolicyAcknowledgment`
- **Depends on (hard)**: 002 (employee owner), 005 (candidate owner)
- **Depends on (soft)**: 007, 009 as "document-heavy moments" — functions independently of both
- **Primary flow**: see [flows.md § 008](./flows.md#008--document-management--e-signature) (two
  diagrams: storage/versioning, and signature + policy)
- **Key entities**: `Document`, `SignatureRequest`, `Policy`, `PolicyAcknowledgment`
- **Gaps / TODO**:
  - `TODO`: **not a legally certified e-signature standard** (explicit in Assumptions) — an
    in-app authenticated click, not PKI-based. Flag to any stakeholder who assumes this meets a
    specific jurisdiction's e-signature law.
  - `TODO`: multi-party (more than one signer) signature workflows are out of scope.

### 009 — Resignation & Exit Management

- **Roles**: Employee (submit), Manager/HR (acknowledge, clearance), IT/Finance/HR (exit tasks)
- **Inputs**: resignation submission (proposed last day); acknowledgment; per-task completion
- **Outputs**: `Resignation`, `ExitChecklist` + `ExitTask`; final offboarding + access revocation
- **Depends on (hard)**: 001 (access revocation), 002 (employee record/status)
- **Depends on (soft)**: 008 (storing signed exit paperwork) — not required to function
- **Primary flow**: see [flows.md § 009](./flows.md#009--resignation--exit-management)
- **Key entities**: `Resignation`, `ExitChecklist`, `ExitTask`
- **Gaps / TODO**:
  - `TODO`: see 002's rehire/uniqueness gap above — this spec's own "treated as a new hire"
    assumption is the other half of that unresolved conflict.
  - `TODO`: final settlement/gratuity computation is recorded as a clearance-task outcome here,
    not computed — if adoption requires real settlement math, that's a Payroll (004) extension,
    not this spec.

### 010 — Statutory Payroll Tax & Compliance

- **Roles**: HR/Admin (configure, exempt, report), Employee (sees itemized deductions)
- **Inputs**: statutory component definitions (flat/percentage/bracket rule); exemptions;
  payroll run
- **Outputs**: itemized statutory deductions on `Payslip`; a `ComplianceReport` export
- **Depends on (hard)**: 004 (extends its payslip generation directly)
- **Primary flow**: see [flows.md § 010](./flows.md#010--statutory-payroll-tax--compliance)
- **Key entities**: `StatutoryComponent`, `StatutoryExemption`, `ComplianceReport`
- **Gaps / TODO**:
  - `TODO`: **this feature does not itself guarantee legal compliance with any jurisdiction**
    (explicit, bolded in the spec's own Assumptions) — it's a configurable framework, not
    pre-built tax logic. This must be surfaced to any customer-facing material.
  - `TODO`: the `ruleConfig` JSON shape for percentage/bracket rules is intentionally
    unspecified in the spec (and left as a schema-level TODO in `schema.prisma`) — a
    `/speckit-plan` decision, not made here.
  - `TODO`: government e-filing integration and employee tax declarations are explicitly out of
    scope.

### 011 — HR Analytics & Reporting Dashboards

- **Roles**: HR/Admin only (no Manager-scoped view in v1.1)
- **Inputs**: none of its own — reads existing Employee/Attendance/Leave/Payroll data
- **Outputs**: headcount, attrition, leave-usage, and payroll-cost dashboards; data export
- **Depends on (hard)**: 002, 003, 004 as data sources
- **Primary flow**: see [flows.md § 011](./flows.md#011--hr-analytics--reporting-dashboards)
- **Key entities**: none new — pure aggregation (explicit in the spec's own Key Entities section)
- **Gaps / TODO**:
  - `TODO`: dashboards are refresh-on-load only, not live-updating — confirm this is acceptable
    before positioning as "real-time analytics" to customers.
  - `TODO`: Manager-scoped analytics (a manager's own team) are deferred — flag if requested
    early, since 015 doesn't address this either.

### 012 — Performance Management (Goals & Reviews)

- **Roles**: Employee (goals, self-reflection), Manager (approve goals, rate reviews), HR/Admin
  (cycles, oversight, corrections)
- **Inputs**: goal creation; Manager approval/change-request; review cycle definition; Manager
  rating + comments
- **Outputs**: `Goal`, `ReviewCycle`, `Review` (immutable once finalized except by HR/Admin)
- **Depends on (hard)**: 001 (role scoping), 002 (reporting-line data)
- **Depends on (soft)**: 011 (future trend views) — not required to function
- **Primary flow**: see [flows.md § 012](./flows.md#012--performance-management-goals--reviews)
- **Key entities**: `Goal`, `ReviewCycle`, `Review`
- **Gaps / TODO**:
  - `TODO`: peer/360-degree feedback is out of scope — Manager-and-self only.
  - `TODO`: review outcomes are explicitly NOT tied to compensation changes in Payroll (004) —
    confirm this stays true if a future comp-review feature is requested.

### 013 — SSO & Multi-Factor Authentication

- **Roles**: HR/Admin (configure/enforce), all users (SSO sign-in, MFA enrollment)
- **Inputs**: Google/Microsoft OAuth callback; TOTP enrollment + codes
- **Outputs**: `SsoIdentityLink`, `MfaEnrollment`, enforcement toggles
- **Depends on (hard)**: 001 (extends it directly; no RBAC scoping change)
- **Primary flow**: see [flows.md § 013](./flows.md#013--sso--multi-factor-authentication)
- **Key entities**: `IdentityProviderConfig`, `SsoIdentityLink`, `MfaEnrollment`, break-glass
  flag on `User`
- **Gaps / TODO**:
  - `TODO`: written before 015 (multi-tenant) existed — doesn't say "per organization" anywhere,
    though this schema scopes `IdentityProviderConfig` by `orgId`. Treat multi-tenant SSO config
    as implied, not spec-confirmed, until 013 is amended or its `/speckit-plan` addresses it.
  - `TODO`: SAML enterprise SSO and SMS-based MFA are both explicitly out of scope.

### 014 — Asset & Expense Management

- **Roles**: HR/IT (inventory, assignment), Employee (expense claims), Manager (claim approval)
- **Inputs**: asset add/assign/return; expense claim (amount, category, receipt)
- **Outputs**: `Asset`, `AssetAssignment`; `ExpenseClaim` (with approval/payout status);
  auto-completed onboarding/exit tasks
- **Depends on (hard)**: 002 (reporting-line-based expense routing)
- **Depends on (soft)**: 007, 009 (checklist-task integration) — core flows work without either
- **Primary flow**: see [flows.md § 014](./flows.md#014--asset--expense-management)
- **Key entities**: `Asset`, `AssetAssignment`, `ExpenseClaim`
- **Gaps / TODO**:
  - `TODO`: no disbursement integration ("paid" is a status, not a money movement) — same
    pattern as Payroll (004); confirm stakeholders understand this consistently.
  - `TODO`: no per-category spending limits or multi-level approval chains in v1.1.

### 015 — Multi-Company / Multi-Tenant Activation

- **Roles**: super-admin (new tier, system-level), all existing roles (now org-scoped)
- **Inputs**: organization provisioning request; suspend/reactivate action
- **Outputs**: an isolated `Organization`; org-scoped data across every module
- **Depends on (hard)**: fulfills Constitution Principle VI; its own text says it "touches every
  other spec (001–014)"
- **Primary flow**: see [flows.md § 015](./flows.md#015--multi-company--multi-tenant-activation)
- **Key entities**: `Organization`, `SuperAdmin`
- **Gaps / TODO**:
  - `TODO` **(the headline gap for this whole exercise)**: 015's isolation guarantee and
    automated test-coverage requirement (FR-002, FR-010) are scoped to "001–014" in its own
    text, written before 016–027 existed. This schema update adds `orgId` to every 016–027
    model so the data layer is ready, but **015's acceptance tests must be explicitly
    re-extended to cover 016–027's endpoints** — don't treat 015's original test suite as proof
    of isolation once later features are built. See the dependency-graph note in `flows.md` for
    the full explanation.
  - `TODO`: self-service company sign-up and per-org billing are both explicitly out of scope —
    provisioning is a manual super-admin action.

---

## v1.2 — Completeness additions

### 016 — Interactive Org Chart

- **Roles**: all (scoped detail), HR/Admin (structural-gap overlay)
- **Inputs**: none of its own — renders existing Employee reporting-line data
- **Outputs**: a rendered, searchable tree; an HR-only orphan/headless-department overlay
- **Depends on (hard)**: 002 (data), 001 (visibility scoping)
- **Primary flow**: see [flows.md § 016](./flows.md#016--interactive-org-chart)
- **Key entities**: none new — explicit in the spec's own Key Entities section
- **Gaps / TODO**:
  - `TODO`: read-only in v1.2 — reassigning a manager still requires going to 002's edit flow.
  - `TODO`: cycle-detection behavior ("refuse to render, flag for correction") needs a defined
    correction UI, which isn't specified — likely just 002's existing manager-edit form.

### 017 — HR Helpdesk / Ticketing

- **Roles**: Employee (raise), HR/Admin (triage, reply, resolve)
- **Inputs**: ticket (category, description); HR replies and status changes
- **Outputs**: `Ticket`, `TicketReply`; open/resolved counts and resolution-time metrics
- **Depends on (hard)**: 001 (who can raise/see which tickets)
- **Depends on (soft)**: 006 (reply notifications) — not required
- **Primary flow**: see [flows.md § 017](./flows.md#017--hr-helpdesk--ticketing)
- **Key entities**: `TicketCategory`, `Ticket`, `TicketReply`
- **Gaps / TODO**:
  - `TODO`: Managers cannot raise tickets on behalf of a direct report in v1.2 — self-service
    only, by design.
  - `TODO`: no ticket-driven automated actions — HR still makes the underlying data change in
    the relevant module manually.

### 018 — Employee Engagement & Pulse Surveys

- **Roles**: HR/Admin (create/view aggregate), Employee (respond anonymously)
- **Inputs**: survey definition (questions, audience); anonymous responses
- **Outputs**: aggregated eNPS scores + trend; a response-rate figure; **no per-person data ever**
- **Depends on (hard)**: 002 (audience membership), 001 (HR/Admin-only creation)
- **Primary flow**: see [flows.md § 018](./flows.md#018--employee-engagement--pulse-surveys)
- **Key entities**: `Survey`, `SurveyQuestion`, `SurveyParticipation` (duplicate-prevention
  only), `SurveyResponse` + `SurveyAnswer` (no identity link — see the anonymity note in
  `schema.prisma`)
- **Gaps / TODO**:
  - `TODO`: the minimum response-count threshold is "configurable but defaults to... e.g., 5" —
    the spec treats 5 as illustrative, not a confirmed default. Pin an actual default during
    `/speckit-plan`.
  - `TODO`: multiple-choice and other question types beyond eNPS-score/text are deferred.

### 019 — Mobile App / Progressive Web App

- **Roles**: all (check-in/out, leave, approvals from a phone)
- **Inputs**: none of its own — a delivery channel over 003 and 006
- **Outputs**: an installable PWA experience; push notifications
- **Depends on (hard)**: 003 (attendance/leave functionality it exposes), 006 (push extends
  in-app/email)
- **Primary flow**: see [flows.md § 019](./flows.md#019--mobile-app--progressive-web-app)
- **Key entities**: `DeviceRegistration` (the only new data — push-delivery targets)
- **Gaps / TODO**:
  - `TODO`: no native iOS/Android app-store builds — PWA only for v1.2.
  - `TODO`: offline-first action queuing is explicitly deferred — a network-required action
    simply fails clearly today.

### 020 — Public Careers Page & Candidate Self-Apply

- **Roles**: anonymous public visitor; HR/Admin (internal pipeline, unchanged)
- **Inputs**: public visitor's application (name, contact, resume) against an open posting
- **Outputs**: `Candidate` + `Application` created via the public entry point (`source =
  PUBLIC`), entering 005's existing pipeline unchanged
- **Depends on (hard)**: 005 (entirely — "adds an entry point, not new pipeline logic")
- **Primary flow**: see [flows.md § 020](./flows.md#020--public-careers-page--candidate-self-apply)
- **Key entities**: none new beyond `Application.source` — reuses 005's entities directly
- **Gaps / TODO**:
  - `TODO`: no candidate accounts — status checking is a lightweight per-application lookup by
    email, not a login.
  - `TODO`: bot-mitigation mechanism (FR-007) is unspecified beyond "a challenge" — a concrete
    choice (e.g., a CAPTCHA provider) is a `/speckit-plan` decision.
  - `TODO`: multi-tenant careers pages (one per organization once 015 lands) are "assumed but
    not detailed" in 020's own Assumptions — same class of gap as 015's headline issue.

### 021 — Employee Referral Program

- **Roles**: Employee (refer), HR/Admin (bonus config, payroll inclusion)
- **Inputs**: referral submission (candidate + posting); pipeline progression; payroll inclusion
- **Outputs**: `Referral` (pending/payable/paid/forfeited/closed-no-bonus); a payslip earning
  line via 004
- **Depends on (hard)**: 005 (pipeline), 002 (referrer active/offboarded status), 004 (payroll
  inclusion)
- **Depends on (soft)**: 020 (channel-attribution edge case) — not required
- **Primary flow**: see [flows.md § 021](./flows.md#021--employee-referral-program)
- **Key entities**: `ReferralProgramConfig`, `Referral`
- **Gaps / TODO**:
  - `TODO`: one company-wide bonus amount/qualifying period for v1.2 — no per-posting or
    per-seniority tiering yet.
  - `TODO`: an offboarded referrer's payable bonus requires manual HR judgment (spec explicitly
    does not auto-forfeit) — this is a deliberate exception to 009's otherwise-automatic
    offboarding effects; don't "fix" it into an auto-forfeit during implementation.

### 022 — Background Verification

- **Roles**: HR/Admin only (not even the hiring Manager sees results)
- **Inputs**: check initiation (items to verify); per-item results; hire-override justification
- **Outputs**: `BackgroundCheck` + `BackgroundCheckItem`; a gate on `Application` reaching
  `HIRED`; `HireOverride` records
- **Depends on (hard)**: 005 (extends its `Application` entity directly)
- **Primary flow**: see [flows.md § 022](./flows.md#022--background-verification)
- **Key entities**: `BackgroundCheck`, `BackgroundCheckItem`, `HireOverride`
- **Gaps / TODO**:
  - `TODO`: no third-party verification vendor integration — results are recorded manually
    based on checks conducted outside the system.
  - `TODO`: which check items apply per application is chosen per-initiation, not derived from
    role/posting — confirm this manual step is acceptable at scale.

### 023 — Learning & Development

- **Roles**: HR/Admin (create/assign/compliance dashboard), Employee (complete)
- **Inputs**: course definition; assignment (audience, due date); completion (+ optional proof)
- **Outputs**: `Course`, `CourseAssignment`; a compliance completed-vs-outstanding dashboard
- **Depends on (hard)**: 002 (assignment audiences), 001 (HR/Admin-only course management)
- **Depends on (soft)**: 008 (proof-of-completion storage) — a plain upload otherwise
- **Primary flow**: see [flows.md § 023](./flows.md#023--learning--development)
- **Key entities**: `Course`, `CourseAssignment`
- **Gaps / TODO**:
  - `TODO`: does not host or author content — always an external link/reference.
  - `TODO`: the ordinary-vs-compliance retroactivity asymmetry (FR-007) is deliberate, per the
    spec — flagged in `schema.prisma` too so it isn't "corrected" during implementation.

### 024 — Succession Planning

- **Roles**: HR/Admin only (not Managers, not the successors themselves)
- **Inputs**: critical-position flag; successor nomination + readiness level
- **Outputs**: `SuccessionPlan` + `SuccessionCandidate`; a risk-categorized coverage overview
- **Depends on (hard)**: 002 (position and active-status data)
- **Depends on (soft)**: 016 (visualization) — functions independently
- **Primary flow**: see [flows.md § 024](./flows.md#024--succession-planning)
- **Key entities**: `SuccessionPlan`, `SuccessionCandidate`
- **Gaps / TODO**:
  - `TODO`: readiness is a manual HR judgment — no automated scoring from 012's review ratings
    (explicitly deferred as a "reasonable future enhancement").
  - `TODO`: successors are never notified they've been identified — a deliberate
    confidentiality choice, not an oversight.

### 025 — White-Labeling / Per-Tenant Branding

- **Roles**: Organization Admin (configure)
- **Inputs**: logo upload; brand color choice
- **Outputs**: `OrganizationBranding` applied to app shell, payslips (004), and careers page
  (020) where present
- **Depends on (hard)**: 015 (has no meaning without multi-tenancy)
- **Depends on (soft)**: 004, 020 (extends both where present)
- **Primary flow**: see [flows.md § 025](./flows.md#025--white-labeling--per-tenant-branding)
- **Key entities**: `OrganizationBranding`
- **Gaps / TODO**:
  - `TODO`: no custom domains — organizations are distinguished by login context, not URL.
  - `TODO`: contrast-check threshold (FR-009) doesn't cite a specific standard (e.g., WCAG AA) —
    pick one during `/speckit-plan`.

### 026 — Global / Multi-Currency Payroll

- **Roles**: HR/Admin (country/currency assignment, exchange rates)
- **Inputs**: per-employee country/currency assignment; exchange-rate entries
- **Outputs**: correctly localized `Payslip`s per country/currency; a reporting-currency total
- **Depends on (hard)**: 010 (per-country statutory rules), 004 (payroll run it extends)
- **Depends on (soft)**: 015 (each org choosing its own reporting currency independently) —
  "assumed but not detailed" in 026's own Assumptions
- **Primary flow**: see [flows.md § 026](./flows.md#026--global--multi-currency-payroll)
- **Key entities**: `ExchangeRate`, `ReportingCurrencyConfig`; new fields on `Employee`,
  `SalaryStructure`, `Payslip`, `StatutoryComponent`
- **Gaps / TODO**:
  - `TODO`: exchange rates are entered manually per period — no live-rate API integration.
  - `TODO`: same multi-tenant-currency-isolation gap noted in 026's own Assumptions — not
    detailed there, and not re-specified here; treat as implied pending 015 + 026 co-planning.

### 027 — HR Assistant Chatbot

- **Roles**: all (ask questions), HR/Admin (anonymized topic overview)
- **Inputs**: a plain-language question
- **Outputs**: a grounded answer + citation, or an explicit decline; an anonymized topic log
- **Depends on (hard)**: 001 (RBAC scoping applied to every answer)
- **Depends on (soft)**: 003, 004, 010, 008 as grounding sources — "degrades gracefully" if
  absent
- **Primary flow**: see [flows.md § 027](./flows.md#027--hr-assistant-chatbot)
- **Key entities**: `AssistantInteraction` (topic + outcome only — see the anonymity note in
  `schema.prisma`)
- **Gaps / TODO**:
  - `TODO`: **no defined retention/access policy for raw question/answer text.** The spec
    requires the HR-facing aggregate to be anonymized (FR-007) but says nothing about whether
    raw Q&A is logged elsewhere for debugging. This schema deliberately stores neither the raw
    text nor an employeeId, on the theory that "don't collect it" is safer than "collect it and
    promise not to look" — but if implementation needs raw-text debugging logs, that requires
    its own access-restricted table and retention policy, decided explicitly, not inherited from
    this one.
  - `TODO`: read-only/informational only — cannot take actions (file leave, submit a ticket) on
    the employee's behalf in v1.2, by explicit design.

---

## Cross-cutting gaps worth tracking as their own backlog items

Collected from the per-feature `TODO`s above, for visibility:

1. **015's isolation test coverage doesn't yet include 016–027** (the headline gap — see
   `flows.md`).
2. **Rehire vs. unique-email/employeeCode constraint** (002 ↔ 009) — unresolved product
   decision.
3. **Password-reset flow has no spec** — 001 explicitly defers it but no follow-up spec exists.
4. **No consolidated RBAC matrix across all 27 features** — each spec defines its own scoping
   inline; 001's matrix only covers the original five.
5. **013's SSO config isn't explicitly org-scoped in spec text** (only in this schema) — same
   class of gap as #1, smaller blast radius.
6. **020's and 026's own Assumptions each flag an "assumed but not detailed" multi-tenant
   interaction with 015** — both should be re-examined once 015 is actually planned.
