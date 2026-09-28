/**
 * `NEXT_PUBLIC_API_URL` é o host (`http://localhost:4050`), `NEXT_PUBLIC_GRAPHQL_PATH` o path
 * (`/graphql`). Separados porque uploads reusam o host, e porque a URL do WebSocket é a mesma
 * com o esquema trocado: http → ws, https → wss.
 */
export const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
export const GRAPHQL_PATH = process.env.NEXT_PUBLIC_GRAPHQL_PATH ?? '/graphql';
export const GRAPHQL_URL = `${BASE_URL}${GRAPHQL_PATH}`;
export const GRAPHQL_WS_URL = GRAPHQL_URL.replace(/^http/, 'ws');
