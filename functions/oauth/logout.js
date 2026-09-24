// POST /oauth/logout
// Encerra a sessão LOCAL (apaga a linha no D1 e expira o cookie).
// Não encerra a sessão da usuária no Google nem no GitHub.

import { lerCookie, apagarCookie, COOKIE_SESSAO } from "../_shared/cookies.js";
import { resumoSha256 } from "../_shared/crypto.js";
import { respostaErro } from "../_shared/http.js";

// onRequest recebe QUALQUER método; assim conseguimos recusar os que não são POST.
export async function onRequest(context) {
  const { request, env } = context;

  // 1. Aceitar somente POST.
  if (request.method !== "POST") {
    return respostaErro(405, "Método não permitido.");
  }

  // 2. Exigir que o cabeçalho Origin seja exatamente o nosso site.
  //    Isso impede que outro site (ex.: https://example.com) derrube a sessão.
  if (request.headers.get("Origin") !== env.PUBLIC_BASE_URL) {
    return respostaErro(403, "Origem não permitida.");
  }

  // 3. Remover a linha da sessão no D1 (se houver cookie).
  const idSessao = lerCookie(request, COOKIE_SESSAO);
  if (idSessao) {
    const idHash = await resumoSha256(idSessao);
    await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?")
      .bind(idHash)
      .run();
  }

  // 4 e 5. Expirar o cookie, responder com no-store e voltar para a página inicial.
  //    303 = "veja outra página"; faz o navegador abrir a página inicial com GET.
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${env.PUBLIC_BASE_URL}/`,
      "Set-Cookie": apagarCookie(COOKIE_SESSAO, "Strict"),
      "Cache-Control": "no-store",
    },
  });
}
