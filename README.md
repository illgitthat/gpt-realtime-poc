# GPT Live Voice

A mobile-first voice app using `gpt-live-1`, with configurable `gpt-5.6-luna` reasoning.
Chat naturally, practise a language, or run a mock interview.

<p>
  <img src="./docs/images/voice-chat.png" width="280" alt="Voice chat with a large microphone start button and three conversation modes">
  <img src="./docs/images/language-tutor.png" width="280" alt="Mandarin tutor showing Chinese characters, pinyin, and an English meaning">
</p>

*The tutor screenshot displays recorded synthetic-test output.*

Tap the microphone and wait for **Listening**. **End** releases the microphone and
unlocks the settings. **Start new conversation** starts the next call in one click;
**Continue** is available when keeping the previous settings and recent context.
Tutor cards appear within the conversation. Scrolling follows new text unless you
scroll up; **Latest** returns to the end. Export and delete are in the conversation
menu. No sign-in is required, and the app does not save audio.

Production runs at **https://voice.adamcbloom.com** on Cloudflare Workers.
Azure Static Web Apps is also supported. Both use the same server-side session
implementation, with no application runtime SDK dependencies or browser credentials.

## Runtime configuration

Use exactly these server-side environment variables for either hosting target:

| Variable | Meaning |
| --- | --- |
| `AZURE_OPENAI_BASE_URL` | Required HTTPS **general APIM gateway route**, ending in `/openai/v1`, e.g. `https://gateway.example.com/general/openai/v1`. |
| `AZURE_OPENAI_API_KEY` | Required **APIM subscription key**, not a Foundry resource key. |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Optional Azure deployment name; defaults to `gpt-live-1`. |
| `AZURE_OPENAI_REASONING_DEPLOYMENT_NAME` | Optional Azure deployment name; defaults to `gpt-5.6-luna`. |

Foundry resource key authentication is disabled in this setup. APIM authenticates
upstream with its managed identity; the application only supplies the APIM
subscription key. No separate transcription deployment or application service-principal
credentials are needed.

**Do not use the old APIM realtime route.** It exposes only `/realtime` calls, not the
`/live/sessions` operation this app needs. Use the general route, whose base URL already
ends in `/openai/v1`. Examples use placeholder infrastructure, not a resource endpoint.

Keep credentials in environment variables, Worker secrets, or SWA application settings.
Never put them in `public/`, source code, client requests, recordings, or CI artifacts.

## Develop and check

Node.js 22+ and npm are required. npm and `package-lock.json` are the single
dependency-install path.

```bash
npm ci
npm test
npm run test:deployment
npm run typecheck
npm run types:check
npm run deploy:dry-run
npm run deploy:preview:dry-run
```

For the local Worker, create a gitignored `.dev.vars`:

```dotenv
AZURE_OPENAI_BASE_URL=https://gateway.example.com/general/openai/v1
AZURE_OPENAI_API_KEY=replace-with-apim-subscription-key
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-live-1
AZURE_OPENAI_REASONING_DEPLOYMENT_NAME=gpt-5.6-luna
```

Run `npm run dev` and open `http://localhost:8787`. Microphone access requires
localhost or HTTPS. `npm run build` is a no-emit typecheck; the static client requires
no separate asset build. `npm run types` regenerates Worker types after config changes
using Wrangler's generator and removes its trailing whitespace. Use `npm run types:check`
for the matching freshness check rather than the raw Wrangler check.
Type generation includes runtime APIs only, independently of local secret files;
the Worker declares its environment shape. Wrangler loads `.dev.vars` normally,
and the shared backend validates credentials and defaults optional deployment names.

For the SWA emulator, export the same runtime values in your shell and run
`npm run dev:swa`, then open `http://localhost:4280`. The SWA CLI uses the existing
`swa-cli.config.json` and Azure Functions tooling. Deployment/setup scripts read shell
environment variables, not `.dev.vars`.

## Worker deployment

The registered `.github/workflows/deploy-worker.yml` workflow handles both targets.
Every deployment first runs tests, typechecking, and both Worker dry-runs.

- Pushes to `main` automatically deploy production with validated Live runtime
  configuration. Missing or invalid configuration fails before deployment, leaving
  the existing site running.
