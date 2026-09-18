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
