---
name: monorepo-setup
description: Monta ou estende um monorepo TypeScript com pnpm workspaces + Turborepo no padrão apps/ + packages/ (Next.js para landing e CMS, NestJS GraphQL code-first com Subscriptions via WebSocket para backend, client Apollo compartilhado em @repo/graphql, Prisma em @repo/database, tsconfig e eslint compartilhados), com um único Dockerfile multi-target, compose de dev com hot reload e compose de produção, e deploy por runner self-hosted com secrets do GitHub. Use sempre que o usuário falar em "monorepo", "workspaces", "turborepo", "apps e packages compartilhados", "landing + cms + api no mesmo repo", "adicionar um app/package ao monorepo", "colocar o app mobile/Expo no monorepo (apps/mobile)", "backend GraphQL", "subscription/tempo real/WebSocket no GraphQL" ou quando dois ou mais apps precisam dividir tipos, banco ou componentes.
---

# Monorepo pnpm + Turborepo, tudo em Docker

Referência viva: `github.com/engenhariainversa/platform-monorepo` (landing + CMS em Next.js, backend NestJS GraphQL, Prisma). Esta skill destila o que funciona lá. Quando em dúvida sobre um detalhe, abra o repo em vez de inventar.

## Layout

```
/
├── apps/
│   ├── landing/        Next.js (site público)             porta 4052
│   ├── cms/            Next.js (painel)                   porta 4051
│   ├── backend/        NestJS + GraphQL code-first + Subscriptions (graphql-ws)   porta 4050
│   └── mobile/         Expo/React Native (opcional)       fora do Docker, build no EAS
├── packages/
│   ├── database/       Prisma: schema, migrations, client (@repo/database)
│   ├── graphql/        client Apollo (HTTP + WebSocket) + queries + tipos (@repo/graphql)
│   ├── types/          tipos compartilhados               (@repo/types)
│   ├── ui/             componentes Tailwind               (@repo/ui)
│   ├── tsconfig/       base.json, nextjs.json, nestjs.json
│   └── eslint-config/  base.js
├── package.json        scripts = "turbo run <task>", só turbo + prettier
├── pnpm-workspace.yaml apps/* e packages/*
├── turbo.json          build dependsOn ^build; dev persistent sem cache
├── Dockerfile          um arquivo, um target por app (backend, cms, landing)
├── Dockerfile.dev      imagem única de dev: deps + source + prisma generate
├── docker-compose.yml  produção (exige POSTGRES_*, JWT_SECRET, NEXT_PUBLIC_*)
├── docker-compose.dev.yml  dev com hot reload e credenciais fixas de dev
├── .env.example        defaults de dev, seguro de commitar
└── .github/workflows/deploy.yml
```

Templates prontos em `assets/` (root, packages, backend, docker, github). Copie e troque os placeholders `<...>`.

## Convenções que seguram o monorepo

- **Nomes**: packages são `@repo/<nome>`, apps têm nome simples (`backend`, `cms`, `landing`). Dependência interna sempre `"@repo/x": "workspace:*"`. Isso faz o pnpm linkar a pasta e o Turborepo entender a ordem de build.
- **Comandos por pacote**: `pnpm --filter <nome> <script>`. Nunca `cd apps/x && pnpm ...` em scripts/Docker: o filtro resolve o workspace certo e funciona da raiz.
- **tsconfig compartilhado**: cada app estende `@repo/tsconfig/nextjs.json` ou `nestjs.json`; cada package estende `base.json`. O app só declara `paths` e `include`.
- **Packages consumidos como fonte** (`ui`, `graphql`, `types`): `exports` aponta para `./src/index.ts` e o Next.js recebe `transpilePackages: ["@repo/ui", "@repo/graphql", "@repo/types"]`. Sem passo de build, hot reload atravessa pacotes.
- **`@repo/database` é compilado**: `build = prisma generate && tsc`, `main` aponta para `dist/`. O backend (NestJS, CommonJS) precisa de JS pronto, e o Prisma Client precisa ser gerado antes de qualquer `tsc` que o importe. Por isso `turbo.json` tem `build.dependsOn: ["^build"]`.
- **Migrations, nunca `db push`**: o script `db:push` existe só para falhar com a mensagem explicando. Fluxo: `db:migrate:dev --name <descritivo>` em dev, `db:migrate:deploy` no boot do backend em produção, `db:migrate:check` no pipeline para pegar drift.
- **Portas fixas por app** (4050/4051/4052) em `package.json`, compose e `PORT`. Vários monorepos no mesmo host não colidem se cada um tiver sua faixa.
- **`.env.example` com defaults de dev reais** (credenciais do Postgres do compose de dev). Produção nunca lê esse arquivo: os valores vêm de secrets.

