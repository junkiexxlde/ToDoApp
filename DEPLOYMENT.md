# Docker Deployment with HTTPS (Let's Encrypt)

This guide covers deploying your Todo App as a Docker container with automatic HTTPS using Let's Encrypt.

## Prerequisites

- A domain name pointing to your server
- Server with Docker and Docker Compose installed
- Port 80 and 443 accessible from the internet

## Step 1: Install Docker

**On Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install docker.io docker-compose-plugin
sudo usermod -aG docker $USER  # Add user to docker group
```

**On other systems:** Follow [Docker's official guide](https://docs.docker.com/get-docker/)

## Step 2: Prepare Your Server

1. Clone or upload your app to the server:
```bash
git clone <your-repo-url> /opt/todoapp
cd /opt/todoapp
```

2. Update `nginx.conf` with your domain:
```bash
sed -i 's/yourdomain.com/your-actual-domain.com/g' nginx.conf
```

3. Update email in `init-letsencrypt.sh`:
```bash
sed -i 's/admin@example.com/your-email@example.com/g' init-letsencrypt.sh
chmod +x init-letsencrypt.sh
```

## Step 3: Initialize Let's Encrypt Certificate

Run the initialization script (replace with your domains):
```bash
./init-letsencrypt.sh your-domain.com www.your-domain.com
```

This will:
- Create Let's Encrypt directories
- Generate an initial dummy certificate
- Start nginx with the dummy cert
- Request a real certificate from Let's Encrypt
- Reload nginx with the real certificate

## Step 4: Start the Application

```bash
docker-compose up -d
```

Check the logs:
```bash
docker-compose logs -f
```

## Step 5: Verify It's Working

1. Visit `https://your-domain.com` (not http!)
2. Check certificate: Click the lock icon in your browser
3. Test offline mode: Open DevTools → Network → Offline, then interact with the app

## Database & Backups

Your database and backups are stored on the host:
- Database: `./todos.db`
- Backups: `./backups/`

These persist even if containers are recreated.

## Maintenance

### View Logs
```bash
docker-compose logs -f app      # App logs
docker-compose logs -f nginx    # Nginx logs
docker-compose logs -f certbot  # Certificate logs
```

### Stop the App
```bash
docker-compose down
```

### Restart After Changes
```bash
docker-compose up -d --build
```

### Manual Certificate Renewal (automatic already runs)
```bash
docker-compose run --rm certbot renew --webroot -w /var/www/certbot
docker-compose exec nginx nginx -s reload
```

### Backup Database
```bash
cp todos.db todos.db.backup.$(date +%Y%m%d)
```

## Hosting Options for Your Domain

Popular affordable options:
- **Linode** - $5-10/month, excellent performance
- **DigitalOcean** - $4-6/month (with discount codes)
- **Hetzner** - €3/month, very affordable
- **Vultr** - $2.50+/month
- **AWS Lightsail** - $3.50+/month

### DNS Setup
1. Point your domain's A record to your server IP
2. Wait for DNS propagation (5-30 minutes)
3. Run the initialization script

## Troubleshooting

**"Connection refused"**
- Wait a few minutes for containers to start
- Check logs: `docker-compose logs`

**Certificate errors**
- Verify domain is pointing to your server: `nslookup your-domain.com`
- Check ports 80/443 are open: `sudo ufw allow 80,443/tcp`
- Ensure `nginx.conf` has correct domain name

**Database issues**
- Check permissions: `sudo chown -R $USER:$USER todos.db backups/`
- Restore from backup if needed

## Next Steps

- Monitor with: `docker-compose ps`
- Scale: Add more app instances in docker-compose.yml
- Analytics: Add Plausible or similar for usage tracking
- Notifications: Integrate webhooks for reminders

---

Your app is now production-ready with automatic SSL renewal! 🚀
