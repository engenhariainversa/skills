# GraphQL Subscriptions (tempo real) no backend NestJS

Validado com `@nestjs/graphql` 13.4, `@apollo/server` 5, `graphql-ws` 6.3, `graphql-subscriptions` 3 e `@apollo/client` 4.3, rodando o template `assets/backend/` num container `node:22`: build limpo, e um script de terminal confirmou health, recusa sem token por HTTP e por WebSocket, e entrega filtrada por usuário. Leia quando for criar a primeira subscription ou quando "o WebSocket não conecta".

## Como as peças se ligam

```
client (Next/mobile)                      backend NestJS
  query/mutation ──HTTP POST /graphql──▶  Apollo Server ──▶ GqlAuthGuard ──▶ resolver
  subscription ───WS  /graphql (graphql-ws)──▶ onConnect (token → header) ──▶ GqlAuthGuard ──▶ @Subscription
                                                                                  ▲
  mutation/service/job/webhook ──▶ pubSub.publish('topico', { topico: payload }) ─┘
```

- **Um path, dois transportes.** O `ws` server é montado sobre o mesmo servidor HTTP do Nest, em `/graphql`. Não há porta nova, e o proxy nginx só precisa repassar o upgrade (o `proxy.conf` do `docker-nginx-cloudflare-proxy` já faz).
- **Um guard.** Navegador não manda header no upgrade do WebSocket, então o token vai em `connectionParams`. Em `onConnect` ele é copiado para `request.headers.authorization` e `context` devolve `{ req }` nos dois transportes: o `GqlAuthGuard` de passport-jwt nem sabe que é WS. Token ausente ou inválido: a operação `subscribe` volta com `Unauthorized`.
- **Um PubSub.** `PUB_SUB` é global; quem publica e quem assina injetam o mesmo objeto. O payload publicado tem a chave com o nome do campo da subscription: `publish('notificationAdded', { notificationAdded: {...} })`.
- **`filter` por assinante.** Recebe `(payload, variables, context)`; `context.req.user` é quem assinou. É ali que "cada um recebe só o que é dele".

## Criar uma subscription nova

1. Tipo do evento como `@ObjectType` (ou reuse o da entidade).
2. Onde o estado muda (service, mutation, job, webhook): `await this.pubSub.publish('pedidoAtualizado', { pedidoAtualizado: pedido })`. Publique **depois** de gravar no banco, nunca antes.
3. No resolver da feature:

```ts
@Subscription(() => Pedido, {
  // Roda a cada publish, por assinante: entrega só o pedido da loja que ele assinou.
  filter: (payload: { pedidoAtualizado: Pedido }, vars: { lojaId: string }) =>
    payload.pedidoAtualizado.lojaId === vars.lojaId,
})
@UseGuards(GqlAuthGuard)
async pedidoAtualizado(@Args('lojaId') lojaId: string, @CurrentUser() user: CurrentUser) {
  // Autorização ("esse usuário pode ver essa loja?") decide-se UMA vez, aqui no subscribe, e
  // recusa na hora em vez de deixar uma assinatura muda. O template traz `CurrentUser = { id, email }`:
  // ou acrescente a claim (ex.: `lojas: string[]`) no JWT e no `JwtStrategy.validate`, ou consulte
  // o service (`await this.lojas.usuarioTemAcesso(user.id, lojaId)`).
  if (!(await this.lojas.usuarioTemAcesso(user.id, lojaId))) throw new ForbiddenException();
  return this.pubSub.asyncIterableIterator('pedidoAtualizado');
}
```

Enum code-first (`registerEnumType(OrderStatus, { name: 'OrderStatus' })`) trafega os **nomes** dos membros (`PAGO`), não os valores (`'pago'`). Declare `enum OrderStatus { pendente = 'pendente', pago = 'pago' }` com nome e valor iguais se o client e o banco usam minúsculas.

4. O `schema.gql` é regenerado no boot (code-first). No client, o documento `subscription { pedidoAtualizado(lojaId: "...") { ... } }` vai para `packages/graphql/src/queries/`.
5. No Next: um client component `apps/cms/app/apollo-wrapper.tsx` cria o client uma vez e envolve o layout com `ApolloProvider` de `@apollo/client/react`; as telas usam `useSubscription(DOC, { variables })`. No mobile, sempre numa store (regra "estado do servidor entra por um caminho só").

