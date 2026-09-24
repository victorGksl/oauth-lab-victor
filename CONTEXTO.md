# Contexto completo do trabalho (para continuar em outro PC)

Este arquivo guarda **tudo o que aconteceu** na sessão de trabalho de 24/09/2026. Serve para você continuar de outro computador, sozinho ou com o Claude.

> **Para continuar com o Claude em outro PC:** abra o Claude (Claude Code ou claude.ai), anexe ou cole este arquivo e o `README.md`, e diga algo como: *"Este é o contexto do meu laboratório OAuth no Cloudflare Pages. Continue de onde parou: [o que você quer]."*

Nenhum segredo está neste arquivo. Client Secrets, tokens e cookies nunca foram vistos nem gravados; eles só existem nos painéis do Google, do GitHub e da Cloudflare.

---

## 1. O que o enunciado (Avaliação 2) pede

Fonte: PDF "Laboratório: login em um site estático no Cloudflare Pages", da disciplina.

- Publicar um site estático e suas rotas de autenticação em **um único projeto do Cloudflare Pages** (`https://NOME.pages.dev`), com a página e as Functions na mesma origem.
- **Login com Google (OIDC) e GitHub (OAuth App)**, usando Authorization Code + **PKCE S256** + Client Secret, em Pages Functions (cliente confidencial).
- Transações (`state`, `nonce`, `code_verifier`) e **sessões opacas** guardadas no **D1**. O D1 guarda só os **resumos SHA-256** dos cookies.
- **Validar o `id_token` do Google sem bibliotecas**: RS256, descoberta, JWKS, `kid`, `importKey`, `verify`, e depois `iss`, `aud`, `exp`, `iat`, `nonce`.
- **GitHub:** usar o `access_token` só para `GET /user`, depois **revogar** o grant (`DELETE /applications/{client_id}/grant`, exigir 204) e usar o `id` numérico como `subject`.
- Cookies:
  - `__Host-oauth-tx`: HttpOnly, Secure, SameSite=Lax, Max-Age=600.
  - `__Host-session`: HttpOnly, Secure, SameSite=Strict, Max-Age=28800.
- Rotas:
  - `/api/me`: perfil mínimo, `no-store`.
  - `/oauth/logout`: só POST, `Origin` igual a `PUBLIC_BASE_URL`, apaga a linha, expira o cookie.
- **Proibido:** `package.json`, `node_modules`, `wrangler.jsonc`, instalar ou executar Node/npm/npx/Wrangler, segredos no repositório.
- `public/` deve conter a página de login (novo `index.html`), **o dashboard** e a pasta `entrega1`.
- **Entrega em `public/entrega1/`, com exatamente estes 8 arquivos** (a correção automática olha lá; nome errado zera a entrega):
  - `01-pages-configuracao.pdf`
  - `02-google-retorno.txt`
  - `03-github-retorno.txt`
  - `04-d1-esquema.txt`
  - `05-inicio-login-google.pdf`
  - `06-inicio-login-github.pdf`
  - `07-testes-falha.md`
  - `08-aceitacao.md`
- **Observação:** o PDF às vezes cita a pasta `evidencias/`, mas o item 6 diz que a entrega é avaliada em `public/entrega1`. Usamos `public/entrega1`.
- O trabalho é **individual**, feito em dupla só para aprender. Depois vem a **prova de autoria**, por isso o `GUIA-DE-ESTUDO.md` existe.

## 2. Recursos criados (nomes e identificadores públicos)

| Recurso | Nome / valor |
|---|---|
| Conta GitHub | `victorGksl` |
| Repositório (privado) | https://github.com/victorGksl/oauth-lab-victor |
| Conta Cloudflare | a do e-mail @unibrasil.com.br |
| Projeto Pages | `oauth-lab-victor` |
| URL de produção (`PUBLIC_BASE_URL`) | https://oauth-lab-victor.pages.dev |
| Banco D1 | `oauth-sessions-victor`, binding `DB` |
| Google Cloud | projeto `oauth-lab-victor`, **dentro da organização addvaloraglobal.com** (conta vbarros@addvaloraglobal.com, escolha feita pelo Victor) |
| Tela de consentimento | Externo, em "Testando"; usuária de teste: vbarros@addvaloraglobal.com |
| Cliente OAuth Google | tipo Aplicativo da Web, nome `oauth-lab-victor-web`, retorno `https://oauth-lab-victor.pages.dev/oauth/callback/google` |
| OAuth App GitHub | `oauth-lab-victor` (id 3881041), Client ID `Ov23liDqzU34gjOVvSim`, Homepage `https://oauth-lab-victor.pages.dev`, retorno `https://oauth-lab-victor.pages.dev/oauth/callback/github`, sem Device Flow, sem wildcard |
| Variáveis (texto) | `PUBLIC_BASE_URL`, `GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID` |
| Segredos (Encrypt) | `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET`, colados pelo próprio Victor |
| Outro projeto antigo (não usado) | `testedash2`, o dashboard Volt, em testedash2.2026108637.workers.dev |

