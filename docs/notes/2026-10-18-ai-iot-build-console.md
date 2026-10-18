# 2026-10-18 — AI IoT Hardware — Build console

Repo mirror: `docs/notes/2026-10-18-ai-iot-build-console.md`

## Outcome

A shared web console tracks the v1 ESP32 build from the 18 October 2026 report. Developers mark the 10-day plan, acceptance checks, tests and parts procurement. The layout is modular: sections can be hidden, reordered or added.

The console includes a **Purpose** section (immediately after Home): functional problem → solution narrative, then technical how-it-works, with local product photos under `static/purpose/` (attribution in that folder).

**Lalit Sonawane** is credited as idea owner and developer: a Lightning-style authorship plaque on the Build Console hero, a compact credit on `/flow`, and a light credit on the login screen (no false titles).

## Key decisions

- The console is a build tracker for people, separate from the future sensor dashboard (Plant, Room, Events charts fed by FastAPI).
- Progress lives in SQLite on the host so every browser that opens the link sees the same record.
- An access code gates the public link. The code is an environment variable or `data/access-code.txt`, and that file stays out of git.
- Visual language follows a Lightning-style header, record cards, path, list views and an Edit page drawer.
- Authorship credit uses catalog `project.owner` and roles **Idea owner** / **Developer** only.

## Artifacts

- App: `server/main.py`, `static/`, `data/catalog.json`
- Owner credit: `static/app.js` (`renderOwnerCredit`), `static/styles.css` (`.owner-credit*`), login aside in `static/index.html`
- Source report: Hardware project REPORT.pdf, version 1.0, prepared for Lalit Sonawane
- Notion: https://app.notion.com/p/3fd89f54d2c281a3b7d0f8d409eded90

## Open follow-ups

<<<<<<< HEAD
- Replace the quick tunnel with a stable hostname when the host is chosen.
=======
- Public host: https://app.maoulabs.dpdns.org/ (Caddy + Cloudflare wildcard `*.maoulabs.dpdns.org`; systemd `iot-build-console`).
>>>>>>> origin/main
- The sensor dashboard in section 11 of the report (live charts and on-demand AI) is still the product UI, not this build console.
