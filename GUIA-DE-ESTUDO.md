> Estado atual do projeto e o que falta fazer: veja README.md. Histórico e decisões: veja CONTEXTO.md.

# Guia de estudo: login com Google e GitHub no Cloudflare Pages

Este guia explica o projeto `oauth-pages-lab` do começo ao fim. A ideia é que, depois de ler, você consiga abrir qualquer arquivo na frente do professor e explicar cada linha, e também responder "por quê?" para cada decisão de segurança.

Ordem sugerida de estudo:

1. Parte 1: o projeto em 1 minuto (decore este resumo)
2. Parte 2: glossário (todos os termos)
3. Parte 3: o fluxo completo, passo a passo
4. Parte 4: arquivo por arquivo
5. Parte 5: os testes de falha e qual linha do código recusa cada um
6. Parte 6: perguntas prováveis do professor, com respostas
7. Parte 7: roteiro de configuração (painéis)

---

## Parte 1: o projeto em 1 minuto

> "Meu site é uma página estática publicada no Cloudflare Pages. No mesmo projeto existem Pages Functions, que são pequenos programas em JavaScript rodando no servidor da Cloudflare. Quando a pessoa clica em 'Entrar com Google' ou 'Entrar com GitHub', uma Function cria uma **transação** (com `state`, `code_verifier` e, no Google, `nonce`), guarda no banco D1 e manda o navegador para o provedor. O provedor devolve um **código de autorização** na URL de retorno. Outra Function confere o cookie temporário e o `state`, apaga a transação, troca o código por tokens usando o **Client Secret** e o **PKCE**, confirma a identidade (no Google validando a assinatura do `id_token`; no GitHub consultando `/user` e depois revogando o token) e cria uma **sessão opaca**: um número aleatório no cookie `__Host-session`, e só o resumo SHA-256 dele no banco. A rota `/api/me` usa esse cookie para dizer quem está logado, e `/oauth/logout` apaga a sessão. O navegador nunca recebe tokens nem segredos."

---

## Parte 2: glossário

### 2.1 Identidade e acesso

| Termo | O que é | Onde aparece no projeto |
|---|---|---|
| **Autenticação** | Provar **quem** a pessoa é. | Feita pelo Google ou GitHub. Nós só conferimos a prova. |
| **Autorização** | Decidir **o que** a pessoa pode fazer. | Neste lab é mínima: ter sessão já basta para ver `/api/me`. |
| **Conta local** | O registro da pessoa **no nosso sistema**, identificada por `issuer` + `subject`. | Colunas `issuer` e `subject` da tabela `sessions`. |
| **Autorização local** | Regras do nosso próprio sistema (ex.: "é admin?"). Nunca por comparação de nome ou e-mail. | O roteiro proíbe dar privilégios comparando nome/login/e-mail. |
| **Sessão** | O "estou logado" que dura um tempo depois do login, para não precisar logar a cada clique. | Tabela `sessions` + cookie `__Host-session` (8 horas). |
| **Sessão opaca** | O cookie é só um número aleatório, sem nenhuma informação dentro. O significado dele está no servidor. | `gerarValorAleatorio()` em `crypto.js`. |
| **Revogação** | Invalidar algo antes do prazo. | Logout apaga a linha no D1; GitHub revoga o grant. |
| **Provedor de identidade (IdP)** | Quem autentica a pessoa. | Google e GitHub. |
| **issuer (emissor)** | Quem emitiu a identidade. | `https://accounts.google.com` ou `https://github.com`. |
| **subject (sujeito)** | Identificador único e estável da pessoa **dentro** daquele emissor. | Google: `sub`. GitHub: `id` numérico convertido em texto. |

Por que `issuer` + `subject` e não o e-mail? Porque o e-mail pode mudar, pode ser nulo (GitHub) e duas contas em provedores diferentes podem ter o mesmo e-mail. O par emissor+sujeito nunca se repete.

### 2.2 OAuth 2.0 e OpenID Connect

| Termo | O que é |
|---|---|
| **OAuth 2.0** | Protocolo para uma aplicação obter permissão (um *access token*) de acessar algo em nome da pessoa. Originalmente é de **autorização**, não de login. |
| **OpenID Connect (OIDC)** | Uma camada sobre o OAuth 2.0 que adiciona **login**: além do access token, o provedor entrega um `id_token` que diz quem é a pessoa. O Google usa OIDC; o GitHub (OAuth App) não. |
| **Cliente** | A nossa aplicação, que pede o login ao provedor. |
| **Cliente confidencial** | Cliente que consegue guardar um segredo (roda em servidor). É o nosso caso: a Pages Function. |
| **Cliente público** | Cliente que **não** consegue guardar segredo (app no navegador, app de celular). Tudo nele pode ser lido pela pessoa. |
| **Client ID** | Identificador público da nossa aplicação no provedor. Pode aparecer na URL. |
| **Client Secret** | Senha da nossa aplicação no provedor. **Nunca** vai para o navegador, para o GitHub ou para prints. Só é usada na troca de tokens. |
| **Authorization Code Flow** (fluxo do código de autorização) | O fluxo usado aqui: o provedor devolve um `code` de uso único pela URL, e o servidor troca esse `code` por tokens num pedido direto, servidor-a-servidor. |
| **Pedido de autorização** | A URL para onde mandamos o navegador (página de login do provedor), com `client_id`, `redirect_uri`, `response_type=code`, `state`, `code_challenge`... |
| **`response_type=code`** | Diz ao provedor: "me devolva um código, não um token". |
| **`redirect_uri` / URL de retorno / callback** | Para onde o provedor manda o navegador de volta. Tem que ser **exatamente** igual à cadastrada no provedor, senão dá `redirect_uri_mismatch`. |
| **`code` (código de autorização)** | Valor de uso único e curta duração que vem na URL de retorno. Sozinho não serve para nada: precisa do Client Secret e do `code_verifier`. |
| **Token endpoint** (ponto de terminação de tokens) | Endereço do provedor onde trocamos o `code` por tokens (`POST`). |
| **`scope` (escopo)** | O que estamos pedindo. Google: `openid email profile`. GitHub: nenhum (só perfil público). Não pedimos `repo`, `user:email` nem `offline_access`. |
| **access_token** | "Chave" para chamar a API do provedor em nome da pessoa. No GitHub usamos só para `GET /user` e depois revogamos. |
| **refresh_token** | Token para conseguir novos access tokens sem nova autorização. Não guardamos. |
| **id_token** | Token do OIDC (um JWT) que diz quem é a pessoa. Só o Google envia. |
| **Bearer** | Tipo de token: "quem porta, usa". Vai no cabeçalho `Authorization: Bearer <token>`. |
| **Grant** | A autorização que a pessoa deu à nossa OAuth App no GitHub. Revogamos com `DELETE /applications/{client_id}/grant`. |
| **OAuth App vs GitHub App** | Dois tipos de app no GitHub. O GitHub recomenda GitHub App para produção (permissões finas); o lab usa OAuth App porque só precisamos identificar a conta. |
| **Device Flow** | Fluxo para aparelhos sem navegador (TV). Fica desativado. |
| **Tela de consentimento** | Tela do Google "O app X quer acessar...". Fica em modo **teste**, com as contas da dupla como usuárias de teste. |

