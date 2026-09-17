import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  adminRead,
  adminWrite,
  readBody,
  failure,
  ApiError,
} from "@/lib/tracking-service";
import { adminBridge } from "@/lib/admin-bridge";
export const dynamic = "force-dynamic";
async function identity() {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, "Sign in required");
  return user.userId;
}
function database() {
  if (!env.DB) throw new ApiError(503, "Database unavailable");
  return env.DB;
}
export async function GET(request: Request) {
  try {
    const owner = await identity();
    const remote = await adminBridge(owner, request);
    if (remote) return remote;
    return Response.json(
      await adminRead(
        database(),
        owner,
        new URL(request.url).searchParams.get("employee"),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin)
      throw new ApiError(403, "Same-origin request required");
    const owner = await identity(),
      body = await readBody(request);
    const remote = await adminBridge(owner, request, body);
    if (remote) return remote;
    return Response.json(await adminWrite(database(), owner, body));
  } catch (e) {
    return failure(e);
  }
}
