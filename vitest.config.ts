import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "package.json"), "utf-8")
);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      // Only measure coverage on business-logic files we own and test.
      include: [
        "server/config.ts",
        "server/logger.ts",
        "server/auth.ts",
        "server/storage.ts",
        "server/storage/workflowStore.ts",
        "server/storage/userStore.ts",
        "server/storage/clientStore.ts",
        "server/storage/brandStore.ts",
        "server/storage/aliasStore.ts",
        "server/storage/competitorStore.ts",
        "server/storage/clientUserStore.ts",
        "server/routes/index.ts",
        "server/routes/auth.ts",
        "server/routes/workflows.ts",
        "server/routes/clients.ts",
        "server/routes/prompts.ts",
        "server/storage/platformStore.ts",
        "server/storage/promptCollectionStore.ts",
        "server/storage/promptStore.ts",
        "server/storage/runStore.ts",
        "server/storage/responseStore.ts",
        "server/storage/scheduleStore.ts",
        "server/routes/runs.ts",
        "server/adapters/perplexity.ts",
        "server/jobs/runner.ts",
        "shared/schema.ts",
        "client/src/lib/launchUtils.ts",
        "client/src/lib/utils.ts",
      ],
      exclude: ["node_modules/", "dist/"],
    },
    projects: [
      {
        plugins: [react()],
        resolve: {
          alias: {
            "@": path.resolve(import.meta.dirname, "client", "src"),
            "@shared": path.resolve(import.meta.dirname, "shared"),
          },
        },
        test: {
          name: "client",
          globals: true,
          environment: "jsdom",
          setupFiles: ["./tests/setup.ts"],
          include: [
            "client/**/*.{test,spec}.{ts,tsx}",
            "tests/client/**/*.{test,spec}.{ts,tsx}",
          ],
        },
      },
      {
        resolve: {
          alias: {
            "@shared": path.resolve(import.meta.dirname, "shared"),
          },
        },
        test: {
          name: "server",
          environment: "node",
          include: [
            "server/**/*.{test,spec}.ts",
            "tests/server/**/*.{test,spec}.ts",
            "shared/**/*.{test,spec}.ts",
          ],
        },
      },
    ],
  },
});
