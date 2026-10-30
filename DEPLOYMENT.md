# Deploy to the existing Vercel project

The repository now contains a Node.js Vercel function (`api/index.js`), frontend assets, routing (`vercel.json`), and PostgreSQL persistence. Deployment has **not** been performed from this workspace: no Vercel identity is connected, and the current cloud network policy denies the Vercel API. Saving an allowlist draft does not apply it to the running machine.

## Existing project prerequisites

Use your existing Vercel project and existing Neon/Postgres database. No new paid resources need to be created by these steps.

In **Vercel Project Settings → Environment Variables**, securely configure:

- `DATABASE_URL`: provider's PostgreSQL connection URI. Prefer the provider's pooled connection URI for serverless use. Production certificate validation is enforced; do not disable verification.
- `SETUP_KEY`: a private random bootstrap key, used only to create the first owner. Never send it in chat or commit it.
- `COOKIE_SECURE=1` (Vercel runtime also enables Secure cookies automatically).

Apply the real production database URL to **Production only**. Use a different database for Preview. Existing integration variables called `POSTGRES_URL` are not automatically used; bind the intended connection to `DATABASE_URL`. The app refuses to start on Vercel without `DATABASE_URL` rather than using temporary local SQLite.

The application uses its own `nexus_zone` schema inside the database, creates missing tables and applies additive column migrations. The database role needs permission to create/use that schema and its tables. Tables in other schemas are not application storage. Existing local SQLite records are not automatically copied to PostgreSQL. Use an appropriate production region close to the database.

## Authorize and deploy

From the repository directory, with Node.js 24:

```bash
npm ci
npm test
npm run build
npx vercel login
npx vercel link
npx vercel deploy --prod
```

During `link`, select your **existing team/account and existing project**. Do not create a second project accidentally. Authorize via Vercel's browser login flow; do not paste tokens into chat. If you use a CI/deployment token, supply it only via secure environment configuration.

This upload does not require pushing the currently uncommitted source to GitHub. Keeping an enduring source copy in your repository is a separate step. The project defaults to framework Other (`framework: null`), Node 24, `npm run build`, output directory `public`. Reset conflicting project-level build/output overrides or use the values in vercel.json. The API is rewritten to one Node function and does not depend on a listening background process.

For this cloud workspace, environment network settings need `vercel.com`, `api.vercel.com` and the resulting deployment's `*.vercel.app` address. These domain additions were saved for review, but current access remains denied. Authentication may identify additional required login/upload hostnames; add only those actually needed. A remote database connection from the cloud workspace also needs the actual database host and appropriate TCP/network policy. Local PostgreSQL tests do not establish access to your remote database.

## Verify the deployment before connecting a PC

1. Check the production `/api/status` response (it should report whether owner setup is needed). A successful static page alone does not prove database connectivity.
2. Create the first owner using the private setup key and a strong unique password. Owner creation is transactionally serialized, so concurrent first-run requests cannot create multiple owners.
3. Login and create a booking request; the PC must not become an active session until separately approved. Check the report and audit log.
4. Add time, mark payment received, sign out/in and verify persistence. Test using two browser sessions. Do not overwrite a live customer's booking as a smoke test.
5. Pair a **spare** Windows PC with the production HTTPS hostname following `windows-agent/README.md`.
6. Set the Vercel project's Deployment Protection so the Windows agent can reach the production API. Owner/staff/device authentication remains required by this app. If your team requires Vercel protection, use a properly designed access integration rather than treating redirects or an authentication HTML page as an unlock response.

The app stores booking mutations and audit entries in PostgreSQL transactions. A database-backed login limiter and booking lock work across multiple function instances. Agent polling does not depend on WebSockets or a continuously running Vercel process. Cold starts/outages can delay new approvals, but the Windows agent's local timer does not depend on the dashboard remaining online.

## What has been tested locally

- Existing SQLite workflow and additive database migration.
- The same end-to-end HTTP workflow against a real temporary PostgreSQL server, using the Vercel rewrite URL shape.
- Authentication, permissions, approval gating, time extension, paid credit, key rotation/revocation, and persistence across server restart.
- Shared PowerShell offline-timer policy; Windows native enforcement still needs hardware tests.

To repeat PostgreSQL tests, use a dedicated **local test database** named `nexus_zone_test` on `127.0.0.1`, and set `NEXUS_TEST_DATABASE_URL` explicitly. The test drops/recreates only that test database's `nexus_zone` schema. It rejects remote hosts and other database names. Never use production credentials in tests. Normal `npm test` explicitly removes any inherited production DATABASE_URL and uses temporary SQLite instead.

No live Vercel URL, remote database connection, Vercel protection policy or deployed runtime has been verified yet. Windows physical control, PS5 hardware integration, online payments and notifications remain subject to the limitations in README.md.
