# pgvector em produção: imagem, migration, CI e índice

## Qual imagem

| Situação | Imagem |
|---|---|
| Já existe volume criado por `postgres:<major>-alpine` | `assets/db/Dockerfile` (mesmo alpine + pgvector compilado). Mesma libc (musl): collations iguais, sem `REINDEX`. Fixe o digest exato da imagem que roda hoje. |
| Projeto novo, precisa de PostGIS também | `assets/db/Dockerfile.postgis` (`pgvector/pgvector:pg17` + `postgresql-17-postgis-3` via apt). |
| Projeto novo, só vetor | `pgvector/pgvector:pg17` direto, sem Dockerfile. |
| CI (banco descartável de teste) | `pgvector/pgvector:pg16/17`; com PostGIS, builde `Dockerfile.postgis` no job ou use um service com imagem publicada por você. |

Trocar alpine (musl) por Debian (glibc) num volume existente muda collations: índices de texto podem ficar corrompidos sem `REINDEX`. Por isso a variante alpine existe.

## Ordem de rollout num banco que já está no ar

A migration começa com `CREATE EXTENSION IF NOT EXISTS vector;`. Se o Postgres que roda não tiver a extensão instalada, ela falha. Ordem segura:

1. **Antes do merge**, recrie só o container do db a partir da imagem nova, mantendo o volume:
   `docker compose --env-file <prod.env> up -d --build --no-deps db` (reinicia o Postgres por alguns segundos).
2. Confira que a extensão está *disponível* (a migration é que cria):
   `docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT extversion FROM pg_available_extensions WHERE name='vector'"`
   Uma linha = ok. Nenhuma = pare e corrija a imagem.
3. Adicione `EMBED_SECRET` ao `.env`/secrets de produção e suba o serviço `embed` (`up -d --build --no-deps embed`).
4. Merge. O backend roda `prisma migrate deploy` no boot e cria extensão + tabela.

Pipelines que sobem o app com `--no-deps` não recriam o `db`: o passo 1 é manual, e deve ser feito por quem opera o servidor.

**Se a migration rodou sem a extensão**: o Prisma marca a migration como falha, o app novo não fica healthy e todo deploy seguinte para com `P3009`. Corrija a imagem (passos 1–2), depois `prisma migrate resolve --rolled-back <nome_da_migration>` e rode o deploy de novo. A migration falhou no primeiro statement, então reaplicar é seguro.

## Prisma

- Coluna como `Unsupported("vector(384)")?`. O client ignora a coluna; leitura/escrita por `$queryRaw`/`$executeRaw` com tagged template (parâmetros, não concatenação) e cast `::vector`.
- Nunca selecione `embedding` em listagens: é pesado e inútil fora do SQL.
- `prisma migrate dev --create-only` para escrever a migration à mão (extensão, tipo vector, índices parciais).
- Prisma 7: a URL do banco sai do `schema.prisma` e vai para `prisma.config.ts` + adapter (`@prisma/adapter-pg`) no runtime; nada muda no uso de `Unsupported` e raw SQL.

## Índice ANN (HNSW / IVFFlat) — quando e o preço

Sem índice, `ORDER BY embedding <=> $1 LIMIT k` é scan exato: recall 100%, e rápido o bastante até dezenas de milhares de linhas *depois do filtro do WHERE*. Comece assim.

Quando ligar HNSW, saiba que:

1. **O Prisma não expressa o índice.** O check de drift (`prisma migrate diff ... --exit-code`) acusa "Removed index on columns (embedding)" e bloqueia o deploy. Opções: excluir esse caso do check, ou criar o índice fora das migrations do Prisma (script idempotente pós-deploy).
2. **Filtro vira pós-filtro.** Com `ef_search` padrão (40), o HNSW acha 40 candidatos globais e só depois aplica o `WHERE user_id = ...`; o usuário pode receber menos de `k` ou nenhum vizinho real. pgvector ≥ 0.8 tem `SET hnsw.iterative_scan = relaxed_order` para mitigar; ou aumente `hnsw.ef_search`.
3. Operador do índice tem que bater com o da query: `vector_cosine_ops` ↔ `<=>`, `vector_l2_ops` ↔ `<->`, `vector_ip_ops` ↔ `<#>`.

## Checklist de validação

```bash
# extensão e tabela
docker compose exec db psql -U <user> -d <db> -c "\dx vector" -c "\d <tabela>"
# serviço de embed pronto (503 enquanto baixa o modelo)
docker compose exec backend node -e "fetch('http://embed:8000/health').then(r=>r.json()).then(console.log)"
# drift entre banco e schema (deve sair 0)
pnpm --filter @repo/database db:migrate:check
# testes do serviço de embed (sem baixar modelo)
docker run --rm -v "$PWD/docker/embed:/srv:ro" -w /srv python:3.12-slim python -m unittest -q test_api
```
