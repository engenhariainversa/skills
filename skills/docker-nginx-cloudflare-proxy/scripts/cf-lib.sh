# Funções comuns aos scripts cf-*.sh. Não rode direto: `. "$(dirname "$0")/cf-lib.sh"`.
#
# Credenciais vêm de um único arquivo fora dos repos (chmod 600), nunca de .env de projeto:
#   CF_ACCOUNT_ID=<id da conta>
#   CF_API_TOKEN=<token de deploy: Account·Cloudflare Tunnel·Edit, Zone·DNS·Edit, Zone·Zone·Read>
#   CF_TUNNEL_ID=<uuid do túnel compartilhado>
# Caminho: $CF_ENV_FILE, senão /mnt/hd2tb/proxy/cloudflare.env, senão ~/proxy/cloudflare.env.
# Nada aqui imprime o token.

CF_API_BASE="${CF_API_BASE:-https://api.cloudflare.com/client/v4}"   # sobrescrever só para testes

cf_env_file() {
  local f
  for f in "${CF_ENV_FILE:-}" /mnt/hd2tb/proxy/cloudflare.env "$HOME/proxy/cloudflare.env"; do
    [ -n "$f" ] && [ -f "$f" ] && { echo "$f"; return 0; }
  done
  return 1
}

# Carrega CF_ACCOUNT_ID, CF_API_TOKEN e CF_TUNNEL_ID sem ecoar valores. Sai com erro se faltar algo.
cf_load_env() {
  local f mode v
  f=$(cf_env_file) || { echo "erro: arquivo de credenciais não encontrado (CF_ENV_FILE, /mnt/hd2tb/proxy/cloudflare.env ou ~/proxy/cloudflare.env)" >&2; return 1; }
  mode=$(stat -c '%a' "$f" 2>/dev/null || stat -f '%Lp' "$f")
  [ "$mode" = 600 ] || [ "$mode" = 400 ] || echo "aviso: $f tem modo $mode; rode chmod 600 $f" >&2
  # Lê só as três chaves esperadas; não executa o arquivo como shell. O arquivo é a única
  # fonte: uma variável exportada no shell não sobrepõe o que está nele.
  for v in CF_ACCOUNT_ID CF_API_TOKEN CF_TUNNEL_ID; do
    printf -v "$v" '%s' "$(sed -n "s/^[[:space:]]*\(export[[:space:]]\+\)\?$v=//p" "$f" | tail -n1 | tr -d "\"'[:space:]")"
    [ -n "${!v}" ] || { echo "erro: $v vazio em $f" >&2; return 1; }
  done
  CF_ENV_PATH="$f"
}

# cf_api METHOD /caminho [arquivo-json]  -> corpo da resposta no stdout.
# Retorna 1 (e mostra os erros da API no stderr) quando success=false ou HTTP falha.
cf_api() {
  local method="$1" path="$2" data="${3:-}" out
  local args=(-sS -X "$method" -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json")
  [ -n "$data" ] && args+=(--data @"$data")
  out=$(curl "${args[@]}" "$CF_API_BASE$path") || { echo "erro: falha de rede em $method $path" >&2; return 1; }
  if ! printf '%s' "$out" | python3 -c 'import sys, json; sys.exit(0 if json.load(sys.stdin).get("success") else 1)' 2>/dev/null; then
    printf '%s' "$out" | python3 -c 'import sys, json
try: r = json.load(sys.stdin)
except Exception: print("  resposta não é JSON", file=sys.stderr); sys.exit()
for e in r.get("errors") or []: print("  [%s] %s" % (e.get("code"), e.get("message")), file=sys.stderr)' >&2
    return 1
  fi
  printf '%s' "$out"
}

# Zona (nome e id) que contém o hostname: o sufixo mais longo entre as zonas que o token vê.
# Uso: read -r ZNAME ZID < <(cf_zone_for app.exemplo.com.br)
cf_zone_for() {
  cf_api GET "/zones?per_page=50" | python3 -c 'import sys, json
h = sys.argv[1].rstrip(".").lower()
zs = [z for z in json.load(sys.stdin)["result"] if h == z["name"] or h.endswith("." + z["name"])]
zs.sort(key=lambda z: len(z["name"]), reverse=True)
print(zs[0]["name"], zs[0]["id"]) if zs else sys.exit(1)' "$1"
}

cf_backup_dir() {
  local d="${CF_BACKUP_DIR:-$(dirname "$CF_ENV_PATH")/tunnel-config-backups}"
  mkdir -p "$d" && echo "$d"
}
