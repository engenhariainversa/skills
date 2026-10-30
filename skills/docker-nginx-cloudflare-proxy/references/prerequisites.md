# Pré-requisitos de Cloudflare (uma vez por máquina)

Isto é o que a pessoa configura **antes**, para o agente fazer o deploy inteiro sozinho: ingress do túnel, DNS e validação. Nasceu do deploy do IP Transporte (set/2026), em que o token disponível tinha permissão de túnel mas não de DNS, o token com DNS precisou ser colado no chat, o domínio novo ainda tinha registros da GoDaddy e o auto mode do Claude Code bloqueou (com razão) leitura de credenciais de outro projeto e mudança de DNS.

## Checklist

| # | Item | Quem | Como conferir |
|---|---|---|---|
| 1 | Túnel remoto criado e `proxy-cloudflared` rodando | pessoa (uma vez) | `docker logs proxy-cloudflared --tail 5` |
| 2 | Token de deploy com escopo mínimo | pessoa (painel) | `cf-check.sh` |
| 3 | `<proxy>/cloudflare.env` com `chmod 600` | pessoa | `cf-check.sh` |
| 4 | Domínio na Cloudflare (nameservers trocados no registrador) | pessoa (registrador) | `dig +short NS <dominio>` → `*.ns.cloudflare.com` |
| 5 | Regras de permissão do Claude Code para os scripts | pessoa (uma vez) | o agente roda `cf-check.sh` sem ser bloqueado |

Feito isso, por site novo o agente só roda `cf-tunnel-add.sh` e `cf-dns.sh`. A única decisão que volta para a pessoa é apagar registro DNS legado (item *Registros legados*).

## 1. Token de deploy

Painel → *Manage Account* → *Account API Tokens* → *Create Token* → *Custom token* (um token de conta sobrevive à saída de uma pessoa; token de usuário em *My Profile → API Tokens* também serve).

| Tipo | Permissão | Para quê |
|---|---|---|
| Account | Cloudflare Tunnel · **Edit** | ler e gravar o ingress do túnel |
| Zone | DNS · **Edit** | criar o CNAME e apagar legado |
| Zone | Zone · **Read** | achar a zona de cada hostname |

- *Account resources*: a conta do túnel. *Zone resources*: todas as zonas da conta (para domínios futuros não exigirem um token novo) ou as zonas específicas.
- Não precisa de mais nada. Access (allowlist) continua com o token próprio da skill `cloudflare-tunnel-hostnames`; quem quiser um token só pode acrescentar *Account · Access: Apps and Policies · Edit* a este.
- Um token de túnel sem DNS foi exatamente o que travou o deploy do IPT: o ingress entra, mas o hostname não resolve.

## 2. Arquivo de credenciais

Um único arquivo por máquina, **fora de qualquer repo**, ao lado do compose do proxy:

```bash
# /mnt/hd2tb/proxy/cloudflare.env   (ou ~/proxy/cloudflare.env; ou aponte CF_ENV_FILE)
CF_ACCOUNT_ID=<id da conta: painel → qualquer domínio → coluna direita "Account ID">
CF_API_TOKEN=<o token do passo 1>
CF_TUNNEL_ID=<uuid do túnel: Zero Trust → Networks → Tunnels → o túnel>
```

```bash
chmod 600 /mnt/hd2tb/proxy/cloudflare.env
```

Por que um arquivo só e padronizado: o agente nunca precisa procurar token em `.env` de outro projeto (o classificador do auto mode bloqueia isso como *Credential Exploration*, e está certo), e os scripts leem o arquivo sozinhos, sem o token passar pelo terminal ou pelo chat. Quem for o agente: **não abra esse arquivo** (`cat`, `grep`); rode os scripts. Para ver só quais chaves existem: `sed 's/=.*/=…/' <arquivo>`.

Um `cloudflare-dns.env` ou token avulso de setups antigos pode ser apagado depois que `cf-check.sh` passar com o arquivo novo.

## 3. Validar (só leitura)

```bash
bash <skill>/scripts/cf-check.sh                    # todas as zonas que o token vê
bash <skill>/scripts/cf-check.sh exemplo.com.br     # só as zonas dos sites deste deploy
```

Faz `tokens/verify`, GET do túnel e da config (conta hostnames, confere o catch-all no fim), lista as zonas e faz um GET em `dns_records` de cada uma. Escrita (Tunnel Edit, DNS Edit) não dá para provar sem escrever; se faltar, o primeiro `--apply` dos outros scripts falha com o erro da API (código 10000 = *Authentication error*: falta a permissão).

## 4. Ingress no túnel compartilhado

A config remota do túnel é **uma só para todos os sites da máquina**: um PUT errado derruba os outros. Por isso o script:

