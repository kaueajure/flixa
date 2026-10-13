import { getMatchStreams } from "../../../../lib/streamed-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId || eventId.length > 300) return Response.json({ error: "Evento inválido" }, { status: 400 });
  const result = await getMatchStreams(eventId);
  if (!result) return Response.json({ error: "Evento não encontrado" }, { status: 404 });
  return Response.json(result, {
    status: !result.sources.length && result.errors.length ? 502 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
