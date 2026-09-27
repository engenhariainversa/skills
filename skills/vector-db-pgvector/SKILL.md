---
name: vector-db-pgvector
description: Adiciona busca por similaridade semântica (banco vetorizado) a um projeto com Postgres + Prisma usando pgvector na própria base, sem Pinecone/Qdrant, e um serviço de embeddings local em Docker (fastembed/ONNX em CPU, modelo multilíngue de 384 dimensões) atrás de Bearer. Cobre imagem do Postgres com pgvector (e variante com PostGIS), migration com CREATE EXTENSION e coluna vector(N), Prisma com Unsupported + SQL cru, cliente TypeScript do embedder, busca k-NN por cosseno, sweeper que re-embeda, calibração de limiar e deduplicação de conteúdo gerado por agente/LLM. Use sempre que o usuário falar em "banco vetorizado", "vector database", "pgvector", "embeddings", "busca semântica", "similaridade", "RAG", "memória do agente", "evitar duplicatas parecidas", "itens parecidos demais", ou quiser pgvector junto com PostGIS no mesmo Postgres.
---

# pgvector + serviço de embeddings, tudo em Docker

Referência viva: o projeto termhub (memória de decisões do chat: cada resposta vira um vetor e perguntas quase idênticas recebem a resposta anterior como sugestão). Esta skill tira dali o que é genérico. O mesmo mecanismo serve para dedup de conteúdo gerado: antes de publicar um item novo, busca os vizinhos mais próximos e recusa se estiver perto demais.

## Arquitetura

```
backend (NestJS/Fastify) ── POST /embed (Bearer) ──▶ embed  (python:3.12-slim + fastembed, CPU)
      │                                                pesos no volume embed-models
      └── $queryRaw / $executeRaw ─────────────────▶ db (postgres + pgvector [+ PostGIS])
                                                     coluna vector(384), busca <=> (cosseno)
```

- **pgvector na mesma base**, não um vector DB separado: join com as tabelas normais, transação, backup e migrations de sempre. Um Qdrant só se justifica com milhões de vetores ou filtros que o Postgres não aguenta.
- **Embeddings locais**: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` via fastembed (ONNX, sem torch), 384 dimensões, bom em pt-BR e en, ~500 MB de pesos, dezenas de ms por lote em CPU. Sem custo por chamada e sem mandar texto para fora. Trocar por uma API externa é trocar a implementação de `Embedder`; a coluna `vector(N)` acompanha a dimensão do modelo.
- **Sem chunking**: os textos são curtos (limite de 2000 caracteres e 32 textos por request no serviço). Para documentos longos (RAG sobre arquivos), quebre em trechos de ~1000 caracteres com sobreposição, uma linha por trecho com FK para o documento; o resto da receita é igual.
- **Feature opcional**: sem `EMBED_URL`/`EMBED_SECRET` o app sobe normal e só a funcionalidade de similaridade fica desligada. Timeout de 2 s no cliente; falhou, segue sem.

## Passo a passo

### 1. Imagem do Postgres

Copie `assets/db/` para `docker/db/` e aponte o serviço `db` do compose para ela (`assets/compose/docker-compose.snippet.yml`):

- `Dockerfile`: `postgres:16-alpine` + pgvector compilado (tag fixada). Use quando já existe volume de dados em alpine.
- `Dockerfile.postgis`: `pgvector/pgvector:pg17` + PostGIS via apt. Para projeto novo que também precisa de geo (ex.: pontos no mapa + vetores).

Ambas foram buildadas e testadas: `CREATE EXTENSION vector` (0.8.x) e `postgis` (3.6) funcionam, busca por cosseno ordena certo.

### 2. Serviço de embeddings

Copie `assets/embed/` para `docker/embed/` e adicione o serviço `embed` do snippet. `GET /health` responde 503 até o modelo baixar (primeiro start leva 1–3 min; o load tenta de novo com backoff de 30 s a 15 min se o Hugging Face devolver 429). `POST /embed` exige `Authorization: Bearer $EMBED_SECRET`; **segredo vazio recusa tudo**, o serviço nunca fica aberto na rede. Sem porta publicada: só o backend fala com ele pela rede do compose.

```bash
openssl rand -base64 32          # EMBED_SECRET, vai para o .env / secrets do GitHub
docker compose up -d --build embed && docker compose logs -f embed   # espere "model ... loaded (dim 384)"
```

Os textos nunca vão para log nem disco; o log tem só contagens e tempos. Mantenha isso no backend também: logue ids e códigos de erro, nunca o texto embedado.

### 3. Schema e migration

- `assets/prisma/schema-snippet.prisma`: coluna `embedding Unsupported("vector(384)")?` + `embedModel String?`.
- `assets/prisma/migration.sql`: crie com `prisma migrate dev --create-only --name <tabela>_embeddings`, cole o SQL (começa com `CREATE EXTENSION IF NOT EXISTS vector;`) e só então aplique. Troque `<tabela>`/`<Modelo>` e os campos.

`embedding` nulo é normal: a linha é gravada primeiro e o vetor depois (na hora, fire-and-forget, ou pelo sweeper).

`embed_model` guarda `<modelo>#<versão do texto>`. Só se comparam vetores com o mesmo valor. Mudou o modelo ou o formato do texto? Suba `EMBED_TEXT_VERSION` e o sweeper re-embeda o backlog sozinho.

