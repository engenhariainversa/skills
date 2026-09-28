import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: corsOrigins?.length ? corsOrigins : true, credentials: true });

  const port = Number(process.env.PORT) || 4050;
  await app.listen(port);
  console.log(`GraphQL em http://localhost:${port}/graphql (HTTP e WebSocket no mesmo path)`);
}
void bootstrap();
