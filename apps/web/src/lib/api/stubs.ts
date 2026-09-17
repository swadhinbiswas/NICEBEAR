import type { APIRoute } from "astro";
import { ApiKeyCreateSchema, CollectionCreateSchema, RotationRuleCreateSchema, ScheduleCreateSchema, WebhookCreateSchema } from "@nicebear/shared-types";

async function handle(schema: { safeParse(u: unknown): { success: boolean; error?: { issues: unknown } } }, request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "invalid payload", issues: parsed.error?.issues }, { status: 400 });
  return Response.json({ ok: true, next: "persist in full API slice" }, { status: 202 });
}

export function stubFor(schema: Parameters<typeof handle>[0]): APIRoute {
  return async ({ request }) => handle(schema, request);
}

export const collectionPOST = () => stubFor(CollectionCreateSchema);
export const rotationRulePOST = () => stubFor(RotationRuleCreateSchema);
export const schedulePOST = () => stubFor(ScheduleCreateSchema);
export const apiKeyPOST = () => stubFor(ApiKeyCreateSchema);
export const webhookPOST = () => stubFor(WebhookCreateSchema);
