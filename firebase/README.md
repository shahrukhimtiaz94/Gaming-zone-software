# Cloud Firestore setup

Firebase web and Admin SDKs are installed for project `gaming-zone-software`. The backend supports Cloud Firestore when explicitly selected with `DATABASE_PROVIDER=firestore`. PostgreSQL/SQLite remain supported; installing the SDK does not silently copy or move existing data.

## Vercel environment variables

Configure these directly in **Vercel → Project Settings → Environment Variables** for the intended production project, never in chat or source control:

- `DATABASE_PROVIDER=firestore`
- `FIREBASE_PROJECT_ID=gaming-zone-software`
- `FIREBASE_CLIENT_EMAIL`: the service account's client email
- `FIREBASE_PRIVATE_KEY`: its matching private key, multiline or escaped newlines
- `SETUP_KEY`: your private first-owner bootstrap key
- `COOKIE_SECURE=1`

Manage credentials via Firebase Console → Project settings → Service accounts. Keep the downloaded JSON/key private and out of the repository. Give the service account appropriate Firestore IAM access. A securely provisioned GOOGLE_APPLICATION_CREDENTIALS binding is also supported, but the cloud workspace's currently supplied binding is not a usable Firebase service account. Do not assume its mere presence provides access.

`DATABASE_URL` is ignored in explicit Firestore mode, so the app no longer requires Postgres in that mode. Leave existing production data backed up before switching; no automatic PostgreSQL/SQLite import is performed. Firestore starts with a new owner/database state unless previously initialized for this app. A named Firestore database can be selected with `FIREBASE_DATABASE_ID`; otherwise `(default)` is used.

## Required Firebase rules and indexes

