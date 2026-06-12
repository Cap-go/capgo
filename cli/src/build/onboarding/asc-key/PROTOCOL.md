# App Store Connect key helper — stdout stats protocol

The `build credentials apple-key` command launches a native macOS helper (a
precompiled Swift app) that walks the user through creating an App Store Connect
**team** API key in an embedded browser, then captures the resulting credentials.

While it runs, the helper streams a **stats protocol** on **stdout** so the CLI
can forward usage statistics to PostHog and receive the final credentials. This
document is the contract between the Swift helper (`StatsProtocol.swift`) and the
CLI (`protocol.ts` / `helper.ts`).

## Wire format

Newline-delimited JSON ("NDJSON"). One JSON object per line on **stdout**. Every
line is tagged with `capgoAscKey` (the protocol version) so the reader can
ignore incidental stdout chatter. Human-readable diagnostics go to **stderr**
and are NOT part of this protocol.

```jsonc
{"capgoAscKey":1,"kind":"event","ts":12,"runId":"<uuid>","name":"step_changed","props":{ }}
{"capgoAscKey":1,"kind":"result","ts":900,"runId":"<uuid>","ok":true,"keyId":"…","issuerId":"…","privateKey":"…"}
{"capgoAscKey":1,"kind":"result","ts":900,"runId":"<uuid>","ok":false,"errorCode":"USER_CANCELLED","message":"…"}
```

| Field         | Lines        | Meaning                                              |
| ------------- | ------------ | ---------------------------------------------------- |
| `capgoAscKey` | all          | Protocol version (currently `1`).                    |
| `kind`        | all          | `"event"` or `"result"`.                             |
| `ts`          | all          | Milliseconds since the helper started.               |
| `runId`       | all          | UUID correlating every line of one run.              |
| `name`        | event        | snake_case event name.                               |
| `props`       | event        | Non-sensitive properties (never the private key).    |
| `ok`          | result       | `true` = credentials present; `false` = error.       |
| `keyId`/`issuerId`/`privateKey` | result (ok) | The captured credentials.         |
| `errorCode`/`message`           | result (!ok)| Failure reason.                   |

### Rules

- **`event` lines are forwarded to PostHog** (channel `app-store-connect-key`).
- The **terminal `result` line** carries the credentials on success. The
  `privateKey` appears **only** here and is **never** forwarded to analytics.
  As defence-in-depth, the CLI also strips any prop key matching
  `private_key|secret|p8|pem|password|token` before sending tags.
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

## Distribution of the precompiled helper

The macOS-only binary is **not** bundled in the npm tarball. The CLI locates it
at runtime:

1. `CAPGO_ASC_KEY_HELPER_PATH` — explicit override (dev / CI).
2. `~/.capgo/asc-key-helper/capgo-asc-key-helper` — cached download.

Build a universal binary from the helper Swift package with
`scripts/build-asc-key-helper.sh <helper-src-dir>`.
