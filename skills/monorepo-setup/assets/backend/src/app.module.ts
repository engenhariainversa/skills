import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import type { Context as WsContext } from 'graphql-ws';
import type { IncomingMessage } from 'http';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { PubSubModule } from './pubsub/pubsub.module';

/**
 * Subscriptions (tempo real) nascem ligadas: protocolo `graphql-ws`, no MESMO path do HTTP.
 * O nginx do proxy já repassa `Upgrade`/`Connection` (skill docker-nginx-cloudflare-proxy),
 * então `wss://api.<dominio>/graphql` funciona sem porta nem rota extra.
 *
 * Auth no WebSocket: o navegador não manda header no upgrade, então o token vai em
 * `connectionParams: { authorization: 'Bearer ...' }`. Em `onConnect` ele é copiado para
 * `request.headers.authorization` e o `GqlAuthGuard` (passport-jwt) fica o mesmo para
 * query, mutation e subscription. Sem token ou token inválido: o guard recusa a operação.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      playground: false,
      plugins: [ApolloServerPluginLandingPageLocalDefault({ embed: true })],
      subscriptions: {
        'graphql-ws': {
          path: '/graphql',
          onConnect: (ctx: WsContext) => {
            const auth = ctx.connectionParams?.authorization ?? ctx.connectionParams?.Authorization;
            const { request } = ctx.extra as { request: IncomingMessage };
            if (typeof auth === 'string' && !request.headers.authorization) {
              request.headers.authorization = auth;
            }
          },
        },
      },
      // HTTP traz { req, res }; WebSocket traz { extra } com a request do upgrade.
      // Normalizar aqui deixa guards e resolvers lerem `ctx.req` nos dois casos.
      context: ({ req, res, extra }: { req?: unknown; res?: unknown; extra?: { request: unknown } }) => ({
        req: req ?? extra?.request,
        res,
      }),
    }),
    PubSubModule,
    AuthModule,
    EventsModule,
  ],
})
export class AppModule {}
