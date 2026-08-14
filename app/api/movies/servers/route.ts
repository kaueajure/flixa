import { listarServidoresDesabilitados } from "../../../../db/player-servers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(
      { disabled: await listarServidoresDesabilitados() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Falha aberta: um problema no controle não deve retirar todo o player.
    return Response.json({ disabled: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
