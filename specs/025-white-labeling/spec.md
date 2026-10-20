# Feature Specification: White-Labeling / Per-Tenant Branding

**Feature Branch**: `025-white-labeling`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Per-tenant logo/branding customization — relevant once Multi-Company/Tenant Activation (015) makes the product genuinely multi-tenant and sellable."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An organization's Admin sets their own logo and brand color (Priority: P1)

An Admin for one organization uploads their company logo and picks a primary brand color, and
every user in that organization sees the app styled with it instead of TeamLoom's default look.

**Why this priority**: This is the entire point of the feature — without at least a logo and a
primary color, there's no perceptible "this is our company's system" experience for a customer
organization.

**Independent Test**: As an Admin in one organization, set a logo and brand color, then sign in
as a different user in that same organization and confirm both appear; sign in as a user in a
different organization and confirm they still see the default (or their own) branding, unaffected.

**Acceptance Scenarios**:

1. **Given** an organization's Admin, **When** they upload a logo and choose a primary color,
   **Then** every user in that organization sees that logo and color applied across the app
   shell (navigation, login page).
2. **Given** two separate organizations, **When** each sets different branding, **Then** neither
   organization's users ever see the other's branding.
3. **Given** an organization that hasn't configured any branding, **When** its users sign in,
   **Then** they see TeamLoom's default branding, not a broken or empty state.

---

### User Story 2 - Branding appears on organization-facing external touchpoints (Priority: P2)

The organization's branding also appears on the surfaces a user sees outside the main app shell
— the login page before signing in, generated payslip PDFs, and (if active) the organization's
public careers page — so the experience feels consistent, not just inside the logged-in app.

**Why this priority**: Extends the branding value to places that matter for a customer's
perceived professionalism (an unbranded payslip or careers page undercuts the whole feature), but
the core in-app branding (P1) already delivers most of the value on its own.

**Independent Test**: Configure branding for an organization, generate a payslip for one of its
employees, and confirm the organization's logo appears on the payslip; visit that organization's
public careers page (if Public Careers Portal, 020, is present) and confirm the branding appears
there too.

**Acceptance Scenarios**:

1. **Given** an organization with configured branding, **When** an unauthenticated user visits
   the login page via that organization's specific entry point, **Then** they see that
   organization's logo before signing in.
2. **Given** an organization with configured branding, **When** a payslip is generated for one of
   its employees, **Then** the organization's logo appears on the payslip document.
3. **Given** an organization with configured branding and a public careers page active, **When**
   anyone visits it, **Then** the organization's logo and brand color are applied there too.

### Edge Cases

- What happens if an uploaded logo is an unsupported file type or exceeds a size limit? The
  upload MUST be rejected with a clear, specific error before it's accepted.
- What happens if a chosen brand color would make text illegible against it (e.g., a very light
  color used where white text is expected)? The system MUST apply a minimum contrast check and
  reject or warn on a color that would fail basic accessibility contrast for its intended use.
- What happens to branding when an organization's data is deleted or the organization is
  deprovisioned (per Multi-Tenant Activation, 015)? Its branding assets MUST be removed along
  with the rest of its data, not orphaned indefinitely.
- What happens for a user who somehow belongs to more than one organization (if that ever
  becomes possible)? v1.2 assumes one user belongs to exactly one organization, consistent with
  Multi-Tenant Activation (015); this edge case doesn't currently arise.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let an organization's Admin upload a logo image for their organization.
- **FR-002**: System MUST let an organization's Admin choose a primary brand color for their
  organization.
- **FR-003**: System MUST apply an organization's configured logo and brand color across that
  organization's app shell (navigation, login) for every user in it.
- **FR-004**: System MUST ensure an organization's branding is never visible to users of a
  different organization, and vice versa.
- **FR-005**: System MUST fall back to TeamLoom's default branding for any organization that has
  not configured its own.
- **FR-006**: System MUST apply an organization's branding to its generated payslip PDFs.
- **FR-007**: System MUST apply an organization's branding to its public careers page, if that
  organization has one active (Public Careers Portal, 020).
- **FR-008**: System MUST reject a logo upload that exceeds a configured size limit or is not an
  accepted image type.
- **FR-009**: System MUST check a chosen brand color against a minimum contrast/accessibility
  threshold for its intended use, rejecting or warning on a color that would fail it.
- **FR-010**: System MUST remove an organization's branding assets when that organization is
  deprovisioned, consistent with Multi-Tenant Activation (015)'s data handling.

### Key Entities

- **Organization branding**: One record per organization — logo image reference and primary
  brand color, applied wherever that organization's users or external touchpoints render.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An Admin can set a logo and brand color for their organization in under 2 minutes.
- **SC-002**: Zero cases, during acceptance testing with multiple organizations configured, of one
  organization's branding appearing to another organization's users.
- **SC-003**: 100% of payslips generated for a branded organization during testing correctly
  display that organization's logo.
- **SC-004**: Zero low-contrast brand colors accepted without a warning during acceptance testing
  of the contrast check.

## Assumptions

- Custom domains (e.g., an organization reaching the app at their own subdomain) are out of scope
  for v1.2; organizations are distinguished by account/login context, not URL.
- Full theme customization beyond logo and one primary color (custom fonts, full color palettes)
  is a reasonable future extension but not required for this pass.
- This feature depends entirely on Multi-Tenant Activation (015) being active — branding
  per-organization has no meaning in a single-tenant deployment — and optionally extends Payroll
  (004) payslips and the Public Careers Portal (020) where those are present.
