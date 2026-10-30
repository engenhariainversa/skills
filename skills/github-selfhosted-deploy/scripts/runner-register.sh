#!/bin/bash
# Registra um runner self-hosted para UM repositório e deixa pronto tudo o que não precisa de
# sudo. O que precisa (serviço systemd e pasta de deploy fora do $HOME) sai como um bloco único
# para a pessoa rodar num terminal interativo: o sudo pede senha num TTY, que o agente não tem.
#
# Uso: bash runner-register.sh <owner/repo> <label> [deploy-dir]
#   deploy-dir: pasta de produção do workflow (DEPLOY_DIR). Se não existir e o usuário não puder
#               criá-la (ex.: /opt/<projeto>), entra no bloco de sudo com o dono certo.
# Env: RUNNER_DIR (padrão /mnt/hd2tb/github-runner-<repo>, ou ~/actions-runner-<repo>),
#      RUNNER_VERSION (padrão: a dos runners já instalados, senão a última release).
set -euo pipefail
[ $# -ge 2 ] || { echo "uso: $0 <owner/repo> <label> [deploy-dir]" >&2; exit 2; }
REPO="$1"; LABEL="$2"; DEPLOY_DIR="${3:-}"
NAME="${REPO#*/}"; ME=$(id -un)
BASE=/mnt/hd2tb; [ -d "$BASE" ] && [ -w "$BASE" ] || BASE="$HOME"
RUNNER_DIR="${RUNNER_DIR:-$([ "$BASE" = "$HOME" ] && echo "$HOME/actions-runner-$NAME" || echo "$BASE/github-runner-$NAME")}"

# 1. Já existe runner online com o label para este repo?
gh api "repos/$REPO/actions/runners" --jq '.runners[] | "\(.name)\t\(.status)\t\([.labels[].name]|join(","))"' | tee /dev/stderr \
  | awk -F'\t' -v l="$LABEL" '$2 == "online" && ("," $3 ",") ~ ("," l ",") { found = 1 } END { exit !found }' \
  && { echo "já há runner online com o label $LABEL em $REPO; nada a fazer"; exit 0; }

groups "$ME" | grep -qw docker || echo "aviso: $ME não está no grupo docker; o job não vai conseguir rodar docker compose"

# 2. Baixar e registrar (sem sudo).
if [ ! -f "$RUNNER_DIR/.runner" ]; then
  if [ -z "${RUNNER_VERSION:-}" ]; then
    other=$(ls -d "$BASE"/github-runner-*/ "$HOME"/actions-runner-*/ 2>/dev/null | head -n1 || true)
    RUNNER_VERSION=$([ -n "$other" ] && "$other/config.sh" --version 2>/dev/null || true)
    [ -n "$RUNNER_VERSION" ] || RUNNER_VERSION=$(gh api repos/actions/runner/releases/latest --jq '.tag_name | ltrimstr("v")')
  fi
  ARCH=$(uname -m | sed 's/x86_64/x64/; s/aarch64/arm64/')
  mkdir -p "$RUNNER_DIR" && cd "$RUNNER_DIR"
  curl -fsSL -o runner.tar.gz "https://github.com/actions/runner/releases/download/v$RUNNER_VERSION/actions-runner-linux-$ARCH-$RUNNER_VERSION.tar.gz"
  tar xzf runner.tar.gz && rm runner.tar.gz
  # O token de registro vale 1 h e vai direto para o config.sh, sem passar pelo terminal.
  ./config.sh --unattended --url "https://github.com/$REPO" \
    --token "$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)" \
    --name "$(hostname -s)-$NAME" --labels "$LABEL" --work _work
else
  echo "runner já configurado em $RUNNER_DIR ($(grep -o '"gitHubUrl": *"[^"]*"' "$RUNNER_DIR/.runner"))"
fi

# 3. O que precisa de sudo.
SUDO=()
if [ -n "$DEPLOY_DIR" ] && [ ! -d "$DEPLOY_DIR" ] && ! mkdir -p "$DEPLOY_DIR" 2>/dev/null; then
  SUDO+=("sudo install -d -o $ME -g $(id -gn) $DEPLOY_DIR")
fi
if ! systemctl list-unit-files 2>/dev/null | grep -q "actions.runner.${REPO/\//-}"; then
  SUDO+=("cd $RUNNER_DIR && sudo ./svc.sh install $ME && sudo ./svc.sh start && sudo ./svc.sh status --no-pager | head -5")
fi
[ ${#SUDO[@]} -gt 0 ] || { echo "serviço já instalado; confira: gh api repos/$REPO/actions/runners"; exit 0; }

if sudo -n true 2>/dev/null; then
  for c in "${SUDO[@]}"; do bash -c "$c"; done
else
  echo
  echo "Falta só o sudo. Rode num terminal interativo (aba do termhub, SSH), não pelo agente:"
  echo
  printf '  %s\n' "${SUDO[@]}"
  echo
  echo "Depois: gh api repos/$REPO/actions/runners --jq '.runners[] | [.name,.status] | @tsv'  (deve dar online)"
  exit 3
fi
