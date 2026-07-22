#!/bin/bash

# Initialize Let's Encrypt SSL certificates
# Usage: bash init-letsencrypt.sh yourdomain.com www.yourdomain.com

if [ -z "$1" ]; then
  echo "Usage: bash init-letsencrypt.sh domain1.com domain2.com ..."
  echo "Example: bash init-letsencrypt.sh example.com www.example.com"
  exit 1
fi

domains=("$@")
rsa_key_size=4096
data_path="./certbot"
email="admin@example.com"  # Change this to your email

echo "### Creating directories..."
mkdir -p "$data_path/conf" "$data_path/www"

echo "### Creating dummy certificate for $domains..."
path="/etc/letsencrypt/live/$domains"
mkdir -p "$data_path/conf/live/$domains"
docker-compose run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:$rsa_key_size -days 1 \
    -keyout '$path/privkey.pem' \
    -out '$path/fullchain.pem' \
    -subj '/CN=localhost'" certbot

echo "### Starting nginx..."
docker-compose up --force-recreate -d nginx

echo "### Deleting dummy certificate..."
docker-compose run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/$domains /etc/letsencrypt/archive/$domains /etc/letsencrypt/renewal/$domains.conf" certbot

echo "### Requesting Let's Encrypt certificate..."
domain_args=""
for domain in "${domains[@]}"; do
  domain_args="$domain_args -d $domain"
done

docker-compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    --email $email \
    $domain_args \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --no-eff-email \
    --force-renewal" certbot

echo "### Reloading nginx..."
docker-compose exec nginx nginx -s reload

echo "### Done!"
