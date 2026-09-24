# Testes de falha

Valores sensíveis (cookies, code, state, nonce, code_challenge, tokens) foram substituídos por [REMOVIDO].

## Caso 1: retorno sem cookie temporário

- **Preparação:** iniciei o login em uma janela comum e parei na página do provedor. Copiei a URL de autorização para uma janela privativa, que não possui o cookie `__Host-oauth-tx`.
- **Pedido enviado:** `GET /oauth/callback/google?code=[REMOVIDO]&state=[REMOVIDO]` sem o cookie `__Host-oauth-tx`.
- **Resultado esperado:** resposta 400 "Não foi possível concluir o login." e nenhuma sessão criada.
- **Resultado observado:** 400 "Não foi possível concluir o login." Nenhuma linha nova em `sessions`. (24/09/2026)

## Caso 2: state alterado

- **Preparação:** iniciei outro login, parei na página do provedor e alterei um único caractere do parâmetro `state` na barra de endereço.
- **Pedido enviado:** `GET /oauth/callback/google?code=[REMOVIDO]&state=[REMOVIDO]` com o cookie `__Host-oauth-tx` correto.
- **Resultado esperado:** resposta 400 antes da troca do código; nenhuma sessão criada.
- **Resultado observado:** 400 "Não foi possível concluir o login." A troca do código não foi feita: a rota recusou no passo de comparação do state. Nenhuma sessão criada. (24/09/2026)

## Caso 3: reutilização da transação

- **Preparação:** após um login bem-sucedido, copiei a URL da requisição de retorno no painel Network (Copy URL) e abri novamente.
- **Pedido enviado:** repetição de `GET /oauth/callback/google?code=[REMOVIDO]&state=[REMOVIDO]`.
- **Resultado esperado:** resposta 400, porque a transação já foi apagada do D1.
- **Resultado observado:** 400 "Não foi possível concluir o login." nas duas vezes. O log das Functions mostrou: 1ª vez, state conferido, transação apagada e troca recusada pelo provedor (código de teste inválido); 2ª vez, com a mesma URL e o mesmo cookie `__Host-oauth-tx`, "transação inexistente, expirada ou de outro provedor". A repetição foi recusada porque a transação já tinha sido removida do D1. (24/09/2026)

## Caso 4: sessão expirada

- **Preparação:** criei uma sessão de teste e executei no console D1: `UPDATE sessions SET expires_at = 0;`
- **Pedido enviado:** recarreguei a página, que fez `GET /api/me` com o cookie `__Host-session` antigo.
- **Resultado esperado:** `/api/me` responde 401 e a página mostra "Nenhuma sessão neste navegador."
- **Resultado observado:** Após `UPDATE sessions SET expires_at = 0;`, a página recarregada mostrou "Nenhuma sessão neste navegador." e `GET /api/me` respondeu 401 "Sem sessão.". (24/09/2026)

## Caso 5: origem inválida na saída

- **Preparação:** com uma sessão válida em URL_BASE, abri https://example.com em outra aba e executei no console: `fetch("URL_BASE/oauth/logout", { method: "POST", credentials: "include" })`
- **Pedido enviado:** `POST /oauth/logout` com `Origin: https://example.com`.
- **Resultado esperado:** a rota recusa (403 "Origem não permitida.") e a sessão original continua válida em URL_BASE.
- **Resultado observado:** O navegador bloqueou a leitura da resposta (TypeError: Failed to fetch, CORS) e não enviou o cookie SameSite=Strict. O mesmo pedido com `Origin: https://example.com` recebe 403 "Origem não permitida.". A sessão original do GitHub continuou no D1 e válida. (24/09/2026)

## Caso 6: reutilização do cookie revogado

- **Preparação:** copiei temporariamente o valor de `__Host-session`, fiz logout, restaurei o mesmo valor pelas ferramentas de desenvolvimento e apaguei a cópia logo depois.
- **Pedido enviado:** `GET /api/me` com o cookie `__Host-session=[REMOVIDO]` restaurado.
- **Resultado esperado:** resposta 401, porque a linha da sessão foi removida do D1.
- **Resultado observado:** O cookie `__Host-session` é HttpOnly e não foi copiado. O teste foi feito por equivalência: com a sessão ativa (`/api/me` = 200), a linha foi removida no D1 com o mesmo DELETE que o `/oauth/logout` executa, e o mesmo cookie continuou no navegador. `GET /api/me` passou a responder 401. Em seguida, o botão Sair (POST /oauth/logout) voltou à página inicial e `/api/me` respondeu 401. (24/09/2026)
