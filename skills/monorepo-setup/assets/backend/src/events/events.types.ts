import { Field, ID, ObjectType } from '@nestjs/graphql';

/** Exemplo de evento em tempo real. Troque pelo que o seu domínio emite (mensagem, pedido, status). */
@ObjectType()
export class Notification {
  @Field(() => ID) id!: string;
  @Field() userId!: string;
  @Field() message!: string;
  @Field() createdAt!: Date;
}
