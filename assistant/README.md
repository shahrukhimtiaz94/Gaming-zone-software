# Real gaming-zone AI agent

The Settings page includes real model-backed conversation controls and the basic booking dialogue; the dashboard has a hands-free toggle. The default AI uses the **Gemini Developer API** with Google AI Studio credentials. Firebase web configuration/service-account credentials do not substitute for a Gemini API key.

## Enable on Vercel

1. Add your existing AI Studio key as **GEMINI_API_KEY** directly in Vercel Project Settings → Environment Variables → Production. Never send it in chat or commit it. It stays server-side and is sent to Google in a request header, not a browser bundle or URL.
2. Redeploy the latest main commit. An optional **GEMINI_MODEL** selects an exact supported model ID. Without it, the backend discovers available stable Flash models and prefers stable Flash-Lite before full Flash, then the newest available version within that class. It excludes Pro, preview, live/audio/image/TTS models.
3. For free voice, choose **Free browser / system voice**. Leave VOICE_PROVIDER unset; paid Google Cloud speech is optional and not required for the AI agent. Do not enable billing solely for that optional voice.
4. In **Real AI agent** mode, type a question or click **Talk to assistant** and allow the microphone. **New conversation** clears in-page conversation context; logout clears it too.

Gemini free-tier availability, quotas, eligible models, regional restrictions and data-use terms are controlled by Google and can change. Use a free-tier key/project with billing disabled if you require no charges. The app does not guarantee unlimited/free AI calls and does not silently retry quota errors on another paid model. Configuring a key on a billable project can incur charges. Review AI Studio's current data-use terms before sending real customer data.

## What it can do

- Converse naturally about gaming-zone operations, customer service and business in English, Urdu, Hindi and Roman Urdu.
- Read current station/session availability and pending requests from the actual database.
- Calculate today, last seven days and current month reports using Pakistan calendar boundaries (Asia/Karachi). It distinguishes booked value, manually recorded payment credit and elapsed session time; those are not bank/cash audits or measured physical gaming.
- Look up recent customer session history. Owner-only audit entries remain owner-only.
- Prepare booking, approval, extension, stop, payment-marking and reject action cards. It asks for missing details before proposing a booking.

For example: “Aaj kitne PCs chal rahe hain?”, “Ali ne kitna time khela?”, “Pichlay haftay ki earning batao”, “PC 5 Ahmed ke liye do ghante book kar do”, or “PC 3 ka aadha ghanta barhao”. Follow-up conversation is retained for eight text turns in the page's memory, not browser localStorage. An opt-in foreground browser wake-word mode is available; conversation context is not retained across reload/logout.

## Action authority

Model tools are allowlisted and validated by the server. In manual mode they read data or prepare a card. An authenticated hands-free server grant can authorize the new-PC-booking tool to execute immediately; all other actions keep the card flow. Each card's exact payload is stored server-side with the preparing user ID, five-minute expiry and one-use consumed flag. Clicking the staff confirmation button (plus its confirmation prompt) calls the existing authenticated operation. Ownership, role, expiry, one-use state and the existing operation's business rules are checked inside a database transaction. Spoken yes or forged conversation text cannot activate a session or mark payment.

A manual booking card saves a pending request only. Starting that session requires separate staff approval. Payment marking is owner-only. Extension previews capture the expected current end; a later change makes that preview stale. Confirming a card twice cannot apply it twice. Unknown tools, arbitrary code execution, deletion, rate editing, free sessions and external messages are unsupported. Native Windows enforcement and PS5 limitations remain unchanged.

The AI can phrase an answer incorrectly; assess live values/action summaries in the dashboard. Its written answer alone does not establish that an action was applied. No model output bypasses the server confirmation checks.

## Voice and privacy

Gemini generates separate Urdu-script, Hindi-script and English speech text, while the displayed answer defaults to Roman Urdu. The browser uses available system voices. Without a usable Urdu voice it can use Hindi speech with a Hindi voice, then English. Female or human-quality Urdu speech is not guaranteed by a free system voice. Installed voice choice and microphone language can be changed independently. Recognition may use the browser vendor's online service.

The assistant sends your messages, a bounded in-page conversation and relevant tool data (which can include customer names/history) to Google. It does not send password hashes, device keys or server credentials as tool data. Database text/customer names are treated as data, not instructions. Read-only responses are bounded: recent 5,000 sessions, 20 customer/audit results, 30 pending requests. Large history can be truncated and the model receives that flag.

The server limits chat to 30 user turns per account per ten-minute window, three model rounds, eight total tool calls and three proposed cards per turn. For provider HTTP 502/503/504 only, it retries once on the identical model URL and payload after a short delay within the existing deadline. It does not retry quota/authentication failures or transport timeouts, does not switch to another model after an error, and never replays staff-confirmed system actions. Action records are separate from authentication sessions and contain no usable login credential.

## Validation and remaining external check

Tests use mocked model responses for tool selection, multi-language reply formatting, unknown tool denial, secret redaction, model discovery and quota handling. Actual database tests cover card preparation, authenticated ownership, one-use confirmation, stale extension refusal and owner-only payment access. Chromium tests with simulated model/audio exercise the actual UI and API. Native Firestore transaction tests use the official local emulator.

The live Gemini key/model, provider quota, microphone and actual voice quality have not been verified from this workspace. After deployment, test a read-only question first, then prepare one spare-PC booking card and inspect it before confirming. The basic booking mode/manual dashboard remain available if the AI service is unavailable.

## Connection diagnosis

