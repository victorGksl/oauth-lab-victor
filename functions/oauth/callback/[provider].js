// GET /oauth/callback/google  e  GET /oauth/callback/github
// É a URL DE RETORNO: depois que a usuária faz login no provedor, o provedor
// manda o navegador de volta para cá com ?code=...&state=...
//
// Esta rota confere tudo, troca o code por tokens, confirma a identidade
// e, só no final, cria a sessão local.

import { buscarProvedor, montarRedirectUri, CABECALHOS_API_GITHUB } from "../../_shared/providers.js";
import { gerarValorAleatorio, resumoSha256, agoraEmSegundos } from "../../_shared/crypto.js";
import { lerCookie, criarCookie, apagarCookie, COOKIE_TRANSACAO, COOKIE_SESSAO } from "../../_shared/cookies.js";
import { validarIdTokenGoogle } from "../../_shared/oidc.js";
import { respostaErro } from "../../_shared/http.js";

// A sessão dura 8 horas (8 * 60 * 60 = 28800 segundos).
const DURACAO_SESSAO = 28800;

export async function onRequestGet(context) {
  const { request, env, params } = context;

  const provedor = buscarProvedor(params.provider);
  if (!provedor) {
    return respostaErro(404, "Não encontrado.");
  }

  // Qualquer falha lá dentro vira uma resposta 400 genérica.
  // No registro (log) vai só a nossa mensagem curta: nunca code, token ou cookie.
  try {
    return await processarRetorno(request, env, provedor);
  } catch (erro) {
    console.log(`Falha no retorno (${provedor.nome}): ${erro.message}`);
    return respostaErro(400, "Não foi possível concluir o login.");
  }
}

