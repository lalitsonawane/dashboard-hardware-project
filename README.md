# AI IoT Build Console

Shared project dashboard for the AI-enabled IoT build (Plant Care Assistant, Room Environment Monitor, Home Event Assistant). It tracks the 10-day plan, acceptance checks, the T1–T17 matrix, the bill of materials, budget, risks and wiring from the 18 October 2026 project report.

Progress is stored in SQLite on the host, so a MacBook and another PC see the same board through one web link.

## Run

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn server.main:app --host 0.0.0.0 --port "${PORT:-8080}"
```

Open `http://127.0.0.1:8080`. The first start writes an access code to `data/access-code.txt`. Set `DASHBOARD_ACCESS_CODE` to choose the code yourself.

## Page layout

**Edit page** shows, hides, reorders and adds sections. Built-in sections can be hidden and restored. Custom sections can be removed.

## Remote access

On the AWS project host the console runs under systemd on `127.0.0.1:8080`, with Caddy terminating TLS for **https://app.maoulabs.dpdns.org/** (Cloudflare-proxied `*.maoulabs.dpdns.org`, same pattern as Hermes). See [docs/hosting.md](docs/hosting.md) for manage/monitor commands.

For a one-off local share without Caddy:

```bash
cloudflared tunnel --url http://127.0.0.1:8080
```
