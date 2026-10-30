#!/bin/bash
# Acrescenta hostnames ao ingress do túnel COMPARTILHADO (config remota, todos os sites da
# máquina dependem dela) sem arriscar os outros sites:
#   1. GET da config atual
#   2. monta a config nova: regras antigas intactas e na mesma ordem, novas antes do catch-all
#   3. confere que só houve acréscimo e mostra o diff do ingress
#   4. (só com --apply) mede o código HTTP de cada site antigo, grava o backup em
#      <proxy>/tunnel-config-backups/<túnel>-v<versão>-<data>.json, faz o PUT, re-GET para conferir
#      a versão nova e mede de novo; acusa site que piorou e mostra como restaurar
# Sem --apply é só leitura: mostra o que mudaria.
#
# Uso: bash cf-tunnel-add.sh [--apply] [--target http://proxy-nginx:80] host [host ...]
#      bash cf-tunnel-add.sh --restore <backup.json>     (PUT da config do backup; pede --apply)
# Env: credenciais via cf-lib.sh; CF_BACKUP_DIR para outra pasta de backup.
set -euo pipefail
. "$(dirname "$0")/cf-lib.sh"

APPLY=0; TARGET="${CF_TUNNEL_TARGET:-http://proxy-nginx:80}"; RESTORE=""; HOSTS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --target) TARGET="$2"; shift ;;
    --restore) RESTORE="$2"; shift ;;
    -*) echo "opção desconhecida: $1" >&2; exit 2 ;;
    *) HOSTS+=("$1") ;;
  esac
  shift
done
[ ${#HOSTS[@]} -gt 0 ] || [ -n "$RESTORE" ] || { echo "uso: $0 [--apply] [--target URL] host [host...] | --restore backup.json" >&2; exit 2; }

cf_load_env
API="/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$CF_TUNNEL_ID/configurations"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT

cf_api GET "$API" > "$W/cur.json"
NAME=$(cf_api GET "/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$CF_TUNNEL_ID" | python3 -c 'import sys, json; print(json.load(sys.stdin)["result"]["name"])')
VER=$(python3 -c 'import sys, json; print(json.load(open(sys.argv[1]))["result"]["version"])' "$W/cur.json")
echo "túnel $NAME, config v$VER"

if [ -n "$RESTORE" ]; then
  python3 -c 'import sys, json; json.dump({"config": json.load(open(sys.argv[1]))["result"]["config"]}, open(sys.argv[2], "w"))' "$RESTORE" "$W/new.json"
else
  # Monta a config nova e garante que as regras antigas não mudaram (nem de ordem).
  python3 - "$W" "$TARGET" "${HOSTS[@]}" <<'PY'
import json, sys
w, target, want = sys.argv[1], sys.argv[2], [h.lower().rstrip(".") for h in sys.argv[3:]]
cfg = json.load(open(f"{w}/cur.json"))["result"]["config"] or {}
ing = cfg.get("ingress") or []
named = [r for r in ing if "hostname" in r]
catch = [r for r in ing if "hostname" not in r] or [{"service": "http_status:404"}]
have = {r["hostname"]: r["service"] for r in named}
add = []
for h in dict.fromkeys(want):
    if h in have:
        note = "já existe" if have[h] == target else f"JÁ EXISTE apontando para {have[h]}; não mexo (troque à mão se for o caso)"
        print(f"  = {h:40} {note}")
    else:
        add.append({"hostname": h, "service": target})
new = named + add + catch
assert new[:len(named)] == named and new[-len(catch):] == catch, "regra antiga mudaria"
cfg["ingress"] = new
json.dump({"config": cfg}, open(f"{w}/new.json", "w"))
open(f"{w}/added", "w").write("\n".join(r["hostname"] for r in add))
PY
  if [ ! -s "$W/added" ]; then echo "nada a acrescentar"; exit 0; fi
fi

# Diff legível só do ingress (uma regra por linha).
ingress_lines() { python3 -c 'import sys, json
d = json.load(open(sys.argv[1])); c = d.get("result", d).get("config") or {}
for r in c.get("ingress") or []: print(r.get("hostname", "*"), "->", r["service"], json.dumps(r.get("originRequest") or {}, sort_keys=True))' "$1"; }
ingress_lines "$W/cur.json" > "$W/a"; ingress_lines "$W/new.json" > "$W/b"
echo "diff do ingress:"; { diff -u "$W/a" "$W/b" || true; } | tail -n +3 | grep '^[-+]' || echo "  (sem mudança)"
# Fora o ingress (warp-routing, originRequest global), nada pode mudar num acréscimo.
if [ -z "$RESTORE" ]; then
  python3 -c 'import sys, json
a = json.load(open(sys.argv[1]))["result"]["config"] or {}; b = json.load(open(sys.argv[2]))["config"]
a.pop("ingress", None); b = dict(b); b.pop("ingress", None)
sys.exit(0 if a == b else "outras chaves da config mudariam; abortando")' "$W/cur.json" "$W/new.json"
fi

if [ $APPLY = 0 ]; then echo "modo leitura: nada foi enviado. Rode de novo com --apply para aplicar."; exit 0; fi

# Código HTTP de cada hostname que já estava no ar, antes e depois do PUT.
OTHERS=$(python3 -c 'import sys, json
c = json.load(open(sys.argv[1]))["result"]["config"] or {}
print("\n".join(r["hostname"] for r in c.get("ingress") or [] if "hostname" in r and "*" not in r["hostname"]))' "$W/cur.json")
probe() { printf '%s\n' "$OTHERS" | xargs -P 8 -I{} sh -c 'printf "%s %s\n" "$1" "$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "https://$1/")"' _ {} | sort; }
echo "medindo os $(printf '%s\n' "$OTHERS" | grep -c .) sites atuais..."
probe > "$W/before"

BK="$(cf_backup_dir)/$NAME-v$VER-$(date +%Y%m%d%H%M%S).json"
cp "$W/cur.json" "$BK"
echo "backup da config v$VER: $BK"
cf_api PUT "$API" "$W/new.json" > "$W/put.json"
cf_api GET "$API" > "$W/after.json"
python3 - "$W" <<'PY'
import json, sys
w = sys.argv[1]
before = json.load(open(f"{w}/cur.json"))["result"]["version"]
after = json.load(open(f"{w}/after.json"))["result"]
want = json.load(open(f"{w}/new.json"))["config"]["ingress"]
assert after["version"] > before, f"versão não avançou ({before} -> {after['version']})"
assert (after["config"] or {}).get("ingress") == want, "ingress relido difere do enviado"
print(f"PUT ok: v{before} -> v{after['version']}, ingress relido confere")
PY

sleep 10   # o cloudflared recebe a config nova em poucos segundos
probe > "$W/after"
# Piorou = respondia algo (não 000/5xx) e agora responde 000 ou 5xx.
if join "$W/before" "$W/after" | awk '{ ok0 = ($2 != "000" && $2 < 500); ok1 = ($3 != "000" && $3 < 500); if (ok0 && !ok1) { print "  PIOROU " $1 ": " $2 " -> " $3; bad = 1 } } END { exit bad }'; then
  echo "outros sites: nenhum piorou ($(wc -l < "$W/after") conferidos)"
else
  echo "algum site piorou. Para voltar: bash $0 --restore $BK --apply"; exit 1
fi
