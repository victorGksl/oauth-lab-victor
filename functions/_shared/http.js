// Respostas HTTP padronizadas.
// Todas usam "Cache-Control: no-store" para que nenhum navegador ou proxy
// guarde uma cópia de erros ou dados de sessão.

// Resposta de erro com uma mensagem curta, sem revelar detalhes internos.
export function respostaErro(status, mensagem) {
  return new Response(mensagem, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// Resposta JSON (usada por /api/me).
export function respostaJson(dados, status = 200) {
  return Response.json(dados, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
