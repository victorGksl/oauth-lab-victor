// GET /oauth/login/google  e  GET /oauth/login/github
// O nome do arquivo entre colchetes, [provider], cria um parâmetro dinâmico:
// a parte da URL depois de /oauth/login/ chega em context.params.provider.
//
// Esta rota COMEÇA o login: cria uma transação, grava no D1, cria um cookie
// temporário e redireciona o navegador para a página de login do provedor.

import { buscarProvedor, montarRedirectUri } from "../../_shared/providers.js";
import { gerarValorAleatorio, resumoSha256, agoraEmSegundos } from "../../_shared/crypto.js";
import { criarCookie, COOKIE_TRANSACAO } from "../../_shared/cookies.js";
import { respostaErro } from "../../_shared/http.js";

// A transação vale 10 minutos (600 segundos).
const DURACAO_TRANSACAO = 600;

export async function onRequestGet(context) {
  const { env, params } = context;

  // 1. Aceitar somente google ou github. Qualquer outro nome -> 404.
  const provedor = buscarProvedor(params.provider);
  if (!provedor) {
    return respostaErro(404, "Não encontrado.");
  }

  // 2. Gerar os valores aleatórios da transação.
  const idTransacao = gerarValorAleatorio(); // vai no cookie __Host-oauth-tx
  const state = gerarValorAleatorio(); // vai na URL e volta na URL de retorno
  const codeVerifier = gerarValorAleatorio(); // segredo do PKCE, fica só no servidor
  const nonce = provedor.usaOidc ? gerarValorAleatorio() : null; // só no Google

  // code_challenge = SHA-256 do code_verifier (método S256 do PKCE).
  const codeChallenge = await resumoSha256(codeVerifier);
  const agora = agoraEmSegundos();

  // Limpeza: remove transações que já venceram (ninguém mais pode usá-las).
  await env.DB.prepare("DELETE FROM oauth_transactions WHERE expires_at <= ?")
    .bind(agora)
    .run();

  // Grava a transação. Do cookie e do state guardamos só o RESUMO.
  await env.DB.prepare(
    `INSERT INTO oauth_transactions
       (id_hash, provider, state_hash, nonce, code_verifier, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      await resumoSha256(idTransacao),
      provedor.nome,
      await resumoSha256(state),
      nonce,
      codeVerifier,
      agora + DURACAO_TRANSACAO
    )
    .run();

  // 3. Criar o cookie temporário.
  //    SameSite=Lax (e não Strict) porque a volta do Google/GitHub é uma
  //    navegação vinda de OUTRO site; com Strict o cookie não seria enviado.
  const cookie = criarCookie(COOKIE_TRANSACAO, idTransacao, "Lax", DURACAO_TRANSACAO);

  // 4. Montar o pedido de autorização (a URL da página de login do provedor).
  const url = new URL(provedor.urlAutorizacao);
  url.searchParams.set("client_id", env[provedor.variavelClientId]);
  url.searchParams.set("redirect_uri", montarRedirectUri(env, provedor));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (provedor.usaOidc) {
    // Só no Google. No GitHub omitimos scope e nonce.
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("nonce", nonce);
  }
  // Repare: Client Secret e code_verifier NUNCA entram nesta URL.

  // 5. Responder com redirecionamento 302.
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
    },
  });
}
