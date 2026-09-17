import { describe, expect, it } from "vitest";
import { WebhookCreateSchema, WebhookEventSchema } from "./index";

/**
 * Free-forever model: no Stripe, no billing events. The event enum is the
 * contract — removed events must be rejected, everything else accepted.
 */
describe("free model: no billing events", () => {
  it("rejects the removed Stripe events", () => {
    for (const event of ["subscription.updated", "billing.updated"]) {
      expect(WebhookEventSchema.safeParse(event).success, event).toBe(false);
      expect(
        WebhookCreateSchema.safeParse({
          url: "https://example.com/hook",
          secret: "sixteen-chars-min",
          events: [event],
        }).success,
        event,
      ).toBe(false);
    }
  });

  it("still accepts every live event", () => {
    for (const event of WebhookEventSchema.options) {
      expect(WebhookEventSchema.safeParse(event).success, event).toBe(true);
    }
    expect(WebhookEventSchema.options).not.toContain("subscription.updated");
    expect(WebhookEventSchema.options).not.toContain("billing.updated");
  });
});
