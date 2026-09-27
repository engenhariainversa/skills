// Leitura/escrita da coluna pgvector. `embedding` é Unsupported no Prisma, então tudo que toca nela
// é SQL cru parametrizado (tagged template: os valores viram parâmetros, nunca concatenação).
// Troque <tabela> e os campos pelos do seu model.
import type { PrismaClient } from '@prisma/client'; // ou '@repo/database'

export interface Neighbour {
  id: string;
  name: string;
  description: string;
  similarity: number; // cosseno, 1 = idêntico
}

/** Formato de texto do pgvector: `[x,y,z]`. Componentes não finitos viram 0 em vez de derrubar o write. */
export const toVector = (v: number[]): string => `[${v.map((x) => (Number.isFinite(x) ? x : 0)).join(',')}]`;

export class VectorRepository {
  constructor(private db: PrismaClient) {}

  async setEmbedding(id: string, vector: number[], embedModel: string): Promise<void> {
    await this.db.$executeRaw`UPDATE "<tabela>" SET "embedding" = ${toVector(vector)}::vector, "embed_model" = ${embedModel} WHERE "id" = ${id}`;
  }

  /**
   * Os `k` mais parecidos, melhor primeiro. `<=>` é a distância de cosseno (0 = igual), então
   * similaridade = 1 - distância. Só compara vetores do mesmo `embedModel` (modelo + versão do
   * texto): vetores de outro modelo não são comparáveis. Sem índice ANN isto é scan exato, que é o
   * certo até dezenas de milhares de linhas e nunca perde vizinho por pós-filtro.
   */
  async nearest(vector: number[], opts: { k: number; embedModel: string; excludeId?: string }): Promise<Neighbour[]> {
    const v = toVector(vector);
    const rows = await this.db.$queryRaw<(Omit<Neighbour, 'similarity'> & { similarity: number | string })[]>`
      SELECT id, name, description, 1 - (embedding <=> ${v}::vector) AS similarity
      FROM "<tabela>"
      WHERE embedding IS NOT NULL AND embed_model = ${opts.embedModel} AND id <> ${opts.excludeId ?? ''}
      ORDER BY embedding <=> ${v}::vector
      LIMIT ${opts.k}`;
    return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
  }

  /** Backlog do sweeper: sem vetor primeiro (mais antigos antes), depois os de outra versão do texto. */
  async listToEmbed(limit: number, tagSuffix: string): Promise<{ id: string; name: string; description: string }[]> {
    return this.db.$queryRaw`
      SELECT id, name, description FROM "<tabela>"
      WHERE embedding IS NULL OR embed_model IS NULL OR right(embed_model, length(${tagSuffix})) <> ${tagSuffix}
      ORDER BY (embedding IS NULL) DESC, created_at ASC
      LIMIT ${limit}`;
  }
}
