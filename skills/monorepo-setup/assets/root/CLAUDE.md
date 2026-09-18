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
