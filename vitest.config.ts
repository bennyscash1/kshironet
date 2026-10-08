import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Database-backed suites skip themselves when no connection string is set, so
    // `npm test` stays green on a machine with no database.
    testTimeout: 30_000,
    // Generous, and deliberately so: a database-backed suite's `beforeAll` spends most of
    // its time WAITING for the advisory lock while the other three run, and that wait
    // counts against this timeout. At 30s the suite failed intermittently — three tests
    // red on one run, all green on the next — because queuing was being reported as a
    // hang. A real hang now takes longer to surface, which is the right trade for a
    // deterministic suite.
    hookTimeout: 180_000,
    // Files run in PARALLEL. The database-backed suites, which need exclusive control of
    // global rows, serialise against each other with a transaction-scoped advisory lock
    // instead — see tests/helpers/db-lock.ts. Serialising every file to solve a problem
    // confined to four of them cost ~55s of wall clock.
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
