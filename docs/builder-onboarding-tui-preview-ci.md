# Builder onboarding TUI preview CI

This repository keeps the private builder onboarding TUI suite in the
`private/cli-mcp-tests` submodule. The GitHub Actions workflow at
`.github/workflows/builder_onboarding_tui_preview.yml` builds the local `cli/`
workspace, runs the private suite with `CAPGO_CLI_ROOT=$GITHUB_WORKSPACE/cli`,
uploads the generated `e2e-tui/results/` files to Cloudflare R2, and appends
the suite's Markdown failure summary to the GitHub Actions run summary.

## Trigger model

- Automatic runs are PR-only and path-filtered to builder onboarding code,
  related CLI tests, and this workflow/submodule pointer.
- Manual runs use `workflow_dispatch`, but the workflow resolves an open PR
  first. Pass `pr_number` or dispatch from a branch with an open PR.
- Secrets are used only for same-repository PR branches. Fork PRs do not run the
  job because the job requires
  `github.event.pull_request.head.repo.full_name == github.repository`.
- The workflow deliberately uses `pull_request`, not `pull_request_target`, so it
  never runs unreviewed fork code with repository secrets.

## Fork PR approval policy

GitHub's manual approval gate for fork pull request workflows is a repository or
organization setting, not a per-workflow YAML option. Keep Capgo configured with:

- Settings > Actions > General > Approval for running fork pull request workflows
  from contributors: `Require approval for all external contributors`.
- REST API value:
  `gh api repos/Cap-go/capgo/actions/permissions/fork-pr-contributor-approval`
  should return `{"approval_policy":"all_external_contributors"}`.

That setting prevents workflows from unknown or external fork contributors from
starting until someone with write access approves the run. This workflow still
blocks fork PRs at the job level after approval, because the private suite token
and Cloudflare credentials are only intended for same-repository PR branches.

## GitHub configuration

Add these repository secrets:

- `CLI_MCP_TESTS_TOKEN`: fine-grained GitHub token with read access to
  `Cap-go/cli-mcp-tests`. If `PERSONAL_ACCESS_TOKEN` already has that access,
  the workflow falls back to it.
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID used to build the R2 S3
  endpoint for uploads.
- `BUILDER_ONBOARDING_TUI_RESULTS_R2_UPLOAD_ACCESS_KEY_ID`: R2 Access Key ID
  used only by this workflow to upload builder onboarding TUI result files to
  the preview bucket.
- `BUILDER_ONBOARDING_TUI_RESULTS_R2_UPLOAD_SECRET_ACCESS_KEY`: R2 Secret Access
  Key paired with the upload Access Key ID above. Scope this token to
  `capgo-builder-html-e2e` with **Object Read & Write** permission.

Add these repository variables:

- `BUILDER_ONBOARDING_TUI_R2_BUCKET`: R2 bucket name, for example
  `capgo-builder-html-e2e`.
- `BUILDER_ONBOARDING_TUI_REPORTS_URL`: Access-protected custom-domain base URL,
  for example `https://buildertuipreview.capgo.app`.

The workflow uploads result files to the remote R2 bucket through R2's
S3-compatible endpoint and uses sixteen concurrent uploads by default. Adjust
`R2_UPLOAD_CONCURRENCY` in the workflow if R2 or the runner needs a lower or
higher parallelism limit.

## Cloudflare one-time setup

The Cloudflare API token used below needs permission to manage R2 buckets/custom
domains and Access applications/policies. Create the Access application before
attaching the R2 custom domain; otherwise the custom domain can be reachable
before Access protects it.

For CI uploads, create a separate R2 token in **R2 Object Storage** ->
**Overview** -> **Manage API Tokens** with **Object Read & Write** scoped only
to `capgo-builder-html-e2e`. Save the generated Access Key ID and Secret Access
Key as the two `BUILDER_ONBOARDING_TUI_RESULTS_R2_UPLOAD_*` GitHub secrets.
These credentials are only used to upload generated TUI result files; the
Cloudflare setup token below is only for the one-time bucket/domain/Access
configuration commands.

