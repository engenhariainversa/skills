// Mantém os vetores em dia sem segurar request nenhuma: linhas gravadas com o serviço fora do ar, ou
// de uma versão antiga de `embedText`, ganham vetor no próximo tick. É também o que re-embeda tudo
// depois de subir EMBED_TEXT_VERSION.
import type { Embedder } from './embeddings';
import { EMBED_TEXT_VERSION, embedTag, embedText } from './embed-text';
import type { VectorRepository } from './vector-repository';

export async function embedPending(repo: VectorRepository, embedder: Embedder, limit = 32): Promise<number> {
  const rows = await repo.listToEmbed(limit, `#${EMBED_TEXT_VERSION}`);
  if (rows.length === 0) return 0;
  const { model, vectors } = await embedder.embed(rows.map(embedText)); // 1 request por lote (máx. 32)
  await Promise.all(rows.map((r, i) => repo.setEmbedding(r.id, vectors[i]!, embedTag(model))));
  return rows.length;
}

/** Roda já e a cada `intervalMs`; `unref` para não segurar o processo; um tick nunca sobrepõe o
 *  anterior. Loga só contagens e códigos. No NestJS: chame no onModuleInit e guarde o stop para o
 *  onModuleDestroy (ou use @nestjs/schedule com @Interval). */
export function startEmbedSweeper(repo: VectorRepository, embedder: Embedder, log: { info(o: object, m: string): void; warn(o: object, m: string): void }, intervalMs = 10 * 60 * 1000): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const n = await embedPending(repo, embedder);
      if (n > 0) log.info({ embedded: n }, 'embeddings updated');
    } catch (err) {
      log.warn({ code: (err as { code?: string }).code ?? 'EMBED_SWEEP_FAILED' }, 'embed sweep failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
