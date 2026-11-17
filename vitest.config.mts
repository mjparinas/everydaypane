import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Logic tests run in node; component tests opt in to jsdom with `// @vitest-environment jsdom` (as in Liftsmith).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/empty.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: { provider: "v8", include: ["src/**"], exclude: ["**/*.test.{ts,tsx}", "src/test/**"], reporter: ["text-summary"] },
  },
});