## Backend GraphQL: nasce com Subscriptions

O backend do template (`assets/backend/`) já sobe com os três tipos de operação: query e mutation por HTTP e **subscription por WebSocket**, protocolo `graphql-ws`, no mesmo path `/graphql`. Ligar isso no dia 1 custa quatro arquivos; ligar depois custa reabrir auth, proxy e client. As peças:

| Peça | Arquivo | O que faz |
|---|---|---|
| Servidor WS | `src/app.module.ts` | `subscriptions: { 'graphql-ws': { path, onConnect } }`; `onConnect` copia `connectionParams.authorization` para o header da request do upgrade; `context` normaliza `req` para HTTP e WS |
| Auth única | `src/auth/gql-auth.guard.ts` | `GqlAuthGuard` (passport-jwt) lê `ctx.req` nos três tipos de operação; `@CurrentUser()` dá o usuário ao resolver |
| Barramento | `src/pubsub/pubsub.module.ts` | `PUB_SUB` global (`graphql-subscriptions`); em memória para uma instância, `RedisPubSub` quando houver réplicas |
| Exemplo | `src/events/events.resolver.ts` | mutation `notify` publica; `@Subscription notificationAdded` assina com `filter` por usuário e guard |
| Client | `packages/graphql/src/client/create-client.ts` | `createApolloClient({ uri, wsUri, getToken })`: `split` manda subscription para `GraphQLWsLink` e o resto para `HttpLink`; token em header e em `connectionParams` |

Uma subscription nova é: publicar no `PUB_SUB` onde o estado muda (service, job, webhook), um método `@Subscription(() => Tipo, { filter })` que devolve `pubSub.asyncIterableIterator('topico')`, e no client `useSubscription`/`client.subscribe` com o documento. Passo a passo, auth, proxy e teste de terminal em `references/graphql-subscriptions.md`.

O template vem sem banco de propósito (o `notify` de exemplo só publica). Com dados de verdade, adicione `@repo/database` ao backend e publique no PubSub logo depois de gravar. O nginx do proxy já repassa `Upgrade`/`Connection` e o Cloudflare Tunnel aceita WebSocket, então `wss://api.<dominio>/graphql` funciona sem rota nem porta extra. O app mobile usa o mesmo `createApolloClient` (skill `react-native-mobile-app` → `references/graphql-client.md`).

## Docker

### Um Dockerfile, vários targets

Stages compartilhados: `base` (node + pnpm + `openssl`, que o Prisma exige no alpine) → `deps` → `source` → `database-build`. Depois, por app, `<app>-build` e o runtime `<app>`. O compose escolhe com `build.target`.

O stage `deps` copia **só** `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json` da raiz, `packages/` inteiro e o `package.json` de cada app. Assim a camada de `pnpm install --frozen-lockfile` só invalida quando dependências mudam. Cada app novo precisa de uma linha `COPY apps/<app>/package.json ...` aqui, senão o install falha por lockfile inconsistente.

`NEXT_PUBLIC_*` são **embutidas no build** do Next: entram como `ARG` no stage de build e o compose passa `build.args` a partir do `.env`. Mudar a URL da API em produção exige rebuild, não só restart.

