-- CreateEnum
CREATE TYPE "AttendanceSessionKind" AS ENUM ('WORK', 'BREAK');

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "breakMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "workedMinutes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AttendanceSession" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "kind" "AttendanceSessionKind" NOT NULL DEFAULT 'WORK',
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3),
    "autoClosed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceSession_attendanceId_idx" ON "AttendanceSession"("attendanceId");

-- CreateIndex
CREATE INDEX "AttendanceSession_employeeId_checkOut_idx" ON "AttendanceSession"("employeeId", "checkOut");

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Backfill: every existing day with a check-in becomes one WORK session, so history keeps its
-- worked time. A past day with no check-out is closed at 23:59:59 India time of that day
-- (marked autoClosed), matching the new end-of-day rule; only today's may stay open.
INSERT INTO "AttendanceSession" ("id", "orgId", "employeeId", "attendanceId", "kind", "checkIn", "checkOut", "autoClosed")
SELECT
  gen_random_uuid()::text, a."orgId", a."employeeId", a."id", 'WORK', a."checkIn",
  COALESCE(
    a."checkOut",
    CASE WHEN a."date" < (now() AT TIME ZONE 'Asia/Kolkata')::date
      THEN ((a."date" + time '23:59:59') AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC'
    END
  ),
  (a."checkOut" IS NULL AND a."date" < (now() AT TIME ZONE 'Asia/Kolkata')::date)
FROM "Attendance" a
WHERE a."checkIn" IS NOT NULL;

UPDATE "Attendance" a
SET "workedMinutes" = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (s."checkOut" - s."checkIn")) / 60))::int
FROM "AttendanceSession" s
WHERE s."attendanceId" = a."id" AND s."checkOut" IS NOT NULL;

-- At most one open session (checkOut IS NULL) per employee: a double-click can't open two.
CREATE UNIQUE INDEX "AttendanceSession_one_open_per_employee" ON "AttendanceSession"("employeeId") WHERE "checkOut" IS NULL;
