---
name: docker-nginx-cloudflare-proxy
description: Publica apps em containers Docker num servidor próprio (homelab, VPS, máquina em casa) com um único nginx como proxy reverso por domínio e Cloudflare Tunnel cuidando de TLS e da entrada, sem abrir portas 80/443 no roteador. Use sempre que o usuário quiser "colocar o app no ar com domínio", "apontar o domínio pro servidor", "configurar nginx/proxy reverso", "hospedar aqui nesse server", "Cloudflare Tunnel/cloudflared", ou adicionar um segundo/terceiro app a um servidor que já tem esse proxy. Cobre tanto a criação do proxy do zero quanto a inclusão de um novo app nele.
---

# Proxy nginx + Cloudflare Tunnel para apps em Docker

## Modelo

```
navegador -> Cloudflare (TLS) -> tunnel -> proxy-cloudflared -> proxy-nginx:80 -> <app>:3000
```

- Um diretório central (por exemplo `/mnt/hd2tb/proxy` ou `~/proxy`) tem o `nginx` e o `cloudflared` em compose.
- Existe uma rede docker **externa** chamada `proxy`. Cada app entra nela e **não publica portas** no host. O nginx fala com o app pelo nome do container.
- Um arquivo `nginx/conf.d/<dominio>.conf` por site, sempre `listen 80`: o TLS acontece na borda da Cloudflare. Isso resolve o caso comum de operadora que bloqueia 80/443 de entrada (CGNAT, ONT sem port forward).

## Primeiro: descubra o que já existe

```bash
docker network ls | grep -w proxy
docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E 'nginx|cloudflared'
ls /mnt/hd2tb/proxy ~/proxy 2>/dev/null
```

Se já há `proxy-nginx` rodando, pule para **Adicionar um app**. Senão, siga **Criar o proxy**.

## Criar o proxy (uma vez por servidor)

1. Crie a pasta e copie `assets/proxy/` para ela (`docker-compose.yml`, `docker-compose.tunnel.yml`, `nginx/conf.d/00-default.conf`).
2. Crie a rede: `docker network create proxy`.
3. No painel Cloudflare Zero Trust → Networks → Tunnels → *Create tunnel* (Cloudflared). Copie o token para `tunnel.env` na pasta do proxy:
   ```
   TUNNEL_TOKEN=eyJ...
   ```
   Nunca versione esse arquivo (`chmod 600 tunnel.env`; adicione ao `.gitignore` se a pasta for um repo).
4. Suba: `docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d`.
5. Confira: `docker logs proxy-cloudflared --tail 20` deve mostrar conexões registradas.

O `00-default.conf` responde 444 para qualquer host desconhecido, para que um domínio errado não caia no primeiro site da lista.

## Adicionar um app

### 1. O app entra na rede `proxy`

No repositório do app, crie `docker-compose.override.yml` a partir de `assets/app/docker-compose.override.yml`. Ele só mexe no serviço de produção: define `container_name`, zera `ports` (`!reset []`) e adiciona a rede. O serviço de dev continua com porta local.

Confira com `docker compose --profile prod config | grep -A8 '^  app:'` que `ports` sumiu e `networks` inclui `proxy`. Depois suba o app: `docker compose --profile prod up -d --build`.

### 2. Config do nginx

Crie `<proxy>/nginx/conf.d/<dominio>.conf` a partir de `assets/nginx/conf.d/site.conf.template`, trocando `<dominio>` e `<container>:<porta>`. Inclua o `www.` no `server_name` se o domínio for usado assim.

Pontos do template que valem manter:
- `X-Real-IP $http_cf_connecting_ip`: atrás da Cloudflare o `$remote_addr` é o IP do túnel; o IP real do visitante vem nesse header.
- `X-Forwarded-Proto https` fixo: o nginx recebe HTTP do túnel, mas o usuário está em HTTPS. Frameworks usam isso para montar URLs absolutas e cookies `Secure`.
- `Upgrade`/`Connection "upgrade"`: necessário para hot reload, WebSocket e streaming.

### 3. Teste e recarregue

O `nginx -t` falha com *host not found in upstream* se o container do app ainda não existe, por isso o app sobe **antes** do reload.

```bash
cd <proxy>
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: <dominio>' http://127.0.0.1/
```

Um 200 aqui prova que nginx → app funciona, independente de DNS.

### 4. Domínio na Cloudflare

1. A zona do domínio precisa estar na Cloudflare. Verifique com `dig +short NS <dominio>`: se aparecer `domaincontrol.com` (GoDaddy), `registro.br` etc., o usuário precisa adicionar o site na Cloudflare e trocar os nameservers no registrador. Um CNAME para `*.cfargotunnel.com` a partir de outro DNS **não** funciona.
2. Hostname no ingress do túnel (→ `proxy-nginx:80`) e CNAME proxied na zona. Dá para fazer pela CLI com `cloudflared` — é a skill **`cloudflare-tunnel-hostnames`** (inclui login por zona, Access com allowlist e validação). Pelo painel: Zero Trust → Tunnels → o túnel → *Public Hostname* → `<dominio>` → tipo **HTTP** → URL `proxy-nginx:80`; a Cloudflare cria o registro DNS sozinha.

Avise o usuário do passo 1 quando o DNS ainda não estiver na Cloudflare.

## Operação

```bash
docker compose logs -f nginx            # acessos e erros
docker logs -f proxy-cloudflared        # saúde do túnel
docker compose exec nginx nginx -s reload   # após editar qualquer .conf
```

Se você precisar do modo com certificado próprio (porta 80/443 abertas, Let's Encrypt via certbot), o compose do proxy já traz o serviço `certbot`; o fluxo está em `references/letsencrypt.md`.
