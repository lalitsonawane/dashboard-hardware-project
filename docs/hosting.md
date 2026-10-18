# Hosting — AI IoT Build Console (AWS VM)

Public access reuses the **Hermes pattern** on this host:

- **uvicorn** on `127.0.0.1:8080` (systemd)
- **Caddy** on `:80` / `:443` terminates TLS and reverse-proxies the hostname
- **Cloudflare** proxies `*.maoulabs.dpdns.org` to this origin (existing wildcard)
- Access-code gate in the app stays required

## Public URL

**https://app.maoulabs.dpdns.org/**

No extra DNS step is required while the zone wildcard `*.maoulabs.dpdns.org` remains proxied to this VM (same as `hermes.maoulabs.dpdns.org` historically).

## Services

| Unit | Role |
| --- | --- |
| `iot-build-console.service` | Build Console (uvicorn → `127.0.0.1:8080`) |
| `caddy.service` | TLS + reverse proxy for `app.maoulabs.dpdns.org` |

Caddy site block (also in `deploy/caddy/Caddyfile.snippet`):

```caddy
app.maoulabs.dpdns.org {
	reverse_proxy 127.0.0.1:8080
}
```

Install / refresh the app unit:

```bash
cd ~/cursor-projects/dashboard-hardware-project
./deploy/install-systemd.sh
```

## Manage

```bash
sudo systemctl status iot-build-console
sudo systemctl restart iot-build-console
sudo systemctl stop iot-build-console
sudo systemctl start iot-build-console

sudo systemctl status caddy
sudo systemctl reload caddy
```

## Monitor / logs

```bash
journalctl -u iot-build-console -f
journalctl -u caddy -f
journalctl -u iot-build-console --since "1 hour ago" --no-pager
```

## Health checks

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/
curl -sS -o /dev/null -w '%{http_code}\n' https://app.maoulabs.dpdns.org/
```

### Access gate

Deployed with **`DASHBOARD_PUBLIC=1`** — no access-code login wall. Anyone with the URL can use the console (including saving workspace state).

Re-enable the gate later:

```bash
sudo systemctl edit iot-build-console
# [Service]
# Environment=DASHBOARD_PUBLIC=0
sudo systemctl daemon-reload
sudo systemctl restart iot-build-console
```

Access-code files under `data/` remain unused while public mode is on.

## Rotate access code (only needed when the gate is re-enabled)

```bash
cd ~/cursor-projects/dashboard-hardware-project
python3 - <<'PY'
import secrets, pathlib
p = pathlib.Path("data/access-code.txt")
p.write_text(secrets.token_urlsafe(24) + "\n")
p.chmod(0o600)
print(p.read_text().strip())
PY
sudo systemctl restart iot-build-console
```

## Update the app from git

```bash
cd ~/cursor-projects/dashboard-hardware-project
git fetch origin
git checkout main   # or your deploy branch
git pull --ff-only
.venv/bin/python -m pip install -r requirements.txt
sudo systemctl restart iot-build-console
curl -sS -o /dev/null -w '%{http_code}\n' https://app.maoulabs.dpdns.org/
```

## Security notes

- App listens on **127.0.0.1:8080** only (not on the public interface).
- Prefer leaving security-group **8080 closed**; public HTTP(S) is 80/443 via Caddy + Cloudflare.
- With `DASHBOARD_PUBLIC=1`, the console is world-writable by anyone who has the URL — treat the hostname as semi-public.
- Keep `data/access-code.txt`, `data/session-secret.txt`, and `*.db` out of git.

## Optional: Cloudflare named tunnel

This host already uses Caddy + the `maoulabs.dpdns.org` wildcard. Named-tunnel units under `deploy/systemd/cloudflared-*.service` are optional alternatives if you later move off origin TLS; they are **not** required for `app.maoulabs.dpdns.org`.
