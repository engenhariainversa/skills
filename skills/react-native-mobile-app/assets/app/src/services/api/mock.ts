// Servidor em memória que responde o MESMO contrato (URLs, status, corpos) que o backend real.
// Ninguém fora deste arquivo sabe a diferença: o mesmo client roda por cima. Use para o simulador
// sem backend e em todo teste de store/tela.
import type { Transport, TransportRequest, TransportResponse } from './transport';

const json = (status: number, body: unknown): TransportResponse => ({ status, headers: { 'content-type': 'application/json' }, text: JSON.stringify(body) });

export function createMockTransport(): Transport {
  const state = { access: 'mock-access-1', refresh: 'mock-refresh-1', user: { id: 'u1', name: 'Pessoa Teste', email: 'teste@example.com' } };

  const routes: Record<string, (req: TransportRequest) => TransportResponse> = {
    'POST /auth/login': (req) => {
      const body = JSON.parse(req.body ?? '{}') as { email?: string; password?: string };
      if (!body.email || !body.password) return json(400, { code: 'BAD_REQUEST', error: 'Informe e-mail e senha.' });
      return json(200, { access_token: state.access, refresh_token: state.refresh, expires_in: 900 });
    },
    'POST /auth/refresh': () => json(200, { access_token: state.access, refresh_token: state.refresh, expires_in: 900 }),
    'GET /me': (req) => (req.headers.Authorization === `Bearer ${state.access}` ? json(200, state.user) : json(401, { code: 'TOKEN_EXPIRED', error: 'Sessão expirada.' })),
  };

  return {
    async fetch(req) {
      const path = new URL(req.url).pathname;
      const handler = routes[`${req.method} ${path}`];
      return handler ? handler(req) : json(404, { code: 'NOT_FOUND', error: 'Rota não encontrada.' });
    },
  };
}
