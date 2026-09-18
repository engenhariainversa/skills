#!/bin/bash
# Adiciona hostnames ao ingress de um túnel gerenciado pelo painel (token/remote config),
# apontando cada um para o nginx do proxy. Usa o token de ~/.cloudflared/cert.pem
# (gerado pelo `cloudflared tunnel login`); o account id vem do próprio cert.
#
# Uso: bash cf-add-hostname.sh <tunel> app.exemplo.com [outro.exemplo.com ...]
# Env: TARGET (padrão http://proxy-nginx:80), CLOUDFLARED_CERT (padrão ~/.cloudflared/cert.pem)
#
# Regras já existentes são mantidas; o catch-all (http_status:404) fica sempre por último.
[ $# -ge 2 ] || { echo "uso: $0 <tunel> hostname [hostname...]"; exit 1; }
set -euo pipefail
TUNNEL="$1"; shift
TARGET="${TARGET:-http://proxy-nginx:80}"
CERT="${CLOUDFLARED_CERT:-$HOME/.cloudflared/cert.pem}"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT

read -r TOK ACC < <(python3 - "$CERT" <<'PY'
import re, json, base64, sys
p = open(sys.argv[1]).read()
b = re.search(r"-----BEGIN ARGO TUNNEL TOKEN-----(.*?)-----END ARGO TUNNEL TOKEN-----", p, re.S).group(1)
j = json.loads(base64.b64decode(b.replace("\n", "")))
print(j["apiToken"], j["accountID"])
PY
)

# id do túnel pelo nome
TID=$(cloudflared tunnel list -n "$TUNNEL" -o json | python3 -c 'import sys, json; r = json.load(sys.stdin); print(r[0]["id"] if r else "")')
[ -n "$TID" ] || { echo "túnel '$TUNNEL' não encontrado (cloudflared tunnel list)"; exit 1; }
API="https://api.cloudflare.com/client/v4/accounts/$ACC/cfd_tunnel/$TID/configurations"

curl -sf -H "Authorization: Bearer $TOK" "$API" > "$W/cur.json"

python3 - "$W" "$TARGET" "$@" <<'PY'
import json, sys
w, target, want = sys.argv[1], sys.argv[2], sys.argv[3:]
cfg = json.load(open(f"{w}/cur.json"))["result"]["config"] or {}
ing = cfg.get("ingress", [])
have = {r.get("hostname") for r in ing}
named = [r for r in ing if "hostname" in r] + [{"hostname": h, "service": target} for h in want if h not in have]
catch = [r for r in ing if "hostname" not in r] or [{"service": "http_status:404"}]
cfg["ingress"] = named + catch
json.dump({"config": cfg}, open(f"{w}/new.json", "w"))
for r in cfg["ingress"]:
    print(f'  {r.get("hostname", "*"):40} -> {r["service"]}')
PY

curl -sf -X PUT -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  --data @"$W/new.json" "$API" \
  | python3 -c 'import sys, json; r = json.load(sys.stdin); print("ingress: OK" if r["success"] else r["errors"])'
