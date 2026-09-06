# Deploying for free

This project is open source and there is no budget for a server or a domain, so
this guide sticks to things that are free permanently — not free trials that
expire and quietly take your data with them.

---

## The constraint that decides everything

Most "free tier" hosts sleep a service after ~15 minutes of no HTTP traffic.
That is fine for a website. It is fatal here, because the scheduler is not
serving requests — it wakes every 5 minutes on its own to decide whether to send
you a reminder. A sleeping scheduler sends nothing, and the product's entire
promise is the reminder that arrives without you asking.

So the requirement is: **something that stays awake**, not something that wakes
on a request.

That rules out the free tiers of Render, Railway, Koyeb and similar for the
`scheduler` (and the bot, if you run it in long-polling mode). They are fine for
the frontend, and fine for the API on its own.

---

## Recommended: Oracle Cloud Always Free

A real virtual machine, free for the life of the account — not a trial. Verified
from Oracle's own documentation:

| | |
|---|---|
| Compute | 2 OCPU + 12 GB RAM continuous (Ampere ARM), or 2 × AMD micro instances |
| Storage | 200 GB block storage |
| Outbound traffic | 10 TB/month |
| Duration | Permanent — "for the life of the account" |

Twelve gigabytes of RAM for free is more than this app will ever need, and
because it is an ordinary Linux box, **`docker-compose.prod.yml` runs on it
unchanged.** Nothing about the architecture has to be redesigned to fit a
platform's model. That is the real argument for it: no rewrite, no lock-in, and
a contributor can reproduce your setup exactly.

One thing to know up front: the free Ampere shape is **ARM64**, not x86. All
four images have been built for `linux/arm64` and verified, so this is checked
rather than assumed:

| Image | linux/arm64 |
|---|---|
| backend | builds (134 MB) |
| telegram | builds (77 MB) |
| scheduler | builds (105 MB) |
| frontend | builds (22 MB) |

CI builds them for ARM on every push, so it stays true. To check yourself:

```bash
docker run --privileged --rm tonistiigi/binfmt --install arm64   # once
docker buildx build --platform linux/arm64 ./backend
```

Build them one at a time. Two emulated ARM builds at once will exhaust a laptop
and fail in ways that look like real incompatibilities but are not.

### Getting a hostname and HTTPS, free

Telegram will only deliver webhooks over valid HTTPS, so you need a hostname.
You do not need to buy one:

- **[DuckDNS](https://www.duckdns.org)** — free subdomain, e.g.
  `smart-habit-tracker.duckdns.org`. Point it at your VM's public IP.
- Caddy then obtains and renews a Let's Encrypt certificate for it
  automatically. That is already configured in `docker/Caddyfile`; you only set
  `DOMAIN`.

### Steps

```bash
# 1. On the VM, install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 2. Open the firewall — Oracle blocks everything by default, in two places:
#    the VCN security list in the console AND the instance's own iptables.
sudo iptables -I INPUT -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# 3. Get the code and configure it
git clone https://github.com/ismaeeeelshaikh/Smart-Habit-Tracker.git
cd Smart-Habit-Tracker
cp .env.example .env
nano .env        # see below

# 4. Run it
export DOMAIN=your-name.duckdns.org
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

For production `.env`, the values that must change from local:

```bash
JWT_SECRET=$(openssl rand -hex 32)          # generate a real one
INTERNAL_API_KEY=$(openssl rand -hex 32)    # generate a real one
TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=...                        # not "postgres"
COOKIE_SECURE=true                           # you have HTTPS now
CORS_ORIGINS=https://your-name.duckdns.org
WEB_APP_URL=https://your-name.duckdns.org
TELEGRAM_WEBHOOK_URL=https://your-name.duckdns.org/telegram/webhook
```

Use a **different bot token from your local one**. Telegram delivers each update
exactly once, so if both environments register a webhook, whichever registered
last silently swallows the other's messages and you will spend an evening
wondering why your laptop stopped working.

Then set up backups — `docker/backup.sh`, per the README.

---

## Alternatives, honestly

**Fly.io** — Docker-native and genuinely good, but it wants one process per app
rather than a compose file, so the backend, bot and scheduler each become their
own deployment. More moving parts, and the free allowance is smaller than
Oracle's. Reasonable if you would rather not run a VM.

**Split hosting** — frontend on Cloudflare Pages or GitHub Pages (free, fast,
trivial), database on Neon or Supabase (free Postgres), API somewhere small.
This works well right up until the scheduler, which still needs a home that
stays awake. Worth considering if you would rather not manage a VM at all and
you accept the bot being request-driven only (`/next` on demand, no proactive
reminders) — but that is giving up the main feature.

**A spare machine you already own** — an old laptop or a Raspberry Pi at home,
with a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
for free HTTPS and no port forwarding. Costs nothing, and is a perfectly
respectable way to run a personal project.

---

## Note for an open-source project

Deploying and open-sourcing are different problems. Contributors do not need
your deployment — they need `README.md`, which gets them running locally in one
command. A hosted instance is only worth the effort if you want people to *try*
the product without installing it.

If you do host a public demo, remember that it holds real people's schedules.
Backups on day one, not later.