Vercel does not deploy Firebase indexes or security rules. With Firebase CLI authorization for your project, run from the repository:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project gaming-zone-software
```

**Review your existing project's rules first.** This repository's rules deny browser access to the app's `nexus_zone` namespace and grant no access elsewhere. Publishing this entire rules file replaces existing rules, so merge any unrelated application's existing rules before publishing. Broad public allow rules also permit the protected namespace, because Firestore matching grants are additive; do not leave a broad test-mode allow rule in place. The Admin SDK uses IAM and does not rely on browser rules.

Deploy the four composite indexes in firestore.indexes.json for efficient queries, then redeploy the Vercel project with the environment variables above. Check `/api/status`, create the owner with SETUP_KEY, and test booking → staff approval → time extension → report. Static HTML loading alone does not prove database access.

All application data is under `nexus_zone/gaming-zone/<collection>/<id>`. Owner/staff credentials, device keys, approvals and payment mutations continue through the authenticated backend. Browser configuration does not grant Admin access and is not used as a device/staff credential. Analytics has not been enabled.

## Transactions and scale

Server mutations use native Firestore transactions. Writes are buffered until all reads finish, as required by Firestore; retries re-run the mutation against current data. Numeric ID counters are updated inside transactions. A shared counters document serializes ID allocation for this small gaming-zone workflow. Existing payment credit and audit records are retained when extending time. Unknown internal query shapes fail closed.

Queries use indexed per-device active/latest sessions and bounded history (5,000 sessions, 100 audit records). Dashboard polling/heartbeat reads and writes are billable Firestore operations. This is a small-zone implementation, not a design for thousands of devices or unbounded report exports. Archive/rollup work and polling cost review are needed as history grows.

## Test without production credentials

Normal `npm test` uses temporary SQLite and clears inherited DATABASE_PROVIDER/DATABASE_URL. For Firestore, start the **official emulator** locally with a demo project and run:

```bash
npx firebase-tools emulators:start --only firestore --project demo-nexus-zone-test
# In a second terminal, with emulator host/port from firebase.json:
NEXUS_TEST_FIRESTORE_EMULATOR=127.0.0.1:8085 npm test
```

The Firestore workflow test clears only the emulator's fixed demo project and verifies the same booking/authentication/payment/extension/key-revocation workflow and persistence across app restart. A real production project and non-loopback emulator addresses are rejected. Never set FIRESTORE_EMULATOR_HOST on Vercel.

The web helper client.js uses npm imports and is not served as an unbundled browser script. Admin code stays server-side. Neither Firebase credentials nor emulator success establishes that your deployed service account, indexes and security rules have been configured correctly; validate those in your own project before live customer use.

### Missing-index recovery

If a composite index is missing or still building, the backend retries only that specific index error using single-field queries and local filtering/sorting. Active/latest session fallback examines at most 5,000 historical records for that PC, and refuses to operate if that bound is exceeded instead of silently missing an active session. The optimized indexed queries remain preferred; fallback increases read volume. Permission, credential and network errors do not trigger this fallback. Disabling even single-field indexes still needs a settings correction.

The official emulator does not enforce missing composite indexes. To exercise the recovery path explicitly against real emulator data, run `NEXUS_TEST_FIRESTORE_EMULATOR=127.0.0.1:8085 NEXUS_TEST_MISSING_INDEX=1 npm test`. A test-process-only import hook rejects composite queries and verifies the booking workflow still succeeds; it never runs in the deployed application.

API errors now distinguish missing indexes, denied server permissions and missing databases where the provider supplies a known error code. Unexpected failures retain a generic message and include a reference that can be matched in Vercel Runtime Logs. Raw error messages/credentials are not sent to the browser or logs; index-specific Firebase Console URLs can be logged to help configure the index.

## Optional server-side cloud voice connector (not needed for the free dashboard)

The current dashboard lists only free browser/system voices, as requested by the user. The earlier cloud connector remains in server code, but its setup below is optional developer reference; do not enable billing for the current free UI.

The voice assistant can synthesize Urdu audio with Google's Cloud Text-to-Speech using the **same server-side service account** already configured for Firebase. No private key belongs in browser code. This voice service is separate from Firestore and is not enabled just by installing Firebase.

1. Open https://console.cloud.google.com/apis/library/texttospeech.googleapis.com?project=gaming-zone-software and enable **Cloud Text-to-Speech API** for the correct project.
2. Link/enable Google Cloud billing if required. Synthesis can incur charges according to the selected voice model and usage; check pricing and budget alerts in your project. No billing/API changes were performed by the agent.
3. Ensure the existing service account is authorized to use the API in that project. If access is denied, inspect its IAM/service usage permissions rather than creating or pasting another key into chat.
4. In Vercel Production Environment Variables add `VOICE_PROVIDER=google` and redeploy. Keep the existing Firebase credential variables. The backend obtains a scoped OAuth token from those credentials and never returns it to the browser.
5. Cloud playback would require explicitly opting the UI back into the server connector. The current Awaaz sunain button previews free system voices only. If your browser blocks audio, enable sound for the site and click again.

The backend lists available Urdu voices, filters on the provider's FEMALE gender metadata, and prefers Chirp/Neural/WaveNet models over Standard. Availability and quality depend on Google's current Urdu voice inventory; the app does not promise a particular voice model. An optional `URDU_VOICE_NAME` selects an exact available FEMALE Urdu voice. If no eligible voice exists, it reports that clearly.

Only authenticated owners/staff can call the synthesis endpoint. It limits text to 4,000 UTF-8 bytes and enforces 60 calls per account per ten-minute window using persistent database transactions. The browser stops listening while audio plays, and stopping voice cancels pending speech fetch/playback. A provider error produces a visible explanation, then falls back to system/browser speech for that conversation. Browser fallback is not guaranteed to be female or Urdu if the OS lacks a suitable voice; it can speak English instead.

Booking prompt text, including customer names embedded in those prompts, is sent to Google for synthesis. This does not stream game audio or enable a general-purpose LLM. Requests still need explicit confirmation and staff button approval. Voice cannot approve, unlock or change payments.

Tests verify voice metadata selection, request payloads, disabled API/credential errors, authentication, cloud playback ordering and fallback without calling the paid API. Real synthesized audio and this project's TTS permissions/billing have **not** been verified from the cloud workspace.

Dashboard reads batch agent status and active sessions; hidden tabs stop background polling. `FIREBASE_QUOTA_EXCEEDED` indicates Firestore quota/rate limits (check Firebase Usage); background polling pauses for five minutes. Deleting data or rotating credentials does not reset quota. `FIREBASE_TRANSACTION_BUSY` and `FIREBASE_TEMPORARILY_UNAVAILABLE` distinguish contention and transient service failures. Runtime logs include a safe code, route, source location and matching Ref, without raw error messages or credentials.
