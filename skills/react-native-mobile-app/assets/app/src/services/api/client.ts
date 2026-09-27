// O client HTTP do app sobre um Transport. Toda resposta 2xx é validada com o schema zod do
// contrato compartilhado com o backend; um 401 TOKEN_EXPIRED dispara UMA renovação (single-flight,
// chamadas simultâneas esperam a mesma) e UMA nova tentativa. Nunca para outro código de erro.
import type { z } from 'zod';
import { meResponse, tokenResponse, type TLoginBody } from '@repo/api-contract';
import { ApiError } from './errors';
import type { Transport } from './transport';

export interface ApiClientOptions {
  transport: Transport;
  baseUrl: string;
  /** Ex.: `ios/1.2.0+34`. O backend pode recusar versões antigas com 426. */
  appHeader: string;
  /** Token de acesso atual (a session store responde). */
  accessToken: () => string | null;
  /** Renovação feita pela session store; null = não deu, sessão acabou. */
  onTokenExpired: () => Promise<string | null>;
}

type CallOptions = { auth?: boolean; body?: unknown; retry?: boolean; token?: string | null };

export function createApiClient(o: ApiClientOptions) {
  let renewing: Promise<string | null> | null = null;
  const renewOnce = () => {
    renewing ??= o.onTokenExpired().finally(() => {
      renewing = null;
    });
    return renewing;
  };

  function decode<T>(text: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new ApiError(502, 'BAD_RESPONSE', 'Resposta inesperada do servidor');
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ApiError(502, 'BAD_RESPONSE', 'Resposta inesperada do servidor');
    return parsed.data;
  }

  async function call<T>(method: string, path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, opts: CallOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json', 'X-App-Version': o.appHeader };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const token = opts.auth === false ? null : (opts.token ?? o.accessToken());
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await o.transport.fetch({
      method,
      url: o.baseUrl + path,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    if (res.status >= 200 && res.status < 300) return decode(res.text, schema);

    const err = ApiError.fromResponse(res.status, res.text);
    if (err.status === 401 && err.code === 'TOKEN_EXPIRED' && token && opts.retry !== false) {
      const fresh = await renewOnce();
      if (fresh) return call(method, path, schema, { ...opts, token: fresh, retry: false });
    }
    throw err;
  }

  // Um método por rota do contrato. Views nunca chamam isto direto: só viewmodels (stores).
  return {
    login: (body: TLoginBody) => call('POST', '/auth/login', tokenResponse, { auth: false, body }),
    refresh: (refreshToken: string) => call('POST', '/auth/refresh', tokenResponse, { auth: false, body: { refresh_token: refreshToken } }),
    me: () => call('GET', '/me', meResponse),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
