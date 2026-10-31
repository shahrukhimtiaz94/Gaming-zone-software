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

Wait for the four composite indexes in firestore.indexes.json to finish building, then redeploy the Vercel project with the environment variables above. Check `/api/status`, create the owner with SETUP_KEY, and test booking → staff approval → time extension → report. Static HTML loading alone does not prove database access.

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
