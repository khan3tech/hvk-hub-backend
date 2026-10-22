# Quickstart: Validate White-Labeling

```bash
npm run dev && node scripts/e2e/run-all.mjs 025
```

1. HR can't change branding. As Admin:
   - an illegible color (`#FFEB3B`) is rejected;
   - a borderline one warns;
   - a dark one is accepted;
   - an SVG and an oversized PNG are refused;
   - a PNG logo is accepted.

   An employee sees the logo and color. A second organization sees only its own defaults.
2. Signed out, `/api/public/branding/default` and the logo URL return the branding and the
   image; the unbranded org's logo is 404. The careers page header carries the branding.
3. An employee's payslip PDF embeds the logo. Another employee gets 403; HR can download it.
4. Removing the logo deletes the file (404) and PDFs fall back to no logo. Reset returns to the
   defaults.