async function processarRetorno(request, env, provedor) {
  const url = new URL(request.url);

  // 1. Recusar "error" ou a falta de code e state.
  if (url.searchParams.has("error")) {
    throw new Error("o provedor devolveu error");
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    throw new Error("code ou state ausente");
  }

  // 2. Exigir o cookie temporário __Host-oauth-tx.
  const idTransacao = lerCookie(request, COOKIE_TRANSACAO);
  if (!idTransacao) {
    throw new Error("cookie de transação ausente");
  }

  // 3. Calcular o resumo do cookie e achar uma transação NÃO expirada
  //    do MESMO provedor.
  const idHash = await resumoSha256(idTransacao);
  const transacao = await env.DB.prepare(
    `SELECT state_hash, nonce, code_verifier
       FROM oauth_transactions
      WHERE id_hash = ? AND provider = ? AND expires_at > ?`
  )
    .bind(idHash, provedor.nome, agoraEmSegundos())
    .first();
  if (!transacao) {
    throw new Error("transação inexistente, expirada ou de outro provedor");
  }

  // 4. Comparar o resumo do state recebido com o resumo guardado.
  if ((await resumoSha256(state)) !== transacao.state_hash) {
    throw new Error("state não confere");
  }

  // 5. Apagar a transação ANTES de continuar: ela só pode ser usada uma vez.
  //    meta.changes diz quantas linhas foram apagadas. Se for 0, outra
  //    requisição já usou esta transação -> recusamos.
  const remocao = await env.DB.prepare("DELETE FROM oauth_transactions WHERE id_hash = ?")
    .bind(idHash)
    .run();
  if (remocao.meta.changes !== 1) {
    throw new Error("transação já utilizada");
  }

  // 6. Trocar o code por tokens, usando o code_verifier e o Client Secret.
  const tokens = await trocarCodigoPorTokens(env, provedor, code, transacao.code_verifier);

  // 7. Confirmar a identidade conforme o contrato de cada provedor.
  let identidade;
  if (provedor.usaOidc) {
    identidade = await validarIdTokenGoogle(tokens.id_token, env.GOOGLE_CLIENT_ID, transacao.nonce);
  } else {
    identidade = await confirmarIdentidadeGithub(env, tokens);
  }

  // 8. Criar a sessão opaca: um valor aleatório no cookie, o resumo no D1.
  const idSessao = gerarValorAleatorio();
  const agora = agoraEmSegundos();
  await env.DB.prepare(
    `INSERT INTO sessions
       (id_hash, issuer, subject, email, display_name, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      await resumoSha256(idSessao),
      identidade.issuer,
      identidade.subject,
      identidade.email,
      identidade.nome,
      agora + DURACAO_SESSAO,
      agora
    )
    .run();

  // 9 e 10. Limpar o cookie temporário, criar o de sessão e voltar ao site.
  //    Usamos Headers.append porque são DOIS cabeçalhos Set-Cookie.
  const headers = new Headers();
  headers.set("Location", `${env.PUBLIC_BASE_URL}/`);
  headers.set("Cache-Control", "no-store");
  headers.append("Set-Cookie", apagarCookie(COOKIE_TRANSACAO, "Lax"));
  headers.append("Set-Cookie", criarCookie(COOKIE_SESSAO, idSessao, "Strict", DURACAO_SESSAO));
  return new Response(null, { status: 302, headers });
}

// Passo 6: POST no ponto de terminação de tokens (token endpoint) do provedor.
// É aqui, e SÓ aqui, que o Client Secret é apresentado.
async function trocarCodigoPorTokens(env, provedor, code, codeVerifier) {
  const corpo = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: montarRedirectUri(env, provedor),
    client_id: env[provedor.variavelClientId],
    client_secret: env[provedor.variavelClientSecret],
    code_verifier: codeVerifier,
  });

  const resposta = await fetch(provedor.urlToken, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json", // sem isso o GitHub responde em outro formato
    },
    body: corpo,
  });

  // Não registramos o corpo enviado nem a resposta completa.
  // No máximo o código de erro (ex.: invalid_grant), que não é segredo.
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok || !dados || dados.error) {
    throw new Error(`troca do código recusada: ${dados?.error ?? resposta.status}`);
  }
  return dados;
}

// Passo 7 no GitHub: usar o access_token só para ler /user e depois revogá-lo.
async function confirmarIdentidadeGithub(env, tokens) {
  // Exigir access_token do tipo Bearer.
  if (!tokens.access_token || String(tokens.token_type).toLowerCase() !== "bearer") {
    throw new Error("resposta do GitHub sem access_token Bearer");
  }

  // Consultar o perfil da conta autenticada.
  const respostaUsuario = await fetch("https://api.github.com/user", {
    headers: {
      ...CABECALHOS_API_GITHUB,
      Authorization: `Bearer ${tokens.access_token}`,
    },
  });
  const usuario = respostaUsuario.status === 200 ? await respostaUsuario.json() : null;

  // Revogar a autorização (sempre, mesmo se /user falhou), para não sobrar
  // nenhum token válido. Autenticação Basic = base64("CLIENT_ID:CLIENT_SECRET").
  const clientId = env.GITHUB_CLIENT_ID;
  const credenciais = btoa(`${clientId}:${env.GITHUB_CLIENT_SECRET}`);
  const respostaRevogacao = await fetch(
    `https://api.github.com/applications/${encodeURIComponent(clientId)}/grant`,
    {
      method: "DELETE",
      headers: {
        ...CABECALHOS_API_GITHUB,
        Authorization: `Basic ${credenciais}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: tokens.access_token }),
    }
  );

  // /user precisa ter respondido 200 com um id inteiro.
  if (!usuario || !Number.isInteger(usuario.id)) {
    throw new Error("perfil do GitHub inválido");
  }
  // A revogação precisa ter respondido 204 antes de criarmos a sessão.
  if (respostaRevogacao.status !== 204) {
    throw new Error("revogação no GitHub não confirmada");
  }

  return {
    issuer: "https://github.com",
    subject: String(usuario.id), // id numérico estável, convertido em texto
    email: usuario.email ?? null, // pode ser null: não pedimos user:email
    nome: usuario.name || usuario.login, // só para exibir
  };
}
