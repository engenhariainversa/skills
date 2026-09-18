---
name: nextjs-docker-bootstrap
description: Cria e roda um projeto Next.js (App Router, TypeScript, Tailwind, pnpm) usando SOMENTE Docker, sem instalar Node, nvm ou pnpm na máquina. Use sempre que o usuário pedir para "criar um projeto Next", "iniciar uma landing page", "subir um app React/Next", "configurar Docker para o Next", "docker dev com hot reload" ou quando for rodar npm/pnpm/next em uma máquina onde o Node não está instalado. Também use para adicionar Dockerfile e docker-compose (dev + prod) em um Next.js já existente.
---

# Next.js só com Docker

## Por que assim

A máquina host fica limpa: nada de nvm, versões de Node divergentes ou `node_modules` global. Tudo (scaffold, `pnpm install`, `next build`, lint) roda dentro de `node:22-alpine`. O mesmo `Dockerfile` serve o dev com hot reload e a imagem enxuta de produção (`output: "standalone"`), então o que você testa é o que vai pro ar.

Antes de instalar qualquer runtime no host, pergunte: **"vai rodar via Docker? quer compose de dev com hot reload?"**. A resposta padrão é sim.

## Passo a passo

### 1. Confirme o ambiente

```bash
docker version --format '{{.Server.Version}}' && docker compose version
ls -la   # pasta vazia? já tem package.json?
```

Se já existir um Next.js, pule para o passo 3.

### 2. Scaffold dentro de um container

Rode o `create-next-app` num container descartável, como o usuário do host (evita `node_modules` como root):

```bash
docker run --rm -it --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD:/app" -w /app node:22-alpine \
  npx --yes create-next-app@latest . --ts --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-pnpm --skip-install
```

Depois gere o lockfile e o `node_modules` (útil para o editor ter os tipos e para você ler `node_modules/next/dist/docs`, que o `AGENTS.md` gerado manda consultar):

```bash
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e COREPACK_HOME=/tmp/corepack \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 -v "$PWD:/app" -w /app node:22-alpine \
  sh -c "corepack pnpm@10 install"
rm -rf .pnpm-store   # pnpm às vezes deixa a store no projeto quando HOME=/tmp
```

Dica: `corepack pnpm@<versão> <comando>` funciona sem `corepack enable` (que tenta escrever em `/usr/local/bin` e falha sem root).

### 3. Arquivos de Docker

Copie os templates de `assets/` para a raiz do projeto e ajuste o que estiver marcado com `<app>`:

| Arquivo | Para quê |
|---|---|
| `assets/Dockerfile` | multi-stage: `deps` → `dev` (hot reload) / `build` → `runner` (standalone, usuário sem root) |
| `assets/docker-compose.yml` | profiles `dev` (porta local, código montado) e `prod` (imagem final, volume de dados) |
| `assets/.dockerignore` | mantém `node_modules`, `.next`, `.env*` e `data` fora do contexto de build |
| `assets/next.config.ts` | `output: "standalone"`, obrigatório para o stage `runner` |

Também garanta em `package.json`:

```json
"packageManager": "pnpm@10.33.0",
"scripts": { "docker:dev": "docker compose --profile dev up --build", "docker:prod": "docker compose --profile prod up -d --build" }
```

E em `.gitignore`: `/data`, `/.pnpm-store`, `!.env.example` (o scaffold ignora `.env*` inteiro).

Detalhes que importam no compose de dev:

- `.:/app` monta o código, mas `node_modules` e `.next` ficam em **volumes nomeados**. Sem isso o `node_modules` do host (ou a falta dele) sobrescreve o da imagem.
- `WATCHPACK_POLLING=true` no stage `dev`: sem polling o hot reload não percebe alterações em volumes montados em várias configurações de Docker.
- Publique a porta como `127.0.0.1:<porta>:3000` e verifique se ela está livre (`docker ps --format '{{.Ports}}'`), outro projeto pode já estar na 3000.

### 4. Rode tooling sempre dentro do container

```bash
docker compose --profile dev up --build            # dev em http://localhost:<porta>
docker compose --profile dev exec dev pnpm lint
docker compose --profile dev exec dev pnpm add zod
```

Sem compose no ar, use o `docker run` do passo 2 trocando o comando (`corepack pnpm@10 build`, `... lint`).

### 5. Valide antes de entregar

1. `corepack pnpm@10 build` no container termina com as rotas listadas e sem erro de tipos. Erros do tipo `Cannot find name 'LayoutProps'` antes do primeiro build são normais: esses tipos globais são gerados pelo próprio `next build`/`next dev`.
2. Suba a imagem `runner` e faça um `curl` na home:

```bash
docker compose --profile prod up -d --build
docker compose --profile prod exec app node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.status<500?0:1))"
```

3. Se o app grava arquivos (uploads, JSON de inscrições), aponte para `DATA_DIR` e monte um volume; o filesystem do container some no próximo deploy.

## Próximos passos comuns

- Publicar atrás de um proxy com domínio: skill `docker-nginx-cloudflare-proxy`.
- Deploy automático no push: skill `github-selfhosted-deploy`.
- Formulário com Server Action e persistência simples: skill `nextjs-server-action-form`.
