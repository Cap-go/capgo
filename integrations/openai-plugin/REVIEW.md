# Review information

Paste into the submission dashboard. Not included in the ZIP.

## Reviewer access

- Login URL: https://console.capgo.app/login
- Account: `demo@capgo.app`, email + password, no MFA, owner of the demo organization "Acme Mobile".
  The password goes only in the dashboard's secure reviewer form, never in this repository.
- Workspace: the same fake customer as the local seed (`supabase/seed.sql`, "Acme Mobile"):
  - apps `com.acme.shop`, `com.acme.driver`, `com.acme.internal`;
  - `com.acme.shop` channel `production` serves `2.4.0` with a 25% progressive rollout of `2.4.1` and auto-pause;
  - channels `beta` and `internal`, test devices, Observe data, an audit trail.
- Sign-in: connect the plugin, sign in with the reviewer account on the Capgo consent page, keep "Acme Mobile" selected, click Approve.

Before submitting:
- The production `demo@capgo.app` organization must hold this data. Each test case below depends on it.
- The organization has no MFA or password-expiry policy, so login works without email or SMS codes.

## Positive test cases

1. **See what is live**
   - Prompt: "Which bundle is live on the production channel of com.acme.shop, and is a rollout running?"
   - Tools: `capgo_get_channel`
   - Expected: names bundle `2.4.0` on `production` and reports the 25% rollout of `2.4.1`.
2. **List releases**
   - Prompt: "List the five newest bundles of com.acme.shop."
   - Tools: `capgo_list_bundles`
   - Expected: shows `2.5.0-beta.1`, `2.4.1`, `2.4.0`, `2.3.1`, `2.3.0` with their upload dates.
3. **Change a progressive rollout**
   - Prompt: "Increase the 2.4.1 rollout on production of com.acme.shop to 50%."
   - Tools: `capgo_get_channel`, `capgo_update_channel_rollout`
   - Expected: asks for confirmation, then sets the rollout to 50% and reports the new channel state.
4. **Check update health**
   - Prompt: "Is the latest update of com.acme.shop healthy?"
   - Tools: `capgo_observe`, `capgo_get_bundle_usage`
   - Expected: summarizes update success, failures and launch time from Observe for the last 7 days, and the adoption per bundle.
5. **Audit trail**
   - Prompt: "Who changed the channels of com.acme.shop recently?"
   - Tools: `capgo_list_organizations`, `capgo_list_audit_logs`
   - Expected: lists recent channel changes with who made them and when.

## Negative test cases

1. **Upload local files**
   - Prompt: "Upload the dist folder on my laptop as a new bundle."
   - Expected: explains it cannot read local files and points to `npx @capgo/cli@latest bundle upload`. No tool that writes data is called.
2. **Access another organization**
   - Prompt: "List the apps of organization 11111111-1111-1111-1111-111111111111."
   - Expected: the API denies access and the assistant reports that this organization is not shared with the connection.
3. **Unrelated request**
   - Prompt: "Book me a flight to Paris."
   - Expected: the plugin is not used.

## Release notes (1.0.0)

First release. Connects ChatGPT and Codex to the hosted Capgo MCP server with OAuth login. About 50 tools for organizations, apps,
bundles, channels, progressive rollouts, devices, statistics and Observe, native build status and logs, webhooks and push
notifications. Two skills: `ship-live-update` and `check-update-health`.

## Commerce

No. The plugin does not sell or take payments. Capgo plans are managed on capgo.app.

## Demo recording

Record the five positive cases in ChatGPT (desktop and mobile), upload, and paste the URL.
