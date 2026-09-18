# Skills — Engenharia Inversa

Skills do [Claude Code](https://code.claude.com) que capturam, passo a passo, como tirar um projeto do zero e colocar no ar num servidor próprio, tudo em Docker. Nasceram de projetos reais (landing page com formulário de voluntários e o monorepo da Engenharia Inversa) e servem de receita para os próximos.

| Skill | O que faz |
|---|---|
| [`nextjs-docker-bootstrap`](skills/nextjs-docker-bootstrap/SKILL.md) | Cria e roda um Next.js (App Router, TS, Tailwind, pnpm) **sem instalar Node na máquina**. Dockerfile multi-stage, compose com profiles `dev` (hot reload) e `prod` (standalone). |
| [`docker-nginx-cloudflare-proxy`](skills/docker-nginx-cloudflare-proxy/SKILL.md) | Um nginx como proxy reverso por domínio e Cloudflare Tunnel na entrada, sem abrir portas no roteador. Criação do proxy e inclusão de novos apps. |
| [`cloudflare-tunnel-hostnames`](skills/cloudflare-tunnel-hostnames/SKILL.md) | Hostname novo num túnel existente **pela CLI**: login do `cloudflared` na zona certa, ingress, CNAME via `tunnel route dns`, Access com allowlist de e-mails e validação de fora. |
| [`github-selfhosted-deploy`](skills/github-selfhosted-deploy/SKILL.md) | Push na `main` → runner self-hosted no servidor → `docker compose --profile prod up -d --build` → health check. Inclui registro do runner. |
| [`monorepo-setup`](skills/monorepo-setup/SKILL.md) | Monorepo pnpm workspaces + Turborepo (`apps/` + `packages/`): Next.js + NestJS + Prisma compartilhados, um Dockerfile multi-target, compose dev/prod e deploy com secrets. Inclui checklist para adicionar app/package. |
| [`nextjs-server-action-form`](skills/nextjs-server-action-form/SKILL.md) | Formulário com Server Action + `useActionState`, validação por campo, honeypot, persistência em JSON e teste por `curl`. |

## Instalar

### Como plugin (recomendado)

Dentro do Claude Code:

```
/plugin marketplace add engenhariainversa/skills
/plugin install deploy-kit@engenhariainversa
```

As skills passam a ser sugeridas automaticamente e também podem ser chamadas como `/deploy-kit:nextjs-docker-bootstrap` etc.

### Copiando as pastas

Para o usuário inteiro:

```bash
git clone https://github.com/engenhariainversa/skills.git ~/engenhariainversa-skills
mkdir -p ~/.claude/skills
for s in ~/engenhariainversa-skills/skills/*; do ln -sfn "$s" ~/.claude/skills/$(basename "$s"); done
```

Só para um projeto: os mesmos links em `.claude/skills/` dentro do repositório.

## Fluxo completo de um projeto novo

1. `nextjs-docker-bootstrap` (app único) ou `monorepo-setup` (landing + cms + api no mesmo repo): scaffold + Docker (dev e prod).
2. `nextjs-server-action-form`: se houver formulário.
3. `docker-nginx-cloudflare-proxy`: app na rede `proxy`, conf do nginx, hostname no túnel.
4. `github-selfhosted-deploy`: workflow + runner; a partir daí, push publica.

Cada skill lista o que fica a cargo de quem opera (painel da Cloudflare, `sudo` para o runner) para o Claude não tentar contornar permissões.

## Estrutura

```
.claude-plugin/        plugin.json + marketplace.json (instalação via /plugin)
skills/<nome>/
  SKILL.md             instruções (frontmatter name + description define quando a skill dispara)
  assets/              templates prontos para copiar (Dockerfile, compose, nginx, workflow)
  references/          material lido sob demanda (runner, Let's Encrypt, testes com curl)
```

## Contribuir

Abra um PR com a skill nova em `skills/<nome>/SKILL.md`. Escreva o *porquê* de cada passo, não só o comando: as skills são lidas por um modelo que se sai melhor entendendo a intenção do que seguindo listas de MUST.