## 3. Decisões tomadas e por quê

1. **Estrutura de pastas:** a do enunciado, mais `functions/_shared/http.js` para não repetir as respostas com `no-store`. O enunciado permite ("estrutura semelhante").
2. **Nomes em português** nas funções auxiliares (`gerarValorAleatorio`, `resumoSha256`, `lerCookie`...), para facilitar a explicação na prova de autoria.
3. **Transação de uso único:** o `DELETE` confere `meta.changes === 1`, então dois retornos simultâneos não usam a mesma transação.
4. **GitHub:** a revogação do grant é feita **sempre**, mesmo se `/user` falhar, e a sessão só é criada com `/user` = 200 e revogação = 204. Os cabeçalhos incluem `User-Agent`, porque a API do GitHub recusa pedidos sem ele.
5. **Google:** o e-mail só é mostrado se `email_verified === true`. Tolerância de relógio de 5 min no `iat`.
6. **Logout:** responde **303** para `/` (volta à página inicial depois do POST do formulário). Outros métodos → 405; `Origin` errado → 403.
7. **`buscarProvedor`** compara o nome explicitamente, para que valores como `toString` nunca sejam aceitos (→ 404).
8. **Dashboard:** o Volt (testedash2) precisaria de npm/gulp para ser compilado, o que o enunciado proíbe. Por isso foi criado um **dashboard básico** próprio (`dashboard.html` e `dashboard.js`), que usa `/api/me`. Os cartões e a tabela são dados fixos de exemplo.
9. **Bug corrigido:** `section { display: flex }` anulava o atributo `hidden`, e os botões "Entrar" apareciam mesmo com sessão. Foi adicionado `[hidden] { display: none !important; }`.
10. **Evidência 04:** o console do D1 mostra também a tabela interna `_cf_KV`. Ela foi copiada exatamente como apareceu.
11. **PDFs 01, 05 e 06:** gerados a partir dos dados reais conferidos. Client IDs, state, code_challenge, nonce e cookie aparecem como [REMOVIDO].

## 4. O que foi testado em produção (24/09/2026)

| Teste | Resultado |
|---|---|
| `/api/health` | 200 `{"status":"ok"}` |
| Início do login (Google e GitHub) | 302, cookie `__Host-oauth-tx` correto, PKCE S256, `redirect_uri` exata, sem secret e sem verifier; no GitHub, sem `nonce` e sem `scope` |
| Provedor inválido | 404 |
| Login Google completo | sessão criada, `/api/me` = 200 com só `issuer`, `displayName`, `email`, `no-store`; dashboard mostrou o nome e "Google" |
| Login GitHub completo (feito pelo Victor) | sessão com issuer `https://github.com`, subject numérico, e-mail nulo, display_name `victorGksl`, 8 h |
| Armazenamento | localStorage vazio; `document.cookie` vazio (HttpOnly) |
| Caso 1: sem cookie | 400 |
| Caso 2: state alterado | 400, antes da troca do código |
| Caso 3: reutilizar transação | 400 na repetição ("transação inexistente"), confirmado no log das Functions |
| Caso 4: sessão expirada | `UPDATE sessions SET expires_at = 0;` → `/api/me` 401 |
| Caso 5: Origin inválido | o navegador bloqueou; com `Origin: https://example.com` → 403; a sessão continuou válida |
| Caso 6: cookie revogado | **por equivalência** (o cookie é HttpOnly e não pode ser copiado pelas ferramentas): a linha foi apagada no D1 com o cookie ainda no navegador → 401; logout real pelo botão Sair → 401 |
| Logout por GET | 405 |

O código também foi testado localmente, antes de publicar, com um D1 e provedores simulados.

## 5. O que falta

1. **Preencher `public/entrega1/08-aceitacao.md`:** marcar os itens, nomes da dupla e responsável pela rotação. Passo a passo no `README.md`, item 1.1.
2. **Decidir o item "não executou Node.js":** o projeto não usa Node, mas o Node foi executado localmente para testes e edição de arquivos. npm, npx e Wrangler não foram usados.
3. **Opcional:** fazer o Caso 6 do jeito literal, se o professor exigir (`README.md`, item 1.2).
4. **Estudar o `GUIA-DE-ESTUDO.md`** para a prova de autoria.
5. **No fim:** sair das contas; quando o professor autorizar, apagar o projeto Google (que está na organização da empresa), a OAuth App, o projeto Pages e o D1.

## 6. Histórico de commits

1. Laboratório OAuth no Cloudflare Pages (código inicial)
2. Evidências com o endereço de produção e o esquema do D1
3. Nova implantação após cadastrar variáveis e segredos
4. Corrige botões de login visíveis com sessão ativa
5. Evidências 01, 05, 06 e resultados parciais dos testes de falha
6. Adiciona dashboard básico
7. Registra os resultados dos casos 3, 4 e 6
8. README, CONTEXTO e GUIA DE ESTUDO no repositório
