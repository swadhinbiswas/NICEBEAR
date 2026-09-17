import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./lib/test/db";

/** Free model: Stripe tables are gone from fresh migrated DBs. */
describe("migration 0005", () => {
  it("drops subscriptions and invoices", async () => {
    const db = await createTestDb();
    const res = (await db.run(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('subscriptions', 'invoices')`,
    )) as unknown as { rows: unknown[] };
    expect(res.rows).toHaveLength(0);
  });
});
