# Contract: Branding

Branding object: `{organizationName, slug, productName, primaryColor, onPrimaryColor, contrastRatio, logoUrl|null, isDefault}`.

## `/api/branding` (authenticated, own organization)

| Method & path | Who | Notes |
|---|---|---|
| GET `/` | any | branding (defaults when unset) |
| PUT `/color` | Admin | `{primaryColor: "#RRGGBB"}` → branding + `warnings[]`; < 3:1 vs white → 400 `LOW_CONTRAST` |
| POST `/logo` | Admin | multipart `file`, PNG/JPEG ≤ 512 KB → branding; 415 type, 413 size |
| DELETE `/logo` | Admin | removes the logo file |
| DELETE `/` | Admin | reset to defaults |

## `/api/public/branding` (no authentication)

| GET `/:org` | branding for the org slug (active orgs only, else 404) |
|---|---|
| GET `/:org/logo` | the logo image; 404 when none |

## Other modules

- `GET /api/payroll/payslips/me/:id/pdf` (owner) and `GET /api/payroll/payslips/:id/pdf`
  (Admin/HR) return `application/pdf` with the org's logo and color.
- `GET /api/public/careers/:org` returns `{organizationName, branding, openRoles}`.