### 2.3 Os três valores de proteção: state, nonce e PKCE

| Valor | Protege contra | Como funciona no código |
|---|---|---|
| **`state`** | **CSRF no login** (alguém fazer seu navegador terminar um login que **ele** começou, te logando na conta dele) e respostas trocadas. | Aleatório, vai na URL de ida, volta na URL de retorno. Guardamos o **resumo** no D1 e comparamos. |
| **`nonce`** | **Replay de id_token** (reaproveitar um id_token antigo ou de outro login). | Aleatório, vai na URL de ida para o Google, volta **dentro** do id_token assinado. Comparamos com o valor do D1. Só no Google, porque o GitHub não emite id_token. |
| **PKCE** (Proof Key for Code Exchange, RFC 7636) | **Roubo do `code`**: se alguém interceptar o código, não consegue trocá-lo. | Geramos o `code_verifier` (segredo, fica no D1). Mandamos na ida só o `code_challenge` = SHA-256 do verifier. Na troca, mandamos o verifier; o provedor calcula o SHA-256 e confere. |
| **`code_verifier`** | É o segredo do PKCE. | 43 caracteres aleatórios. Fica no D1 (precisa ser enviado cru na troca, por isso não é resumo). |
| **`code_challenge`** | Versão "trancada" do verifier que pode ir pela URL. | `resumoSha256(codeVerifier)`. |
| **`code_challenge_method=S256`** | Diz que o challenge é SHA-256 (o outro método, `plain`, não protege nada). | Fixo na URL. |

**Por que PKCE complementa o Client Secret e não substitui?** São duas provas diferentes:

- O **Client Secret** prova que quem troca o código é **a nossa aplicação**.
- O **code_verifier** prova que quem troca o código é **a mesma transação que começou o login**.

Se o secret vazar, o atacante ainda precisaria do verifier daquela transação específica. Se alguém roubar um `code`, ainda precisaria do verifier **e** do secret. Uma camada não cobre o buraco da outra, por isso usamos as duas (recomendação da RFC 9700).

### 2.4 JWT e validação do id_token

| Termo | O que é |
|---|---|
| **JWT** (JSON Web Token) | Texto `CABEÇALHO.CONTEÚDO.ASSINATURA`, cada parte em Base64URL. O cabeçalho e o conteúdo são JSON. |
| **Claims** | Os campos do conteúdo do JWT. |
| **`iss`** | Emissor. Tem que ser `https://accounts.google.com` (ou `accounts.google.com`). |
| **`aud`** | Audiência = para quem o token foi feito. Tem que ser o **nosso** `GOOGLE_CLIENT_ID`. Impede usar um token feito para outro site. |
| **`exp`** | Momento em que o token vence (segundos desde 1970). Tem que estar no futuro. |
| **`iat`** | Momento em que foi emitido. Não pode estar no futuro (damos 5 min de tolerância de relógio). |
| **`sub`** | Identificador da pessoa no Google. Vira o nosso `subject`. |
| **`email_verified`** | O Google diz se o e-mail foi confirmado. Só mostramos o e-mail se for `true`. |
| **`alg`** | Algoritmo da assinatura. Exigimos `RS256`. Isso impede ataques como `alg: none`. |
| **`kid`** | Key ID: qual das chaves do Google assinou o token. |
| **RS256** | Assinatura RSA com SHA-256 (nome técnico: RSASSA-PKCS1-v1_5 com SHA-256). |
| **Chave pública / privada** | O Google assina com a chave **privada** (só ele tem). Nós verificamos com a chave **pública** (todo mundo pode ter). Se a verificação passa, só o Google poderia ter assinado. |
| **JWK** | Uma chave em formato JSON (campos `kty`, `n`, `e`, `kid`). |
| **JWKS** | JWK Set: lista de chaves públicas do Google, publicada em `jwks_uri`. |
| **Documento de descoberta** | `https://accounts.google.com/.well-known/openid-configuration`: JSON onde o Google diz seu `issuer`, seu `jwks_uri` etc. |
| **Validação criptográfica** | Verificar a **assinatura** (passos 1 a 7). |
| **Validação semântica** | Verificar o **significado**: `iss`, `aud`, `exp`, `iat`, `nonce` (passo 8). As duas são obrigatórias. |

### 2.5 Criptografia

| Termo | O que é |
|---|---|
| **Web Crypto API** | API de criptografia que já vem no ambiente (objeto `crypto`). `crypto.getRandomValues`, `crypto.subtle.digest`, `importKey`, `verify`. Por isso não precisamos de biblioteca. |
| **`crypto.getRandomValues()`** | Gera bytes aleatórios **criptograficamente seguros** (imprevisíveis). `Math.random()` **não** serve para segurança. |
| **32 bytes = 256 bits** | Quantidade de aleatoriedade. Adivinhar é impossível na prática (2^256 possibilidades). |
| **Hash / resumo** | Função de mão única: do texto sai um resumo de tamanho fixo; do resumo não se volta ao texto. |
| **SHA-256** | O algoritmo de hash usado. Gera 32 bytes. |
| **Por que guardar só o resumo no D1?** | Se o banco vazar, o atacante vê resumos, mas o navegador precisa do valor **original** no cookie. Do resumo ele não consegue tirar o original. |
| **Base64** | Forma de escrever bytes como texto usando 64 caracteres. |
| **Base64URL** | Base64 trocando `+`→`-` e `/`→`_` e sem `=` no final, para caber em URL e cookie. 32 bytes viram **43** caracteres. |
| **`btoa` / `atob`** | Funções nativas que codificam/decodificam Base64. |
| **`TextEncoder` / `TextDecoder`** | Convertem texto ↔ bytes em UTF-8 (necessário para nomes com acento no JWT). |

