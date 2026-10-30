#!/usr/bin/env bash
# Barra migrations do Prisma que quebram quando várias branches andam em paralelo.
# Uso (no CI do PR, com fetch-depth: 0): check-migration-order.sh origin/main
#
# Falha se o PR:
#   - adiciona migration que ordena antes (ou empata) com a última da base;
#   - edita ou remove migration que já está na base;
#   - adiciona migration com nome fora do formato do `prisma migrate dev`;
#   - deixa dois diretórios com o mesmo timestamp.
set -euo pipefail

base="${1:-origin/main}"
dir="${MIGRATIONS_DIR:-packages/database/prisma/migrations}"
fail=0

last_base=$(git ls-tree --name-only "$base" "$dir/" 2>/dev/null | xargs -r -n1 basename | grep -E '^[0-9]{14}_' | sort | tail -n1 || true)
echo "última migration em $base: ${last_base:-<nenhuma>}"

changed=$(git diff --name-only --diff-filter=MDR "$base"...HEAD -- "$dir" | grep -v '/migration_lock.toml$' || true)
if [ -n "$changed" ]; then
  echo "❌ migrations que já estão em $base foram editadas/removidas:"
  echo "$changed" | sed 's/^/   /'
  fail=1
fi

added=$(git diff --name-only --diff-filter=A "$base"...HEAD -- "$dir" | sed -n "s#^$dir/\([^/]*\)/.*#\1#p" | sort -u)
for m in $added; do
  if ! [[ "$m" =~ ^[0-9]{14}_[a-z0-9_]+$ ]]; then
    echo "❌ $m: nome fora do formato do prisma migrate dev (AAAAMMDDHHMMSS_nome)"
    fail=1
  elif [ -n "$last_base" ] && [[ ! "$m" > "$last_base" ]]; then
    echo "❌ $m ordena antes da última migration de $base ($last_base)."
    echo "   Faça rebase, apague a pasta e gere de novo: pnpm --filter @repo/database db:migrate:dev --name <descritivo>"
    fail=1
  else
    echo "✔ $m"
  fi
done

dups=$(ls -1 "$dir" 2>/dev/null | grep -E '^[0-9]{14}_' | cut -c1-14 | sort | uniq -d || true)
if [ -n "$dups" ]; then
  echo "❌ timestamps repetidos em $dir: $dups"
  fail=1
fi

exit "$fail"
