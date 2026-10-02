# Deploying Axia for the closed beta

This guide runs the whole platform on **one VPS with Docker Compose**: web app, API, PostgreSQL, Redis, and Caddy (automatic HTTPS). It costs roughly ₹1–2K/month and easily handles a 500–1,000-player beta.

```
Internet ──443──► Caddy (HTTPS) ──► web (Next.js) ──/api──► api (NestJS) ──► Postgres + Redis
```

Only Caddy is exposed. The API, database and Redis are reachable only inside the Docker network.

## 1. Get a server and a domain
- A VPS with **2 vCPU / 4 GB RAM**, Ubuntu 24.04. DigitalOcean, Hetzner, AWS Lightsail and Linode all work. A Mumbai or Bangalore region is closest to players.
- A domain or subdomain, e.g. `play.yourbrand.in`.
- In your DNS provider, add an **A record** pointing the domain at the server's public IP. Wait until `ping play.yourbrand.in` shows that IP.

## 2. Install Docker on the server
```bash
ssh root@YOUR_SERVER_IP
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 3. Create the Google sign-in client
1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. Open **APIs & Services → OAuth consent screen**. Choose External, then fill in the app name, support email and your domain.
3. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**, and choose **Web application**.
4. Under **Authorised JavaScript origins**, add `https://play.yourbrand.in`. No redirect URIs are needed.
5. Copy the **Client ID**, which ends with `.apps.googleusercontent.com`.

## 4. Get the code and configure it
```bash
git clone https://github.com/jitendersharma61220-netizen/Axia-game.git /opt/axia
cd /opt/axia
cp deploy/.env.example deploy/.env
nano deploy/.env
```
Fill in every value:
- `DOMAIN`: your domain, without `https://`.
- `POSTGRES_PASSWORD` and `JWT_SECRET`: run `openssl rand -hex 32` once for each.
- `GOOGLE_CLIENT_ID`: the client ID from step 3.
- `ADMIN_EMAILS`: your Google email. It becomes an admin the first time you sign in, and admins never need an invite code.
- `SIGNUP_MODE=invite`: keeps the beta closed.

The API refuses to start if `JWT_SECRET` is weak or `GOOGLE_CLIENT_ID` is missing. That's on purpose.

## 5. Start everything
```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env ps     # all should be "healthy"
```
The first build takes a few minutes. Database migrations run automatically every time the API starts.

**Load the five games** (only once; running it again is safe):
```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec api ./node_modules/.bin/tsx prisma/seed.ts
```

Then open `https://play.yourbrand.in`. Caddy fetches the HTTPS certificate on the first visit.

## 6. First sign-in and invite codes
1. Sign in with Google using the `ADMIN_EMAILS` address, then open **Admin → Invite codes**.
2. Create one code per group (college, creator, WhatsApp group, office) with a sensible **max uses**.
3. Share the link, e.g. `https://play.yourbrand.in/?invite=COLLEGE50`. The code fills in automatically on sign-in.
   - Add UTM tags to see which channel works: `?invite=COLLEGE50&utm_source=instagram&utm_campaign=beta-week1`.
4. A friend's **challenge link** (`/c/...`) also works as an invite, so the share loop keeps growing the beta.

Track progress in **Admin → Analytics**: D1/D7/D30 retention, the funnel, which game keeps people, and where sign-ups came from. Read what players say in **Admin → Feedback**.

## 7. Backups
```bash
chmod +x deploy/backup.sh
crontab -e
# add this line: nightly backup at 03:15, 14 days kept
15 3 * * * cd /opt/axia && ./deploy/backup.sh >> deploy/backups/backup.log 2>&1
```
Copy `deploy/backups/` off the server now and then, e.g. with `rsync` to your laptop.

To restore a backup:
```bash
gunzip -c deploy/backups/axia-YYYYMMDD-HHMMSS.sql.gz | \
  docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T postgres psql -U axia axia
```

## 8. Updating to a new version
```bash
cd /opt/axia && git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

## Troubleshooting
| Symptom | Fix |
| --- | --- |
| Browser shows a certificate error | DNS isn't pointing at the server yet, or ports 80/443 are blocked. Check `docker compose ... logs caddy`. |
| "Google sign-in isn't configured" | `GOOGLE_CLIENT_ID` was empty when the web image was built. Fix `.env`, then run `up -d --build` again. |
| Google popup says "origin not allowed" | Add `https://<DOMAIN>` to the OAuth client's authorised JavaScript origins. |
| API keeps restarting | `docker compose ... logs api`. It names any unsafe or missing setting. |
| "Too many requests" | Sign-in is limited to 60 attempts per minute per IP (enough for a whole class on one campus Wi-Fi). Wait a minute. |
