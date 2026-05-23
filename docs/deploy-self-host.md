# Self-hosting RoofOps on a Linux VPS

Per the PRD §4.4, the API runs on a VPS behind Nginx, managed by PM2. This doc covers the one-time server bootstrap and the per-deploy steps. Tested target: **Debian 12 or Ubuntu 24.04 LTS** on a small VPS (1–2 vCPU, 2–4 GB RAM, 40 GB disk).

## Components installed by the bootstrap

| Component | Role |
|---|---|
| Node 22 (NodeSource) | API runtime |
| pnpm (via corepack) | Workspace install |
| PM2 (global npm) | Process manager for the API |
| PostgreSQL 16 (PGDG) | Primary database |
| Redis 7 (apt) | Queues + cache (used from Phase 1 onward) |
| Nginx | TLS terminator + reverse proxy |
| Certbot | Let's Encrypt issuer |
| ufw + fail2ban | Firewall + brute-force defense |

## 1. Prepare the VPS

1. Provision a Debian 12 / Ubuntu 24.04 host with a public IPv4.
2. Point a DNS A record (e.g. `api.example.com`) at the host. The bootstrap can run without DNS, but you can't issue TLS until DNS resolves.
3. SSH in as a sudoer.

## 2. Run the bootstrap

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/cronicsm0ker/cronicsm0ker.github.io.git /tmp/roofops
cd /tmp/roofops
sudo ROOFOPS_DOMAIN=api.example.com bash scripts/server/bootstrap.sh
```

What it does (all idempotent — re-run safely):

- Creates the `roofops` system user and `~/app` checkout
- Installs Node, pnpm, PM2, Postgres 16, Redis, Nginx, certbot, ufw, fail2ban
- Generates and stores a Postgres password at `/etc/roofops/.db_password`
- Creates the `roofops` Postgres role and `roofops` database
- Writes `/etc/roofops/api.env` (root:roofops, 0640) with a generated `JWT_SECRET` and the DB URL — **fill in `APP_WEB_URL`, `CORS_ORIGINS`, and `SENTRY_DSN` before going live**
- Installs `/usr/local/bin/roofops-api` (wrapper that sources the env file)
- Drops an Nginx vhost for your domain (HTTP-only until certbot runs)
- Opens ufw for 22 / 80 / 443

Override knobs (pass as env vars to the script):

- `ROOFOPS_DOMAIN` — the API hostname
- `ROOFOPS_REPO_URL` / `ROOFOPS_BRANCH` — where to clone from
- `ROOFOPS_USER`, `ROOFOPS_HOME`, `ROOFOPS_APP_DIR` — paths
- `ROOFOPS_API_PORT` — defaults to 3000 (bound to 127.0.0.1; Nginx fronts it)
- `DB_NAME`, `DB_USER` — Postgres identifiers

## 3. Issue TLS

Once DNS resolves to the box:

```bash
sudo certbot --nginx -d api.example.com --redirect --agree-tos -m you@example.com
```

Certbot rewrites the Nginx vhost in place, adds the 443 server block, and sets a redirect. Renewal is automatic via the system timer.

## 4. First deploy

```bash
sudo -iu roofops
cd ~/app
bash scripts/server/deploy.sh
```

`deploy.sh` is the standard recurring command. It:

1. `git fetch` + hard reset to `origin/main` (override via `ROOFOPS_BRANCH`)
2. `pnpm install --frozen-lockfile`
3. `pnpm --filter @roofops/db generate`
4. `pnpm --filter @roofops/api... build`
5. Sources `/etc/roofops/api.env`
6. `prisma migrate deploy`
7. `pm2 reload` (or `pm2 start` on first run, then prints the `pm2 startup` command to enable boot persistence)
8. Smokes `GET http://127.0.0.1:3000/health`

The first run prints something like:

```
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u roofops --hp /home/roofops
```

Run that once as root, then `pm2 save` so the API resurrects on reboot.

## 5. Verify

```bash
curl -fsS https://api.example.com/health
# {"status":"ok",...}

curl -fsS https://api.example.com/health/ready
# {"status":"ready"}

sudo -iu roofops pm2 status
# roofops-api should be "online"

sudo -iu roofops pm2 logs roofops-api --lines 50
```

## 6. Subsequent deploys

After pushing to `main`:

```bash
ssh you@api.example.com 'sudo -iu roofops bash -lc "cd ~/app && bash scripts/server/deploy.sh"'
```

You can wire this into a GitHub Actions workflow once SSH key pairs are set up (Phase 1 task).

## 7. Operational reference

| Concern | Command |
|---|---|
| Tail API logs | `sudo -iu roofops pm2 logs roofops-api` |
| Restart API | `sudo -iu roofops pm2 reload roofops-api` |
| Edit env vars | `sudo $EDITOR /etc/roofops/api.env`, then `pm2 reload roofops-api --update-env` |
| Open psql | `sudo -u postgres psql roofops` |
| Backup DB (manual) | `sudo -u postgres pg_dump -Fc roofops > roofops-$(date +%F).dump` |
| Tail Nginx access | `sudo tail -f /var/log/nginx/access.log` |
| Re-run bootstrap (safe) | `sudo bash scripts/server/bootstrap.sh` |

## 8. Where the web app goes

The web frontend (`apps/web`) is a static Vite build. Two reasonable options:

- **Cloudflare Pages** — easiest, free, auto-deploys from git push. Point `VITE_API_URL` at `https://api.example.com`.
- **Same VPS** — drop `apps/web/dist` under `/var/www/roofops-web` and add a second Nginx vhost. Add a `deploy:web` script later if you want this; not in Phase 0.

## 9. Hardening checklist (do these before pilot)

- [ ] Disable password SSH (`PasswordAuthentication no` in `/etc/ssh/sshd_config`)
- [ ] Set up an off-host nightly `pg_dump` to S3-compatible storage
- [ ] Confirm `certbot renew --dry-run` succeeds
- [ ] Add Sentry DSN to `/etc/roofops/api.env` and reload
- [ ] Set `ROOFOPS_BRANCH=main` only — never deploy a feature branch to prod
- [ ] Review `ufw status verbose` and `fail2ban-client status sshd`
