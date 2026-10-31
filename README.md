# NEXUS Gaming Zone

Working first version: a Node.js 24 web dashboard with local SQLite, hosted PostgreSQL or Cloud Firestore persistence. Interface guidance is in Roman Urdu / English.

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
- Manual booking requests need separate staff approval. With an explicitly enabled hands-free lease, complete PC bookings are created and started atomically by voice. Busy stations cannot receive overlapping sessions.
- Customer, station, duration, approving operator and full booked bill are stored. Ending early retains the full booked bill, with elapsed time shown separately. Staff can extend live sessions; paid credit stays recorded and the extra balance is due. After expiry, continuing starts a new billed interval without charging the locked gap. Dashboard distinguishes pending time delivery from agent acknowledgement.
- Owner can mark payment received; staff cannot. This is a manual payment record, not bank verification or cash reconciliation.
- Sessions expire by server time, independently of whether the dashboard is open. Refresh is every 10 seconds.
- Daily, past-seven-day and calendar-month reports use the browser timezone. Usage time is clipped to the chosen period; booked value is attributed to the session start date. Reports currently load the latest 5,000 sessions and audit screen the latest 100 events.
- Owner audit history records approval, early stopping, requests, staff creation and payment marking. No delete/edit-record API exists. This is not a tamper-proof external ledger: a server/database administrator can alter files.
- The dashboard voice selector uses free browser/system voices only. Awaaz sunain previews the available system voice. The earlier paid cloud-speech connector remains in server code but is not listed in the free dashboard selector; no cloud TTS setting is needed.
- Talk to assistant runs a spoken booking dialogue: station and duration, customer name, price confirmation, then saves a pending request after an explicit yes/haan. The assistant speaks the saved result only after server success; manual mode requires staff approval with the dashboard button; enabled hands-free mode can auto-start complete PC bookings. English, Roman Urdu number words, Urdu and Hindi commands are supported for this bounded booking flow. Select recognition language and available system voice; responses fall back to English if an appropriate Urdu/Hindi voice is unavailable. Use Chrome/Edge with microphone permission. Speech recognition may use the browser vendor's online service. This basic mode uses a deterministic dialogue. Real AI mode uses Gemini and the server tools described below. Neither mode verifies a speaker’s identity.

## Important integration boundaries

**Windows 10 x64 experimental agent integration is included in [windows-agent](windows-agent/README.md).** It uses a protected SYSTEM scheduled task to enable a dedicated standard Windows account after approval and disable/disconnect its desktop on expiry without deliberately terminating games. This is not seamless desktop lock/unlock. It has not been executed on Windows; physical enforcement remains unverified. PS5 control is not implemented. Dashboard heartbeat is agent-reported status, not verified physical usage. Elapsed session time is not verified device usage.

Before unattended commercial use, complete the Windows acceptance checklist, strengthen boot/logon gating (an enabled account can remain enabled before the startup task runs), and keep a separately secured Windows admin account. Test games, offline expiry, reboot and recovery on an actual spare PC. A browser overlay alone is insufficient. PS5 needs separately assessed hardware integration.

WhatsApp, email/push notifications, online payment verification, rate editing, password recovery, user deactivation, backups automation and production deployment are not implemented. No customer telephone numbers are collected in this version.

## Data and validation

Locally, data is retained in ignored `data/zone.db` (override DATA_DIR with an absolute path). With DATABASE_URL configured, data is instead stored in PostgreSQL in the nexus_zone schema; Vercel requires persistent storage. For Firebase Cloud Firestore instead, see [firebase/README.md](firebase/README.md) and set DATABASE_PROVIDER=firestore after configuring server credentials and indexes. Keep that directory private. For a consistent live backup, use SQLite's backup API or stop the server before copying the database; do not copy the main database alone while WAL writes are active.

```bash
npm test
```

