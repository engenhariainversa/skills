import { ExecutionContext, Injectable, createParamDecorator } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';
import type { CurrentUser as User } from './jwt.strategy';

/** Um guard só para query, mutation e subscription: `ctx.req` existe nos três (veja app.module.ts). */
@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    return GqlExecutionContext.create(context).getContext().req;
  }
}

/** `@CurrentUser() user` no resolver: o que o JwtStrategy.validate devolveu. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): User => {
  return GqlExecutionContext.create(context).getContext().req.user;
});
