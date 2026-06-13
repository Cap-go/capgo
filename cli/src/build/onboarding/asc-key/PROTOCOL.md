# App Store Connect key helper — stdout stats protocol

The `build credentials apple-key` command launches a native macOS helper (a
precompiled Swift app) that walks the user through creating an App Store Connect
**team** API key in an embedded browser, then captures the resulting credentials.

While it runs, the helper streams a **stats protocol** on **stdout** so the CLI
can forward usage statistics to PostHog, append verbose diagnostics to its
**internal support log**, and receive the final credentials. This document is the
contract between the Swift helper (`StatsProtocol.swift`) and the CLI
(`protocol.ts` / `helper.ts`).

Three line kinds travel the same stdout channel:

- **`event`** → forwarded to **PostHog** (structured, low-volume analytics).
- **`log`** → appended to the **internal support log** (verbose diagnostics — the
  bundle a user emails to support when a run goes wrong). Never analytics.
- **`result`** → the terminal line carrying the credentials (or a failure).

## Wire format

Newline-delimited JSON ("NDJSON"). One JSON object per line on **stdout**. Every
line is tagged with `capgoAscKey` (the protocol version) so the reader can
ignore incidental stdout chatter. Free-form stderr is still tolerated, but is NOT
part of this protocol — prefer a `log` line so the diagnostic reaches the bundle.

```jsonc
{"capgoAscKey":1,"kind":"event","ts":12,"runId":"<uuid>","name":"step_changed","props":{ }}
{"capgoAscKey":1,"kind":"log","ts":420,"runId":"<uuid>","level":"warn","message":"issuer_id scrape returned no value","props":{"attempt":3}}
{"capgoAscKey":1,"kind":"result","ts":900,"runId":"<uuid>","ok":true,"keyId":"…","issuerId":"…","privateKey":"…"}
{"capgoAscKey":1,"kind":"result","ts":900,"runId":"<uuid>","ok":false,"errorCode":"USER_CANCELLED","message":"…"}
```

| Field         | Lines        | Meaning                                              |
| ------------- | ------------ | ---------------------------------------------------- |
| `capgoAscKey` | all          | Protocol version (currently `1`).                    |
| `kind`        | all          | `"event"`, `"log"`, or `"result"`.                   |
| `ts`          | all          | Milliseconds since the helper started.               |
| `runId`       | all          | UUID correlating every line of one run.              |
| `name`        | event        | snake_case event name.                               |
| `props`       | event, log   | Non-sensitive properties (never the private key).    |
| `level`       | log          | `debug` \| `info` \| `warn` \| `error` (else `info`).|
| `message`     | log          | Human-readable diagnostic (never the private key).   |
| `ok`          | result       | `true` = credentials present; `false` = error.       |
| `keyId`/`issuerId`/`privateKey` | result (ok) | The captured credentials.         |
| `errorCode`/`message`           | result (!ok)| Failure reason.                   |

### Rules

- **`event` lines are forwarded to PostHog** (channel `app-store-connect-key`).
- **`log` lines are appended to the CLI's internal support log**, never to
  analytics. The CLI renders each as
  `[asc-helper +<ts>ms] <LEVEL> <message> <props-json>`, drops any secret-looking
  prop key, and `redactSecrets` runs over the line as a final backstop. The CLI
  also writes a one-line per-run summary (outcome + event/log counts) so a bundle
  always shows the helper ran.
- The **terminal `result` line** carries the credentials on success. The
  `privateKey` appears **only** here and is **never** forwarded to analytics.
  As defence-in-depth, the CLI also strips any prop key matching
  `private_key|secret|p8|pem|password|token` before sending event tags.
- The reader tolerates non-protocol stdout lines (it skips anything without a
  matching `capgoAscKey`), partial lines split across chunks, and a final
  newline-less line.

## Events

| `name`                | `props`                                              | Emitted when                              |
| --------------------- | ---------------------------------------------------- | ----------------------------------------- |
| `helper_started`      | `protocol_version`, `os_version`                     | The helper window appears.                |
| `signed_in`           | `team_count`                                         | First authenticated session read.         |
| `team_confirmed`      | `is_switch`, `team_count`                            | User confirms a team in the dialog.       |
| `api_access_checked`  | `enabled`, `role_ok`                                 | Team API-access capability is determined. |
| `api_access_denied`   | `reason` (`not_enabled` \| `insufficient_role`)      | Team can't create a key.                  |
| `step_changed`        | `from`, `to`, `elapsed_ms_on_prev`                   | The guided step advances (the funnel).    |
| `validation_started`  | —                                                    | The new key is validated against Apple.   |
| `validation_succeeded`| `duration_ms`                                        | Validation passed.                        |
| `validation_failed`   | `duration_ms`                                        | Validation failed.                        |
| `helper_finished`     | `ok`, `outcome` (`created`\|`cancelled`), `total_ms` | Just before the helper exits.             |

New events can be added without bumping the protocol version — the CLI forwards
any `event` line generically (humanized name + `prop_*` tags). Bump
`ASC_PROTOCOL_VERSION` only for breaking envelope changes.

## Diagnostic logs

`log` lines are verbose, free-form diagnostics for the support bundle. Unlike
events they are not a fixed taxonomy — the helper emits them generously wherever
context would help a human reconstruct a stuck or failed run after the fact.
Current emit points (see `GuidedFlowModel.swift`):

| `level` | `message` (abridged)                                  | Emitted when                                  |
| ------- | ----------------------------------------------------- | --------------------------------------------- |
| `debug` | `step <from> → <to>` (+ url, team, ever_logged_in)    | Every guided-step transition.                 |
| `debug` | `team switch attempt` (+ diagnostics)                 | The account-menu team switch is driven.       |
| `debug` | `steering to the API keys page…`                      | The user wandered to an off-flow ASC page.    |
| `warn`  | `issuer_id scrape returned no value…`                 | A DOM finder didn't match (per attempt).      |
| `warn`  | `non-recommended role selected for the key`           | The user chose a role other than Admin.       |
| `warn`  | `API access denied for this team` (+ team, roles)     | The team can't create a key.                  |
| `warn`  | `automatic team switch did not land…`                 | The auto-switch timed out → manual fallback.  |
| `warn`  | `selected file is not a .p8 private key` (+ path)     | The user picked the wrong file.               |
| `error` | `issuer_id scrape persistently failing…`              | The Issuer ID finder missed ≥8 times.         |
| `error` | `Apple key validation failed` (+ detail)              | Apple rejected the new key.                   |

New `log` lines can be added freely — the CLI renders any `log` line generically.
Adding emit points never requires a version bump.

## Distribution of the precompiled helper

The macOS-only binary is **not** bundled in the npm tarball. The CLI locates it
at runtime:

1. `CAPGO_ASC_KEY_HELPER_PATH` — explicit override (dev / CI).
2. `~/.capgo/asc-key-helper/capgo-asc-key-helper` — cached download.

Build a universal binary from the helper Swift package with
`scripts/build-asc-key-helper.sh <helper-src-dir>`.
