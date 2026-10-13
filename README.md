# 1. Laboratório: login em um site estático no Cloudflare Pages

Victor Gabriel Kovalski de Barros — RA: 2026108637  
Vitória Faranhas Braga — RA: 2026109204

Site em produção: https://oauth-lab-victor.pages.dev

- Dashboard: https://oauth-lab-victor.pages.dev/dashboard.html
- Rota de teste: https://oauth-lab-victor.pages.dev/api/health

O guia completo para estudar e explicar o projeto ao professor está em [GUIA-DE-ESTUDO.md](GUIA-DE-ESTUDO.md). Ele tem o glossário, o fluxo, a explicação de cada arquivo e as perguntas prováveis.

---



## 2. O que já está feito e conferido

| Item | Onde | Situação |
|---|---|---|
| Repositório privado | github.com/victorGksl/oauth-lab-victor | ✅ `public/` e `functions/` são pastas irmãs; sem package.json, node_modules ou wrangler |
| Projeto Pages | Cloudflare → Workers & Pages → oauth-lab-victor | ✅ branch `main`, preset None, sem build command, saída `public` |
| Banco D1 | `oauth-sessions-victor` | ✅ 2 tabelas + 2 índices; binding `DB` |
| Variáveis | Pages → Settings → Variables and secrets | ✅ `PUBLIC_BASE_URL`, `GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID` (texto); `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET` (Secret) |
| Google | Projeto `oauth-lab-victor`, cliente Web `oauth-lab-victor-web` | ✅ Externo/Testando, usuária de teste cadastrada, escopos openid email profile, retorno `/oauth/callback/google` |
| GitHub | OAuth App `oauth-lab-victor` | ✅ Homepage e retorno exatos, sem Device Flow, sem escopos |
| Login Google | produção | ✅ sessão criada, `/api/me` = 200, dashboard mostra o nome |
| Login GitHub | produção | ✅ sessão criada (e-mail nulo, mostra o login), token revogado |
| Testes de falha 1 a 6 | `public/entrega1/07-testes-falha.md` | ✅ todos recusados como esperado |
| Evidências 01 a 07 | `public/entrega1/` | ✅ prontas e saneadas |
| Evidência 08 | `public/entrega1/08-aceitacao.md` | ✅ preenchida e assinada; 2 itens dependem de você (item 1.1) |

## 3. Estrutura do projeto

```
oauth-pages-lab/
├── README.md               este arquivo (não é publicado no site)
├── GUIA-DE-ESTUDO.md       guia completo (não é publicado no site)
├── public/                 PÚBLICO: tudo aqui pode ser aberto pela URL
│   ├── index.html          página de login
│   ├── app.js              consulta /api/me e mostra o status
│   ├── dashboard.html      dashboard básico
│   ├── dashboard.js        preenche o dashboard com /api/me
│   ├── styles.css
│   └── entrega1/           evidências (corrigidas automaticamente)
└── functions/              SERVIDOR: roda na Cloudflare
    ├── _shared/            crypto.js, cookies.js, providers.js, oidc.js, http.js
    ├── api/                health.js, me.js
    └── oauth/              login/[provider].js, callback/[provider].js, logout.js
```

## 4. Como alterar algo a partir de outro PC

Não é preciso instalar nada:

1. Abra o arquivo no GitHub e clique no lápis.
2. Edite e faça **Commit changes** na `main`.
3. A Cloudflare detecta o commit e publica em cerca de 1 minuto. Acompanhe em *Cloudflare → Workers & Pages → oauth-lab-victor → Deployments*.

Nunca coloque um Client Secret, token ou valor de cookie em nenhum arquivo do repositório.
