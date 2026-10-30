#!/bin/bash
# DNS dos hostnames do túnel: CNAME proxied <host> -> <CF_TUNNEL_ID>.cfargotunnel.com.
# A zona de cada host é descoberta pelo token (sufixo mais longo), então não há como criar o
# registro na zona errada.
#
# Para cada host lista o que existe com aquele nome:
#   ok      CNAME para o túnel, proxied
#   ajuste  CNAME para o túnel sem proxy (vira proxied)
#   legado  A/AAAA/CNAME apontando para outro lugar (estacionamento do registrador, servidor
#           antigo); impede o CNAME e só é apagado com confirmação explícita
#   mantido outros tipos (MX, TXT, CAA...) nunca são tocados
#
# Sem --apply é só leitura. Com --apply cria/ajusta o que não depende de apagar nada. Registro
# legado só é apagado se o id dele vier em --confirm-delete (ou, num terminal interativo, se
# a pessoa digitar "apagar"); antes de apagar, o registro é salvo em JSON na pasta de backup.
#
# Uso: bash cf-dns.sh [--apply] [--confirm-delete id1,id2] host [host ...]
set -euo pipefail
. "$(dirname "$0")/cf-lib.sh"

APPLY=0; CONFIRM=""; HOSTS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --confirm-delete) CONFIRM="$2"; shift ;;
    -*) echo "opção desconhecida: $1" >&2; exit 2 ;;
    *) HOSTS+=("$1") ;;
  esac
  shift
done
[ ${#HOSTS[@]} -gt 0 ] || { echo "uso: $0 [--apply] [--confirm-delete id1,id2] host [host...]" >&2; exit 2; }

cf_load_env
export CF_API_TOKEN CF_TUNNEL_ID CF_API_BASE APPLY CONFIRM
CF_BACKUP="$(cf_backup_dir)"; export CF_BACKUP

python3 - "${HOSTS[@]}" <<'PY'
import json, os, sys, time, urllib.request, urllib.error, urllib.parse

BASE, TOK = os.environ["CF_API_BASE"], os.environ["CF_API_TOKEN"]
TARGET = os.environ["CF_TUNNEL_ID"] + ".cfargotunnel.com"
APPLY = os.environ["APPLY"] == "1"
CONFIRMED = {i for i in os.environ["CONFIRM"].split(",") if i}
BACKUP = os.environ["CF_BACKUP"]

def api(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"})
    try:
        r = json.load(urllib.request.urlopen(req, timeout=30))
    except urllib.error.HTTPError as e:
        r = json.load(e)
    if not r.get("success"):
        raise SystemExit(f"erro em {method} {path.split('?')[0]}: " + "; ".join(f"[{e.get('code')}] {e.get('message')}" for e in r.get("errors") or []))
    return r

zones = api("GET", "/zones?per_page=50")["result"]
def zone_for(h):
    zs = sorted((z for z in zones if h == z["name"] or h.endswith("." + z["name"])), key=lambda z: -len(z["name"]))
    return zs[0] if zs else None

plan = []   # (acao, host, zona, registro)
for h in dict.fromkeys(x.lower().rstrip(".") for x in sys.argv[1:]):
    z = zone_for(h)
    if not z:
        print(f"{h}: nenhuma zona da conta contém este nome (domínio fora da Cloudflare ou fora do escopo do token)")
        plan.append(("sem-zona", h, None, None)); continue
    recs = api("GET", f"/zones/{z['id']}/dns_records?per_page=100&name={urllib.parse.quote(h)}")["result"]
    print(f"{h}  (zona {z['name']}, status {z['status']})")
    if z["status"] != "active":
        print(f"  aviso: zona {z['status']}: os nameservers no registrador ainda não são os da Cloudflare; o registro não resolve até a troca")
    tunnel = [r for r in recs if r["type"] == "CNAME" and r["content"].rstrip(".").lower() == TARGET]
    legacy = [r for r in recs if r["type"] in ("A", "AAAA", "CNAME") and r not in tunnel]
    for r in recs:
        kind = ("ok" if r["proxied"] else "ajuste") if r in tunnel else "legado" if r in legacy else "mantido"
        print(f"  {kind:8} {r['type']:6} {r['content'][:60]:60} proxied={str(r.get('proxied')).lower():5} id={r['id']}"
              + (f"  ({r['comment']})" if r.get("comment") else ""))
        if kind == "ajuste": plan.append(("proxied", h, z, r))
        if kind == "legado": plan.append(("apagar", h, z, r))
    if not tunnel:
        plan.append(("criar", h, z, None))
        print(f"  falta    CNAME  {TARGET} proxied")

todo = [p for p in plan if p[0] in ("proxied", "apagar", "criar")]
if not todo:
    print("nada a fazer"); sys.exit(1 if any(p[0] == "sem-zona" for p in plan) else 0)
if not APPLY:
    print("modo leitura: nada foi alterado. Rode com --apply" + (" (legados só com --confirm-delete <ids>)" if any(p[0] == "apagar" for p in todo) else "") + ".")
    sys.exit(0)

# Confirmação dos legados: ids explícitos, ou "apagar" digitado num terminal interativo.
to_delete = [p for p in todo if p[0] == "apagar"]
pending = [p for p in to_delete if p[3]["id"] not in CONFIRMED]
# O stdin do python é este heredoc; a pergunta vai pelo terminal, se houver um.
try:
    tty = open("/dev/tty") if pending else None
except OSError:
    tty = None
if tty:
    print("\nregistros legados a apagar:")
    for _, h, _, r in pending: print(f"  {r['type']} {h} -> {r['content']}  id={r['id']}")
    print('digite "apagar" para confirmar: ', end="", flush=True)
    if tty.readline().strip() == "apagar":
        CONFIRMED |= {p[3]["id"] for p in pending}; pending = []
blocked = {p[1] for p in pending}
for _, h, _, r in pending:
    print(f"pulando {h}: legado {r['type']} {r['content']} sem confirmação (id {r['id']})")

stamp = time.strftime("%Y%m%d%H%M%S")
for act, h, z, r in todo:
    if h in blocked: continue
    if act == "apagar":
        path = os.path.join(BACKUP, f"dns-{h}-{r['type']}-{stamp}.json")
        json.dump(r, open(path, "w"), indent=2)
        api("DELETE", f"/zones/{z['id']}/dns_records/{r['id']}")
        print(f"apagado  {r['type']} {h} -> {r['content']}  (backup {path})")
for act, h, z, r in todo:
    if h in blocked: continue
    if act == "proxied":
        api("PATCH", f"/zones/{z['id']}/dns_records/{r['id']}", {"proxied": True})
        print(f"ajustado CNAME {h} -> proxied")
    elif act == "criar":
        api("POST", f"/zones/{z['id']}/dns_records", {"type": "CNAME", "name": h, "content": TARGET, "proxied": True, "ttl": 1, "comment": "túnel (cf-dns.sh)"})
        print(f"criado   CNAME {h} -> {TARGET} proxied")
sys.exit(1 if blocked else 0)
PY
