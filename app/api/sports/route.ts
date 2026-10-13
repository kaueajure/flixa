import { getSportsCatalog } from "../../../lib/streamed-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await getSportsCatalog();
  return Response.json(payload, {
    status: !payload.events.length && payload.errors.length ? 502 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
