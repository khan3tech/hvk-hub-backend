import { logger } from "./logger.js";

// Minimal in-process periodic jobs (e.g. 009's "last working day passed" prompt). Jobs must be
// idempotent — they may run on several instances or re-run after a restart. Started only from
// server.ts, never in tests. A real queue (BullMQ) stays out of scope (constitution VII).
type Job = { name: string; everyMs: number; run: () => Promise<void> };
const jobs: Job[] = [];

export function registerJob(name: string, everyMs: number, run: () => Promise<void>): void {
  jobs.push({ name, everyMs, run });
}

export function startScheduler(): void {
  for (const job of jobs) {
    const tick = () =>
      job.run().catch((err) => logger.error({ err, job: job.name }, "scheduled job failed"));
    setTimeout(tick, 5_000).unref();
    setInterval(tick, job.everyMs).unref();
  }
}
