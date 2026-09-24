// Funções de criptografia usadas no login.
// Tudo aqui usa a Web Crypto API (o objeto global "crypto"), que já vem
// no ambiente da Cloudflare. Nenhuma biblioteca externa é instalada.

// Converte bytes (Uint8Array) em texto Base64URL SEM o "=" do final.
// Base64URL é o Base64 comum trocando "+" por "-" e "/" por "_",
// para o texto poder ir em URLs e cookies sem problemas.
export function bytesParaBase64Url(bytes) {
  let binario = "";
  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }
  return btoa(binario)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Caminho inverso: texto Base64URL -> bytes.
export function base64UrlParaBytes(texto) {
  let base64 = texto.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}

// Texto Base64URL -> texto normal (UTF-8). Usado para ler as partes do JWT.
export function base64UrlParaTexto(texto) {
  return new TextDecoder().decode(base64UrlParaBytes(texto));
}

// Gera 32 bytes aleatórios seguros e devolve em Base64URL (43 caracteres).
// Serve para: id da transação, state, nonce, code_verifier e id da sessão.
export function gerarValorAleatorio() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesParaBase64Url(bytes);
}

// Calcula o resumo (hash) SHA-256 de um texto e devolve em Base64URL.
// Um resumo não pode ser "desfeito": a partir dele não se descobre o texto original.
export async function resumoSha256(texto) {
  const dados = new TextEncoder().encode(texto);
  const resumo = await crypto.subtle.digest("SHA-256", dados);
  return bytesParaBase64Url(new Uint8Array(resumo));
}

// Horário atual em segundos (o mesmo formato de exp e iat do JWT).
export function agoraEmSegundos() {
  return Math.floor(Date.now() / 1000);
}
