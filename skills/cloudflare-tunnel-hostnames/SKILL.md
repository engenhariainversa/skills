---
name: cloudflare-tunnel-hostnames
description: Publica hostnames novos num Cloudflare Tunnel já existente pela linha de comando, sem abrir o painel - login do cloudflared na zona certa, hostname no ingress do túnel, CNAME proxied via `cloudflared tunnel route dns`, Cloudflare Access com allowlist de e-mails e validação de fora. Use sempre que o usuário pedir "aponta o subdomínio pro túnel", "cria o CNAME", "coloca o staging no ar", "protege com Access/allowlist", "logar na zona X do cloudflared", ou quando o `tunnel route dns` criou o registro na zona errada (`x.outrazona.com.zona-antiga.dev`). Complementa a skill docker-nginx-cloudflare-proxy, que para no "faça no painel".
---

# Hostnames num Cloudflare Tunnel pela CLI

## Modelo

```
navegador -> Cloudflare (TLS, Access) -> túnel -> proxy-cloudflared -> proxy-nginx:80 -> <app>
```

Colocar `app.exemplo.com` no ar exige **três coisas na Cloudflare**, todas automatizáveis:

| Passo | O que é | Como | Credencial |
|---|---|---|---|
| Ingress | O túnel saber que `app.exemplo.com` → `proxy-nginx:80` | `scripts/cf-add-hostname.sh` | `cert.pem` |
| DNS | CNAME proxied `app.exemplo.com` → `<tunnel-id>.cfargotunnel.com` | `cloudflared tunnel route dns` | `cert.pem` **da zona** |
| Access (opcional) | Só e-mails da allowlist entram | `scripts/cf-access-allowlist.sh` | API token de conta |

Mais o nginx do proxy (`server_name` + `proxy_pass`), que é a skill `docker-nginx-cloudflare-proxy`.

## Credenciais e o que cada uma enxerga

- **`~/.cloudflared/cert.pem`** — gerado por `cloudflared tunnel login`. Contém um `apiToken` **restrito à zona escolhida no browser durante o login** (mais o `accountID`). Serve para ingress (escopo de conta) e para `route dns` (escopo de zona).
- **`~/.cloudflare/access-token`** — API token criado no painel (*My Profile → API Tokens*) com `Account · Access: Apps and Policies · Edit` e `Zone · Zone · Read`. Uma linha, sem espaços. Só para Access.

Nunca imprima o conteúdo desses arquivos. Os scripts leem o token numa variável e só mostram nome/ids. Prefira rodar os scripts prontos desta skill a montar comandos inline que abrem esses arquivos.

## Armadilha principal: `route dns` na zona errada

`cloudflared tunnel route dns <tunel> app.outrazona.com` **não falha** quando o `cert.pem` é de outra zona: ele cria `app.outrazona.com.<zona-do-cert>` na zona do cert. Sintomas: o `dig` do hostname certo vem vazio e aparece um registro estranho na zona antiga.

Regra: **um `cert.pem` por zona**, e conferir antes de rotear.

```bash
bash scripts/cf-zones.sh              # mostra account + zonas que o cert atual vê
```

Se a zona desejada não estiver na lista, guarde o cert atual e faça login de novo escolhendo a zona certa no browser:

```bash
mv ~/.cloudflared/cert.pem ~/.cloudflared/cert-<zona-antiga>.pem
cloudflared tunnel login              # abre URL; escolher a zona do hostname novo
```

Para voltar a mexer na zona antiga: `CLOUDFLARED_CERT=~/.cloudflared/cert-<zona-antiga>.pem` nos scripts, ou trocar os arquivos de lugar. O `cloudflared` sempre usa `~/.cloudflared/cert.pem` (ou `--origincert`).

## Passo a passo

Pré-requisitos: proxy + túnel rodando (`docker ps` mostra `proxy-nginx` e `proxy-cloudflared`), zona do domínio na Cloudflare (`dig +short NS dominio` → `*.ns.cloudflare.com`), `cloudflared` instalado no host.

### 1. nginx do proxy

Um `server {}` por hostname em `<proxy>/nginx/conf.d/<projeto>.conf`, `proxy_pass` para o container do app, `nginx -t && nginx -s reload`. Prova sem DNS:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: app.exemplo.com' http://127.0.0.1/
```

### 2. Ingress do túnel

```bash
bash scripts/cf-add-hostname.sh jarvis app.exemplo.com api.exemplo.com
```

Lista o ingress resultante (regras antigas preservadas, catch-all `http_status:404` por último) e faz o `PUT`. Se o túnel é gerenciado por config local (`config.yml`) em vez de token/painel, edite o arquivo e reinicie o `cloudflared` em vez de usar o script.

### 3. CNAME na zona

```bash
bash scripts/cf-zones.sh                            # a zona do hostname tem que aparecer aqui
cloudflared tunnel route dns jarvis app.exemplo.com
```

Saída esperada: `Added CNAME app.exemplo.com which will route to this tunnel`. Se o nome no log tiver um sufixo de outra zona, o cert está errado — apague o registro na zona antiga e volte em *Credenciais*. Se o registro já existe (ex.: A/CNAME antigo), o comando falha; apague no painel ou use `--overwrite-dns`.

### 4. Access (só para painéis internos, mailpit, staging)

```bash
bash scripts/cf-access-allowlist.sh app.exemplo.com "exemplo staging" pessoa@exemplo.com outra@exemplo.com
```

Cria o app self-hosted (ou reaproveita pelo hostname) e grava/atualiza a policy `allowlist`. Não proteja hostnames que o app público chama (API do mobile/web, webhooks): o browser passa pelo Access, um `fetch` de outro domínio não.

O IdP precisa estar configurado na conta (Google, One-time PIN...). Sem IdP o usuário vê o login do Access e não consegue passar.

### 5. Validar de fora

```bash
for h in app api; do
  printf '%-20s ' $h; dig +short $h.exemplo.com @1.1.1.1 | tr '\n' ' '
  curl -s -o /dev/null -w '%{http_code}\n' --max-time 15 https://$h.exemplo.com/
done
```

- IPs `104.21.x.x` / `172.67.x.x` = proxied pela Cloudflare, ok.
- `000` logo após criar o CNAME é propagação; espere 30-60 s e repita.
- `200`/`307` = chegou no app. `404` na raiz de uma API costuma ser normal; teste a rota de health (`/webhooks/health`, `/graphql`).
- `502` com DNS ok = nginx não alcança o container (nome errado no `proxy_pass` ou container fora da rede do proxy).
- `530` = ingress do túnel sem esse hostname (passo 2).
- Access ativo responde `302` para `*.cloudflareaccess.com` sem cookie.
