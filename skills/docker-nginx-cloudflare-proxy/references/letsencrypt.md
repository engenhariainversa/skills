# Modo alternativo: portas 80/443 abertas + Let's Encrypt

Só use se o servidor recebe tráfego direto (port forward funcionando, sem CGNAT). No modo Cloudflare Tunnel isto não é necessário.

Script `novo-site.sh <dominio> <container:porta> <email>` na pasta do proxy:

```bash
#!/bin/bash
# 1) cria o server HTTP (só ACME + redirect), 2) emite o certificado, 3) ativa o HTTPS e recarrega o nginx.
set -euo pipefail
DOM=${1:?dominio}; UP=${2:?servico:porta}; EMAIL=${3:?email}
cd "$(dirname "$0")"
CONF=nginx/conf.d/$DOM.conf

cat > "$CONF" <<HTTP
server {
    listen 80;
    server_name $DOM;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
HTTP
docker compose up -d nginx
docker compose exec nginx nginx -s reload

if [ ! -f "certbot/conf/live/$DOM/fullchain.pem" ]; then
  docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
    -d "$DOM" --email "$EMAIL" --agree-tos --no-eff-email
fi

cat >> "$CONF" <<HTTPS

server {
    listen 443 ssl;
    http2 on;
    server_name $DOM;
    ssl_certificate     /etc/letsencrypt/live/$DOM/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOM/privkey.pem;
    include snippets/ssl.conf;
    location / {
        proxy_pass http://$UP;
        include snippets/proxy.conf;
    }
}
HTTPS
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
echo "OK: https://$DOM -> $UP"
```

O serviço `certbot` do compose renova sozinho e o nginx recarrega a cada 6h para pegar o certificado novo.
