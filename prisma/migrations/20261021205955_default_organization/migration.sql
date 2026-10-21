-- 015 FR-009: the v0.1 single org (orgId "default") becomes organization one of many.
INSERT INTO "Organization" ("id", "name", "status", "createdAt", "slug")
VALUES ('default', 'Default organization', 'ACTIVE', CURRENT_TIMESTAMP, 'default')
ON CONFLICT ("id") DO NOTHING;