### 2.6 Cookies

Contratos exigidos:

```
__Host-oauth-tx=VALOR; Path=/; HttpOnly; Secure; SameSite=Lax;    Max-Age=600
__Host-session=VALOR;  Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800
```

| Atributo | Significado | Por que usamos |
|---|---|---|
| **Cookie** | Pequeno valor que o servidor manda (`Set-Cookie`) e o navegador devolve automaticamente (`Cookie`) nas próximas requisições para o mesmo site. | É como o navegador "lembra" da sessão. |
| **`HttpOnly`** | O JavaScript da página **não** consegue ler o cookie (`document.cookie`). | Se alguém injetar script (XSS), não rouba o cookie. |
| **`Secure`** | Cookie só viaja por HTTPS. | Ninguém na rede lê o cookie. |
| **`SameSite=Strict`** | O cookie **não** é enviado em requisições que vêm de outro site. | Sessão protegida contra CSRF. |
| **`SameSite=Lax`** | Enviado em navegação de topo com GET vinda de outro site, mas não em POST/iframes/fetch de outro site. | O retorno do Google/GitHub **é** uma navegação vinda de outro site. Com Strict, o `__Host-oauth-tx` não chegaria no callback e o login sempre falharia. |
| **`Max-Age`** | Duração em segundos. 600 = 10 min; 28800 = 8 h; 0 = apagar. | |
| **`Path=/`** | O cookie vale para o site inteiro. | Exigido pelo prefixo `__Host-`. |
| **`Domain`** (ausente) | Sem `Domain`, o cookie vale só para o hospedeiro exato (não para subdomínios). | Exigido pelo prefixo `__Host-`. |
| **Prefixo `__Host-`** | O navegador só aceita o cookie se tiver `Secure`, `Path=/` e **nenhum** `Domain`. | Garante que ninguém de outro subdomínio consiga criar ou sobrescrever o nosso cookie. |
| **Cookie temporário (de transação)** | Liga o navegador que começou o login ao callback. | Caso 1 dos testes. |

### 2.7 Web, HTTP e navegador

| Termo | O que é |
|---|---|
| **Origem (origin)** | Esquema + hospedeiro + porta. Ex.: `https://oauth-aula-equipe-07.pages.dev`. |
| **Mesma origem** | Página e Functions têm a mesma origem, então o `fetch("/api/me")` leva o cookie sem configuração extra. |
| **CORS** | Regras que o navegador aplica quando uma página faz `fetch` para **outra** origem. Como tudo está na mesma origem, **não precisamos** de CORS. |
| **Cabeçalho `Origin`** | O navegador informa de qual origem veio um POST. No logout exigimos que seja exatamente `PUBLIC_BASE_URL`. |
| **CSRF** | Cross-Site Request Forgery: outro site faz o **seu** navegador enviar um pedido para o **nosso** site. O `SameSite` + a checagem de `Origin` no logout impedem. |
| **XSS** | Injeção de script na página. `HttpOnly` limita o estrago (o cookie não é lido). |
| **Replay** | Reenviar um pedido antigo para reaproveitá-lo. Transação de uso único e `nonce` impedem. |
| **Site estático** | Arquivos prontos (HTML, CSS, JS) entregues como estão. Qualquer um com a URL baixa. |
| **Rota dinâmica** | Código que roda a cada pedido e decide a resposta (as Functions). |
| **Cabeçalho `Location`** | Para onde o navegador deve ir num redirecionamento. |
| **`Set-Cookie` / `Cookie`** | Cabeçalho que cria um cookie (resposta) / que envia os cookies (pedido). |
| **`Authorization`** | Cabeçalho com credenciais. `Bearer <token>` ou `Basic <base64(id:segredo)>`. |
| **Autenticação Basic** | `Authorization: Basic ` + Base64 de `CLIENT_ID:CLIENT_SECRET`. Usada para revogar o grant no GitHub. |
| **`Cache-Control: no-store`** | Proíbe navegador/proxy de guardar cópia da resposta. Usado em erros, retornos e dados de sessão. |
| **`Accept`** | Diz o formato de resposta desejado. O GitHub só devolve JSON na troca de tokens se mandarmos `Accept: application/json`. |
| **`User-Agent`** | Identifica o cliente. A API do GitHub **recusa** pedidos sem ele. |
| **`X-GitHub-Api-Version`** | Versão da API REST do GitHub (`2026-03-10`). |
| **`application/x-www-form-urlencoded`** | Formato `a=1&b=2` usado no corpo da troca de tokens. |
| **DevTools / Network / Preserve log** | Ferramentas do navegador (F12) para ver pedidos, cabeçalhos e cookies. "Preserve log" mantém o histórico entre redirecionamentos. |
| **Janela privativa** | Janela sem cookies da janela normal. Usada no Caso 1. |

**Códigos HTTP usados:**

| Código | Nome | Onde |
|---|---|---|
| 200 | OK | `/api/health`, `/api/me` com sessão, `GET /user` do GitHub |
| 204 | No Content | Resposta esperada da revogação do grant no GitHub |
| 302 | Found (redirecionamento) | Início do login e fim do callback |
| 303 | See Other | Logout: manda o navegador abrir `/` com GET |
| 400 | Bad Request | Qualquer falha no callback |
| 401 | Unauthorized | `/api/me` sem sessão válida |
| 403 | Forbidden | Logout com `Origin` errado |
| 404 | Not Found | Provedor diferente de google/github |
| 405 | Method Not Allowed | Logout com método diferente de POST |

### 2.8 Cloudflare

