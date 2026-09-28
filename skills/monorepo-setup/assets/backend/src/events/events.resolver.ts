import { Inject, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import type { PubSub } from 'graphql-subscriptions';
import { randomUUID } from 'crypto';
import { CurrentUser, GqlAuthGuard } from '../auth/gql-auth.guard';
import type { CurrentUser as User } from '../auth/jwt.strategy';
import { PUB_SUB } from '../pubsub/pubsub.module';
import { Notification } from './events.types';

const NOTIFICATION_ADDED = 'notificationAdded';

/**
 * Padrão de uma subscription:
 * 1. quem muda o estado publica no PubSub (aqui a mutation `notify`; pode ser um service, job ou webhook);
 * 2. `@Subscription` devolve `asyncIterableIterator` do mesmo tópico;
 * 3. `filter` decide por assinante (o usuário só recebe o que é dele);
 * 4. o guard é o mesmo do HTTP: sem token, a subscription é recusada no `subscribe`.
 * O payload publicado usa a chave com o nome da subscription (`{ notificationAdded: ... }`).
 */
@Resolver(() => Notification)
export class EventsResolver {
  constructor(@Inject(PUB_SUB) private readonly pubSub: PubSub) {}

  @Query(() => String)
  health(): string {
    return 'ok';
  }

  @Mutation(() => Notification)
  @UseGuards(GqlAuthGuard)
  async notify(@Args('userId') userId: string, @Args('message') message: string): Promise<Notification> {
    const notification: Notification = { id: randomUUID(), userId, message, createdAt: new Date() };
    await this.pubSub.publish(NOTIFICATION_ADDED, { [NOTIFICATION_ADDED]: notification });
    return notification;
  }

  @Subscription(() => Notification, {
    filter: (payload: { notificationAdded: Notification }, _vars, ctx: { req: { user: User } }) =>
      payload.notificationAdded.userId === ctx.req.user.id,
  })
  @UseGuards(GqlAuthGuard)
  notificationAdded(@CurrentUser() _user: User) {
    return this.pubSub.asyncIterableIterator(NOTIFICATION_ADDED);
  }
}
