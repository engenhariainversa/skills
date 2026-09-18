#!/bin/bash
# Lista as zonas que o cert.pem atual do cloudflared enxerga (nome + id) e o account id.
# Serve para conferir em qual zona o `cloudflared tunnel login` foi feito ANTES de
# rodar `tunnel route dns` (um cert de outra zona cria o registro no lugar errado).
# Não imprime o token. Uso: bash cf-zones.sh
set -euo pipefail
CERT="${CLOUDFLARED_CERT:-$HOME/.cloudflared/cert.pem}"
read -r TOK ACC < <(python3 - "$CERT" <<'PY'
import re, json, base64, sys
p = open(sys.argv[1]).read()
b = re.search(r"-----BEGIN ARGO TUNNEL TOKEN-----(.*?)-----END ARGO TUNNEL TOKEN-----", p, re.S).group(1)
j = json.loads(base64.b64decode(b.replace("\n", "")))
print(j["apiToken"], j.get("accountID", "-"))
PY
)
echo "account: $ACC"
echo "zonas visíveis por $CERT:"
curl -sf -H "Authorization: Bearer $TOK" "https://api.cloudflare.com/client/v4/zones?per_page=50" \
  | python3 -c 'import sys, json; [print("  %-32s %s" % (z["name"], z["id"])) for z in json.load(sys.stdin)["result"]]'