```tsx
'use client';
import { ApolloProvider } from '@apollo/client/react';
import { createApolloClient, getAuthToken, GRAPHQL_URL, GRAPHQL_WS_URL } from '@repo/graphql';
import { useState } from 'react';

export function ApolloWrapper({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => createApolloClient({ uri: GRAPHQL_URL, wsUri: GRAPHQL_WS_URL, getToken: getAuthToken }));
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
```

`getAuthToken` lê o cookie de sessão do CMS (helper em `client/auth.ts` no monorepo de referência); a landing pública cria o client sem `getToken` nem `wsUri`.

## Client: `createApolloClient` de `@repo/graphql`

```ts
const client = createApolloClient({
  uri: GRAPHQL_URL,          // http(s)://api/graphql
  wsUri: GRAPHQL_WS_URL,     // ws(s)://api/graphql (mesma URL, esquema trocado)
  getToken: () => getAuthToken(),
});
```

- `lazy: true`: o WebSocket só abre na primeira subscription. Landing pública nunca abre.
- `retryAttempts: Infinity`: rede móvel cai e volta; o `graphql-ws` reconecta e reassina sozinho.
- **Trocou o token** (login, refresh, logout): `client.wsClient?.terminate()`. A conexão cai, reconecta e `connectionParams()` é chamado de novo com o token atual. Sem isso, a conexão antiga continua com o usuário antigo.
- **SSR**: sem `window` o `wsUri` é ignorado (não existe WebSocket no servidor do Next). Subscriptions só em client components.
- **Apollo Client 4**: erro de GraphQL numa subscription chega em `result.error` dentro de `next`, não no callback `error` (esse é só transporte). Trate os dois.

## Produção

- **Réplicas**: PubSub em memória só entrega dentro do processo. Com dois containers de backend (ou publicação vinda de um worker), troque o provider por `RedisPubSub` de `graphql-redis-subscriptions`, mesma interface; o Redis entra no compose sem porta publicada.
- **Conexões ociosas**: o `graphql-ws` manda ping a cada 12 s por padrão; `proxy_read_timeout 300s` do nginx e o Cloudflare Tunnel não derrubam a conexão. Se mudar o nginx, mantenha o timeout maior que o intervalo de ping.
- **Cloudflare Access** na frente da API bloqueia o upgrade de apps nativos; a rota da API fica fora do Access (skill `cloudflare-tunnel-hostnames`).
- **Backpressure**: subscription que dispara muito (streaming de texto, telemetria) merece agrupar eventos no service antes de publicar; cada `publish` vira um frame por assinante.

## Testar do terminal (sem front)

Sobe o backend (`pnpm --filter backend dev` ou o compose de dev) e roda um script Node no workspace com `@repo/graphql`, `ws` e `jsonwebtoken` (o segredo é o `JWT_SECRET` do `.env`):

```ts
import { gql } from '@apollo/client';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';
import { createApolloClient } from '@repo/graphql';

const token = (sub: string) => jwt.sign({ sub, email: `${sub}@x.dev` }, process.env.JWT_SECRET!, { expiresIn: '5m' });
const mk = (t: string | null) => createApolloClient({ uri: 'http://localhost:4050/graphql', wsUri: 'ws://localhost:4050/graphql', getToken: () => t, webSocketImpl: WebSocket });
const SUB = gql`subscription { notificationAdded { id userId message } }`;
const NOTIFY = gql`mutation ($u: String!, $m: String!) { notify(userId: $u, message: $m) { id } }`;

async function main() {
  const alice = mk(token('alice')), bob = mk(token('bob'));
  const got: string[] = [];
  alice.subscribe({ query: SUB }).subscribe({ next: (r) => got.push(r.data!.notificationAdded.message) });
  await new Promise((r) => setTimeout(r, 300));                       // WS conecta e assina
  await bob.mutate({ mutation: NOTIFY, variables: { u: 'alice', m: 'oi alice' } });
  await bob.mutate({ mutation: NOTIFY, variables: { u: 'bob', m: 'oi bob' } });
  await new Promise((r) => setTimeout(r, 300));
  console.log(got); // ['oi alice']: o filtro segurou a de bob
  process.exit(0);
}
void main();
```

Rode com `node_modules/.bin/tsx script.ts` num package CommonJS (sem `"type": "module"`: o `tsx` lê `@repo/graphql` como fonte e o interop ESM perde os named exports). Se `got` vier vazio: token errado (veja `Unauthorized` em `result.error`), `wsUri` com esquema `http`, ou o proxy sem `Upgrade`.
