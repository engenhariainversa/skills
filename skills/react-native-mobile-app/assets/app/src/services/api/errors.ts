import { errorBody } from '@repo/api-contract';

/** Toda resposta não-2xx. `code` é estável (o app decide por ele); `message` é o texto para a pessoa. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Nunca lança: corpo fora do contrato (portal cativo, página do Cloudflare) vira HTTP_<status>. */
  static fromResponse(status: number, text: string): ApiError {
    try {
      const parsed = errorBody.safeParse(JSON.parse(text));
      if (parsed.success) return new ApiError(status, parsed.data.code, parsed.data.error);
    } catch {
      // cai no genérico abaixo
    }
    return new ApiError(status, `HTTP_${status}`, `Erro do servidor (${status})`);
  }
}