| Termo | O que é |
|---|---|
| **Cloudflare Pages** | Serviço que publica sites estáticos a partir de um repositório GitHub. Cada commit em `main` gera uma nova implantação. |
| **Pages Functions** | Código JavaScript na pasta `functions/` que roda no servidor da Cloudflare. O caminho do arquivo vira a rota: `functions/api/me.js` → `/api/me`. |
| **Rota dinâmica `[provider]`** | Nome de arquivo com colchetes = parâmetro. `/oauth/login/google` chama `login/[provider].js` com `context.params.provider = "google"`. |
| **`onRequestGet` / `onRequestPost` / `onRequest`** | Funções exportadas que tratam GET / POST / qualquer método. |
| **`context`** | Objeto que a Cloudflare passa para a Function. Tem `request` (o pedido), `env` (variáveis, segredos e o banco) e `params` (parâmetros da rota). |
| **`env`** | Onde ficam `PUBLIC_BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` e `DB`. |
| **Variável (texto simples)** vs **Segredo (Encrypt)** | Variável é visível no painel. Segredo é criptografado e não pode ser lido de volta. Os Client Secrets são segredos. |
| **D1** | Banco de dados SQL (baseado em SQLite) da Cloudflare. |
| **Binding (ligação)** | Liga o banco D1 ao projeto com um nome. O nosso nome é `DB`, por isso o código usa `context.env.DB`. |
| **Implantação (deployment)** | Uma versão publicada. **Produção** = ramificação `main`, endereço fixo `NOME.pages.dev`. **Prévia** = outras ramificações, endereços diferentes (não servem como URL de retorno). |
| **pages.dev** | Domínio gratuito que a Cloudflare dá ao projeto. Não precisamos comprar domínio. |
| **Build output directory = `public`** | Só a pasta `public` é publicada como estática. `functions` é compilada à parte. Por isso `functions` fica **fora** de `public`. |
| **Wrangler / npm / Node.js** | Ferramentas de linha de comando. **Não** usamos: tudo é feito pelo navegador e pelo GitHub. |

### 2.9 SQL e banco

| Termo | O que é |
|---|---|
| **`CREATE TABLE`** | Cria uma tabela. |
| **`PRIMARY KEY`** | Coluna que identifica a linha, sem repetição. Aqui é o `id_hash` (resumo do cookie). |
| **`NOT NULL`** | Coluna obrigatória. |
| **`CHECK (provider IN ('google','github'))`** | O banco recusa qualquer outro provedor. |
| **`CREATE INDEX ... (expires_at)`** | Índice: deixa rápidas as buscas/remoções por data de expiração. |
| **`sqlite_schema`** | Tabela interna que lista tabelas e índices. Usada na evidência 04. |
| **Consulta preparada (`prepare` + `bind`)** | O SQL tem `?` e os valores vão separados em `bind(...)`. O valor nunca é colado no texto do SQL, o que **impede SQL injection**. |
| **`.first()`** | Devolve a primeira linha (ou `null`). |
| **`.run()`** | Executa sem devolver linhas; `meta.changes` diz quantas linhas mudaram. |

Tabelas:

- `oauth_transactions`: `id_hash` (resumo do cookie temporário), `provider`, `state_hash` (resumo do state), `nonce` (só Google), `code_verifier`, `expires_at`.
- `sessions`: `id_hash` (resumo do cookie de sessão), `issuer`, `subject`, `email`, `display_name`, `expires_at`, `created_at`.

### 2.10 JavaScript usado

| Termo | O que é |
|---|---|
| **Módulos ES (`import` / `export`)** | Cada arquivo exporta funções e outros arquivos importam. É assim que `_shared/` é reaproveitado. |
| **`async` / `await` / Promise** | Operações demoradas (banco, rede, criptografia) devolvem Promise. `await` espera o resultado sem travar. |
| **`fetch`** | Faz pedidos HTTP (no navegador e na Function). |
| **`Request` / `Response` / `Headers` / `URL` / `URLSearchParams`** | Objetos padrão da Web para pedido, resposta, cabeçalhos, URL e parâmetros. |
| **`Response.json()`** | Cria uma resposta JSON. |
| **`headers.append` vs `headers.set`** | `set` substitui; `append` adiciona outro. Usamos `append` para mandar **dois** `Set-Cookie`. |
| **`try` / `catch` / `throw`** | Tratamento de erros. No callback, qualquer `throw` vira um 400 genérico. |
| **Template string `` `${x}` ``** | Monta texto com variáveis. |
| **Desestruturação `const { env, params } = context`** | Tira campos de um objeto para variáveis. |
| **Espalhamento `...CABECALHOS_API_GITHUB`** | Copia os campos de um objeto para outro. |
| **`??` (coalescência nula)** | `a ?? b` = usa `b` se `a` for `null`/`undefined`. |
| **`?.` (encadeamento opcional)** | `dados?.error` = não quebra se `dados` for `null`. |
| **`Object.freeze`** | Congela o objeto: ninguém consegue alterar. Garante que não há "variável global mutável". |
| **`Number.isInteger`** | Confere se o `id` do GitHub é inteiro. |
| **`hidden`** | Atributo HTML que esconde um elemento. |
| **`defer`** | Script roda depois que o HTML foi lido. |

---

## Parte 3: o fluxo completo

```
 NAVEGADOR                    NOSSA FUNCTION (Cloudflare)           D1                PROVEDOR (Google/GitHub)
    |                                  |                              |                        |
 1  |-- GET /oauth/login/google ------>|                              |                        |
    |                                  |-- gera idTx, state,          |                        |
    |                                  |   verifier, nonce            |                        |
    |                                  |-- INSERT resumos ----------->|                        |
 2  |<- 302 Location: google...        |                              |                        |
    |   Set-Cookie: __Host-oauth-tx    |                              |                        |
    |                                                                                          |
 3  |----------------- página de login do Google (a pessoa digita a senha LÁ) --------------->|
 4  |<---------------- 302 para /oauth/callback/google?code=...&state=... ---------------------|
    |                                  |                              |                        |
 5  |-- GET /oauth/callback/google --->|                              |                        |
    |   Cookie: __Host-oauth-tx        |-- SELECT transação --------->|                        |
    |                                  |-- confere state              |                        |
    |                                  |-- DELETE transação --------->|                        |
    |                                  |-- POST token (code+verifier+secret) ------------------>|
    |                                  |<------------------------------ id_token / access_token |
    |                                  |-- valida identidade          |                        |
    |                                  |-- INSERT sessão (resumo) --->|                        |
 6  |<- 302 Location: /                |                              |                        |
    |   Set-Cookie: tx apagado         |                              |                        |
    |   Set-Cookie: __Host-session     |                              |                        |
    |                                  |                              |                        |
 7  |-- GET / (arquivo estático) ----->|                              |                        |
 8  |-- fetch /api/me (com cookie) --->|-- SELECT sessão ------------>|                        |
    |<- 200 { displayName, email }     |                              |                        |
    |                                  |                              |                        |
 9  |-- POST /oauth/logout (Origin) -->|-- DELETE sessão ------------>|                        |
    |<- 303 Location: / (cookie=0)     |                              |                        |
```

