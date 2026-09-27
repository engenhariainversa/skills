-- prisma/migrations/<timestamp>_<tabela>_embeddings/migration.sql
-- Crie com `prisma migrate dev --create-only --name <tabela>_embeddings` e cole isto: o Prisma não
-- gera CREATE EXTENSION nem tipos vector sozinho. Precisa da imagem com pgvector (docker/db).
CREATE EXTENSION IF NOT EXISTS vector;
-- CREATE EXTENSION IF NOT EXISTS postgis;   -- se usar Dockerfile.postgis

CREATE TABLE "<tabela>" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    -- Dimensão fixa = a do modelo (384 para paraphrase-multilingual-MiniLM-L12-v2).
    -- Nula até o embedding ser calculado: a linha é gravada primeiro, o vetor depois.
    "embedding" vector(384),
    -- Qual modelo + versão do texto gerou o vetor (ex.: "<modelo>#t1"). Só se comparam vetores com o
    -- mesmo valor; trocar modelo ou formato do texto = re-embed pelo sweeper.
    "embed_model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "<tabela>_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "<tabela>_created_at_idx" ON "<tabela>"("created_at");

-- Índice ANN (HNSW) só quando a busca exata ficar lenta (dezenas de milhares de linhas por consulta).
-- O Prisma não sabe declarar esse índice no schema: o check de drift (`migrate diff --exit-code`)
-- vai acusar "Removed index" e bloquear o deploy. Veja references/rollout-and-ci.md antes de ligar.
-- CREATE INDEX "<tabela>_embedding_hnsw" ON "<tabela>" USING hnsw ("embedding" vector_cosine_ops);
