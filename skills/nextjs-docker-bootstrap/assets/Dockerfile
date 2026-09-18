# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# dev: usado pelo serviço "dev" do docker-compose (hot reload com o código montado como volume)
FROM base AS dev
ENV NODE_ENV=development NEXT_TELEMETRY_DISABLED=1 WATCHPACK_POLLING=true
COPY --from=deps /app/node_modules ./node_modules
EXPOSE 3000
CMD ["pnpm", "dev"]

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Versão exibida no app (o pipeline passa o SHA e a hora do build)
ARG GIT_SHA=dev
ARG BUILD_TIME=
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_APP_VERSION=$GIT_SHA NEXT_PUBLIC_BUILD_TIME=$BUILD_TIME
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 DATA_DIR=/data
# /data: arquivos gravados pelo app, montado como volume no docker-compose.yml
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data && chown app:app /data
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