The integration test launches the actual HTTP server with a temporary database, verifies setup-key protection, authentication, staff restrictions, approval gating, overlap rejection, billing/payment state, early stop, restart persistence, logout revocation, owner-only device pairing, device-scoped polling, rotation/revocation, session approval delivery, authorized extensions, duplicate/stale rejection, paid-credit preservation and expired continuation billing. `windows-agent/Test-Lease.ps1` exercises the shared offline timer policy separately. Browser UI and physical devices have not been automatically tested.

Use the existing checkout for future work; cloud tasks already provide isolation, so no extra Git worktree is required.

## Real AI agent

Use Real AI agent mode for free-form system questions and server-backed tools, with multilingual speech and staff-confirmed action cards. Configure GEMINI_API_KEY securely in Vercel; see [AI setup and permissions](assistant/README.md). The free browser/system voice is the default. Provider quotas and installed Urdu/Hindi/English voices still apply. Basic booking mode remains available without a model key.

## Spoken booking example (basic mode)

Click **Talk to assistant** and allow the microphone. Say “PC number five for two hours”, answer “Ahmed” when asked for the customer name, then say “yes” after hearing the station/duration/price. In basic/manual mode the request appears under Awaiting approval and staff press Approve & start separately. Dashboard hands-free mode instead uses the AI and server-side PC auto-booking permission. Cancel/Stop voice ends the conversation; **Dobara suno** retries a silent recognition turn. The assistant aborts listening before speaking so it does not intentionally hear its own voice. A manual form edit stops the voice draft. During submission the manual submit button is disabled to prevent a second submission.

Manual voice mode only prepares requests. Explicit hands-free mode may start a new PC booking; payment, extension, stop, discount and other changes retain their existing controls. Availability/rate are rechecked before writing; price changes require a new confirmation. If a request result is uncertain, the assistant does not retry automatically; inspect the pending list. Once the server write has been sent, stopping the microphone cannot undo it. Browser audio, recognition accuracy and voice quality depend on installed voices/device settings; an online multiplayer game does not pause when Windows disconnects.

Voice parser/dialogue/controller tests cover English/Urdu/Hindi numbers, name prompts, confirmation, cancellation, busy station checks, duplicate confirmations, and server-save failure. A Chromium UI smoke check with simulated microphone/voice APIs exercised the actual page and backend and saved exactly one pending request without activating a session. Physical microphone/audio have not been verified in this cloud environment.

## Hands-free mode

Choose a name such as Stella, click Hands-free on karein once and allow the microphone. Say its name to begin; conversation continues across replies and silence. Say **OK thanks** to return to waiting for the name. Stop voice turns the mic fully off. Keep the tab visible; background/sleep/browser shutdown cannot provide reliable always-on listening. See the [hands-free guide](assistant/README.md#hands-free-conversations) for privacy, browser limitations and recovery.

## Settings and dashboard

The dashboard shows current stations, usage/revenue summaries and one prominent AI hands-free ON/OFF button. Configuration is on **Settings**: station add/name/rate/remove/restore, AI name/voice/language/chat controls, PC pairing and staff accounts. Station mutations are owner-only. Removal archives the station; existing session/history records remain. Running sessions and pending requests block removal. Rate changes apply to future sessions; an existing session retains its captured rate.

PC display names and internal device IDs are independent. Pair the Windows agent with the **device ID** shown in Settings, including newly added PCs beyond the first ten. The default assistant is **Maya**; Settings can change its wake name. The last wake transcript is shown transiently in Settings for diagnosis, without being added to conversation history or sent to Gemini before the wake name matches.

Hands-free activation grants this login/tab a short-lived server permission for automatic **new PC bookings only**. Renewal runs while enabled. Complete PC/customer/duration details are required. “OK thanks” pauses the conversation while leaving hands-free enabled. “Hands-free off”, the dashboard OFF button, logout or backgrounding the tab stops the microphone and requests server revocation. Check the off acknowledgement before leaving: during a network failure an already-sent command can complete, and the unrenewed grant expires after 60 seconds. Off does not stop sessions already started. Any nearby speaker can request a booking while this mode is on; wake names are not identity verification.
