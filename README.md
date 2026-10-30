# NEXUS Gaming Zone

Working first version: a Node.js 24 web dashboard with local SQLite or hosted PostgreSQL persistence. Interface guidance is in Roman Urdu / English.

## Run locally

```bash
cd /workspace/Gaming-zone-software
# Choose a private, random setup key in your terminal. Do not share it in chat.
read -rs -p 'Private setup key: ' SETUP_KEY
export SETUP_KEY
npm ci
npm start
```

Open the application at port 3000 on the machine running it. The first screen creates the owner account using your setup key. Pick a unique owner password of at least 12 characters. After the owner exists, the setup endpoint is disabled. Subsequent starts do not require SETUP_KEY. Stop with Ctrl-C.

The default listener is loopback only. For private LAN testing, set HOST=0.0.0.0 and configure the machine firewall. Do not expose that HTTP listener directly to the public internet. Remote use requires a trusted HTTPS reverse proxy, COOKIE_SECURE=1, restricted network access and tested backups. Forward the original Host and X-Forwarded-Proto headers. Vercel deployment files are included; see [DEPLOYMENT.md](DEPLOYMENT.md). Live deployment has not yet been completed.

## Available workflow

- Ten PC stations and two sample PS5 stations (actual station count and rates still need your confirmation).
- PC rate Rs 300/hour, PS5 rate Rs 500/hour; defaults are illustrative.
- Owner creates staff accounts in Team; staff use their own credentials.
- A booking request never starts a session. A logged-in operator must explicitly approve it. Busy stations cannot receive overlapping approved sessions.
- Customer, station, duration, approving operator and full booked bill are stored. Ending early retains the full booked bill, with elapsed time shown separately. Staff can extend live sessions; paid credit stays recorded and the extra balance is due. After expiry, continuing starts a new billed interval without charging the locked gap. Dashboard distinguishes pending time delivery from agent acknowledgement.
- Owner can mark payment received; staff cannot. This is a manual payment record, not bank verification or cash reconciliation.
- Sessions expire by server time, independently of whether the dashboard is open. Refresh is every 10 seconds.
- Daily, past-seven-day and calendar-month reports use the browser timezone. Usage time is clipped to the chosen period; booked value is attributed to the session start date. Reports currently load the latest 5,000 sessions and audit screen the latest 100 events.
- Owner audit history records approval, early stopping, requests, staff creation and payment marking. No delete/edit-record API exists. This is not a tamper-proof external ledger: a server/database administrator can alter files.
- Browser speech recognition fills PC number and duration for simple numeric English/Roman Urdu commands. Customer name is entered manually. The user submits the request, then separately approves it. Microphone permission and a compatible browser are required; recognition may use the browser vendor's online service. This is not a conversational multilingual AI or voice-identity authentication.

## Important integration boundaries

**Windows 10 x64 experimental agent integration is included in [windows-agent](windows-agent/README.md).** It uses a protected SYSTEM scheduled task to enable a dedicated standard Windows account after approval and disable/disconnect its desktop on expiry without deliberately terminating games. This is not seamless desktop lock/unlock. It has not been executed on Windows; physical enforcement remains unverified. PS5 control is not implemented. Dashboard heartbeat is agent-reported status, not verified physical usage. Elapsed session time is not verified device usage.

Before unattended commercial use, complete the Windows acceptance checklist, strengthen boot/logon gating (an enabled account can remain enabled before the startup task runs), and keep a separately secured Windows admin account. Test games, offline expiry, reboot and recovery on an actual spare PC. A browser overlay alone is insufficient. PS5 needs separately assessed hardware integration.

WhatsApp, email/push notifications, online payment verification, conversational AI, rate editing, password recovery, user deactivation, backups automation and production deployment are not implemented. No customer telephone numbers are collected in this version.

## Data and validation

Locally, data is retained in ignored `data/zone.db` (override DATA_DIR with an absolute path). With DATABASE_URL configured, data is instead stored in PostgreSQL in the nexus_zone schema; Vercel requires this persistent mode. Keep that directory private. For a consistent live backup, use SQLite's backup API or stop the server before copying the database; do not copy the main database alone while WAL writes are active.

```bash
npm test
```

The integration test launches the actual HTTP server with a temporary database, verifies setup-key protection, authentication, staff restrictions, approval gating, overlap rejection, billing/payment state, early stop, restart persistence, logout revocation, owner-only device pairing, device-scoped polling, rotation/revocation, session approval delivery, authorized extensions, duplicate/stale rejection, paid-credit preservation and expired continuation billing. `windows-agent/Test-Lease.ps1` exercises the shared offline timer policy separately. Browser UI and physical devices have not been automatically tested.

Use the existing checkout for future work; cloud tasks already provide isolation, so no extra Git worktree is required.
