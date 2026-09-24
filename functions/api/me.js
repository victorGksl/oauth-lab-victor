// GET /api/me
// Descobre quem está logado a partir do cookie __Host-session.
// Responde 401 quando não há sessão válida.

import { lerCookie, COOKIE_SESSAO } from "../_shared/cookies.js";
import { resumoSha256, agoraEmSegundos } from "../_shared/crypto.js";
import { respostaErro, respostaJson } from "../_shared/http.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  const idSessao = lerCookie(request, COOKIE_SESSAO);
  if (!idSessao) {
    return respostaErro(401, "Sem sessão.");
  }

  // O banco não guarda o valor do cookie, só o resumo SHA-256 dele.
  const idHash = await resumoSha256(idSessao);

  // "?" + bind() = consulta preparada. O valor nunca é colado no texto do SQL,
  // o que impede SQL injection.
  const sessao = await env.DB.prepare(
    `SELECT issuer, email, display_name
       FROM sessions
      WHERE id_hash = ? AND expires_at > ?`
  )
    .bind(idHash, agoraEmSegundos())
    .first();

  if (!sessao) {
    return respostaErro(401, "Sem sessão.");
  }

  // Perfil mínimo: só o necessário para a página mostrar quem está logado.
  return respostaJson({
    issuer: sessao.issuer,
    displayName: sessao.display_name,
    email: sessao.email,
  });
}
