---
name: github-selfhosted-deploy
description: Configura deploy contínuo de um app Docker no próprio servidor via GitHub Actions com runner self-hosted - push na main atualiza o código no servidor, roda docker compose --profile prod up -d --build e faz health check. Use sempre que o usuário pedir "pipeline", "CI/CD", "deploy automático", "configurar o GitHub Actions", "runner self-hosted", "vai ser hospedado nesse server" ou quando um repo novo precisa do mesmo fluxo de deploy que outro projeto já usa na mesma máquina. Inclui o registro do runner, um por repositório.
---

# Deploy no próprio servidor com runner self-hosted

## Como funciona

O servidor de produção roda um *runner* do GitHub Actions. O workflow não faz `checkout` numa pasta temporária: ele entra no diretório de produção, faz `git merge --ff-only` para o commit da `main`, roda `docker compose --profile prod up -d --build` e verifica se o app responde. Sem SSH, sem segredos no GitHub: o `github.token` do próprio job basta para o fetch.

Pré-requisitos no repo: `docker-compose.yml` com profile `prod` e serviço `app` (skill `nextjs-docker-bootstrap`) e, se houver domínio, o override na rede do proxy (skill `docker-nginx-cloudflare-proxy`).

## 1. Workflow

Copie `assets/deploy.yml` para `.github/workflows/deploy.yml` e ajuste:

- `DEPLOY_DIR`: pasta do projeto no servidor (ex.: `/mnt/hd2tb/projetos/<app>`). Tem que ser um clone do repo com a `main` checada.
- `runs-on: [self-hosted, <label>]`: o label que o runner do servidor tem (ex.: `jarvis`). Veja com `gh api repos/<owner>/<repo>/actions/runners --jq '.runners[] | [.name,.status,([.labels[].name]|join(","))]'`.
- `concurrency.group`: mantém um deploy por vez; dois pushes seguidos não disputam o `docker compose`.

O health check usa `docker compose exec app node -e "fetch(...)"` em vez de `curl` no host porque o app não publica portas quando está atrás do proxy.

## 2. Runner: um por repositório

Runners registrados no nível de repositório só atendem aquele repo. Se o servidor já tem um runner para outro projeto, o job do repo novo fica em `queued` para sempre. Verifique:

```bash
systemctl list-units --type=service | grep actions.runner     # runners instalados como serviço
cat <pasta-do-runner>/.runner | grep gitHubUrl                # para qual repo cada um aponta
```

Para registrar um novo, siga `references/runner-setup.md`. Resumo: baixar o tarball do runner numa pasta própria, `config.sh` com token gerado por `gh api -X POST repos/<owner>/<repo>/actions/runners/registration-token`, e `svc.sh install` (precisa de sudo). Use o mesmo label do workflow.

Registrar um runner é uma alteração persistente no servidor (serviço de sistema). Se você não tiver sudo sem senha ou a política da sessão bloquear, entregue ao usuário os comandos prontos, na ordem, em vez de tentar contornar.

## 3. Primeiro deploy e verificação

O clone em `DEPLOY_DIR` precisa existir antes do primeiro run. Se o projeto foi criado ali mesmo, ótimo; senão `git clone` na pasta.

```bash
git push -u origin main
gh run list --repo <owner>/<repo> --limit 3          # deve sair de queued para in_progress
gh run watch --repo <owner>/<repo> --exit-status
docker ps --filter name=<app> --format '{{.Names}}\t{{.Status}}'
```

Se o run ficou `queued` por mais de um minuto, o runner não está online ou o label não bate.

## Armadilhas vistas na prática

- **Remote SSH com deploy key de outro repo**: `ssh -T git@github.com` responde "Hi <org>/<outro-repo>!" e o push falha. Use remote HTTPS com o `gh` como credential helper (`gh auth setup-git`).
- **Porta do host ocupada**: em produção o app não publica portas (override do proxy). Em dev, escolha uma porta livre.
- **Build usa arquivos ignorados**: o `.dockerignore` exclui `.env*`; variáveis de produção entram via `env_file`/`environment` no compose, não na imagem.
