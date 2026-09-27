# App mobile falando com backend GraphQL (NestJS)

No monorepo de `monorepo-setup` o backend é NestJS GraphQL code-first e já existe `@repo/graphql` (client Apollo + queries + tipos) usado pelos apps Next. O app mobile reusa o mesmo package: as queries e os tipos gerados são os mesmos, só muda a criação do client.

## Onde encaixa na arquitetura do template

- `src/services/api/` passa a exportar um `ApolloClient` em vez do client REST. A regra continua: **views não chamam API**; as stores (viewmodels) chamam `client.query/mutate` e expõem estado. Hooks `useQuery` direto na tela são aceitáveis para leitura simples, mas perdem o teste em Node puro.
- Auth igual ao template: refresh no SecureStore, access em memória na session store, `renew()` single-flight.
- Se parte da API for REST (upload, webhook, health), mantenha o `Transport` para essa parte.

## Client (Apollo Client 3.x)

```ts
// src/services/api/apollo.ts
import { ApolloClient, HttpLink, InMemoryCache, from, fromPromise } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { API_URL } from './config';

let getToken: () => string | null = () => null;
let renew: () => Promise<string | null> = async () => null;
export function bindSession(get: typeof getToken, r: typeof renew) { getToken = get; renew = r; }

const auth = setContext((_, { headers }) => {
  const token = getToken();
  return { headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } };
});

// UNAUTHENTICATED → renova uma vez e repete a operação. Outros erros sobem para quem chamou.
const retryOnExpired = onError(({ graphQLErrors, operation, forward }) => {
  if (!graphQLErrors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED')) return;
  if (operation.getContext().retried) return;
  return fromPromise(renew()).filter(Boolean).flatMap((token) => {
    operation.setContext(({ headers = {} }) => ({ retried: true, headers: { ...headers, authorization: `Bearer ${token}` } }));
    return forward(operation);
  });
});

export const apollo = new ApolloClient({
  link: from([retryOnExpired, auth, new HttpLink({ uri: `${API_URL}/graphql` })]),
  cache: new InMemoryCache(),
});
```

Apollo Client 4 mudou a API dos links (classes `SetContextLink`/`ErrorLink`, imports de React em `@apollo/client/react`). Use a mesma major que `@repo/graphql` já usa e confira a doc dela antes de copiar.

## Pontos de atenção

- `API_URL` no emulador Android: `http://10.0.2.2:<porta>`; aparelho físico: IP da máquina na LAN; produção: HTTPS atrás do proxy (skill `docker-nginx-cloudflare-proxy`). Cloudflare Access na frente da API bloqueia o app: a rota da API mobile precisa ficar fora do Access (ou usar service token).
- CORS não se aplica ao app nativo, mas o backend pode recusar requests sem `Origin`; confira o guard.
- Subscriptions (tempo real): `graphql-ws` sobre WebSocket; o RN aceita headers no construtor do WebSocket (`new WebSocket(url, undefined, { headers })`), útil para mandar o Bearer no upgrade.
- Testes: stores recebem o client por injeção (`createXStore({ apollo })`), e o teste passa um client com `SchemaLink`/mocks ou `MockedProvider` nas telas.
- `@repo/graphql` exporta fonte TS: o Metro transpila packages do workspace, mas o Jest precisa do `@repo` no `transformIgnorePatterns` (já está no `jest.config.js` do template).