O que o **navegador** chega a ver: o cookie de transação, o `state`, o `code_challenge`, o `nonce` (na URL de ida), o `code` (na URL de volta) e o cookie de sessão. O que **nunca** vê: Client Secret, `code_verifier`, `access_token`, `refresh_token`, `id_token`.

---

## Parte 4: arquivo por arquivo

### Estrutura

```
oauth-pages-lab/
├── public/                     <- PÚBLICO: qualquer pessoa baixa pela URL
│   ├── index.html              página com os botões de login e sair
│   ├── app.js                  consulta /api/me e mostra o status
│   ├── styles.css              aparência
│   └── entrega1/               evidências (corrigidas automaticamente)
└── functions/                  <- SERVIDOR: roda na Cloudflare
    ├── _shared/                funções reaproveitadas (o "_" indica que não é rota)
    │   ├── crypto.js           aleatórios, SHA-256, Base64URL
    │   ├── cookies.js          ler/criar/apagar cookies
    │   ├── providers.js        dados fixos do Google e do GitHub
    │   ├── oidc.js             validação do id_token do Google
    │   └── http.js             respostas de erro/JSON com no-store
    ├── api/
    │   ├── health.js           GET /api/health
    │   └── me.js               GET /api/me
    └── oauth/
        ├── login/[provider].js     GET /oauth/login/{google|github}
        ├── callback/[provider].js  GET /oauth/callback/{google|github}
        └── logout.js               POST /oauth/logout
```

Observação: acrescentei `_shared/http.js` à estrutura sugerida, para não repetir o mesmo código de resposta com `no-store` em todos os arquivos. O roteiro permite ("estrutura semelhante, ou ter conhecimento total da estrutura que escolher").

### 4.1 `public/index.html`

- Dois links: `/oauth/login/google` e `/oauth/login/github`. São links normais (GET), porque começar um login não altera nada importante.
- Um `<form method="post" action="/oauth/logout">`. O logout é **POST** porque altera estado (apaga a sessão). Se fosse um link GET, qualquer site poderia colocar `<img src=".../oauth/logout">` e deslogar a pessoa.
- `<p id="status">` é onde o `app.js` escreve se há sessão.
- `hidden` na área de sessão: começa escondida e o `app.js` mostra/esconde.

### 4.2 `public/app.js`

1. `fetch("/api/me", { credentials: "same-origin" })`: pergunta ao servidor quem está logado. O cookie vai junto automaticamente porque é a mesma origem.
2. `response.ok ? response.json() : null`: se deu 200, lê o JSON; se deu 401, considera "sem sessão".
3. Mostra `user.email ?? user.displayName` (no GitHub o e-mail pode ser nulo, então cai no nome).
4. Esconde/mostra os botões.

Frase para o professor: *"Esconder o botão é só interface. Nenhum arquivo da pasta public fica privado por causa disso; quem sabe a URL baixa o arquivo. A proteção real está nas rotas dinâmicas que conferem o cookie."*

### 4.3 `functions/_shared/crypto.js`

- `bytesParaBase64Url(bytes)`: bytes → texto → `btoa` → troca `+`/`/` e tira `=`.
- `base64UrlParaBytes(texto)`: o caminho inverso (recoloca `=` até o tamanho ser múltiplo de 4).
- `base64UrlParaTexto(texto)`: bytes → texto UTF-8 com `TextDecoder` (para acentos no JWT).
- `gerarValorAleatorio()`: 32 bytes de `crypto.getRandomValues` → 43 caracteres.
- `resumoSha256(texto)`: `crypto.subtle.digest("SHA-256", ...)` → Base64URL. Usado para `code_challenge`, resumo do cookie de transação, resumo do `state`, resumo do cookie de sessão.
- `agoraEmSegundos()`: `Date.now()` dá milissegundos; dividimos por 1000 para ficar igual ao `exp`/`iat` do JWT.

### 4.4 `functions/_shared/cookies.js`

- `COOKIE_TRANSACAO` e `COOKIE_SESSAO`: os nomes com prefixo `__Host-`.
- `lerCookie(request, nome)`: lê o cabeçalho `Cookie` (`"a=1; b=2"`), separa por `;`, separa nome e valor pelo primeiro `=`. Devolve `null` se não achar.
- `criarCookie(nome, valor, sameSite, maxAge)`: monta exatamente o texto do contrato do roteiro.
- `apagarCookie(nome, sameSite)`: mesmo cookie, valor vazio, `Max-Age=0`. O navegador apaga.

### 4.5 `functions/_shared/providers.js`

- `PROVEDORES`: para cada provedor, a URL de autorização, a URL de token, os **nomes** das variáveis de ambiente (nunca os valores!) e se usa OIDC.
- `CABECALHOS_API_GITHUB`: `Accept`, `X-GitHub-Api-Version` e `User-Agent`.
- `buscarProvedor(nome)`: devolve o provedor só se o nome for **exatamente** `google` ou `github`. Por que não só `PROVEDORES[nome]`? Porque todo objeto JavaScript tem propriedades herdadas como `toString`; `PROVEDORES["toString"]` devolveria uma função e não `undefined`. A comparação explícita fecha essa porta.
- `montarRedirectUri(env, provedor)`: `PUBLIC_BASE_URL + /oauth/callback/ + nome`. Precisa ser idêntica à cadastrada no provedor e é usada **duas vezes** (na ida e na troca), porque o provedor confere se são iguais.

### 4.6 `functions/_shared/http.js`

- `respostaErro(status, mensagem)`: texto curto, sem detalhes internos, com `no-store`.
- `respostaJson(dados)`: JSON com `no-store`.

