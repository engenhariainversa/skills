import { Global, Module } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';

export const PUB_SUB = 'PUB_SUB';

/**
 * Um PubSub para o app inteiro: quem publica (mutation, job, webhook) e quem assina
 * (resolver de @Subscription) falam pelo mesmo objeto, injetado por `@Inject(PUB_SUB)`.
 *
 * Em memória serve para uma instância do backend. Com mais de uma réplica (ou fila fora do
 * processo), troque por `graphql-redis-subscriptions` (`RedisPubSub`) mantendo esta mesma
 * interface: nada muda nos resolvers.
 */
@Global()
@Module({
  providers: [{ provide: PUB_SUB, useValue: new PubSub() }],
  exports: [PUB_SUB],
})
export class PubSubModule {}
