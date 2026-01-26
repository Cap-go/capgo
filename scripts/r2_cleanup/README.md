# R2 Cleanup Scripts

Efficiently find and remove orphaned files from R2 storage that are not present in the production database.

## Overview

The cleanup process uses 2 scripts:

1. **Script 1**: Find orphaned paths using hierarchical listing (fast, doesn't list all 4.8M files)
2. **Script 2**: Delete orphaned paths (with dry-run by default)

## How It Works

### Hierarchical Approach (Fast)

Instead of listing all 4.8M files, we use S3 delimiter to list only folder names at each level:

1. **Level 1 - Orgs**: List `orgs/` folders → compare with DB → mark entire orphan org folders
2. **Level 2 - Apps**: For active orgs, list app folders → compare with DB → mark orphan app folders
3. **Level 3 - Versions**: For active apps, list version files/folders → compare with DB → mark orphan versions

This approach is ~100x faster because we only list what we need.

### Version Types

Versions can be:
- `.zip` files (regular bundles)
- Folders (manifest-based bundles with multiple files)

Both are handled automatically.

## Usage

### Step 1: Find orphaned paths

```bash
bun scripts/r2_cleanup/1_list_r2_files.ts
```

This creates `./tmp/r2_cleanup/1_orphaned_paths.json` with:
- Orphaned org folders (entire orgs not in DB)
- Orphaned app folders (apps not in DB)
- Orphaned version files/folders (versions not in DB or deleted)

### Step 2: Delete orphaned paths

**Dry run (default - no deletion):**
```bash
bun scripts/r2_cleanup/2_delete_orphans.ts
```

**Actually delete files:**
```bash
DRY_RUN=false bun scripts/r2_cleanup/2_delete_orphans.ts
```

## Environment

Scripts load credentials directly from `./internal/cloudflare/.env.prod`.

No manual environment setup needed.

## Output Files

All output files are saved to `./tmp/r2_cleanup/`:

| File | Description |
|------|-------------|
| `1_orphaned_paths.json` | All orphaned paths with type and reason |

## Safety Features

- Script 2 runs in **dry-run mode by default**
- Review orphaned paths before deletion
- Hierarchical deletion (orgs first, then apps, then individual versions)

## What Gets Flagged as Orphaned

| Type | Reason |
|------|--------|
| `org` | Org folder in R2 with no active versions in DB |
| `app` | App folder in R2 with no active versions for that app in DB |
| `version` | Version .zip or folder not matching any `r2_path` in DB |
| `legacy` | Any folder under `apps/` prefix (legacy structure) |