```bash
export BUCKET=capgo-builder-html-e2e
export REPORTS_HOST=buildertuipreview.capgo.app
export EMAIL_DOMAIN=capgo.app
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_ZONE_ID=...
export CF_SETUP_API_TOKEN=...
export TUI_RESULTS_R2_UPLOAD_ACCESS_KEY_ID=...
export TUI_RESULTS_R2_UPLOAD_SECRET_ACCESS_KEY=...

bunx wrangler@latest r2 bucket create "$BUCKET"

curl -fsS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps" \
  -H "Authorization: Bearer $CF_SETUP_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg host "$REPORTS_HOST" \
    --arg emailDomain "$EMAIL_DOMAIN" \
    '{
      name: "Builder onboarding TUI reports",
      domain: $host,
      type: "self_hosted",
      session_duration: "24h",
      app_launcher_visible: false,
      http_only_cookie_attribute: true,
      same_site_cookie_attribute: "strict",
      destinations: [{ type: "public", uri: $host }],
      policies: [{
        name: "Allow Capgo team",
        decision: "allow",
        precedence: 1,
        session_duration: "24h",
        include: [{ email_domain: { domain: $emailDomain } }]
      }]
    }')"

curl -fsS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets/$BUCKET/domains/custom" \
  -H "Authorization: Bearer $CF_SETUP_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg domain "$REPORTS_HOST" \
    --arg zoneId "$CLOUDFLARE_ZONE_ID" \
    '{ domain: $domain, enabled: true, zoneId: $zoneId, minTLS: "1.2" }')"

curl -fsS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets/$BUCKET/domains/managed" \
  -X PUT \
  -H "Authorization: Bearer $CF_SETUP_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":false}'

gh secret set CLOUDFLARE_ACCOUNT_ID \
  --repo Cap-go/capgo \
  --body "$CLOUDFLARE_ACCOUNT_ID"

gh secret set BUILDER_ONBOARDING_TUI_RESULTS_R2_UPLOAD_ACCESS_KEY_ID \
  --repo Cap-go/capgo \
  --body "$TUI_RESULTS_R2_UPLOAD_ACCESS_KEY_ID"

gh secret set BUILDER_ONBOARDING_TUI_RESULTS_R2_UPLOAD_SECRET_ACCESS_KEY \
  --repo Cap-go/capgo \
  --body "$TUI_RESULTS_R2_UPLOAD_SECRET_ACCESS_KEY"

gh variable set BUILDER_ONBOARDING_TUI_R2_BUCKET \
  --repo Cap-go/capgo \
  --body "$BUCKET"

gh variable set BUILDER_ONBOARDING_TUI_REPORTS_URL \
  --repo Cap-go/capgo \
  --body "https://$REPORTS_HOST"
```

If access should be based on an existing Cloudflare Access group instead of an
email domain, replace the policy include rule with:

```json
[{ "group": { "id": "ACCESS_GROUP_ID" } }]
```

The workflow writes objects under:

```text
builder-onboarding-tui/pr-<number>/<sha>/index.html
builder-onboarding-tui/pr-<number>/<sha>/report.html
builder-onboarding-tui/pr-<number>/<sha>/summary.md
builder-onboarding-tui/pr-<number>/<sha>/run.json
builder-onboarding-tui/pr-<number>/<sha>/files.txt
builder-onboarding-tui/pr-<number>/<sha>/casts/*.cast
```

The run summary includes the Markdown failure report and links to the protected
HTML report, raw `run.json`, and uploaded file list after the R2 upload.

The raw cast files and `run.json` can contain terminal output, paths, and future
debug details. Keep the custom domain behind Cloudflare Access and keep the
bucket's `r2.dev` public URL disabled. The workflow does not upload the raw
result tree as a GitHub Actions artifact because this repository is public.

Cloudflare references:

- R2 upload command:
  https://developers.cloudflare.com/r2/objects/upload-objects/
- Protect an R2 bucket with Access:
  https://developers.cloudflare.com/r2/tutorials/cloudflare-access/
- R2 custom-domain access controls:
  https://developers.cloudflare.com/r2/buckets/public-buckets/
- R2 custom-domain API:
  https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/domains/subresources/custom/methods/create/
- R2 managed-domain API:
  https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/domains/subresources/managed/methods/update/
