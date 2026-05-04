import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "script/", "tests/setup.ts"],
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
