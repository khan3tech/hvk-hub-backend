# Feature Specification: Interactive Org Chart

**Feature Branch**: `016-org-chart-visualization`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "A company-wide visual org chart people can explore, instead of only the per-employee manager/direct-reports mini view that Employee Management (002) already has."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Anyone explores the company org chart (Priority: P1)

Any authenticated user opens a visual chart of the company's reporting structure and can expand
or collapse branches to explore teams other than their own, scoped to what their role can see.

**Why this priority**: This is the entire point of the feature — turning reporting-line data
that already exists (002) into something explorable rather than one profile at a time.

**Independent Test**: With a multi-level reporting structure populated, open the org chart as
each role and confirm the visible nodes match that role's directory-visibility scope from
Employee Management (002).

**Acceptance Scenarios**:

1. **Given** a company with several reporting levels, **When** any authenticated user opens the
   org chart, **Then** they see a visual tree rooted at the top of the company, matching current
   reporting lines.
2. **Given** the org chart, **When** a user clicks a node with direct reports, **Then** that
   branch expands to show them, and can be collapsed again.
3. **Given** an Employee (not HR/Admin/their own manager chain), **When** they view the chart,
   **Then** they see names, titles, and departments but not restricted fields like salary,
   consistent with Employee Management (002)'s directory scoping.
4. **Given** a Manager, **When** they view the chart, **Then** their own position and the parts of
   the tree connecting to it are easy to locate (e.g., highlighted or auto-centered).

---

### User Story 2 - User searches the org chart for a specific person (Priority: P1)

A user searches by name and jumps directly to that person's position in the chart, with the path
back to the top expanded automatically, instead of manually expanding branch by branch.

**Why this priority**: In any company beyond a handful of people, browsing branch-by-branch to
find one person is impractical — search is what makes the chart usable at real scale.

**Independent Test**: Search for an employee several levels deep in the hierarchy and confirm the
chart auto-expands and scrolls to their node.

**Acceptance Scenarios**:

1. **Given** the org chart open, **When** a user searches by name, **Then** matching employees
   are suggested as they type.
2. **Given** a search result several levels deep, **When** the user selects it, **Then** the
   chart expands every ancestor branch needed to reveal that node and scrolls it into view.
3. **Given** a search with no matches, **When** the user finishes typing, **Then** they see a
   clear "no results" state rather than an empty chart.

---

### User Story 3 - HR/Admin spots structural issues from the chart (Priority: P2)

HR/Admin can see, from the same chart, anyone with no assigned manager (other than the intended
top of the company) or any department with no head, so structural gaps are visible rather than
hidden inside individual records.

**Why this priority**: A useful-but-secondary HR data-quality capability that depends on P1's
chart already existing to visualize against; not required for the chart to deliver its core
browsing value.

**Independent Test**: Create one employee with no manager assigned (not intended as the company
top) and confirm HR/Admin's chart view flags them distinctly from a normal root node.

**Acceptance Scenarios**:

1. **Given** an employee with no manager assigned who isn't configured as the company's top
   position, **When** HR/Admin views the chart, **Then** that employee is visually flagged as an
   orphaned node.
2. **Given** a department with no head assigned, **When** HR/Admin views a department-level
   summary, **Then** that department is flagged as headless.
3. **Given** a non-HR/Admin user, **When** they view the chart, **Then** they do not see these
   structural-gap flags — this is an HR/Admin-only overlay.

### Edge Cases

- What happens with a very large company (hundreds or thousands of employees)? The chart MUST
  render collapsed by default beyond a shallow depth (e.g., only direct reports of the top few
  levels expanded), so initial load stays fast regardless of company size.
- What happens when an employee has no direct reports? Their node MUST render as a leaf with no
  expand affordance, not an empty/broken expand control.
- What happens if the reporting-line data itself contains a cycle (e.g., through a data error)?
  The system MUST detect and refuse to render an infinite loop, instead flagging the cycle to
  HR/Admin for correction.
- How does the chart handle an employee who is offboarded? Offboarded employees MUST NOT appear
  in the default chart view; their former direct reports, if not yet reassigned, appear as
  temporarily manager-less per the orphaned-node handling above.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render a company-wide org chart from existing Employee Management (002)
  reporting-line data, requiring no separate data entry.
- **FR-002**: System MUST let a user expand and collapse individual branches of the chart.
- **FR-003**: System MUST scope visible employee detail on the chart to the same rules as the
  Employee Management (002) directory (self/team/all, by role).
- **FR-004**: System MUST provide a name search that locates an employee anywhere in the chart and
  auto-expands the path to reveal them.
- **FR-005**: System MUST exclude offboarded employees from the default chart view.
- **FR-006**: System MUST render large hierarchies collapsed beyond a shallow default depth so
  initial load time does not scale with total company size.
- **FR-007**: System MUST detect a reporting-line cycle and refuse to render it as an infinite
  loop, instead flagging it for correction.
- **FR-008**: System MUST let HR/Admin see an overlay flagging employees with no assigned manager
  (other than an intended company-top position) and departments with no assigned head.
- **FR-009**: System MUST keep the chart's data current with the underlying Employee Management
  records — no separate, independently-editable copy of reporting-line data is introduced by this
  feature.

### Key Entities

This feature introduces no new data of its own — it is a visualization over Employee Management
(002)'s existing Employee, Department, and reporting-line (`managerId`) data, plus one
HR/Admin-only overlay concept:

- **Structural gap flag**: A derived, not stored, indicator — an employee with no manager (not
  the designated top position) or a department with no head.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can locate any specific employee in a chart of at least 500 people, via
  search, in under 10 seconds.
- **SC-002**: Initial chart load time does not measurably increase as total company size grows,
  verified by testing against both a small and a large seeded hierarchy.
- **SC-003**: Zero cases, during acceptance testing, of a reporting-line cycle causing a hang or
  crash — 100% are caught and flagged instead.
- **SC-004**: HR/Admin can identify every orphaned employee and headless department in the company
  from a single chart view, with zero missed cases during testing.

## Assumptions

- This feature is read-only — reassigning a manager or department head is still done through
  Employee Management (002)'s existing edit flow, not from within the chart itself, for v1.2.
- Printing/exporting the chart as an image or PDF is a nice-to-have, not a functional requirement,
  for this pass.
- Depends entirely on Employee Management (002) for its data and Authentication & RBAC (001) for
  its visibility scoping; introduces no new tables beyond what those two already provide.
