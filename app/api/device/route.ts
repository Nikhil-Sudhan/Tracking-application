import { env } from "cloudflare:workers";
import {
  deviceIdentity,
  deviceRead,
  deviceWrite,
  readBody,
  failure,
  ApiError,
} from "@/lib/tracking-service";
export const dynamic = "force-dynamic";
async function context(request: Request) {
  if (!env.DB) throw new ApiError(503, "Database unavailable");
  return {
    db: env.DB,
    employee: await deviceIdentity(
      env.DB,
      request.headers.get("authorization"),
    ),
  };
}
export async function GET(request: Request) {
  try {
    const { db, employee } = await context(request);
    return Response.json(await deviceRead(db, employee), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { db, employee } = await context(request);
    return Response.json(
      await deviceWrite(db, employee, await readBody(request)),
    );
  } catch (e) {
    return failure(e);
  }
}