Click **Check AI connection** for a short typed greeting without microphone input. If the API fails, its message now distinguishes invalid keys (AI_KEY_INVALID), authentication (AI_AUTH_FAILED), project API access (AI_API_DISABLED), key restrictions (AI_KEY_RESTRICTED), model-not-found (AI_MODEL_NOT_FOUND), quota, region, timeout, network and provider HTTP errors. It does not print or return Google's raw error body or your key. AQ-prefixed keys are not rejected solely for their prefix. API keys must be copied as values without surrounding quotes, newlines or Bearer prefixes; Live API ephemeral tokens are not accepted for generateContent.

A configured key and redeploy alone do not establish that Google accepted that key/model. Verify the connection test before trying a data/action question. Report the displayed error code/reference if it still fails; never share the full key.

A Google HTTP 503 indicates provider-side unavailability, not an instruction to rotate keys or enable billing. The app now displays the selected model on a persistent 5xx response. If GEMINI_MODEL is explicitly set, it remains authoritative; clear it to use available stable Flash-Lite discovery. If 503 persists after the bounded retry, test the same supported model in AI Studio and retry later. This workspace cannot establish the health of your live model from mocked retry tests.

## Hands-free conversations

Set the assistant name (default **Maya**) and click **Hands-free on karein** once to allow microphone access. The chosen name alone is stored locally in this browser; the mic-enable state and conversation are not restored automatically. After the server grants hands-free permission, the dashboard toggle greets and opens the conversation immediately. After “OK thanks”, say just “Maya” to wake the assistant again, then give the command. Name-only partial results and up to five final recognition alternatives are checked; partial booking commands are never executed. Its next turns do not require the wake name again. Silent recognition endings and no-speech events re-arm the listening turn automatically instead of requiring another click.

Say **“OK thanks”** (also “okay thanks”, “اوکے تھینکس”, “ओके थैंक्स”) while it is listening to pause the conversation and return to wake-name detection. The recent conversation context stays in memory. Say the name again to resume. **Stop voice** or the hands-free off button disables the microphone and all queued restarts. Logout, page exit, changing mode/language/name or backgrounding the tab also disables listening. Permission/device failures stop immediately; repeated network/recognition errors stop after three failures, rather than looping forever.

The browser speech-recognition service produces the text that is matched against the wake word. This is **not guaranteed on-device/offline wake detection**: the browser vendor may process microphone audio online even while waiting for the name. Speech before a wake-name match is not added to the app transcript or sent to Gemini. An explicit mic indicator is shown. Wake detection pauses during assistant speech/processing so it does not intentionally hear its own voice. There is no voice interruption/barge-in while a reply plays; the Stop button remains available.

Browser/OS restrictions, sleeping devices and background tabs can interrupt listening. Keep the dashboard tab visible, and re-enable after returning from the background. This is not a native always-on Windows assistant and cannot hear after the browser closes. A shared room can produce false wakeups; no wake phrase authenticates a customer/staff member or removes staff confirmation requirements.

Controller tests cover ignored ambient text, name aliases and word boundaries, multi-turn wake/listen cycles, silence recovery, OK thanks, microphone denial, bounded network retries and complete Stop cancellation. Chromium smoke tests exercise the UI with simulated speech/model/audio; actual microphones, wake accuracy and long-running recognition still need testing on the owner's Windows browser.

## Hands-free PC auto-booking authorization

Click the dashboard hands-free toggle once to authorize hands-free PC booking for the current login/tab and allow the mic. This switches to real AI mode. With a valid grant, `prepare_action` for a new PC request validates the station/customer/duration, rechecks availability and atomically saves an approved request, starts its session with the configured rate and writes an audit entry. No yes/button is needed for that booking. PS5, payments, extensions, existing-request approvals, stops and other actions still use their normal confirmation path. Missing customer/time details must be requested, not invented.

A random lease in the server's assistant_actions collection is bound to user ID and a hash of the current login token. It lasts 60 seconds and is renewed every 20 seconds. Revocation, expiry, logout, a different login token and busy/archived devices prevent automatic booking. The server rechecks both login and grant inside the booking transaction. Off immediately stops local listening/cancels in-flight chat, then revokes the server grant. The dashboard shows pending/confirmed off or an explicit revocation failure. Network failure can allow an already-authorized in-flight command to finish before the grant expires; existing sessions are not undone. A late enable response after local off is revoked rather than reactivating the mic.

“OK thanks” is pause-to-wake, **not** permission revocation. Say “hands-free off” or “Maya hands-free off” to stop the mic and automatic booking completely. No automatic mic reactivation is possible after it is fully off; returning requires the dashboard toggle. Payment marking is still owner-only, and the AI never receives the lease ID in its tool data. A successful automatic booking is reported from the actual transaction even if the provider fails on its following reply.

The last recognized idle phrase is displayed transiently in Settings to diagnose wake pronunciation; it is not retained in the chat history or sent to Gemini without a wake match. Maya aliases include مایا and माया. Actual recognition remains browser/network dependent.

Wake detection for a Latin assistant name uses en-US independently of the conversation language (for example ur-PK). It uses short recognition turns that rearm after silence, instead of a continuous stream that may delay final name results. The dashboard shows microphone readiness and a separate last-heard idle phrase for pronunciation diagnosis. These browser settings need validation with a real microphone; controller tests simulate recognition.

Wake recognition has bounded recovery deadlines: 8 seconds for startup, 45 seconds for an idle stalled stream and 6 seconds after speech ends without a result. Stop and mode changes cancel the timers. Dashboard status distinguishes connected recognition, microphone audio, detected speech and reconnect error codes. Repeated failures stop hands-free after three attempts. Server lease renewal failures display their safe API error rather than a generic connection message. Ali includes Urdu/Hindi aliases. Real-device microphone diagnosis still requires the displayed browser status.
