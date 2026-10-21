import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests deliberately exercise failure paths that log warnings/errors; keep output clean.
    env: { LOG_LEVEL: "silent" },
  },
});