### 4.7 `functions/api/health.js`

Devolve `{"status":"ok"}`. Serve para provar que a Cloudflare reconheceu a pasta `functions`. Se der 404, a pasta está no lugar errado ou a implantação é antiga.

### 4.8 `functions/oauth/login/[provider].js` (início do login)

Siga os comentários numerados no código, que batem com o roteiro (13.3):

1. `buscarProvedor(params.provider)`: aceita só google/github; senão **404**.
2. Gera `idTransacao`, `state`, `codeVerifier` e (só no Google) `nonce`. Calcula `codeChallenge = SHA-256(codeVerifier)`.
   - Antes de gravar, apaga transações vencidas (limpeza).
   - Grava no D1: **resumo** do id da transação, provedor, **resumo** do state, nonce, code_verifier, expiração (agora + 600 s).
3. Cria o cookie `__Host-oauth-tx` com o `idTransacao` **cru** (o navegador guarda o original; o banco, o resumo). `SameSite=Lax` porque o retorno vem de outro site.
4. Monta a URL do provedor com `URL` + `searchParams.set`: `client_id`, `redirect_uri`, `response_type=code`, `state`, `code_challenge`, `code_challenge_method=S256`; no Google também `scope=openid email profile` e `nonce`. **Client Secret e code_verifier não entram.**
5. Responde **302** com `Location` (a URL do provedor), `Set-Cookie` e `no-store`.

Por que guardamos o `state` como resumo, mas o `code_verifier` cru? O `state` só precisa ser **comparado**: comparar resumos basta. O `code_verifier` precisa ser **enviado** ao provedor na troca, então precisamos do valor original.

### 4.9 `functions/oauth/callback/[provider].js` (URL de retorno)

`onRequestGet`: confere o provedor (404) e chama `processarRetorno` dentro de `try/catch`. Qualquer erro vira **400 "Não foi possível concluir o login."**. No log vai só a nossa mensagem curta (ex.: "state não confere"), nunca code, token ou cookie.

`processarRetorno`, passos do roteiro (13.4):

1. Se a URL tem `error` (a pessoa clicou "Cancelar", por exemplo) ou falta `code`/`state` → recusa.
2. Lê o cookie `__Host-oauth-tx` → se não houver, recusa (**Caso 1**).
3. Calcula o resumo do cookie e busca a transação com `id_hash = ?`, `provider = ?` e `expires_at > agora`. Não achou → recusa (transação ausente, expirada, de outro provedor, ou já usada → **Caso 3**).
4. Compara `SHA-256(state recebido)` com `state_hash` → diferente, recusa (**Caso 2**). Note que isso acontece **antes** da troca do código.
5. Apaga a transação. Se `meta.changes !== 1`, outro pedido já usou a mesma transação ao mesmo tempo → recusa. Assim ela é realmente de **uso único**.
6. `trocarCodigoPorTokens`: `POST` no token endpoint com `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, **`client_secret`** e **`code_verifier`**. Este é um dos **dois** pontos em que o Client Secret é usado; o outro é a autenticação Basic da revogação no GitHub (`confirmarIdentidadeGithub`). Nos dois casos ele so trafega do servidor para o provedor, nunca para o navegador.
7. Confirma a identidade:
   - Google → `validarIdTokenGoogle(tokens.id_token, GOOGLE_CLIENT_ID, transacao.nonce)`.
   - GitHub → `confirmarIdentidadeGithub(env, tokens)`.
8. Cria a sessão: gera `idSessao` aleatório, grava o **resumo** + issuer + subject + email + nome + expiração (8 h) + criação.
9. Apaga o cookie temporário (`Max-Age=0`).
10. Cria o cookie `__Host-session` (`SameSite=Strict`) e redireciona **302** para `PUBLIC_BASE_URL/`.

A sessão só é criada no passo 8, **depois** de toda a identidade estar confirmada. Se qualquer passo antes falhar, cai no `catch` e nenhuma sessão existe.

`confirmarIdentidadeGithub`:

1. Exige `access_token` e `token_type` = `bearer`.
2. `GET https://api.github.com/user` com `Authorization: Bearer ...`, `Accept`, `X-GitHub-Api-Version`, `User-Agent`.
3. **Sempre** chama `DELETE https://api.github.com/applications/{client_id}/grant` com `Authorization: Basic base64(client_id:client_secret)` e o `access_token` no corpo JSON. Revogamos mesmo se `/user` falhar, para não sobrar token válido por aí.
4. Exige que `/user` tenha dado **200** com `id` inteiro, e que a revogação tenha dado **204**. Só então devolve a identidade.
5. `subject = String(usuario.id)`: o **id numérico** é estável; o `login` pode ser trocado pela pessoa. `nome = name || login` é só para exibir. `email` pode ser `null` (não pedimos `user:email`).

### 4.10 `functions/_shared/oidc.js` (validação do id_token)

Passos do roteiro (13.5):

1. `split(".")` e exige exatamente 3 partes.
2. Decodifica o cabeçalho e exige `alg === "RS256"`.
3. Busca o documento de descoberta do Google e confere que o `issuer` dele é `https://accounts.google.com`.
4. Busca a JWKS no `jwks_uri` indicado.
5. Procura a chave cujo `kid` é igual ao do cabeçalho.
6. `crypto.subtle.importKey("jwk", ...)` com `RSASSA-PKCS1-v1_5` + `SHA-256`, só para `verify`.
7. `crypto.subtle.verify(...)`: confere a assinatura sobre o texto `"CABEÇALHO.CONTEÚDO"` (exatamente como veio, sem decodificar).
8. Só depois da assinatura válida lê o conteúdo e confere: `iss`, `aud` = nosso Client ID, `exp` no futuro, `iat` não no futuro (tolerância 5 min), `nonce` igual ao do D1, `sub` presente.

Devolve `{ issuer, subject: sub, email (só se email_verified), nome }`.

Por que não confiar direto no conteúdo do JWT? Porque qualquer pessoa pode escrever um JSON e codificar em Base64. Só a assinatura prova que foi o Google. E só `aud`/`nonce`/`exp` provam que o token é **para nós**, **deste login** e **ainda vale**.

### 4.11 `functions/api/me.js`