### 4. Código no backend

Copie `assets/src/` para o módulo que usa similaridade:

| Arquivo | Papel |
|---|---|
| `embeddings.ts` | interface `Embedder`, `httpEmbedder` (timeout, zod na resposta, `EmbedError` com código), `embedderFromEnv` (null = desligado) |
| `embed-text.ts` | `embedText` (o texto que vira vetor, mesma função para gravar e consultar), `EMBED_TEXT_VERSION`, `embedTag` |
| `vector-repository.ts` | `setEmbedding`, `nearest(vector, {k, embedModel})` com `1 - (embedding <=> $1::vector)`, `listToEmbed` |
| `embed-sweeper.ts` | `embedPending` em lotes de 32 e `startEmbedSweeper` (tick a cada 10 min, sem sobreposição, `unref`) |

No NestJS: `Embedder` como provider com `useFactory` lendo o `ConfigService` (retorna `null` sem as envs), `VectorRepository` recebendo o `PrismaService`, sweeper iniciado no `onModuleInit` e parado no `onModuleDestroy`. Pelo monorepo (`monorepo-setup`), o tipo do Prisma vem de `@repo/database`.

Fluxo de escrita: `INSERT` normal pelo Prisma → `embedder.embed([embedText(item)])` → `setEmbedding(id, vec, embedTag(model))`. Se o embed falhar, a linha fica sem vetor e o sweeper resolve.

Fluxo de consulta: `embed` do texto novo → `nearest(vec, { k: 5, embedModel: embedTag(model) })` → filtra `similarity >= limiar`. Retorne vizinhos para quem chamou (ex.: o agente), não só sim/não.

### 5. Limiar e dedup

Não chute o limiar. `references/similarity-and-dedup.md` tem a medição real (perguntas de sentido oposto a 0.974, paráfrases a 0.56–0.90), como calibrar com 30 pares rotulados e o loop gerar → buscar vizinhos → regenerar com feedback para conteúdo criado por agente (ex.: itens colecionáveis que não podem se repetir).

### 6. Produção e CI

`references/rollout-and-ci.md`: ordem de rollout num banco que já está no ar (recriar o db com a imagem nova **antes** do merge, senão a migration falha e trava todo deploy com `P3009`), imagem do Postgres no CI (`pgvector/pgvector:pg16`), por que começar sem índice HNSW (o Prisma não o expressa e o check de drift bloqueia o deploy; com filtro por usuário o HNSW perde vizinhos) e checklist de validação.

## O que fica a cargo de quem opera

- Recriar o container `db` de produção com a imagem nova (reinicia o Postgres por segundos). Não faça isso por conta própria num servidor com dados reais: entregue o comando.
- Criar o `EMBED_SECRET` nos secrets do repositório/`.env` de produção.

## Próximos passos comuns

- Monorepo com `@repo/database` e backend NestJS: skill `monorepo-setup`.
- Deploy: skill `github-selfhosted-deploy` (acrescente um passo `up -d --build --no-deps embed` antes do app).
