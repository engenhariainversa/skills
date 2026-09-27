// Cliente HTTP do serviço de embeddings (docker/embed). Sem dependência de framework: no NestJS,
// registre como provider (useFactory) lendo EMBED_URL/EMBED_SECRET do ConfigService.
import { z } from 'zod';

export const EMBED_TIMEOUT_MS = 2000;

export class EmbedError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = 'EmbedError';
  }
}

/** Porta única para gerar vetores: troque a implementação (outro serviço, API externa) sem mexer no
 *  repositório. Quem trocar de modelo muda a dimensão: coluna vector(N) e `embed_model` acompanham. */
export interface Embedder {
  embed(texts: string[]): Promise<{ model: string; vectors: number[][] }>;
}

const embedResponse = z.object({ model: z.string(), vectors: z.array(z.array(z.number())) });

/** POST {url}/embed com Bearer. Erros viram EmbedError com código estável (EMBED_TIMEOUT,
 *  EMBED_UNREACHABLE, EMBED_HTTP_<status>, EMBED_BAD_RESPONSE): loga-se o código, nunca o texto. */
export function httpEmbedder(url: string, secret: string, fetchImpl: typeof fetch = globalThis.fetch, timeoutMs = EMBED_TIMEOUT_MS): Embedder {
  const base = url.replace(/\/$/, '');
  return {
    async embed(texts) {
      if (texts.length === 0) return { model: '', vectors: [] };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(`${base}/embed`, {
          method: 'POST',
          headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
          body: JSON.stringify({ texts }),
          signal: controller.signal,
        });
        if (!res.ok) throw new EmbedError(`EMBED_HTTP_${res.status}`);
        const parsed = embedResponse.safeParse(await res.json().catch(() => null));
        if (!parsed.success) throw new EmbedError('EMBED_BAD_RESPONSE');
        if (parsed.data.vectors.length !== texts.length) throw new EmbedError('EMBED_BAD_RESPONSE', 'vector count mismatch');
        return parsed.data;
      } catch (err) {
        if (err instanceof EmbedError) throw err;
        if (err instanceof Error && err.name === 'AbortError') throw new EmbedError('EMBED_TIMEOUT');
        throw new EmbedError('EMBED_UNREACHABLE', err instanceof Error ? err.message : String(err));
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** null quando URL ou segredo faltam: a feature que depende de similaridade fica desligada, o resto
 *  do app segue normal. */
export function embedderFromEnv(env: NodeJS.ProcessEnv = process.env): Embedder | null {
  return env.EMBED_URL && env.EMBED_SECRET ? httpEmbedder(env.EMBED_URL, env.EMBED_SECRET) : null;
}
