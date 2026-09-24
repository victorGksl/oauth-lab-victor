# Testes de falha

Valores sensíveis (cookies, code, state, nonce, code_challenge, tokens) foram substituídos por [REMOVIDO].

## Caso 1: retorno sem cookie temporário

- **Preparação:** iniciei o login em uma janela comum e parei na página do provedor. Copiei a URL de autorização para uma janela privativa, que não possui o cookie `__Host-oauth-tx`.
- **Pedido enviado:** `GET /oauth/callback/google?code=[REMOVIDO]&state=[REMOVIDO]` sem o cookie `__Host-oauth-tx`.
- **Resultado esperado:** resposta 400 "Não foi possível concluir o login." e nenhuma sessão criada.
- **Resultado observado:** [PREENCHER]

## Caso 2: state alterado

- **Preparação:** iniciei outro login, parei na página do provedor e alterei um único caractere do parâmetro `state` na barra de endereço.
- **Pedido enviado:** `GET /oauth/callback/google?code=[REMOVIDO]&state=[REMOVIDO]` com o cookie `__Host-oauth-tx` correto.
- **Resultado esperado:** resposta 400 antes da troca do código; nenhuma sessão criada.
- **Resultado observado:** [PREENCHER]

## Caso 3: reutilização da transação

- **Preparação:** após um login bem-sucedido, copiei a URL da requisição de retorno no painel Network (Copy URL) e abri novamente.
- **Pedido enviado:** repetição de `GET /oauth/callback/google?code=[REMOVIDO]&state=[REMOVIDO]`.
- **Resultado esperado:** resposta 400, porque a transação já foi apagada do D1.
- **Resultado observado:** [PREENCHER]

## Caso 4: sessão expirada

- **Preparação:** criei uma sessão de teste e executei no console D1: `UPDATE sessions SET expires_at = 0;`
- **Pedido enviado:** recarreguei a página, que fez `GET /api/me` com o cookie `__Host-session` antigo.
- **Resultado esperado:** `/api/me` responde 401 e a página mostra "Nenhuma sessão neste navegador."
- **Resultado observado:** [PREENCHER]

## Caso 5: origem inválida na saída

- **Preparação:** com uma sessão válida em URL_BASE, abri https://example.com em outra aba e executei no console: `fetch("URL_BASE/oauth/logout", { method: "POST", credentials: "include" })`
- **Pedido enviado:** `POST /oauth/logout` com `Origin: https://example.com`.
- **Resultado esperado:** a rota recusa (403 "Origem não permitida.") e a sessão original continua válida em URL_BASE.
- **Resultado observado:** [PREENCHER]

## Caso 6: reutilização do cookie revogado

- **Preparação:** copiei temporariamente o valor de `__Host-session`, fiz logout, restaurei o mesmo valor pelas ferramentas de desenvolvimento e apaguei a cópia logo depois.
- **Pedido enviado:** `GET /api/me` com o cookie `__Host-session=[REMOVIDO]` restaurado.
- **Resultado esperado:** resposta 401, porque a linha da sessão foi removida do D1.
- **Resultado observado:** [PREENCHER]
