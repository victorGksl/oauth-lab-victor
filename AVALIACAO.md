# Avaliação: GitHub Actions com IA

Repositório: https://github.com/victorGksl/oauth-lab-victor · Site: https://oauth-lab-victor.pages.dev · Banco D1: `oauth-sessions-victor` (binding `DB`)

## Adaptações ao enunciado

- **Não existia a pasta `migrations/`.** As tabelas tinham sido criadas pelo console do D1. A `0001_esquema_inicial.sql` reproduz o esquema real (conferido com `sqlite_schema` no D1 remoto) com `IF NOT EXISTS`, para que a primeira execução do `migrar` apenas registre a migração sem recriar nada.
- **Não existe tabela `notas`.** A Tarefa 3 usa `sessions` (busca por e-mail) e a Tarefa 4 adiciona a coluna `sessions.ultimo_acesso`.
- **`actions/ai-inference@v3` em vez de `@v1`.** A tag `v1` ainda chama o GitHub Models (`endpoint: https://models.github.ai/inference`, `model: openai/gpt-4o`) e falhou com `Cannot use 'in' operator to search for 'choices' in OK` ([execução](https://github.com/victorGksl/oauth-lab-victor/actions/runs/38405428267)). A `v3` é a versão que usa o Copilot com `COPILOT_GITHUB_TOKEN`, como descrevem o README e o esqueleto.
- **`model: ''`.** O padrão da `v3` é `gpt-4.1`, que não existe no plano Copilot desta conta (`Error: Model "gpt-4.1" from --model flag is not available`, visto com `ACTIONS_STEP_DEBUG`). Com o valor vazio, a CLI usa o modelo padrão do plano.
- **O `ci.yml` se exclui da busca de segredos** (`':!.github/workflows/ci.yml'`). O padrão `GOCSPX-` está escrito no próprio arquivo, e sem a exclusão o CI acusaria a si mesmo e nunca ficaria verde.
- **`sqlite3 -bail`**: para na primeira instrução com erro.

## Tarefa 1: CI a cada commit

- Execução verde: https://github.com/victorGksl/oauth-lab-victor/actions/runs/38399815312
- Execução vermelha: https://github.com/victorGksl/oauth-lab-victor/actions/runs/38400149791
- Linha do log com o erro:
  ```
  Parse error near line 2: near ",": syntax error
  ##[error]Process completed with exit code 1.
  ```
- A primeira tentativa de falha (`ADD COLUN ultimo_acesso INTEGER`) [passou verde](https://github.com/victorGksl/oauth-lab-victor/actions/runs/38399971118): no SQLite, a palavra `COLUMN` é opcional no `ALTER TABLE ... ADD`, então ele criou uma coluna chamada `COLUN` com o tipo `ultimo_acesso INTEGER`. Só uma vírgula sobrando gerou um erro de sintaxe de verdade.

**Por que testar em SQLite antes do D1:** o D1 usa o mesmo dialeto do SQLite, então aplicar as migrações num banco local e descartável pega o erro no PR, antes do merge, e não no banco de produção, onde uma migração aplicada pela metade é difícil de desfazer.

## Tarefa 2: `main` protegida pelo CI

Ruleset `protege-main` (ativo, ninguém liberado para ignorar): exige pull request e o status check `verificar`.

- PR bloqueado e depois liberado: https://github.com/victorGksl/oauth-lab-victor/pull/1
  - bloqueado (`mergeStateStatus: BLOCKED`) pela [execução vermelha](https://github.com/victorGksl/oauth-lab-victor/actions/runs/38405428163);
  - liberado (`CLEAN`) depois da correção na mesma ramificação, com a [execução verde](https://github.com/victorGksl/oauth-lab-victor/actions/runs/38408162490).
- `git push` direto na `main`, recusado:
  ```
  remote: error: GH013: Repository rule violations found for refs/heads/main.
  remote: - Changes must be made through a pull request.
  remote: - Required status check "verificar" is expected.
   ! [remote rejected] main -> main (push declined due to repository rule violations)
  error: failed to push some refs to 'https://github.com/victorGksl/oauth-lab-victor.git'
  ```

## Tarefa 3: revisão de PR por IA

PR: https://github.com/victorGksl/oauth-lab-victor/pull/4. Função auxiliar sem `onRequest`, para que o deploy de prévia não publicasse um endpoint vulnerável. O PR foi fechado sem merge.

- 1º comentário, SQL concatenado (`WHERE email = '${email}'`): https://github.com/victorGksl/oauth-lab-victor/pull/4#issuecomment-6147143065. Apontou a injeção na linha 5, com o exemplo `' OR 1=1 -- `.
- 2º comentário, depois de `prepare("... WHERE email = ? AND expires_at > ?").bind(email, agora)` (evento `synchronize`): https://github.com/victorGksl/oauth-lab-victor/pull/4#issuecomment-6147176694. Nenhum problema apontado.
- Sem `pull-requests: write`: https://github.com/victorGksl/oauth-lab-victor/actions/runs/38408983672
  ```
  GraphQL: Resource not accessible by integration (addComment)
  ```
  A IA respondeu normalmente, mas o `GITHUB_TOKEN` ficou só com `contents: read` e não pôde criar o comentário. A permissão foi restaurada no commit seguinte.

**Crítica à IA (item 4):** o primeiro comentário termina com um menu de opções: "1. Corrigir o problema de maior gravidade… 2. Corrigir todos os problemas — mesma correção… 3. Registrar as descobertas em `SECURITY-REVIEW.md` e criar um commit". Isso é irrelevante e enganoso. A ação roda uma única vez, sem ninguém para responder, com permissão só de leitura no código, então não tem como corrigir nada nem criar commit. Além disso, as opções 1 e 2 são idênticas: é texto de um assistente interativo colado num comentário de revisão. O segundo comentário tem outro defeito de forma: repete "nenhum problema" em duas frases e publica uma tabela de achados vazia. A IA também deixou passar, sem comentar, a interpolação de `${agora}` na versão vulnerável. Ali o silêncio estava certo (o valor é um número gerado no servidor), mas a resposta não explica o critério, então não dá para saber se ela analisou ou ignorou.

## Tarefa 4: migrações D1 depois do merge

- Execução do merge do PR #1 (`9aafb91`): https://github.com/victorGksl/oauth-lab-victor/actions/runs/38409317646. Aplicou `0001_esquema_inicial.sql` ✅ e `0002_adiciona_coluna.sql` ✅.
- `npx wrangler d1 execute oauth-sessions-victor --remote --command "PRAGMA table_info(sessions)"`:
  ```
  cid  name           type     notnull
  0    id_hash        TEXT     0
  1    issuer         TEXT     1
  2    subject        TEXT     1
  3    email          TEXT     0
  4    display_name   TEXT     0
  5    expires_at     INTEGER  1
  6    created_at     INTEGER  1
  7    ultimo_acesso  INTEGER  0
  ```
- Merge que não toca `migrations/`: o [PR #3](https://github.com/victorGksl/oauth-lab-victor/pull/3) (`8e06fb8`) disparou [só o `ci`](https://github.com/victorGksl/oauth-lab-victor/commit/8e06fb8) e nenhuma execução do `migrar`. O [histórico do `migrar`](https://github.com/victorGksl/oauth-lab-victor/actions/workflows/migrar.yml) não tem execução nesse commit.
  - Observação: o merge anterior, do [PR #2](https://github.com/victorGksl/oauth-lab-victor/pull/2), aparece no histórico como uma falha de *arquivo* do workflow, sem nenhum job executado. O YAML tinha a chave `model` duplicada, o que foi corrigido no PR #3. Não é uma execução disparada pelo filtro `paths`.
- **Bônus:** depois de aplicar, o `migrar` monta um prompt com `git diff HEAD~1 HEAD -- migrations/`, chama `actions/ai-inference@v3` e escreve o resumo em `$GITHUB_STEP_SUMMARY`. Ele aparece na página da [execução do merge](https://github.com/victorGksl/oauth-lab-victor/actions/runs/38409317646).

## Perguntas

1. **Por que o `ci.yml` roda duas vezes?** Um push numa ramificação com PR aberto gera dois eventos: `push` (o workflow escuta qualquer push) e `pull_request` com `synchronize` (o PR aponta para a `main`). O check exigido é o do commit no topo do PR, e na tela do PR quem conta é a execução do `pull_request`. Ela testa o resultado da junção com a `main`, que é o que de fato entra no merge.
2. **Por que um PR de fork não recebe `secrets.COPILOT_PAT`?** Quem abre o PR a partir de um fork controla o código que o workflow executa (scripts, testes, o próprio YAML do fork). Se os segredos fossem entregues, bastaria um `echo` ou um `curl` para um servidor externo para roubá-los. A regra impede o roubo de credenciais (exfiltração de segredos) por PR malicioso. A própria IA levantou esse limite no [PR #2](https://github.com/victorGksl/oauth-lab-victor/pull/2).
3. **Por que declarar `permissions`?** Para seguir o princípio do menor privilégio. Dependendo da configuração do repositório ou da organização, o `GITHUB_TOKEN` padrão pode vir com escrita ampla. Declarando só `contents: read` e `pull-requests: write`, o pior que um passo comprometido ou uma resposta manipulada por injeção de prompt no diff consegue fazer é comentar no PR, e não fazer push ou alterar o repositório. O teste da Tarefa 3 mostra o efeito: sem `pull-requests: write`, nem o comentário é possível.
4. **A revisão da IA pode substituir o status check?** Não. O `verificar` é determinístico: o mesmo commit dá sempre o mesmo resultado, e o código de saída bloqueia o merge pela regra da `main`. A revisão da IA muda de uma execução para outra, mistura conteúdo irrelevante (o menu de opções e a tabela vazia do item 4) e não para o merge. Com o check exigido apenas `verificar`, um PR com SQL vulnerável passaria se o CI estivesse verde. A IA ajuda a revisão humana, mas não serve de portão.
