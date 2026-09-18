# Por que cada decisão

Contexto para adaptar sem quebrar. Leia quando for desviar do template.

- **pnpm workspaces em vez de npm/yarn**: `workspace:*` + store com hardlinks deixa `node_modules` pequeno e o `--filter` resolve dependências entre pacotes na ordem certa. É o que o Turborepo espera.
- **Turborepo só para orquestrar**: `turbo run build` respeita `dependsOn: ["^build"]` (constrói `@repo/database` antes do backend). `dev` com `cache: false, persistent: true` porque servidores de dev não terminam. Sem cache remoto: o build de produção acontece no Docker, onde o cache é por camada.
- **Um Dockerfile multi-target em vez de um por app**: os stages `base`/`deps`/`source` são compartilhados, então o `pnpm install` roda uma vez para os três apps e o compose só muda o `target`. Um Dockerfile por app duplicaria o stage de deps e triplicaria o tempo de build.
- **`deps` copia `packages/` inteiro mas só o `package.json` dos apps**: packages são pequenos e mudam junto com dependências; apps têm o grosso do código e mudariam a camada de install a cada commit.
- **`openssl` no alpine**: o engine do Prisma linka contra ele; sem isso o `prisma generate` falha com erro pouco claro.
- **`@repo/database` com `dist/`, o resto como fonte**: NestJS compila com `tsc` para CommonJS e não transpila dependências; Next.js transpila via `transpilePackages`. Compilar só o que precisa mantém o hot reload simples nos apps Next.
- **`db:push` bloqueado**: em time, alguém rodando `push` deixa o banco de produção diferente do histórico de migrations. O `db:migrate:check` no pipeline pega quem passou por cima.
- **Migrations no boot do backend** (`migrate deploy && seed && start`): deploy é um passo só e o seed é idempotente. Alternativa: um job separado no pipeline, útil quando há mais de uma réplica do backend.
- **`NEXT_PUBLIC_*` como build args**: o Next embute essas variáveis no bundle do cliente no `next build`. Passar só como `environment` em runtime não tem efeito no browser.
- **Credenciais de dev fixas no compose de dev e no `.env.example`**: elimina o "copia o .env de alguém". Produção usa `${VAR:?}` para falhar cedo se um secret faltar.
- **`.env` de produção escrito pelo pipeline em `/opt/<projeto>/.env` com `chmod 600`**: o checkout do runner é limpo a cada run; o `.env` fora do checkout sobrevive e não entra no git.
- **Healthcheck em Node puro**: as imagens alpine não trazem `curl`/`wget` garantidos; `net.createConnection` está sempre disponível.
- **Volumes de dev só nas pastas de código**: montar `.:/app` esconderia o `node_modules` e o `dist` gerados na imagem, e o `node_modules` do host (se existir) seria de outro SO.
