---
name: github-selfhosted-deploy
description: Configura deploy contínuo de um app Docker no próprio servidor via GitHub Actions com runner self-hosted - push na main atualiza o código no servidor, roda docker compose --profile prod up -d --build e faz health check. Use sempre que o usuário pedir "pipeline", "CI/CD", "deploy automático", "configurar o GitHub Actions", "runner self-hosted", "vai ser hospedado nesse server" ou quando um repo novo precisa do mesmo fluxo de deploy que outro projeto já usa na mesma máquina. Inclui o registro do runner, um por repositório.
---

# Deploy no próprio servidor com runner self-hosted

## Como funciona

O servidor de produção roda um *runner* do GitHub Actions. O workflow não faz `checkout` numa pasta temporária: ele entra no diretório de produção, faz `git merge --ff-only` para o commit da `main`, roda `docker compose --profile prod up -d --build` e verifica se o app responde. Sem SSH, sem segredos no GitHub: o `github.token` do próprio job basta para o fetch.

Pré-requisitos no repo: `docker-compose.yml` com profile `prod` e serviço `app` (skill `nextjs-docker-bootstrap`) e, se houver domínio, o override na rede do proxy (skill `docker-nginx-cloudflare-proxy`).

## Pré-requisitos na máquina (uma vez)

O objetivo é um deploy novo rodar do zero sem a pessoa colar tokens nem rodar comandos, **exceto o sudo do runner**. Antes de começar, confira:

- [ ] `gh` autenticado com admin no repo (`gh auth status`) e usuário no grupo `docker` (`groups`).
- [ ] Se há domínio: os pré-requisitos de Cloudflare da skill `docker-nginx-cloudflare-proxy` (token de deploy em `<proxy>/cloudflare.env`, validado com `scripts/cf-check.sh` de lá).
- [ ] **Credenciais compartilhadas em arquivos padrão, nunca copiadas de outro projeto** (veja *Segredos compartilhados*). Ler o `.env` de outro repo é bloqueado pelo auto mode (*Credential Exploration*) e espalha segredo; se o arquivo padrão não existe, pare e peça à pessoa para criá-lo.
- [ ] Um terminal interativo onde a pessoa possa digitar a senha do sudo (aba do termhub, SSH). O agente não tem TTY, e registrar serviço é *Unauthorized Persistence* para o auto mode: não tente contornar com `sudo -S`, `nohup` permanente ou cron.
- [ ] Opcional: regra de allow para `Bash(bash *github-selfhosted-deploy/scripts/runner-register.sh*)` em `~/.claude/settings.json`; o script só faz o que não precisa de sudo.

### Segredos compartilhados

Credencial usada por vários projetos da mesma máquina fica num arquivo próprio ao lado do proxy, `chmod 600`, dono o usuário do runner:

| Arquivo | Chaves | Quem usa |
|---|---|---|
| `/mnt/hd2tb/proxy/cloudflare.env` | `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_TUNNEL_ID` | scripts `cf-*.sh` |
| `/mnt/hd2tb/proxy/smtp.env` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | apps que mandam e-mail |

O app recebe o SMTP pelo compose, sem o valor passar pelo repo, pelo `.env` do projeto ou pelo agente:

```yaml
services:
  app:
    env_file:
      - path: /mnt/hd2tb/proxy/smtp.env
        required: false      # dev em outra máquina sobe sem e-mail (Compose 2.24+)
```

O app lê `SMTP_*` com esses nomes; se a lib espera outros (`MAIL_HOST`...), faça o mapeamento no código de config do app. Para conferir quais chaves existem sem ver valores: `sed 's/=.*/=…/' /mnt/hd2tb/proxy/smtp.env`.

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

Para registrar um novo:

```bash
bash scripts/runner-register.sh <owner>/<repo> <label> [<DEPLOY_DIR>]
```

O script sai cedo se já há runner online com o label; senão baixa o runner (mesma versão dos já instalados), registra com token gerado pela API (sem passar pelo terminal) e termina com **um bloco único de sudo** para a pessoa rodar num terminal interativo: `svc.sh install/start` e, se o `DEPLOY_DIR` fica fora da área do usuário (ex.: `/opt/<projeto>`), a criação da pasta com o dono certo (`sudo install -d -o <usuario> -g <grupo> /opt/<projeto>`). Mostre o bloco à pessoa como veio e espere ela avisar; depois confira o runner `online`. Detalhes e remoção em `references/runner-setup.md`.

Registrar um runner é uma alteração persistente no servidor (serviço de sistema). Se a política da sessão bloquear até o script, entregue os comandos de `references/runner-setup.md` prontos, na ordem, em vez de tentar contornar.

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
