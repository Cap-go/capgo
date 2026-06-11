# Builder onboarding TUI preview CI

This repository keeps the private builder onboarding TUI suite in the
`private/cli-mcp-tests` submodule. The GitHub Actions workflow at
`.github/workflows/builder_onboarding_tui_preview.yml` builds the local `cli/`
workspace, runs the private suite with `CAPGO_CLI_ROOT=$GITHUB_WORKSPACE/cli`,
and uploads the generated `e2e-tui/results/report.html` to Cloudflare R2.

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
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID used by Wrangler.
- `CLOUDFLARE_API_TOKEN`: Cloudflare API token that can write R2 objects for the
  preview bucket.

Add these repository variables:

- `BUILDER_ONBOARDING_TUI_R2_BUCKET`: R2 bucket name, for example
  `capgo-builder-onboarding-tui-preview`.
- `BUILDER_ONBOARDING_TUI_REPORTS_URL`: Access-protected custom-domain base URL,
  for example `https://builder-onboarding-tui-preview.capgo.app`.

## Cloudflare one-time setup

1. Create an R2 bucket for preview reports.
2. Attach a custom domain to the bucket, for example
   `builder-onboarding-tui-preview.capgo.app`.
3. In Cloudflare Zero Trust, create a Self-hosted Access application for that
   hostname.
4. Add an Allow policy for the Capgo team identity group or approved email
   domain.
5. Keep the bucket's public access limited to the custom domain protected by
   Access. The workflow writes objects under:

```text
builder-onboarding-tui/pr-<number>/<sha>/index.html
```

The run summary links directly to the protected HTML report after upload.

Cloudflare references:

- R2 upload command:
  https://developers.cloudflare.com/r2/objects/upload-objects/
- Protect an R2 bucket with Access:
  https://developers.cloudflare.com/r2/tutorials/cloudflare-access/
- R2 custom-domain access controls:
  https://developers.cloudflare.com/r2/buckets/public-buckets/
