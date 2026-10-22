# Contract: Referrals (`/api/referrals`) — authenticated

| Method & path | Roles | Notes |
|---|---|---|
| POST `/` | active employee | multipart `postingId, name, email, phone?, file (PDF/DOCX)` → 201 referral (`IN_PIPELINE`); 409 duplicate / not open; 400 self-referral |
| GET `/me` | any | own referrals: `{status, stage, bonusAmount, qualifyingDays, hiredAt, qualifyingUntil, paidAt, candidateName, postingTitle}` |
| GET `/config` | any | `{bonusAmount, qualifyingDays, effectiveFrom, configured}` |
| PUT `/config` | ADMIN, HR | `{bonusAmount ≥ 0, qualifyingDays ≥ 0}` — new referrals only |
| GET `/?status` | ADMIN, HR | plus `referrerActive`, `hireEmployeeId`, `applicationId`, `payrollPeriod` |
| POST `/:id/link-hire` | ADMIN, HR | `{employeeId}` when emails differ |
| POST `/:id/schedule-payout` | ADMIN, HR | `{periodMonth, periodYear}`; 409 `NOT_PAYABLE` |

Status flow: IN_PIPELINE → PENDING (hired) → PAYABLE → PAID, or FORFEITED (hire left early), or
CLOSED_NO_BONUS (rejected). The payslip shows the bonus as earning `Referral bonus (<candidate>)`.
