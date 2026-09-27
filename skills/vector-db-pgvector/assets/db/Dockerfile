# Postgres oficial (alpine) + pgvector compilado da tag fixada.
# Use quando já existe um volume de dados criado por postgres:<major>-alpine: mesmo binário e mesma
# libc (musl), então as collations não mudam e o volume é reaproveitado sem REINDEX.
# Compilado sem LLVM bitcode e sem -march=native: a imagem roda em qualquer host x86-64/arm64.
# Fixe o digest da imagem base (postgres:16-alpine@sha256:...) quando for trocar o db de produção.
FROM postgres:16-alpine
ARG PGVECTOR_VERSION=0.8.0
RUN apk add --no-cache --virtual .build-deps git build-base \
 && git clone --branch "v${PGVECTOR_VERSION}" --depth 1 https://github.com/pgvector/pgvector.git /tmp/pgvector \
 && make -C /tmp/pgvector OPTFLAGS="" with_llvm=no \
 && make -C /tmp/pgvector OPTFLAGS="" with_llvm=no install \
 && rm -rf /tmp/pgvector \
 && apk del .build-deps