O runtime do Next copia `.next`, `public`, `package.json`, `next.config.*`, o `node_modules` da raiz e do app e `packages/`, e roda `next start --port`. Funciona sem `output: standalone`, que em monorepo precisa de `outputFileTracingRoot` para não perder os packages linkados; adote standalone só se o tamanho da imagem virar problema.

### Dev com hot reload

`Dockerfile.dev` é uma imagem só: instala tudo, copia o código e roda `pnpm --filter @repo/database build`. O `docker-compose.dev.yml` sobe `db`, `backend`, `cms`, `landing` a partir dela, cada um com seu `command: pnpm --filter <app> dev`, montando **apenas as pastas de código** (`apps/<app>/app`, `components`, `packages/*/src`) como volumes. Montar a raiz inteira sobrescreveria o `node_modules` e o `dist` gerados na imagem.

O backend de dev roda `database build && migrate deploy && seed && nest start --watch`, então subir o ambiente do zero deixa o banco pronto. `depends_on` com `condition: service_healthy` encadeia db → backend → cms.

```bash
docker compose -f docker-compose.dev.yml up --build            # tudo
docker compose -f docker-compose.dev.yml up db backend         # só API
docker compose -f docker-compose.dev.yml exec backend pnpm --filter @repo/database db:migrate:dev --name add_x
```

### Produção

`docker-compose.yml` sem sufixo é produção: variáveis com `${VAR:?mensagem}` para o compose recusar subir sem secrets; Postgres sem porta publicada; `uploads` em volume nomeado com `UPLOADS_DIR` apontando para o mesmo caminho do mount (senão os uploads vão para a camada gravável do container e somem no deploy); healthcheck do backend por TCP em Node, sem depender de `curl` na imagem.

Para domínio e TLS, cada serviço público (landing, cms, backend) entra na rede `proxy` e ganha um `.conf` no nginx: skill `docker-nginx-cloudflare-proxy`.

## Deploy

`assets/github/deploy.yml`: runner self-hosted, `actions/checkout`, escreve `/opt/<projeto>/.env` a partir dos secrets (`chmod 600`), `docker compose --env-file ... up --build -d --remove-orphans`, espera o `backend` ficar `healthy` via `docker inspect`, roda `db:migrate:check` e faz prune. Registro do runner: skill `github-selfhosted-deploy`.

Secrets necessários no repo: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` (host `db`), `JWT_SECRET` (`openssl rand -hex 64`), `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GRAPHQL_PATH`. Liste-os no `.env.example` para ninguém precisar caçar.

## Adicionar um app ou package

Checklist em `references/add-app-or-package.md`. O resumo: `package.json` com nome e `workspace:*`, `tsconfig.json` estendendo o compartilhado, `transpilePackages` se for Next, linha no stage `deps` do Dockerfile, stages `<app>-build` e `<app>`, serviço nos dois composes com porta nova, conf no nginx se for público. Rode `pnpm install` dentro do container de dev para atualizar o lockfile.

**App mobile (`apps/mobile`, Expo)** é o caso diferente: não vira stage nem serviço de compose, só entra no stage `deps` para o lockfile bater e fica fora do install da imagem (`--filter "!mobile"`); o React da raiz é fixado por `pnpm.overrides` porque o React Native exige versão exata. Seção própria no checklist; o app em si vem da skill `react-native-mobile-app`.

## CLAUDE.md do monorepo

Coloque na raiz as três regras que evitam a maior parte dos erros: checar `docker info` antes de qualquer `docker compose`; usar `docker-compose.dev.yml` para desenvolvimento (o compose sem sufixo é produção e recusa subir sem secrets); rodar Prisma sempre pelo container ou via `pnpm --filter @repo/database`, porque o package não lê o `.env` da raiz. Template em `assets/root/CLAUDE.md`.