- Manual runs default to **preview + dry-run**. Production dispatch is permitted only
  from the `main` ref.
- Preview explicitly targets `gpt-realtime-poc-live-preview`, with `workers_dev: true`
  and an empty routes list. It cannot inherit the production domain route.
- Repository configuration: `CLOUDFLARE_API_TOKEN` secret and
  `CLOUDFLARE_ACCOUNT_ID` variable. Preview requires the nonempty `LIVE_PREVIEW_ENV`
  secret; production requires `LIVE_PRODUCTION_ENV`. Each is a JSON object containing
  the four runtime variables above, using the general APIM route and that target's
  subscription key. Omitted model names are filled with the documented Live defaults.
  Setting a GitHub secret alone does not change the running production Worker.

```bash
# Safe branch validation: no deployment and no runtime secret required.
gh workflow run deploy-worker.yml --ref YOUR_BRANCH \
  -f target=preview -f dry_run=true

# After a maintainer has configured LIVE_PREVIEW_ENV:
gh workflow run deploy-worker.yml --ref YOUR_BRANCH \
  -f target=preview -f dry_run=false
```

Both targets upload code and all four runtime values **together in one Worker version**
using `wrangler deploy --secrets-file /dev/stdin`. Configuration is validated before
any deployment; there is no separate secret-upload window. Production also uses
`--keep-vars` to preserve unrelated settings, but explicitly replaces these four
runtime values rather than inheriting the old realtime route or model. Preview never
changes production credentials.

Deployment scripts send validated JSON through stdin, not command arguments, child
environment variables, disk files, logs, or artifacts. They use Bash to convert Node's
subprocess socket into a real pipe that Wrangler can open as `/dev/stdin`; the Ubuntu
Actions runner supports this. Local deployment also requires Bash and `/dev/stdin`.

For a preview deployment, export `LIVE_PREVIEW_ENV` and use `npm run deploy:preview`.
For a deliberate production deployment from `main`, export `LIVE_PRODUCTION_ENV` and
use `npm run deploy:production` (or `deploy:domain`). Both require Cloudflare
authentication. Production's checked-in route is `voice.adamcbloom.com`, and
target/domain overrides are rejected. Plain `npm run deploy` and
`npm run deploy:preview:dry-run` are safe bundle-only checks requiring no runtime
secret. Deployment tests additionally exercise real Wrangler atomic dry-runs with
placeholder credentials only.

## Existing Azure Static Web App

Set the same four runtime values in the existing SWA application's settings. To
apply them deliberately with the Azure CLI, authenticate with `az login`, export
the runtime values plus `SWA_APP_NAME` and `SWA_RESOURCE_GROUP`, and run:

```bash
npm run setup:swa -- --apply
```

This updates only the selected existing app; it does not create resources or change
GitHub secrets. It targets production unless `SWA_ENVIRONMENT_NAME` names a specific
existing preview environment. Other environments are not overwritten.

SWA is the optional secondary host. Its production deployment is **manual-only**:
main pushes do not publish to SWA, avoiding a rollout with the old runtime route/model.
After configuring all four Live runtime settings on the existing production SWA,
dispatch `.github/workflows/azure-static-web-apps.yml` from `main` and explicitly set
`runtime_settings_configured=true`. The confirmation defaults to false; missing
confirmation or a non-main ref fails before deployment. No Azure federated-auth
infrastructure is added.

The workflow checks tests, types, and the Worker bundle before deployment.
Same-repository pull requests retain automatic SWA previews and closed-PR cleanup;
configure each preview's runtime settings separately after that environment exists.
Preview URLs are not posted as PR comments. They can still appear in Actions logs.
The workflow uses the existing `AZURE_STATIC_WEB_APPS_API_TOKEN` secret; runtime
credentials remain SWA app settings. **Cloudflare main deployments remain automatic**
with the atomic configuration flow above.

For optional direct deployment, set `SWA_CLI_DEPLOYMENT_TOKEN` in the environment:
`npm run deploy:swa` targets preview; `npm run deploy:swa -- --production` requires
the `main` branch. The Functions runtime is Node.js 22.

## Session API and transport