1. Lê `__Host-session`; se não há → **401**.
2. Calcula o resumo e busca sessão com `id_hash = ?` e `expires_at > agora`.
3. Não achou (nunca existiu, expirou → **Caso 4**, ou foi apagada no logout → **Caso 6**) → **401**.
4. Devolve só o perfil mínimo: `issuer`, `displayName`, `email`. Não devolve `subject`, `id_hash` nem datas. Sempre `no-store`.

### 4.12 `functions/oauth/logout.js`

1. `onRequest` recebe qualquer método; se não for POST → **405**.
2. `Origin` precisa ser **exatamente** `PUBLIC_BASE_URL` (sem barra no final) → senão **403** (**Caso 5**).
3. Se há cookie, apaga a linha do D1 pelo resumo.
4. Expira o cookie (`Max-Age=0`).
5. Responde **303** para `/`, com `no-store`. O 303 faz o navegador abrir a página inicial com GET depois do POST do formulário.

O logout encerra só a sessão **local**. A pessoa continua logada no Google/GitHub no navegador dela; isso é esperado.

---

## Parte 5: testes de falha e onde o código recusa

| Caso | O que se faz | Quem recusa | Resposta |
|---|---|---|---|
| 1. Sem cookie temporário | Termina o login numa janela privativa | callback, passo 2 (`cookie de transação ausente`) | 400 |
| 2. `state` alterado | Muda 1 caractere do state na URL | callback, passo 4 (`state não confere`), **antes** da troca | 400 |
| 3. Reutilizar a transação | Reabre a URL de retorno já usada | callback, passo 3 (a transação já foi apagada no passo 5 da vez anterior) | 400 |
| 4. Sessão expirada | `UPDATE sessions SET expires_at = 0;` | `me.js` (`expires_at > agora` falha) | 401 |
| 5. Origem inválida | `fetch` POST de `https://example.com` | `logout.js`, passo 2 (`Origin` diferente) | 403 |
| 6. Cookie revogado | Restaura o cookie depois do logout | `me.js` (a linha foi apagada no logout) | 401 |

No Caso 5 há **duas** barreiras: o navegador nem envia o cookie (é `SameSite=Strict`) e, mesmo que enviasse, o servidor recusa pelo `Origin`. O teste prova a checagem do servidor.

Outras recusas que o código também faz: provedor desconhecido (404), `error` na URL (400), transação de outro provedor (400), `nonce`/`aud`/`iss`/`exp` inválidos (400), assinatura inválida (400), revogação do GitHub diferente de 204 (400, sem sessão).

Obs.: além dos testes locais com banco e provedores simulados, os seis casos foram executados em produção no `pages.dev` em 24/09/2026. Os resultados observados estão registrados em `public/entrega1/07-testes-falha.md`.

---

## Parte 6: perguntas prováveis do professor

**1. Qual a diferença entre autenticação, conta local, autorização local e sessão?**
Autenticação é provar quem é (o Google/GitHub faz). Conta local é como o **nosso** sistema identifica a pessoa (`issuer` + `subject`). Autorização local é o que ela pode fazer no nosso sistema. Sessão é o estado "logado" que dura 8 horas, representado pelo cookie opaco e pela linha em `sessions`.

**2. Por que um cliente confidencial numa Pages Function?**
Porque a Function roda no servidor e consegue guardar o Client Secret como segredo criptografado. Se o login fosse feito no JavaScript do navegador, o secret estaria visível para qualquer um. Além disso, os tokens ficam no servidor e o navegador recebe só um cookie opaco.

**3. Por que PKCE se já temos Client Secret?**
Ver 2.3: o secret prova **qual aplicação**; o verifier prova **qual transação**. São complementares.

**4. Para que servem state, nonce e code_verifier?**
`state` → liga a volta ao navegador/transação que começou (anti-CSRF de login). `nonce` → liga o id_token a este login (anti-replay de token). `code_verifier` → só quem começou consegue trocar o código (anti-roubo do code).

**5. Por que o nonce não vai para o GitHub?**
Porque nonce é do OIDC e serve para validar o `id_token`. O GitHub (OAuth App) não emite id_token, então não há onde conferir o nonce.

**6. Por que guardar no D1 só o resumo do cookie?**
Se o banco vazar, o atacante tem resumos. Para usar a sessão, ele precisaria do valor original no cookie, e SHA-256 não pode ser revertido.

**7. Por que o cookie de transação é Lax e o de sessão é Strict?**
O retorno do provedor é uma navegação que vem de outro site (google.com/github.com). Com Strict, o navegador não mandaria o cookie de transação e o login falharia. O cookie de sessão só precisa ser usado dentro do nosso próprio site, então pode (e deve) ser Strict.

**8. O que o prefixo `__Host-` garante?**
O navegador só aceita o cookie se for `Secure`, `Path=/` e sem `Domain`. Ele fica preso ao hospedeiro exato e não pode ser plantado por outro subdomínio.

**9. Por que página e Functions na mesma origem?**
O `fetch("/api/me")` leva o cookie automaticamente, sem CORS, sem compartilhar cookie entre domínios e sem precisar comprar domínio.

**10. Por que os arquivos de `public/` continuam públicos mesmo com login?**
Porque o Pages entrega arquivos estáticos para quem pedir a URL; ele não consulta sessão. Só as rotas dinâmicas que leem e validam o cookie (como `/api/me`) são protegidas. Esconder um link é só aparência.

**11. Como você valida o id_token sem biblioteca?**
Parte 4.10: 3 partes, `alg=RS256`, descoberta, JWKS, chave pelo `kid`, `importKey`, `verify` com RSASSA-PKCS1-v1_5, depois `iss`, `aud`, `exp`, `iat`, `nonce`. Tudo com Web Crypto.

**12. Por que usar o `id` do GitHub e não o `login` ou o e-mail?**
O `id` numérico nunca muda. O `login` pode ser renomeado e o e-mail pode ser nulo ou mudar. Nome, login e e-mail são só para exibir e nunca dão privilégio.

**13. Por que revogar o token do GitHub?**
Porque só precisávamos dele para uma chamada (`/user`). Revogando, não sobra nenhum token válido que possa vazar. E a sessão só é criada se a revogação responder 204.

