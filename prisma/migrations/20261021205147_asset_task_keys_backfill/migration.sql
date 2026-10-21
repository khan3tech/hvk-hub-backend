-- 014: tag the built-in asset tasks created before systemKey existed (data only).
UPDATE "OnboardingTaskTemplate" SET "systemKey" = 'ASSET_ASSIGNMENT' WHERE "systemKey" IS NULL AND "description" = 'Assign laptop and accounts';
UPDATE "OnboardingTask" SET "systemKey" = 'ASSET_ASSIGNMENT' WHERE "systemKey" IS NULL AND "description" = 'Assign laptop and accounts';
UPDATE "ExitTask" SET "systemKey" = 'ASSET_RETURN' WHERE "systemKey" IS NULL AND "description" = 'Collect laptop/assets and revoke system accounts';
