import { ApolloClient, HttpLink, InMemoryCache, from, split } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { removeTypenameFromVariables } from '@apollo/client/link/remove-typename';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient as createWsClient } from 'graphql-ws';

export type CreateApolloClientOptions = {
  /** Endpoint HTTP, ex.: `http://localhost:4050/graphql`. */
  uri: string;
  /** Endpoint WebSocket, ex.: `ws://localhost:4050/graphql`. Sem ele, o client não faz subscriptions. */
  wsUri?: string;
  /** Lê o token atual. Chamado a cada request HTTP e a cada (re)conexão do WebSocket. */
  getToken?: () => string | null | undefined;
  /** Next.js: `{ next: { revalidate: 60 } }`. */
  fetchOptions?: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } };
  /** Fora do navegador (Node, React Native com polyfill) passe a implementação de WebSocket. */
  webSocketImpl?: unknown;
};

/**
 * Um client para os três apps (landing, cms, mobile). Query e mutation vão por HTTP;
 * subscription vai pelo WebSocket `graphql-ws`, no mesmo path do backend NestJS.
 *
 * O token entra no HTTP como header e no WebSocket como `connectionParams` (o navegador não
 * manda header no upgrade); o backend copia um para o outro e usa um guard só. `getToken` é
 * lido na hora de conectar: depois de login/refresh, `client.wsClient?.terminate()` derruba a
 * conexão e o graphql-ws reconecta com o token novo.
 *
 * No servidor (SSR do Next) não existe WebSocket: `wsUri` é ignorado e só o HTTP fica ligado.
 */
export function createApolloClient(options: CreateApolloClientOptions) {
  const isServer = typeof window === 'undefined' && !options.webSocketImpl;

  const httpLink = new HttpLink({ uri: options.uri, fetchOptions: options.fetchOptions });

  const authLink = setContext((_operation, prevContext) => {
    const token = options.getToken?.();
    if (!token) return prevContext;
    return { ...prevContext, headers: { ...(prevContext.headers ?? {}), authorization: `Bearer ${token}` } };
  });

  // Tira o `__typename` que o cache injeta antes de mandar objetos de volta como variáveis:
  // input types do NestJS rejeitam chaves desconhecidas.
  const removeTypenameLink = removeTypenameFromVariables();

  const wsClient =
    options.wsUri && !isServer
      ? createWsClient({
          url: options.wsUri,
          lazy: true, // conecta na primeira subscription, não no boot
          retryAttempts: Infinity, // rede móvel cai; o client volta sozinho
          shouldRetry: () => true,
          connectionParams: () => {
            const token = options.getToken?.();
            return token ? { authorization: `Bearer ${token}` } : {};
          },
          webSocketImpl: options.webSocketImpl as never,
        })
      : null;

  const transport = wsClient
    ? split(
        ({ query }) => {
          const def = getMainDefinition(query);
          return def.kind === 'OperationDefinition' && def.operation === 'subscription';
        },
        new GraphQLWsLink(wsClient),
        httpLink,
      )
    : httpLink;

  const client = new ApolloClient({
    link: from([removeTypenameLink, authLink, transport]),
    cache: new InMemoryCache(),
    ssrMode: isServer,
  });

  return Object.assign(client, { wsClient });
}
