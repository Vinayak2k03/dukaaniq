import "server-only";
import type { z } from "zod";
import { getApiMerchantAccess } from "@/server/merchant/access";

type Access = Exclude<Awaited<ReturnType<typeof getApiMerchantAccess>>, { error: Response }>;

/** Same-origin check for browser writes (a missing Origin header is allowed for non-browser clients). */
export const badOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return origin !== null && origin !== new URL(request.url).origin;
};

/**
 * Shared guard for JSON write Route Handlers: authentication, verified membership (merchant never taken from the
 * request), optional OWNER role, same origin, JSON content type and Zod validation of the body.
 */
export async function jsonWrite<S extends z.ZodType>(request: Request, schema: S, opts: { ownerOnly?: boolean } = {}): Promise<{ error: Response } | { access: Access; body: z.infer<S> }> {
  const access = await getApiMerchantAccess();
  if ("error" in access) return { error: access.error as Response };
  if (opts.ownerOnly && access.role !== "OWNER") return { error: Response.json({ error: "Only the shop owner can do this." }, { status: 403 }) };
  if (badOrigin(request)) return { error: Response.json({ error: "Invalid origin" }, { status: 403 }) };
  if (!request.headers.get("content-type")?.includes("application/json")) return { error: Response.json({ error: "Send JSON" }, { status: 415 }) };
  const raw: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) return { error: Response.json({ error: "Invalid input", fieldErrors: (parsed.error as z.ZodError).flatten().fieldErrors }, { status: 400 }) };
  return { access, body: parsed.data };
}

export const actorOf = (access: Access) => ({ userId: access.session.user.id });