```bash
bash <skill>/scripts/cf-tunnel-add.sh app.exemplo.com.br www.app.exemplo.com.br          # mostra o diff
bash <skill>/scripts/cf-tunnel-add.sh --apply app.exemplo.com.br www.app.exemplo.com.br  # aplica
```

1. GET da config; monta a nova com as regras antigas intactas e na mesma ordem e as novas antes do catch-all; aborta se qualquer outra chave mudaria. Hostname que já existe apontando para outro serviço é avisado e não é tocado.
2. Mostra o diff do ingress. Sem `--apply` para aqui.
3. Com `--apply`: mede o código HTTP de cada site já publicado, grava o backup em `<proxy>/tunnel-config-backups/<túnel>-v<versão>-<data>.json`, faz o PUT, relê e confere versão e ingress, espera 10 s e mede de novo.
4. Se algum site que respondia passou a dar `000` ou 5xx, sai com erro e imprime o comando de volta: `cf-tunnel-add.sh --restore <backup> --apply`.

Túnel gerenciado por `config.yml` local (não remoto) não usa este script: edite o arquivo e reinicie o `cloudflared`.

## 5. DNS

```bash
bash <skill>/scripts/cf-dns.sh app.exemplo.com.br www.app.exemplo.com.br          # plano
bash <skill>/scripts/cf-dns.sh --apply app.exemplo.com.br www.app.exemplo.com.br  # cria/ajusta
```

A zona de cada hostname é descoberta pelo token (sufixo mais longo), então o registro nunca cai na zona errada (o problema clássico do `cloudflared tunnel route dns` com o `cert.pem` de outra zona). Para cada nome, o script classifica o que existe:

- `ok`: CNAME proxied para `<CF_TUNNEL_ID>.cfargotunnel.com`.
- `ajuste`: o CNAME certo sem proxy; `--apply` liga o proxy.
- `legado`: A/AAAA/CNAME apontando para outro lugar. Impede o CNAME do túnel.
- `mantido`: MX, TXT, CAA etc. Nunca são tocados (e-mail do domínio continua funcionando).
- `falta`: não há CNAME do túnel; `--apply` cria.

Zona em status `pending` gera aviso: os nameservers no registrador ainda não foram trocados e nada resolve até isso acontecer (passo 4 do checklist, só a pessoa faz).

### Registros legados

Domínio recém-transferido costuma trazer o A de estacionamento e o CNAME do `www` do registrador. Eles **não são apagados sem confirmação**:

1. O agente roda `cf-dns.sh` (leitura) e mostra à pessoa a lista `legado` com tipo, conteúdo e id.
2. Com o "pode apagar" da pessoa: `cf-dns.sh --apply --confirm-delete <id1>,<id2> <hosts>`. Só os ids listados são apagados; cada registro é salvo em JSON na pasta de backup antes do DELETE.
3. Num terminal interativo o próprio script pergunta (digite `apagar`), sem precisar dos ids.

Sem confirmação, `--apply` faz o resto (ajustes e CNAMEs dos nomes sem legado), pula os nomes bloqueados e sai com código 1.

## 6. Permissões do Claude Code

O auto mode bloqueia, por padrão, mudança de DNS (*DNS / Domain / Cert Changes*) e leitura de credenciais. Duas formas de liberar sem abrir mão disso:

**a) Regras específicas para os scripts** em `~/.claude/settings.json` (vale para todos os projetos da máquina). Leitura liberada; escrita (`--apply`) pergunta antes:

```json
{
  "permissions": {
    "allow": [
      "Bash(bash *docker-nginx-cloudflare-proxy/scripts/cf-check.sh*)",
      "Bash(bash *docker-nginx-cloudflare-proxy/scripts/cf-tunnel-add.sh*)",
      "Bash(bash *docker-nginx-cloudflare-proxy/scripts/cf-dns.sh*)"
    ],
    "ask": [
      "Bash(bash *docker-nginx-cloudflare-proxy/scripts/cf-tunnel-add.sh *--apply*)",
      "Bash(bash *docker-nginx-cloudflare-proxy/scripts/cf-dns.sh *--apply*)"
    ]
  }
}
```

Quem quiser o deploy sem nenhuma pergunta move as linhas de `ask` para `allow`; é uma autorização durável para o agente mexer no túnel e no DNS de todas as zonas do token, e deve ser uma decisão consciente da pessoa. `--confirm-delete` continua exigindo que a pessoa tenha visto e aprovado os ids.

**b) A pessoa roda o comando com `!`** no prompt do Claude Code (`! bash <skill>/scripts/cf-dns.sh --apply ...`). A saída cai na conversa e o agente segue a partir dela.

Se o classificador ainda bloquear mesmo com a regra, use (b). Não tente contornar a regra (copiar o token para outra variável, chamar a API por outro caminho).
