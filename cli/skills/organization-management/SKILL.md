---
name: organization-management
description: Use when working with Capgo account lookup, organization administration, member security settings, and deprecated organisation aliases.
---

# Capgo CLI Organization Management

Use this skill for account and organization administration commands.

## Account command

### `account whoami`

- Example: `npx @capgo/cli@latest account whoami`
- Alias: `account id`.
- Displays the account ID and email associated with the API key.
- Key option:
  - `-a, --apikey <apikey>`

### `account get`

- Alias: `g`
- Example: `npx @capgo/cli@latest account get`
- Shows the profile and email notification settings of the API key owner.

### `account set`

- Alias: `s`
- Example: `npx @capgo/cli@latest account set --first-name Ada --no-newsletter --email-preference weekly_stats=false`
- Notes:
  - Email, password, 2FA and account deletion stay in the web dashboard because they need an interactive sign-in.
- Key options:
  - `--first-name <firstName>`, `--last-name <lastName>`, `--country <country>`
  - `--discord-username <username>`, `--format-locale <locale>` (empty or `null` clears)
  - `--notifications`, `--no-notifications`
  - `--newsletter`, `--no-newsletter`
  - `--email-preference <key=bool>` (repeatable)

## Organization commands

### `organization list`

- Alias: `l`
- Example: `npx @capgo/cli@latest organization list`
- Lists all organizations the current user can access.

### `organization add`

- Alias: `a`
- Example: `npx @capgo/cli@latest organization add --name "My Company" --email admin@mycompany.com`
- Key options:
  - `-n, --name <name>`
  - `-e, --email <email>`

### `organization members [orgId]`

- Alias: `m`
- Example: `npx @capgo/cli@latest organization members ORG_ID`
- Notes:
  - Lists members, roles, and 2FA status.
  - Useful before enabling 2FA enforcement.
  - Viewing 2FA status requires `super_admin` rights.

### `organization members-invite [orgId]`

- Example: `npx @capgo/cli@latest organization members-invite ORG_ID --email teammate@example.com --role org_admin`
- Roles: `org_member`, `org_billing_admin`, `org_admin`, `org_super_admin`.

### `organization members-role [orgId]`

- Example: `npx @capgo/cli@latest organization members-role ORG_ID --email teammate@example.com --role org_member`
- Changes the role of a member or a pending invite.

### `organization members-remove [orgId]`

- Example: `npx @capgo/cli@latest organization members-remove ORG_ID --email teammate@example.com`

### `organization set [orgId]`

- Alias: `s`
- Example: `npx @capgo/cli@latest organization set ORG_ID --name "New Name"`
- Security examples:
  - `npx @capgo/cli@latest organization set ORG_ID --enforce-2fa`
  - `npx @capgo/cli@latest organization set ORG_ID --password-policy --min-length 12`
  - `npx @capgo/cli@latest organization set ORG_ID --require-apikey-expiration --max-apikey-expiration-days 90`
  - `npx @capgo/cli@latest organization set ORG_ID --enforce-hashed-api-keys`
- Notes:
  - Security settings require `super_admin` role.
- Key options:
  - `-n, --name <name>`
  - `-e, --email <email>`
  - `--enforce-2fa`, `--no-enforce-2fa`
  - `--password-policy`, `--no-password-policy`
  - `--min-length <minLength>`
  - `--require-uppercase`, `--no-require-uppercase`
  - `--require-number`, `--no-require-number`
  - `--require-special`, `--no-require-special`
  - `--require-apikey-expiration`, `--no-require-apikey-expiration`
  - `--max-apikey-expiration-days <days>`
  - `--enforce-hashed-api-keys`, `--no-enforce-hashed-api-keys`
  - `--website <url>`
  - `--enforce-encrypted-bundles`, `--no-enforce-encrypted-bundles`
  - `--required-encryption-key <key>`
  - `--email-preference <key=bool>` (repeatable)

### `organization delete [orgId]`

- Alias: `d`
- Example: `npx @capgo/cli@latest organization delete ORG_ID`
- Notes:
  - This action cannot be undone.
  - Only organization owners can delete organizations.

## Deprecated aliases

The `organisation` command group is deprecated in favor of `organization` and will be removed in a future version.

### Deprecated commands

- `organisation list`
- `organisation add`
- `organisation set [orgId]`
- `organisation delete [orgId]`

Use the `organization` equivalents for all new documentation and examples.

## Shared options

Most account and organization commands support:

- `-a, --apikey <apikey>`
