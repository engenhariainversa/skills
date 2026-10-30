#!/bin/bash
# Valida o token de deploy da Cloudflare SEM alterar nada (só GETs):
#   1. arquivo de credenciais (modo 600, três variáveis)
#   2. token ativo (tokens/verify da conta; cai para /user/tokens/verify se for token de usuário)
#   3. túnel: nome, status, conexões e o ingress atual (prova Cloudflare Tunnel Read)
#   4. zonas visíveis (prova Zone Read) e, para cada zona, se dns_records responde (prova DNS Read)
# Permissão de escrita (Tunnel Edit, DNS Edit) não dá para provar sem escrever; o primeiro
# --apply dos outros scripts acusa se faltar.
#
# Uso: bash cf-check.sh [zona ...]     (sem zonas: confere todas as que o token vê)
set -euo pipefail
. "$(dirname "$0")/cf-lib.sh"

fail=0
ok()  { printf '  ok    %s\n' "$*"; }
bad() { printf '  FALHA %s\n' "$*"; fail=1; }

echo "credenciais"
cf_load_env || exit 1
ok "$CF_ENV_PATH (CF_ACCOUNT_ID, CF_API_TOKEN, CF_TUNNEL_ID presentes)"

echo "token"
if v=$(cf_api GET "/accounts/$CF_ACCOUNT_ID/tokens/verify" 2>/dev/null); then
  ok "token de conta: $(printf '%s' "$v" | python3 -c 'import sys, json; r = json.load(sys.stdin)["result"]; print(r["status"], "expira", r.get("expires_on") or "nunca")')"
elif v=$(cf_api GET "/user/tokens/verify"); then
  ok "token de usuário: $(printf '%s' "$v" | python3 -c 'import sys, json; r = json.load(sys.stdin)["result"]; print(r["status"], "expira", r.get("expires_on") or "nunca")')"
else
  bad "token inválido ou revogado"; exit 1
fi

echo "túnel"
if t=$(cf_api GET "/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$CF_TUNNEL_ID"); then
  ok "$(printf '%s' "$t" | python3 -c 'import sys, json; r = json.load(sys.stdin)["result"]; print("%s (%s) status=%s conexões=%d" % (r["name"], r["id"], r["status"], len(r.get("connections") or [])))')"
else
  bad "GET do túnel (falta Account · Cloudflare Tunnel, ou CF_TUNNEL_ID/CF_ACCOUNT_ID errado)"
fi
if c=$(cf_api GET "/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$CF_TUNNEL_ID/configurations"); then
  printf '%s' "$c" | python3 -c 'import sys, json
r = json.load(sys.stdin)["result"]
ing = (r.get("config") or {}).get("ingress") or []
named = [x for x in ing if "hostname" in x]
last = ing[-1] if ing else {}
print("  ok    config remota v%s: %d hostnames, catch-all no fim: %s" % (r.get("version"), len(named), "sim" if ing and "hostname" not in last else "NÃO"))'
else
  bad "GET da config do túnel (túnel gerenciado por config.yml local? então o ingress é editado no arquivo)"
fi

echo "zonas e DNS"
if z=$(cf_api GET "/zones?per_page=50"); then
  mapfile -t zones < <(printf '%s' "$z" | python3 -c 'import sys, json; [print(x["name"], x["id"], x["status"]) for x in json.load(sys.stdin)["result"]]')
  [ ${#zones[@]} -gt 0 ] || bad "token não vê nenhuma zona (falta Zone · Zone · Read)"
  want=("$@")
  for line in "${zones[@]}"; do
    read -r name id status <<<"$line"
    if [ ${#want[@]} -gt 0 ] && [[ ! " ${want[*]} " == *" $name "* ]]; then continue; fi
    if n=$(cf_api GET "/zones/$id/dns_records?per_page=1" 2>/dev/null); then
      ok "$name ($status): $(printf '%s' "$n" | python3 -c 'import sys, json; print(json.load(sys.stdin)["result_info"]["total_count"])') registros DNS legíveis"
    else
      bad "$name ($status): dns_records negado (falta Zone · DNS nesta zona)"
    fi
  done
  for w in "${want[@]}"; do
    printf '%s\n' "${zones[@]}" | grep -q "^$w " || bad "$w: zona não visível pelo token (não está na conta, ou o token não inclui essa zona)"
  done
else
  bad "listar zonas (falta Zone · Zone · Read)"
fi

[ $fail = 0 ] && echo "tudo certo (leitura). Escrita é confirmada no primeiro --apply." || echo "há falhas acima"
exit $fail
