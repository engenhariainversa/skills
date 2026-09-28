# App mobile falando com backend GraphQL (NestJS)

No monorepo de `monorepo-setup` o backend é NestJS GraphQL code-first **com Subscriptions** (`graphql-ws`) e existe `@repo/graphql` com `createApolloClient` (HTTP + WebSocket), queries e tipos usados pelos apps Next. O app mobile reusa o mesmo package: só muda de onde vem a URL e o token.

## Onde encaixa na arquitetura do template

- `src/services/api/` passa a exportar o `ApolloClient` em vez do client REST. A regra continua: **views não chamam API**; as stores (viewmodels) chamam `client.query/mutate/subscribe` e expõem estado. Hooks `useQuery`/`useSubscription` direto na tela perdem o teste em Node puro; use só em leitura descartável.
- Auth igual ao template: refresh no SecureStore, access em memória na session store, `renew()` single-flight.
- Se parte da API for REST (upload, webhook, health), mantenha o `Transport` para essa parte.

## Client

```ts
// src/services/api/apollo.ts
import { createApolloClient } from '@repo/graphql';
import { API_URL } from './config';
import { useSessionStore } from '@/features/session/viewmodel/useSessionStore';

export const apollo = createApolloClient({
  uri: `${API_URL}/graphql`,
  wsUri: `${API_URL.replace(/^http/, 'ws')}/graphql`,
  getToken: () => useSessionStore.getState().accessToken,
  // React Native já tem WebSocket global: não passe webSocketImpl.
});

// Token mudou (login, refresh, logout): derruba o WS; o graphql-ws reconecta com o token novo.
useSessionStore.subscribe((s, prev) => {
  if (s.accessToken !== prev.accessToken) apollo.wsClient?.terminate();
});
```

`401`/`UNAUTHENTICATED` no HTTP: a session store faz `renew()` e a store que chamou repete a operação uma vez (mesmo desenho do client REST do template). Numa subscription, o erro chega em `result.error` dentro de `next` (Apollo Client 4); trate ali: `renew()` e `terminate()` para reassinar.

## Subscription dentro de uma store

Estado do servidor entra por um caminho só (regra 5 de `architecture.md`): a subscription alimenta a store, e a view só lê.

```ts
// src/features/notifications/viewmodel/createNotificationsStore.ts
export function createNotificationsStore(deps: { apollo: ApolloClient }) {
  let sub: { unsubscribe(): void } | null = null;
  const store = create<State>()((set) => ({
    items: [],
    start() {
      sub?.unsubscribe();
      sub = deps.apollo.subscribe({ query: NOTIFICATION_ADDED }).subscribe({
        next: (r) => {
          if (r.error) return set({ error: r.error.message });
          if (r.data) set((s) => ({ items: [r.data!.notificationAdded, ...s.items] }));
        },
      });
    },
    stop() { sub?.unsubscribe(); sub = null; },
  }));
  sessionEnded.subscribe(() => { store.getState().stop(); store.setState({ items: [] }); });
  return store;
}
```

`start()` é chamado pela view da tela que precisa (ou pelo `_layout` quando a sessão vira `signedIn`); `stop()` no `sessionEnded`. Em background o iOS fecha o socket: o `graphql-ws` reconecta ao voltar (`appForeground`), sem código extra.

## Pontos de atenção

- `API_URL` no emulador Android: `http://10.0.2.2:<porta>`; aparelho físico: IP da máquina na LAN; produção: `https://api.<dominio>` atrás do proxy (skill `docker-nginx-cloudflare-proxy`), e o WS vira `wss://` sozinho. Cloudflare Access na frente da API bloqueia o app: a rota da API mobile fica fora do Access.
- CORS não se aplica ao app nativo, mas o backend pode recusar requests sem `Origin`; confira o guard.
- Testes: stores recebem o client por injeção (`createXStore({ apollo })`); o teste passa um client com `SchemaLink` sobre o schema do backend ou um `ApolloLink` falso que emite os resultados desejados (inclusive para subscription, que é só um Observable).
- `@repo/graphql` exporta fonte TS: o Metro transpila packages do workspace, mas o Jest precisa do `@repo` no `transformIgnorePatterns` (já está no `jest.config.js` do template). Mantenha **uma** versão de `graphql-ws` e `@apollo/client` no lockfile (`pnpm why graphql-ws`); duas cópias quebram o `split`.
- Detalhes do lado do servidor (guard único, `filter`, Redis com réplicas, teste de terminal): `references/graphql-subscriptions.md` da skill `monorepo-setup`.
