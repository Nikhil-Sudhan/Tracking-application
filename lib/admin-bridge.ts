import { env } from "cloudflare:workers";
import { ApiError } from "./tracking-service";
export async function adminBridge(
  owner: string,
  request: Request,
  body?: Record<string, unknown>,
): Promise<Response | null> {
  if (!env.TRACKING_API_URL && !env.TRACKING_SERVICE_TOKEN) return null;
  if (
    !env.TRACKING_API_URL ||
    !env.TRACKING_SERVICE_TOKEN ||
    env.TRACKING_SERVICE_TOKEN.length < 64
  )
    throw new ApiError(503, "The tracking backend is not fully configured.");
  const origin = new URL(env.TRACKING_API_URL);
  if (origin.protocol !== "https:" || origin.username || origin.password)
    throw new ApiError(503, "Invalid tracking backend address");
  const target = new URL("/internal/admin", origin);
  const employee = new URL(request.url).searchParams.get("employee");
  if (employee) target.searchParams.set("employee", employee);
  const response = await fetch(target, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + env.TRACKING_SERVICE_TOKEN,
      "x-workspace-owner": owner,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
