import { listarServidoresDesabilitados } from "../../../../db/player-servers";
import { DEFAULT_DISABLED_PLAYER_SERVER_IDS } from "../../../../lib/player-servers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(
      { disabled: await listarServidoresDesabilitados() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Falha segura: preserva apenas a lista curta revisada no código.
    return Response.json(
      { disabled: [...DEFAULT_DISABLED_PLAYER_SERVER_IDS] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
