// GET /api/health
// Rota de teste: prova que a pasta functions foi reconhecida pelo Pages.
export function onRequestGet() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
