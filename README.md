# Aufgaben - Todo App

A feature-rich todo application with offline support, built with Node.js, Express, SQLite, and deployable as a PWA.

## Features

✅ Add, edit, and delete todos  
✅ Subtasks/Checklists  
✅ Notes for each todo  
✅ File attachments on notes (up to 12 MB per file)
✅ Progress tracking with visual ring  
✅ Automatic backups  
✅ Offline support (PWA)  
✅ Mobile-installable  
✅ Dark/Light theme ready  

## Local Development

```bash
# Install dependencies
npm install

# Start development server (with auto-reload)
npm run dev

# Visit http://localhost:3000
```

## Production Deployment

### Docker + HTTPS (Recommended)

1. Update your domain in `nginx.conf`:
   ```bash
   sed -i 's/yourdomain.com/your-domain.com/g' nginx.conf
   ```

2. Initialize Let's Encrypt SSL:
   ```bash
   chmod +x init-letsencrypt.sh
   ./init-letsencrypt.sh your-domain.com www.your-domain.com
   ```

3. Start the app:
   ```bash
   docker-compose up -d
   ```

See [DEPLOYMENT.md](DEPLOYMENT.md) for full instructions.

## Architecture

```
┌─────────────────────────────────────┐
│     Browser (PWA)                   │
│  - index.html                       │
│  - script.js (service worker)       │
│  - manifest.json                    │
└──────────────┬──────────────────────┘
               │ HTTPS
       ┌───────▼────────┐
       │ NGINX Reverse  │  (port 80/443)
       │ Proxy + SSL    │
       └───────┬────────┘
               │
       ┌───────▼────────┐
       │ Node.js App    │  (port 3000)
       │ (Express)      │
       └───────┬────────┘
               │
       ┌───────▼────────┐
       │ SQLite DB      │
       └────────────────┘
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/todos` | Get all todos |
| GET | `/todos/:id` | Get single todo |
| POST | `/todos/:id/attachments` | Add an attachment (up to 12 MB) |
| GET | `/todos/:id/attachments/:attachmentId` | Download an attachment |
| DELETE | `/todos/:id/attachments/:attachmentId` | Delete an attachment |
| POST | `/todos` | Create todo |
| PUT | `/todos/:id` | Update todo |
| DELETE | `/todos/:id` | Delete todo |
| GET | `/backup` | Create backup |

## File Structure

```
ToDoApp/
├── index.js              # Express server
├── index.html            # Frontend
├── script.js             # Frontend logic + Service Worker registration
├── service-worker.js     # Offline support & caching
├── styles.css            # UI styles
├── manifest.json         # PWA manifest
├── package.json          # Dependencies
├── Dockerfile            # Container configuration
├── docker-compose.yml    # Multi-container setup
├── nginx.conf            # Reverse proxy config
├── init-letsencrypt.sh   # SSL certificate setup
├── todos.db              # SQLite database
├── backups/              # Automatic backups
├── attachments/          # Files attached to todo notes
└── DEPLOYMENT.md         # Deployment guide
```

## Database Backups

Backups are automatically created and stored in `./backups/`

To restore a backup:
1. In the app: Settings → Backup Todos (shows restore option)
2. Or manually: `cp backups/todos-backup-*.db todos.db`

## Troubleshooting

**App won't start?**
```bash
docker-compose logs app
```

**Database locked?**
```bash
# Stop all containers and remove database lock
docker-compose down
rm todos.db
docker-compose up -d
```

**SSL certificate issues?**
```bash
# Manually renew certificate
docker-compose run --rm certbot renew --force-renewal
docker-compose exec nginx nginx -s reload
```

## Mobile Installation

1. Visit your HTTPS domain on a smartphone
2. Chrome/Edge: Menu → "Install app"
3. Safari: Share → "Add to Home Screen"

The app will now appear on your home screen like a native app!

## License

ISC
