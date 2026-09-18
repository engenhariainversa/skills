#!/bin/bash
# Cloudflare Access: cria (ou reaproveita) um app self-hosted para um hostname e
# grava a policy "allowlist" com os e-mails informados. Idempotente: rodar de novo
# com outra lista de e-mails só atualiza a policy.
#
# Uso: bash cf-access-allowlist.sh <hostname> <nome-do-app> e-mail1 [e-mail2 ...]
# Env: CF_ACCESS_TOKEN_FILE (padrão ~/.cloudflare/access-token) — API token de conta com
#      "Access: Apps and Policies: Edit" + "Zone: Read". Uma linha, sem espaços.
#      CLOUDFLARED_CERT (padrão ~/.cloudflared/cert.pem) — só para descobrir o account id.
[ $# -ge 3 ] || { echo "uso: $0 <hostname> <nome> e-mail [e-mail...]"; exit 1; }
set -euo pipefail
DOMAIN="$1"; NAME="$2"; shift 2
TOKFILE="${CF_ACCESS_TOKEN_FILE:-$HOME/.cloudflare/access-token}"
CERT="${CLOUDFLARED_CERT:-$HOME/.cloudflared/cert.pem}"
TOK=$(tr -d '[:space:]' < "$TOKFILE")
ACC="${CF_ACCOUNT_ID:-$(python3 - "$CERT" <<'PY'
import re, json, base64, sys
p = open(sys.argv[1]).read()
b = re.search(r"-----BEGIN ARGO TUNNEL TOKEN-----(.*?)-----END ARGO TUNNEL TOKEN-----", p, re.S).group(1)
print(json.loads(base64.b64decode(b.replace("\n", "")))["accountID"])
PY
)}"
API="https://api.cloudflare.com/client/v4/accounts/$ACC/access"
H() { curl -sS -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" "$@"; }
EMAILS_JSON=$(python3 -c 'import json, sys; print(json.dumps([{"email": {"email": e}} for e in sys.argv[1:]]))' "$@")

# 1) app: cria uma vez, reaproveita se já existe para o hostname
APP_ID=$(H "$API/apps" | python3 -c 'import sys, json; r = json.load(sys.stdin)["result"] or []; a = [x for x in r if x.get("domain") == sys.argv[1]]; print(a[0]["id"] if a else "")' "$DOMAIN")
if [ -z "$APP_ID" ]; then
  BODY=$(python3 -c 'import json, sys; print(json.dumps({"name": sys.argv[1], "domain": sys.argv[2], "type": "self_hosted", "session_duration": "168h", "auto_redirect_to_identity": True, "app_launcher_visible": True, "http_only_cookie_attribute": True, "same_site_cookie_attribute": "lax"}))' "$NAME" "$DOMAIN")
  OUT=$(H -X POST "$API/apps" --data "$BODY")
  echo "$OUT" | python3 -c 'import sys, json; r = json.load(sys.stdin); print("app create:", "OK" if r["success"] else r["errors"])'
  APP_ID=$(echo "$OUT" | python3 -c 'import sys, json; r = json.load(sys.stdin); print(r["result"]["id"] if r["success"] else "")')
else
  echo "app exists: $APP_ID"
fi
[ -n "$APP_ID" ] || exit 1
echo "app:    $NAME ($DOMAIN)"
echo "app id: $APP_ID"

# 2) policy "allowlist": cria ou atualiza
POL_ID=$(H "$API/apps/$APP_ID/policies" | python3 -c 'import sys, json; r = json.load(sys.stdin)["result"] or []; a = [x for x in r if x.get("name") == "allowlist"]; print(a[0]["id"] if a else "")')
BODY=$(python3 -c 'import json, sys; print(json.dumps({"name": "allowlist", "decision": "allow", "precedence": 1, "include": json.loads(sys.argv[1])}))' "$EMAILS_JSON")
if [ -z "$POL_ID" ]; then
  H -X POST "$API/apps/$APP_ID/policies" --data "$BODY" | python3 -c 'import sys, json; r = json.load(sys.stdin); print("policy create:", "OK" if r["success"] else r["errors"])'
else
  H -X PUT "$API/apps/$APP_ID/policies/$POL_ID" --data "$BODY" | python3 -c 'import sys, json; r = json.load(sys.stdin); print("policy update:", "OK" if r["success"] else r["errors"])'
fi
echo "allowed:"; python3 -c 'import sys; [print("  -", e) for e in sys.argv[1:]]' "$@"
