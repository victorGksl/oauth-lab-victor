// Funções para ler e criar cookies.

// Nomes dos dois cookies do projeto.
// O prefixo "__Host-" obriga o navegador a aceitar o cookie só se ele tiver
// Secure, Path=/ e NÃO tiver Domain. Assim ele fica preso a este hospedeiro exato.
export const COOKIE_TRANSACAO = "__Host-oauth-tx";
export const COOKIE_SESSAO = "__Host-session";

// Lê um cookie do cabeçalho "Cookie" da requisição.
// O cabeçalho chega assim: "nome1=valor1; nome2=valor2".
// Devolve null quando o cookie não existe.
export function lerCookie(request, nome) {
  const cabecalho = request.headers.get("Cookie");
  if (!cabecalho) {
    return null;
  }
  for (const parte of cabecalho.split(";")) {
    const [chave, ...resto] = parte.trim().split("=");
    if (chave === nome) {
      return resto.join("=") || null;
    }
  }
  return null;
}

// Monta o texto do cabeçalho Set-Cookie.
//   HttpOnly -> o JavaScript da página não consegue ler o cookie
//   Secure   -> o cookie só viaja por HTTPS
//   SameSite -> controla se o cookie vai em requisições vindas de outros sites
//   Max-Age  -> quantos segundos o cookie dura
export function criarCookie(nome, valor, sameSite, maxAge) {
  return `${nome}=${valor}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${maxAge}`;
}

// Para apagar um cookie, mandamos o mesmo cookie vazio com Max-Age=0.
export function apagarCookie(nome, sameSite) {
  return criarCookie(nome, "", sameSite, 0);
}
