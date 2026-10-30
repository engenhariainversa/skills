# CLAUDE.md

Instruções para o Claude Code neste repositório.

## Git

- Mensagens de commit e títulos/corpos de PR em inglês, mesmo com a conversa em português.

## Desenvolvimento local

- Antes de qualquer `docker`/`docker compose`, rode `docker info > /dev/null 2>&1`. Se o daemon estiver parado, avise e pare; não improvise um setup só no host.
- Suba o ambiente com o compose de dev:

  ```bash
  docker compose -f docker-compose.dev.yml up --build
  ```

  Ele traz as credenciais do Postgres, as `NEXT_PUBLIC_*` e as portas; monta o código como volume para hot reload; o serviço `backend` roda `db:migrate:deploy` e `db:seed` ao subir. Backend `:4050`, CMS `:4051`, landing `:4052`.
- `docker compose up` sem `-f` é a stack de **produção**: não publica o Postgres e recusa subir sem `POSTGRES_*` no `.env`. Não use para rodar localmente.
- Rodar no host com `pnpm dev` é o caminho difícil: exige `NEXT_PUBLIC_*` exportadas e o Prisma roda de `packages/database`, que não lê o `.env` da raiz. O compose de dev evita tudo isso.
- Comandos por pacote sempre com `pnpm --filter <nome> <script>`, de preferência dentro do container: `docker compose -f docker-compose.dev.yml exec backend pnpm --filter @repo/database db:migrate:dev --name <descritivo>`.
- Nunca `prisma db push`: o script está desabilitado de propósito. Toda alteração de schema vira migration.
- Migration só via `db:migrate:dev --name <descritivo>`: nunca criar a pasta nem escrever o timestamp à mão, nunca editar migration que já está na `main`. Se a `main` ganhou migration no meio da história: rebase, apague a sua e gere de novo.

## Trabalho em paralelo (vários agentes)

- A história sai da `main` atual e volta para a `main` num PR pequeno. Sem branch de épico; precisou de código de outra história, espere ela entrar na `main` e faça rebase, nunca copie.
- Só comece uma história quando as dependências dela já estão na `main`.
- Escreva em arquivos do seu domínio, não em arquivos centrais:
  - model novo em `packages/database/prisma/models/<dominio>.prisma`;
  - backend: o módulo do domínio (`src/<dominio>/<dominio>.module.ts`) registra os próprios providers; o `AppModule` só ganha a linha de import quando o domínio é novo;
  - pacotes compartilhados: export por subcaminho do domínio (`@repo/graphql/<dominio>`), não no `index.ts` da raiz;
  - decisão de arquitetura: `docs/decisions/<CARD>-<slug>.md`, sem numeração global.
- Conflito no `pnpm-lock.yaml`: aceite o da `main` e rode `pnpm install` de novo; nunca edite o lockfile à mão.
- Abra o PR e pare: quem mescla é a automação com o `PR check` verde, salvo instrução explícita.
