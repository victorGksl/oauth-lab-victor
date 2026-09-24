// Dados fixos de cada provedor de identidade (Google e GitHub).
// Object.freeze impede que alguém altere esses dados durante a execução:
// não existe nenhuma variável global mutável guardando dados de requisições.

const PROVEDORES = Object.freeze({
  google: Object.freeze({
    nome: "google",
    urlAutorizacao: "https://accounts.google.com/o/oauth2/v2/auth",
    urlToken: "https://oauth2.googleapis.com/token",
    variavelClientId: "GOOGLE_CLIENT_ID",
    variavelClientSecret: "GOOGLE_CLIENT_SECRET",
    usaOidc: true, // o Google devolve um id_token (OpenID Connect)
  }),
  github: Object.freeze({
    nome: "github",
    urlAutorizacao: "https://github.com/login/oauth/authorize",
    urlToken: "https://github.com/login/oauth/access_token",
    variavelClientId: "GITHUB_CLIENT_ID",
    variavelClientSecret: "GITHUB_CLIENT_SECRET",
    usaOidc: false, // o GitHub devolve só um access_token (OAuth puro)
  }),
});

// Cabeçalhos exigidos pela API REST do GitHub.
// O GitHub recusa chamadas sem User-Agent, por isso ele está aqui.
export const CABECALHOS_API_GITHUB = Object.freeze({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2026-03-10",
  "User-Agent": "oauth-pages-lab",
});

// Devolve os dados do provedor ou null se o nome não for google nem github.
// Comparamos o nome explicitamente para que valores como "toString"
// (que existem em todo objeto JavaScript) nunca sejam aceitos.
export function buscarProvedor(nome) {
  if (nome === "google" || nome === "github") {
    return PROVEDORES[nome];
  }
  return null;
}

// URL de retorno exata cadastrada no provedor.
// Ex.: https://oauth-aula-equipe-07.pages.dev/oauth/callback/google
export function montarRedirectUri(env, provedor) {
  return `${env.PUBLIC_BASE_URL}/oauth/callback/${provedor.nome}`;
}
