import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { startScheduler } from "./lib/scheduler.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  logger.info({ port }, "TeamLoom API listening");
  startScheduler();
});
