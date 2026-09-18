# Testar uma Server Action de formulário com curl

Funciona contra `next dev` ou contra a imagem de produção. Aqui o app responde em `http://127.0.0.1:3999`.

## 1. Pegar os campos ocultos do form

```bash
curl -s http://127.0.0.1:3999/ | grep -o '<input type="hidden"[^>]*>'
```

Saída típica (valores mudam a cada build):

```
<input type="hidden" name="$ACTION_REF_1"/>
<input type="hidden" name="$ACTION_1:0" value="{&quot;id&quot;:&quot;6018fb…&quot;,&quot;bound&quot;:&quot;$@1&quot;}"/>
<input type="hidden" name="$ACTION_1:1" value="[{&quot;status&quot;:&quot;idle&quot;}]"/>
<input type="hidden" name="$ACTION_KEY" value="kb8f8…"/>
```

O `id` também está em `.next/server/server-reference-manifest.json` depois do build.

## 2. Enviar como um navegador sem JavaScript

```bash
ID=<id da action>; KEY=<valor de $ACTION_KEY>
post() {
  curl -s -X POST http://127.0.0.1:3999/ \
    -F '$ACTION_REF_1=' \
    -F '$ACTION_1:0={"id":"'$ID'","bound":"$@1"}' \
    -F '$ACTION_1:1=[{"status":"idle"}]' \
    -F "\$ACTION_KEY=$KEY" "$@"
}

# válido
post -F name='Maria Silva' -F email='maria@exemplo.com' -F phone='62999990000' -F city='Goiânia' \
     -F area=recepcao -F availability=sabado -F availability=domingo -F consent=on \
  | grep -o 'Inscrição recebida!\|Revise os campos'

# duplicado (mesmo e-mail em maiúsculas)
post -F name='Maria Silva' -F email='MARIA@exemplo.com' -F phone='62999990000' -F city='Goiânia' \
     -F area=recepcao -F availability=sabado -F consent=on | grep -o 'E-mail já cadastrado'

# inválido
post -F name='M' -F email='x' -F phone='1' -F city='' -F area=zzz \
  | grep -o 'Informe seu nome completo\|Marque pelo menos um período' | sort -u
```

A resposta é o HTML da página com o estado novo do form, por isso o `grep` pelas mensagens.

## 3. Conferir o que foi gravado

```bash
cat data/volunteers.json          # dev
docker compose --profile prod exec app cat /data/volunteers.json
```

## Rodar a imagem de produção isolada para o teste

```bash
docker run -d --name form-test --user "$(id -u):$(id -g)" -e HOSTNAME=0.0.0.0 -e PORT=3000 -e DATA_DIR=/data \
  -v "$PWD/.next/standalone:/app" -v "$PWD/.next/static:/app/.next/static" -v "$PWD/public:/app/public" \
  -v "$PWD/tmp-data:/data" -p 127.0.0.1:3999:3000 -w /app node:22-alpine node server.js
# ... testes ...
docker rm -f form-test
```
