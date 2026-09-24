// Validação do id_token do Google (OpenID Connect), sem bibliotecas externas.
//
// Um id_token é um JWT: três partes em Base64URL separadas por ponto.
//   CABEÇALHO . CONTEÚDO . ASSINATURA
// O cabeçalho diz qual algoritmo e qual chave assinaram.
// O conteúdo traz as "claims": quem emitiu (iss), para quem (aud), quem é a
// pessoa (sub), quando vence (exp) etc.
// A assinatura prova que foi o Google quem gerou o token e que nada foi alterado.

import { base64UrlParaBytes, base64UrlParaTexto, agoraEmSegundos } from "./crypto.js";

const EMISSOR_GOOGLE = "https://accounts.google.com";
const URL_DESCOBERTA = `${EMISSOR_GOOGLE}/.well-known/openid-configuration`;

// Tolerância para pequenas diferenças de relógio entre servidores (5 minutos).
const TOLERANCIA_RELOGIO = 300;

export async function validarIdTokenGoogle(idToken, clientId, nonceEsperado) {
  // 1. Separar as três partes do JWT e recusar qualquer outro formato.
  if (typeof idToken !== "string") {
    throw new Error("id_token ausente");
  }
  const partes = idToken.split(".");
  if (partes.length !== 3) {
    throw new Error("id_token com formato inválido");
  }
  const [cabecalhoB64, conteudoB64, assinaturaB64] = partes;

  // 2. Ler o cabeçalho e exigir o algoritmo RS256.
  const cabecalho = JSON.parse(base64UrlParaTexto(cabecalhoB64));
  if (cabecalho.alg !== "RS256") {
    throw new Error("algoritmo do id_token não é RS256");
  }

  // 3. Buscar o documento de descoberta OIDC do emissor esperado.
  const respostaDescoberta = await fetch(URL_DESCOBERTA);
  if (!respostaDescoberta.ok) {
    throw new Error("documento de descoberta indisponível");
  }
  const descoberta = await respostaDescoberta.json();
  if (descoberta.issuer !== EMISSOR_GOOGLE) {
    throw new Error("emissor inesperado na descoberta");
  }

  // 4. Buscar o conjunto de chaves públicas (JWKS) indicado em jwks_uri.
  const respostaChaves = await fetch(descoberta.jwks_uri);
  if (!respostaChaves.ok) {
    throw new Error("JWKS indisponível");
  }
  const jwks = await respostaChaves.json();

  // 5. Escolher a chave pública cujo "kid" é igual ao do cabeçalho.
  const jwk = jwks.keys.find((chave) => chave.kid === cabecalho.kid);
  if (!jwk) {
    throw new Error("chave do id_token não encontrada");
  }

  // 6. Importar a chave pública para a Web Crypto.
  const chavePublica = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // 7. Verificar a assinatura. O que foi assinado é o texto "CABEÇALHO.CONTEÚDO".
  const assinaturaValida = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    chavePublica,
    base64UrlParaBytes(assinaturaB64),
    new TextEncoder().encode(`${cabecalhoB64}.${conteudoB64}`)
  );
  if (!assinaturaValida) {
    throw new Error("assinatura do id_token inválida");
  }

  // 8. Só agora que a assinatura é válida confiamos no conteúdo.
  //    Validamos iss, aud, exp, iat e nonce ANTES de usar sub, nome e e-mail.
  const dados = JSON.parse(base64UrlParaTexto(conteudoB64));
  const agora = agoraEmSegundos();

  if (dados.iss !== EMISSOR_GOOGLE && dados.iss !== "accounts.google.com") {
    throw new Error("emissor (iss) inválido");
  }
  if (dados.aud !== clientId) {
    throw new Error("audiência (aud) inválida");
  }
  if (typeof dados.exp !== "number" || dados.exp <= agora) {
    throw new Error("id_token expirado (exp)");
  }
  if (typeof dados.iat !== "number" || dados.iat > agora + TOLERANCIA_RELOGIO) {
    throw new Error("data de emissão (iat) inválida");
  }
  if (!nonceEsperado || dados.nonce !== nonceEsperado) {
    throw new Error("nonce não confere");
  }
  if (typeof dados.sub !== "string" || dados.sub === "") {
    throw new Error("sub ausente");
  }

  return {
    issuer: EMISSOR_GOOGLE,
    subject: dados.sub,
    // Só mostramos o e-mail se o próprio Google disser que ele foi verificado.
    email: dados.email_verified === true ? dados.email : null,
    nome: dados.name ?? null,
  };
}