Both hosts expose `POST /connect` (`/api/connect` is the SWA adapter route).
The browser sends JSON `{ sdp, mode, settings, instructions, history }`.
Success is **201 JSON**, shaped as:

```json
{
  "session": { "id": "session-id" },
  "transport": { "type": "webrtc", "sdp": "answer-sdp" }
}
```

There are no client secrets or credentials in that response.

```text
Browser -- JSON SDP offer --> Worker / SWA adapter
                                   |
                                   v
                         APIM general /openai/v1/live/sessions
                                   |
                                   v
                         Foundry (APIM managed identity)

Browser <======= native WebRTC audio/data =======> negotiated Live transport
```

**Native WebRTC audio does not pass through APIM after negotiation.** Inspect the
negotiated connection and actual browser behavior when measuring connectivity.

## Reliability, privacy, and acceptance

- Recent text is saved locally, with revisions and Web Locks preventing stale tabs
  from overwriting newer text or restoring deleted history. Browsers without Web Locks
  can still run voice sessions, but cannot save history. Restoring a
  conversation sends its selected history to the service with a new session request;
  local storage is not an application-managed cloud history store.
- Background audio on iOS is **not guaranteed**. The target is stable conversations
  up to **30 minutes**, with explicit reconnect and recent-context recovery if the
  browser suspends the call. End releases the microphone and closes the active session.
- Azure/APIM compatibility is established by measurements against the actual route
  and deployments, not by assuming every OpenAI feature is supported. Do not infer
  native resume, fork, or session-store guarantees from the UI.
- Generated speech checks the real service path, but does not replace a human
  conversation or phone test. Recordings are test-only artifacts. Keep them under ignored
  `artifacts/`, review them for sensitive content, and do not publish credentials.
- Before merge, exercise real audio, interruptions, Stop, reconnect, and the secondary
  modes on your own target device, including iOS if it matters. Automated tests and
  mocked playback do not replace that device check.

### Manual generated-audio check

`test/audio-harness.mjs` uses the Kimi browser bridge at `http://127.0.0.1:10086`
(override with `KIMI_BRIDGE_URL`). It opens a dedicated test tab and injects a
synthetic microphone and output recording through CDP; the application has no test
hooks. This is an **opt-in, billable live test**, not part of `npm test`, which runs
only `test/*.test.mjs`.

Generate a short WAV fixture with an external speech-synthesis tool; no fixture
generator or extra browser dependency is installed by this project. Then:

```bash
# Use an app URL reachable by the browser; a configured preview also works.
node test/audio-harness.mjs setup http://localhost:8787
# In that test tab, start the conversation with a user gesture.
node test/audio-harness.mjs play artifacts/fixtures/sample.wav
node test/audio-harness.mjs status -
# End/Stop the conversation in the UI BEFORE saving.
node test/audio-harness.mjs save artifacts/audio-smoke
```

Each command accepts an optional final Kimi session name; the default is
`voice-audio-test`. Play additional fixtures to exercise interruptions or multiple
languages. Saving collects sanitized events and recorded output as WebM. Check
microphone/session cleanup, read the events, and listen to the output rather than
treating file creation as a pass. Review all recordings and transcripts for private
content, keep them local, and close the dedicated test tab afterward.

## Code and references

- Client: `public/`
- Shared session core: `api/shared/live-core.js` and its TypeScript declaration
- Worker adapter: `src/worker.ts`
- SWA adapter: `api/connect/`; routing: `public/staticwebapp.config.json`
- Checks: `test/*.test.mjs`; CI: `.github/workflows/ci.yml`

See the OpenAI [Live guide](https://developers.openai.com/api/docs/guides/live),
[Live prompting guide](https://developers.openai.com/api/docs/guides/live-prompting),
and [GPT Live introduction](https://openai.com/index/introducing-gpt-live-1-in-the-api/).
The [HeyGen LiveAvatar GPT Live demos](https://github.com/heygen-com/liveavatar-gpt-live-demos)
([MIT license](https://github.com/heygen-com/liveavatar-gpt-live-demos/blob/master/LICENSE))
inspired the tutor/visual interaction ideas. This app reimplements those ideas;
it does not copy their code or require an avatar service.