**14. Por que a transação é apagada antes da troca?**
Para ser de uso único: se alguém repetir a URL de retorno (Caso 3), a transação já não existe. A checagem de `meta.changes` garante isso até se dois pedidos chegarem juntos.

**15. Por que o logout é POST e confere o Origin?**
Porque altera estado. Um GET poderia ser disparado por qualquer site (uma imagem, um link). A checagem de `Origin` garante que o pedido veio da nossa própria página.

**16. O logout desloga do Google?**
Não. Ele revoga só a sessão local. A sessão global no Google/GitHub continua.

**17. Onde está o Client Secret?**
Só como segredo criptografado no painel do Pages (`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET`), lido em `context.env`. Não está no GitHub, no HTML, nas URLs nem nos logs. O código só conhece o **nome** da variável.

**18. Por que não existe variável global mutável?**
As Functions podem atender pedidos de pessoas diferentes na mesma instância. Uma variável global com dados de um pedido poderia vazar para outro. Tudo que é de um pedido vive dentro da função; o que é global (`PROVEDORES`) está congelado com `Object.freeze`.

**19. O que é SQL injection e como o código evita?**
É quando um valor enviado pelo usuário é colado no texto do SQL e muda o comando. Usamos `prepare("... ?")` + `bind(valor)`: o valor vai separado e nunca é interpretado como SQL.

**20. Por que `Cache-Control: no-store`?**
Para que respostas com dados de sessão ou erros não fiquem guardadas em cache do navegador ou de proxies, onde outra pessoa poderia ver.

**21. O que acontece se usar uma URL de prévia?**
O endereço de prévia é diferente de `PUBLIC_BASE_URL` e não está cadastrado no provedor → `redirect_uri_mismatch`. Por isso todos os testes usam produção.

**22. Por que `functions` fica fora de `public`?**
Tudo em `public` é publicado como arquivo que qualquer um baixa. Se o código do servidor estivesse lá, seria entregue como texto em vez de executado.

---

## Parte 7: roteiro de configuração (resumo)

1. **GitHub**: criar repositório, branch `main`, subir `public/` e `functions/` como pastas irmãs. Nada de `package.json`, `node_modules`, `wrangler.jsonc` ou segredos.
2. **Cloudflare Pages**: Workers & Pages → Create → Pages → Connect to Git → repositório → produção `main`. Framework preset **None**, build command **vazio**, output **public**, root **vazio**. Testar `URL_BASE/api/health` → 200.
3. **D1**: criar `oauth-sessions-EQUIPE`, rodar o esquema no Console, conferir com a consulta `sqlite_schema`. Em Settings → Bindings → D1, nome **`DB`**. Nova implantação.
4. **Google**: projeto, tela de consentimento em teste com as contas da dupla, escopos `openid email profile`, cliente **Web application** com retorno `URL_BASE/oauth/callback/google`.
5. **GitHub OAuth App**: Homepage `URL_BASE`, callback `URL_BASE/oauth/callback/github`, sem Device Flow, gerar Client Secret.
6. **Variáveis e segredos** no Pages: `PUBLIC_BASE_URL`, `GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID` (texto); `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET` (**Encrypt**). Nova implantação.
7. **Testar**: caminho feliz nos dois, DevTools → Network → Preserve log para conferir o 302, os 6 casos de falha.
8. **Evidências** em `public/entrega1/`:
   - `01-pages-configuracao.pdf`: print da configuração (nome do projeto, branch, opções de build), **sem** IDs da conta.
   - `02-google-retorno.txt`: já pronto, troque `NOME-DO-PROJETO`.
   - `03-github-retorno.txt`: já pronto, troque `NOME-DO-PROJETO`.
   - `04-d1-esquema.txt`: já preenchido com o resultado esperado; confira com o que o console mostrar e copie exatamente.
   - `05-inicio-login-google.pdf` e `06-inicio-login-github.pdf`: print dos cabeçalhos da resposta 302, com cookie, state e code_challenge trocados por [REMOVIDO].
   - `07-testes-falha.md`: já com preparação, pedido e esperado; preencha o "observado".
   - `08-aceitacao.md`: marque os itens e assine.
9. **Limpeza**: sair das contas, fechar a janela privativa, conferir que nenhum segredo está no histórico do GitHub.

### Diagnóstico rápido

| Sintoma | Conferir |
|---|---|
| `redirect_uri_mismatch` | URL pages.dev exata no provedor, sem barra final; cliente do tipo Web |
| `invalid_client` | Client ID / Client Secret certos e não expirados |
| `invalid_grant` | Código já usado ou vencido; verifier da transação certa; mesma URL de retorno |
| "state não confere" | Cookie temporário presente; mesma janela que começou o login |
| Emissor/audiência inválidos | `GOOGLE_CLIENT_ID` certo; relógio |
| `/api/me` dá 401 | Cookie existe? Sessão no D1? Expirou? |
| `/api/health` dá 404 | `functions` na raiz; implantação mais recente |
| `DB is undefined` | Binding chamado exatamente `DB`; nova implantação |
| A página abre sem login | Normal: arquivos estáticos são públicos |

---

## Parte 8: o dashboard

Arquivos: `public/dashboard.html` e `public/dashboard.js`, que usam os estilos de `public/styles.css`.

- Quando existe sessão, a página inicial mostra o botão **Abrir dashboard**, que leva a `/dashboard.html`.
- `dashboard.js` faz o mesmo `fetch("/api/me")` do `app.js`:
  - com **200**, mostra "Olá, nome" e, pelo `issuer`, se o login foi com Google ou com GitHub;
  - com **401**, mostra "Nenhuma sessão. Faça login na página inicial."
- Os cartões ("Visitas hoje", "Tarefas abertas") e a tabela são **dados fixos de exemplo**, só para demonstração.
- **Ponto importante para o professor:** o dashboard está em `public/`, então **qualquer pessoa abre `/dashboard.html` pela URL**, mesmo sem login. Ele só mostra "Nenhuma sessão". Isso é o item "a permanência do conteúdo estático como recurso público". O que é protegido de verdade é a resposta de `/api/me`, porque ela confere o cookie no D1. Para esconder a página em si, seria preciso servi-la por uma Function que conferisse a sessão, e isso está fora do escopo do laboratório.
