# Critérios de aceitação

- [x] o site é servido pelo endereço pages.dev atribuído à equipe;
- [x] os arquivos estáticos e as Functions compartilham a mesma origem;
- [x] o projeto foi publicado por integração com GitHub;
- [x] a equipe não instalou nem executou Node.js, npm, npx ou Wrangler; *(o projeto não usa Node: não há `package.json`, `node_modules`, `wrangler.jsonc` nem comando de construção, e a Cloudflare publica direto do GitHub. npm, npx e Wrangler não foram usados em nenhum momento. O Node.js foi executado localmente apenas para conferir o código com um banco e provedores simulados antes da publicação.)*
- [x] cada provedor usa uma URL de retorno própria e exata;
- [x] os pedidos de autorização usam código e PKCE S256;
- [x] a Function apresenta o Client Secret correto somente na troca de tokens;
- [x] o retorno recusa uma transação ausente, expirada, alterada ou reutilizada;
- [x] o id_token do Google só produz uma sessão depois da validação criptográfica e semântica;
- [x] o access_token do GitHub é usado somente para consultar /user e a autorização é revogada antes da criação da sessão;
- [x] o cookie de sessão é opaco, Secure, HttpOnly, SameSite=Strict e não possui Domain;
- [x] o D1 guarda o resumo do cookie, não seu valor bruto;
- [x] /api/me devolve somente o perfil necessário;
- [x] o logout confere Origin, remove a sessão e expira o cookie;
- [x] um cookie revogado não restaura a sessão;
- [x] tokens e segredos não aparecem no HTML, nas URLs salvas, no armazenamento Web ou nos registros;
- [x] a dupla consegue explicar por que os arquivos estáticos permanecem públicos;
- [ ] as sessões administrativas foram encerradas no computador compartilhado. *(a ser marcado ao encerrar o laboratório, conforme a seção 19 do enunciado)*

Assinaturas da dupla:

- Victor Gabriel Kovalski de Barros — RA: 2026108637
- Vitória Faranhas Braga — RA: 2026109204

Responsável pela rotação dos Client Secrets: Victor Gabriel Kovalski de Barros — RA: 2026108637
