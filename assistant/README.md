# Real gaming-zone AI agent

The dashboard now includes a real model-backed conversation mode, alongside the basic booking dialogue. The default AI uses the **Gemini Developer API** with Google AI Studio credentials. Firebase web configuration/service-account credentials do not substitute for a Gemini API key.

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

Model tools are allowlisted and validated by the server. They read data or **prepare** a card; they cannot execute an operational mutation. Each card's exact payload is stored server-side with the preparing user ID, five-minute expiry and one-use consumed flag. Clicking the staff confirmation button (plus its confirmation prompt) calls the existing authenticated operation. Ownership, role, expiry, one-use state and the existing operation's business rules are checked inside a database transaction. Spoken yes or forged conversation text cannot activate a session or mark payment.

A booking card saves a pending request only. Starting that session requires separate staff approval. Payment marking is owner-only. Extension previews capture the expected current end; a later change makes that preview stale. Confirming a card twice cannot apply it twice. Unknown tools, arbitrary code execution, deletion, rate editing, free sessions and external messages are unsupported. Native Windows enforcement and PS5 limitations remain unchanged.

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

Set the assistant name (default **Nexus**) and click **Hands-free on karein** once to allow microphone access. The chosen name alone is stored locally in this browser; the mic-enable state and conversation are not restored automatically. Say “Nexus, aaj ki earning batao” or just “Nexus” to wake the assistant. Its next turns do not require the wake name again. Silent recognition endings and no-speech events re-arm the listening turn automatically instead of requiring another click.

Say **“OK thanks”** (also “okay thanks”, “اوکے تھینکس”, “ओके थैंक्स”) while it is listening to pause the conversation and return to wake-name detection. The recent conversation context stays in memory. Say the name again to resume. **Stop voice** or the hands-free off button disables the microphone and all queued restarts. Logout, page exit, changing mode/language/name or backgrounding the tab also disables listening. Permission/device failures stop immediately; repeated network/recognition errors stop after three failures, rather than looping forever.

The browser speech-recognition service produces the text that is matched against the wake word. This is **not guaranteed on-device/offline wake detection**: the browser vendor may process microphone audio online even while waiting for the name. Speech before a wake-name match is not added to the app transcript or sent to Gemini. An explicit mic indicator is shown. Wake detection pauses during assistant speech/processing so it does not intentionally hear its own voice. There is no voice interruption/barge-in while a reply plays; the Stop button remains available.

Browser/OS restrictions, sleeping devices and background tabs can interrupt listening. Keep the dashboard tab visible, and re-enable after returning from the background. This is not a native always-on Windows assistant and cannot hear after the browser closes. A shared room can produce false wakeups; no wake phrase authenticates a customer/staff member or removes staff confirmation requirements.

Controller tests cover ignored ambient text, name aliases and word boundaries, multi-turn wake/listen cycles, silence recovery, OK thanks, microphone denial, bounded network retries and complete Stop cancellation. Chromium smoke tests exercise the UI with simulated speech/model/audio; actual microphones, wake accuracy and long-running recognition still need testing on the owner's Windows browser.
