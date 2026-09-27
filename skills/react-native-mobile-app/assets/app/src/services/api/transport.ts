// A porta de transporte: a única coisa com que o client fala. FetchTransport vai à rede; o
// MockTransport (mock.ts) responde o mesmo contrato em memória. É isso que deixa o client, as
// stores e as telas testáveis sem servidor, e o app rodável no simulador sem backend.

export interface TransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/** `headers` com nomes em minúsculas. */
export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
}

export interface Transport {
  fetch(req: TransportRequest): Promise<TransportResponse>;
}

export class FetchTransport implements Transport {
  async fetch(req: TransportRequest): Promise<TransportResponse> {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return { status: res.status, headers, text: await res.text() };
  }
}
