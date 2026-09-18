# Registrar um runner self-hosted para um repositório

Pré-requisitos: `gh` autenticado com permissão de admin no repo, Docker acessível pelo usuário do serviço, sudo para instalar o serviço.

## 1. Baixar o runner numa pasta própria

Uma pasta por runner. Use a mesma versão dos runners já instalados (`<pasta>/config.sh --version`) ou a mais recente em https://github.com/actions/runner/releases.

```bash
mkdir -p /mnt/hd2tb/github-runner-<app> && cd /mnt/hd2tb/github-runner-<app>
curl -fsSL -o runner.tar.gz https://github.com/actions/runner/releases/download/v2.337.0/actions-runner-linux-x64-2.337.0.tar.gz
tar xzf runner.tar.gz && rm runner.tar.gz
```

## 2. Registrar no repositório

O token de registro vale 1 hora e é gerado pela API; passe direto para o `config.sh` sem imprimir no terminal:

```bash
./config.sh --unattended \
  --url https://github.com/<owner>/<repo> \
  --token "$(gh api -X POST repos/<owner>/<repo>/actions/runners/registration-token --jq .token)" \
  --name <host>-<app> --labels <label> --work _work
```

`--labels` deve bater com o `runs-on` do workflow. O nome só precisa ser único.

## 3. Instalar como serviço

```bash
sudo ./svc.sh install <usuario-do-servidor>
sudo ./svc.sh start
sudo ./svc.sh status
```

Sem sudo, alternativa temporária: `nohup ./run.sh &` (não sobrevive a reboot).

## 4. Conferir

```bash
gh api repos/<owner>/<repo>/actions/runners --jq '.runners[] | "\(.name)\t\(.status)\t\([.labels[].name]|join(","))"'
gh run list --repo <owner>/<repo> --limit 3
```

Um job que estava `queued` é pego automaticamente assim que o runner fica `online`. Se o run já expirou, dispare de novo: `gh workflow run "<nome do workflow>" --repo <owner>/<repo>`.

## Remover

```bash
cd /mnt/hd2tb/github-runner-<app>
sudo ./svc.sh stop && sudo ./svc.sh uninstall
./config.sh remove --token "$(gh api -X POST repos/<owner>/<repo>/actions/runners/remove-token --jq .token)"
```
