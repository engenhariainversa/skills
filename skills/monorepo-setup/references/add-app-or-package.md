# Checklist: adicionar um app ou package

## Package novo (`packages/<nome>`)

1. `package.json`: `"name": "@repo/<nome>"`, `"private": true`, `"version": "0.0.0"`.
   - Consumido como fonte (ui, types, clients): `"exports": { ".": "./src/index.ts" }`, sem build obrigatório.
   - Precisa de JS compilado (consumido por NestJS/Node): `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`, `"build": "tsc"`.
2. `tsconfig.json`: `{ "extends": "@repo/tsconfig/base.json", "compilerOptions": { "outDir": "dist" }, "include": ["src"] }` e `"@repo/tsconfig": "workspace:*"` em devDependencies.
3. Quem usa: `"@repo/<nome>": "workspace:*"` e, se for app Next e o package for fonte, entra em `transpilePackages`.
4. `pnpm install` dentro do container de dev (atualiza `pnpm-lock.yaml`): `docker compose -f docker-compose.dev.yml exec backend pnpm install`. O stage `deps` do Dockerfile já copia `packages/` inteiro, nada a mudar lá.
5. Se o package precisa aparecer no hot reload, adicione `./packages/<nome>/src:/app/packages/<nome>/src` nos volumes dos apps que o usam em `docker-compose.dev.yml`.

## App novo (`apps/<app>`)

1. Escolha a próxima porta da faixa (ex.: 4053) e fixe em `package.json` (`dev`/`start` com `--port`), `PORT` e nos dois composes.
2. `package.json` com nome simples (`<app>`), scripts `dev`/`build`/`start`/`lint`, deps `@repo/*` com `workspace:*`.
3. `tsconfig.json` estendendo `@repo/tsconfig/nextjs.json` (ou `nestjs.json`); `next.config.js` com `transpilePackages` dos packages-fonte.
4. **Dockerfile**:
   - stage `deps`: `COPY apps/<app>/package.json ./apps/<app>/package.json` (sem isso `pnpm install --frozen-lockfile` falha).
   - stage `<app>-build` a partir de `source` (ou `database-build` se usa Prisma), com `ARG`/`ENV` das `NEXT_PUBLIC_*` se for Next.
   - stage runtime `<app>` copiando `.next`/`dist`, `public`, `package.json`, `node_modules` da raiz e do app, `packages/`.
5. **Dockerfile.dev**: `COPY apps/<app>/package.json ./apps/<app>/package.json`.
6. **docker-compose.yml** (prod): serviço com `build.target: <app>`, `build.args` das `NEXT_PUBLIC_*`, `environment`, `depends_on` no backend se consumir a API, `restart: unless-stopped`.
7. **docker-compose.dev.yml**: serviço com `dockerfile: Dockerfile.dev`, `command: pnpm --filter <app> dev`, volumes só das pastas de código, porta.
8. Se for público: `docker-compose.override.yml` colocando o serviço na rede `proxy` sem portas, e `nginx/conf.d/<subdominio>.conf` (skill `docker-nginx-cloudflare-proxy`). Adicione a origem em `CORS_ORIGINS` do backend.
9. `pnpm install` no container de dev e `docker compose -f docker-compose.dev.yml up --build <app>` para validar.

## Verificação rápida

```bash
pnpm --filter <app> build                      # dentro do container de dev
docker compose build <app>                     # target de produção compila
docker compose config | grep -A5 "^  <app>:"   # portas/args corretos
```

## App mobile (`apps/mobile`, Expo / React Native)

O app nativo vive no monorepo para dividir contrato, tipos e queries com o backend, mas **não roda em Docker nem entra em imagem**: o build é no EAS e o dev é Metro + development build. Scaffold, arquitetura e build: skill `react-native-mobile-app`. Aqui fica só o que muda no monorepo.

1. Copie o template da skill para `apps/mobile/` (`"name": "mobile"`) e, se a API for REST, `packages/api-contract/` (`@repo/api-contract`, zod compilado para `dist/`, usado pelo backend para validar e pelo app para decodificar). Se for GraphQL, o app consome `@repo/graphql` (veja `references/graphql-client.md` da skill mobile).
2. **Uma versão de React no repo inteiro**: o React Native fixa a versão exata e o Next dos outros apps precisa seguir. No `package.json` da raiz:
   ```json
   "pnpm": { "overrides": { "react": "19.2.3", "react-dom": "19.2.3", "@types/react": "~19.2.2" } }
   ```
   Upgrade de SDK do Expo = subir essas versões e testar landing/cms junto.
3. **Dockerfile** (stage `deps`): copie o `package.json` do mobile para o lockfile bater e exclua o workspace do install:
   ```dockerfile
   COPY apps/mobile/package.json ./apps/mobile/package.json
   RUN pnpm install --frozen-lockfile --filter "!mobile"
   ```
   Mesmo ajuste no `Dockerfile.dev`. Sem o filtro, a imagem baixa o React Native inteiro (centenas de MB) à toa.
4. **`.dockerignore`**: `apps/mobile/*` seguido de `!apps/mobile/package.json`, para o stage `source` (`COPY . .`) não carregar assets e `node_modules` do app.
5. **Compose e nginx**: nada. O app fala com a API pública (`https://api.<dominio>`); lembre que rota atrás de Cloudflare Access é inalcançável pelo app, e que o backend pode querer checar o header `X-App-Version`.
6. **Turborepo**: os scripts `typecheck`, `test`, `lint` do mobile entram no `turbo run` normalmente; não defina `build` no mobile (o "build" é o EAS). Se `@repo/api-contract` é compilado, `turbo run typecheck` precisa de `dependsOn: ["^build"]` na task.
7. **Metro**: `expo/metro-config` acha a raiz do workspace sozinho. Se aparecer "Unable to resolve module" ou duas cópias de `react`, use `node-linker=hoisted` no `.npmrc` da raiz (afeta o repo todo; rode `pnpm install` de novo e revalide os builds Docker).
8. **CI**: typecheck e testes do mobile rodam no job de check (container `node:22`), não no deploy. O deploy do servidor continua sem saber que o app existe.

Verificação rápida:

```bash
pnpm install && pnpm --filter @repo/api-contract build
pnpm --filter mobile typecheck && pnpm --filter mobile test
docker compose build backend        # imagem continua sem react-native
```
