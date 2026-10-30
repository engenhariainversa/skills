# Vários agentes (ou pessoas) no mesmo monorepo ao mesmo tempo

Leia antes de quebrar o trabalho em épicos/histórias e soltar mais de um agente no repo, e antes de montar o CI. O monorepo desta skill aguenta bem um fluxo sequencial; em paralelo, ele quebra exatamente nos arquivos que todo mundo toca. As regras abaixo saíram de um caso real e valem para qualquer projeto neste formato.

## O caso

Monorepo NestJS GraphQL + Prisma, 4 apps Next.js e 1 app Expo. O trabalho foi planejado em 11 épicos e 40 histórias, lançados quase juntos, cada um com seu agente. Fluxo: história → branch do épico → `main`, com deploy automático em staging a cada merge na `main`.

O que aconteceu:

- Depois do primeiro merge num épico, os PRs das outras histórias passaram a conflitar com ele. O merge automático desistiu após 3 tentativas e o trabalho ficou parado.
- Dois deploys derrubaram o staging: um provider Nest usado sem estar registrado no módulo e uma dependência importada que não estava no `package.json` (passava no dev porque o pacote existia hoisted no `node_modules`, mas a imagem de produção, com `--frozen-lockfile` e filtro, não o tinha).
- Juntar os épicos na `main` exigiu um agente só para integrar, por cerca de um dia.

Causas:

1. **Paralelismo sobre base velha**: cada agente partiu de uma `main` que deixou de existir minutos depois.
2. **Arquivos que toda história edita**: `schema.prisma` único, `app.module.ts`, o `index.ts` dos pacotes de GraphQL e tipos, `docs/decisions.md` numerado, `pnpm-lock.yaml`, variáveis nos composes. Dois agentes editando a mesma região do mesmo arquivo = conflito garantido.
3. **Migrations com timestamp escrito à mão**: timestamps repetidos, a mesma migration copiada com nomes diferentes, ordem que não bate com a história real do schema.
4. **Branches de épico de vida longa**: um épico precisava de código do outro, copiava, e os dois chegavam à `main` com modelos e migrations duplicados.
5. **CI que não monta a imagem de produção**: typecheck e lint passam com provider faltando no módulo e com dependência ausente do `package.json`. Só o boot do container de produção pega isso, e ele só acontecia no deploy.

## Regras

### Fluxo de branches

- **História sai da `main` e volta para a `main`**, num PR pequeno. Sem branch de épico de vida longa: épico é agrupamento no quadro, não no git.
- Precisou de algo de outra história? Espere ela chegar na `main` e faça rebase. Nunca copie código entre branches.

### Quanto paralelismo

- **Padrão: uma história por vez.** O ganho de soltar dez agentes some no primeiro conflito.
- **2 a 3 em paralelo só em áreas diferentes**: apps diferentes, domínios diferentes do backend, sem migration em mais de uma delas. Se duas histórias mexem no mesmo domínio ou ambas criam migration, são sequenciais.
- **Respeite dependências**: uma história só começa quando aquilo de que depende já está na `main` (merge feito, não "PR aberto").
- Ao planejar os épicos, já marque as dependências no card e quais histórias tocam schema; isso decide a ordem.

### Sem arquivo central que todo mundo edita

A estrutura do repo precisa deixar cada história escrever em arquivos próprios:

| Ponto de conflito | Em vez disso |
|---|---|
| `schema.prisma` único | `packages/database/prisma/schema.prisma` só com `generator` e `datasource`; **um arquivo por domínio** em `prisma/models/<dominio>.prisma` (Prisma ≥ 6.7, `"prisma": { "schema": "./prisma" }`) |
| `app.module.ts` crescendo a cada feature | **um módulo Nest por domínio** (`src/<dominio>/<dominio>.module.ts`) que registra os próprios providers e é importado **uma vez** no `AppModule`. Feature nova dentro do domínio não toca o `AppModule` |
| `index.ts` único em `@repo/graphql`/`@repo/types` | **exports por subcaminho por domínio** (`"./billing": "./src/billing/index.ts"`); o consumidor importa `@repo/graphql/billing`. Barrel na raiz do pacote vira ponto de conflito e de import circular |
| `docs/decisions.md` numerado (ADR-001, 002...) | **um arquivo por card** em `docs/decisions/<CARD>-<slug>.md`, sem numeração global. Dois agentes nunca disputam o "próximo número" |
| `pnpm-lock.yaml` | inevitável; por isso dependência nova é motivo para a história ser sequencial, e o conflito se resolve rodando `pnpm install` sobre a `main` atual, nunca editando o lockfile à mão |
| variáveis nos composes e `.env.example` | blocos comentados por domínio/app, variável nova no fim do bloco certo |

### Migrations

- **Só via `prisma migrate dev --name <descritivo>`** (no container de dev). Nunca criar a pasta da migration nem escrever o timestamp à mão; nunca editar migration que já está na `main`.
- Se a `main` ganhou migration enquanto a história andava: rebase, apague a migration da história, rode `migrate dev` de novo. O timestamp novo fica depois da última da `main`.
- **O CI barra** (`assets/github/scripts/check-migration-order.sh` + `assets/github/pr-check.yml`):
  - migration nova que ordena antes ou empata com a última da `main`;
  - migration da `main` editada ou removida no PR;
  - nome fora do formato do Prisma (`AAAAMMDDHHMMSS_nome`);
  - migrations que, aplicadas do zero num Postgres vazio, não reconstroem o schema (`db:migrate:check` depois do `migrate deploy`).

### CI de PR monta o que vai para produção

`assets/github/pr-check.yml`: em todo PR para a `main`, monta **todas as imagens Docker de produção** (`docker compose build`), sobe o `backend` com um Postgres de serviço, deixa o boot rodar as migrations e espera o healthcheck ficar `healthy`. É isso que pega provider sem registro (o Nest morre no boot) e dependência fora do `package.json` (o `pnpm install --frozen-lockfile` da imagem ou o `require` em runtime falha). Rodar em runner hospedado do GitHub, não no self-hosted de produção: o CI publica as mesmas portas e não deve disputar a máquina com o deploy.

### Merge e deploy

- **Quem mescla é a automação, com CI verde**, não o agente da história. O agente abre o PR e para. Isso serializa os merges e mantém a `main` sempre deployável.
- Se o fluxo exige que o agente mescle (ex.: não há automação), a permissão tem que estar liberada no Claude Code da máquina (`Bash(gh pr merge:*)` em `permissions.allow`); senão o agente trava num prompt que ninguém vê.
- **Deploy que falha pausa a automação.** Depois da correção, alguém precisa retomá-la explicitamente; se ninguém retomar, o trabalho para sem aviso. Ao corrigir um deploy quebrado, inclua "retomar a automação" no checklist do card da correção.

## Checklist ao planejar um épico com vários agentes

1. Cada história tem dependências declaradas e diz se toca schema, dependências (`package.json`) ou compose.
2. Histórias que tocam schema ou dependências: em fila, uma por vez.
3. No máximo 2–3 em paralelo, em apps/domínios diferentes, todas saindo da `main` atual.
4. O repo já tem schema em pasta, módulo por domínio, exports por subcaminho e `docs/decisions/` por card (se não tem, essa é a primeira história, sozinha).
5. `pr-check.yml` ativo e exigido na proteção da `main` antes de soltar o primeiro agente.
6. Merge pela automação; alguém responsável por retomar a automação quando um deploy falhar.
