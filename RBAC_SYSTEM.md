# Capgo RBAC System - Complete Technical Documentation

This document explains in detail the Capgo RBAC (Role-Based Access Control) permission system, enabling granular access control to platform resources.

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Database Tables](#database-tables)
4. [Available Roles](#available-roles)
5. [Available Permissions](#available-permissions)
6. [SQL Functions](#sql-functions)
7. [Backend Integration](#backend-integration)
8. [Frontend Integration](#frontend-integration)
9. [Debugging and Troubleshooting](#debugging-and-troubleshooting)
10. [Best Practices](#best-practices)

---

## Overview

Capgo uses a **hybrid** system that supports two permission-management modes:

### Legacy System (old)
- **Main table**: `org_users`
- **Simple roles**: `super_admin`, `admin`, `write`, `upload`, `read`
- **Limitation**: one role per user per organization
- **Granularity**: limited, no per app/channel control

### RBAC System (new)
- **Main tables**: `roles`, `permissions`, `role_bindings`, `role_permissions`
- **Multiple roles**: a user can have several roles at different scopes
- **Fine granularity**: permissions at org, app, channel, and bundle level
- **Flexibility**: add/change permissions without code changes

### Automatic switching

The system automatically switches between legacy and RBAC via:
- **Org-level flag**: `use_new_rbac` column in the `orgs` table
- **Global flag**: `rbac_settings` table (singleton) to enable RBAC for all orgs
- **Auto-detection**: the `rbac_is_enabled_for_org()` function checks both flags

```sql
-- The org uses RBAC if:
-- 1. orgs.use_new_rbac = true OR
-- 2. rbac_settings.use_new_rbac = true
SELECT rbac_is_enabled_for_org('org-uuid');
```

---

## System Architecture

The Capgo RBAC system follows the standard RBAC model with extensions for multi-scope:

```
+-------------+     +--------------+     +-------------+
|  Principal  |---->| Role Binding |---->|    Role     |
| (User/API)  |     |  (by scope)  |     |             |
+-------------+     +--------------+     +------+------+
                                            |
                                            |
                                      +-----v------+
                                      | Role Perms |
                                      +-----+------+
                                            |
                                      +-----v------+
                                      | Permission |
                                      +------------+
```

### Key concepts

1. **Principal**: The entity that performs the action
   - User (authenticated user)
   - API Key
   - Group (user group)

2. **Role**: A coherent set of permissions
   - Example: `org_admin`, `app_developer`, `app_uploader`
   - Defined for a specific scope (platform, org, app, channel, bundle)

3. **Permission**: An atomic allowed action
   - Example: `app.upload_bundle`, `channel.promote_bundle`
   - Fine granularity for precise control

4. **Role Binding**: Assignment of a role to a principal within a scope
   - Example: User X has role `app_developer` on app Y
   - A principal can have multiple bindings at different scopes

5. **Scope**: Hierarchy level where the binding applies
   - `platform`: Entire platform (Capgo admins only)
   - `org`: Organization (applies to all apps in the org)
   - `app`: Specific application
   - `channel`: Specific channel
   - `bundle`: Specific bundle

### Scope hierarchy

Permissions propagate downward in the hierarchy:

```
Platform (global)
  |
  +-> Organization
        |
        +-> Application
              |
              +-> Channel
              |
              +-> Bundle
```

**Propagation example**:
- User with `org_admin` at org level -> access to all apps in that org
- User with `app_developer` at app level -> access to all channels in that app
- User with `channel_admin` at channel level -> access only to that channel

---

## Database Tables

### 1. `roles` - Role definitions

Stores all roles available in the system.

```sql
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('platform', 'org', 'app', 'bundle', 'channel')),
  description text,
  priority_rank int NOT NULL DEFAULT 0,
  is_assignable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);
```

**Important columns**:
- `name`: Unique role name (e.g., `org_admin`)
- `scope_type`: Native level for the role (where it can be assigned)
- `priority_rank`: Priority order (higher = more permissions)
- `is_assignable`: If `false`, cannot be assigned to customers (internal use)

**Indexes**:
- Primary key on `id`
- Unique on `name`

### 2. `permissions` - Atomic actions

Defines all available permissions.

```sql
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('platform', 'org', 'app', 'channel')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Important columns**:
- `key`: Unique permission identifier (e.g., `app.upload_bundle`)
- `scope_type`: Minimal required scope for this permission
- `description`: Explanation of the allowed action

**Naming convention**: `{scope}.{action}`
- Examples: `org.read`, `app.update_settings`, `channel.promote_bundle`

### 3. `role_permissions` - Role to permission mapping

Join table between roles and permissions.

```sql
CREATE TABLE public.role_permissions (
  role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
```

**Usage**:
- Defines which permissions each role grants
- A role can have multiple permissions
- A permission can belong to multiple roles

### 4. `role_bindings` - Role assignments

Assigns roles to principals in specific scopes.

```sql
CREATE TABLE public.role_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_type text NOT NULL CHECK (principal_type IN ('user', 'group', 'apikey')),
  principal_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('platform', 'org', 'app', 'bundle', 'channel')),
  org_id uuid NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  app_id uuid NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  bundle_id bigint NULL REFERENCES public.app_versions(id) ON DELETE CASCADE,
  channel_id uuid NULL REFERENCES public.channels(rbac_id) ON DELETE CASCADE,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  reason text NULL,
  is_direct boolean NOT NULL DEFAULT true,
  CHECK (
    (scope_type = 'platform' AND org_id IS NULL AND app_id IS NULL AND bundle_id IS NULL AND channel_id IS NULL) OR
    (scope_type = 'org' AND org_id IS NOT NULL AND app_id IS NULL AND bundle_id IS NULL AND channel_id IS NULL) OR
    (scope_type = 'app' AND org_id IS NOT NULL AND app_id IS NOT NULL AND bundle_id IS NULL AND channel_id IS NULL) OR
    (scope_type = 'bundle' AND org_id IS NOT NULL AND app_id IS NOT NULL AND bundle_id IS NOT NULL AND channel_id IS NULL) OR
    (scope_type = 'channel' AND org_id IS NOT NULL AND app_id IS NOT NULL AND bundle_id IS NULL AND channel_id IS NOT NULL)
  )
);
```

**Important columns**:
- `principal_type` / `principal_id`: Who receives the role (user, group, apikey)
- `role_id`: Which role is assigned
- `scope_type`: At which level (org, app, channel, etc.)
- `org_id` / `app_id` / `channel_id` / `bundle_id`: Scope identifiers
- `granted_by`: Who granted the role (audit)
- `expires_at`: Optional expiration date
- `is_direct`: If `true`, assigned manually; if `false`, inherited

**Integrity constraints**:
- **SSD (Static Separation of Duty)**: A principal can have only one role per scope
  - Example: User X cannot be both `org_admin` AND `org_member` in the same org
  - Implemented via unique indexes on `(principal_type, principal_id, scope_type, {scope_id})`

**Indexes**:
```sql
-- SSD enforcement
CREATE UNIQUE INDEX role_bindings_platform_scope_uniq
  ON role_bindings (principal_type, principal_id, scope_type)
  WHERE scope_type = 'platform';

CREATE UNIQUE INDEX role_bindings_org_scope_uniq
  ON role_bindings (principal_type, principal_id, org_id, scope_type)
  WHERE scope_type = 'org';

CREATE UNIQUE INDEX role_bindings_app_scope_uniq
  ON role_bindings (principal_type, principal_id, app_id, scope_type)
  WHERE scope_type = 'app';

CREATE UNIQUE INDEX role_bindings_bundle_scope_uniq
  ON role_bindings (principal_type, principal_id, bundle_id, scope_type)
  WHERE scope_type = 'bundle';

CREATE UNIQUE INDEX role_bindings_channel_scope_uniq
  ON role_bindings (principal_type, principal_id, channel_id, scope_type)
  WHERE scope_type = 'channel';

-- Performance
CREATE INDEX role_bindings_principal_scope_idx
  ON role_bindings (principal_type, principal_id, scope_type, org_id, app_id, channel_id);
```

### 5. `role_hierarchy` - Role inheritance

Defines parent-child relationships between roles.

```sql
CREATE TABLE public.role_hierarchy (
  parent_role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
  child_role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_role_id, child_role_id),
  CHECK (parent_role_id IS DISTINCT FROM child_role_id)
);
```

**Usage**:
- A parent role automatically inherits all permissions from its children
- Simplifies management: `org_admin` inherits all app_* roles

**Inheritance examples**:
```
org_super_admin -> org_admin -> app_admin -> app_developer -> app_uploader -> app_reader
                                   |
                                   +-> bundle_admin -> bundle_reader
                                   |
                                   +-> channel_admin -> channel_reader
```

### 6. `groups` - User groups

Allows grouping users for simpler management.

```sql
CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT groups_org_name_unique UNIQUE (org_id, name)
);
```

**Usage**:
- Create org-level groups (e.g., "Backend Team", "Admins")
- Assign a role to a group instead of individual users
- All group members automatically inherit the role

### 7. `group_members` - Group members

```sql
CREATE TABLE public.group_members (
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
```

### 8. `rbac_settings` - Global configuration

Singleton table to enable RBAC globally.

```sql
CREATE TABLE public.rbac_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  use_new_rbac boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Usage**:
- Single row with `id = 1`
- If `use_new_rbac = true`, RBAC is enabled for ALL orgs (unless overridden at org level)

### 9. Auxiliary tables

#### `orgs.use_new_rbac`
```sql
ALTER TABLE public.orgs
ADD COLUMN use_new_rbac boolean NOT NULL DEFAULT false;
```
- Org-level flag to enable RBAC for a specific org

#### `apikeys.rbac_id`
```sql
ALTER TABLE public.apikeys
ADD COLUMN rbac_id uuid DEFAULT gen_random_uuid() UNIQUE NOT NULL;
```
- Stable UUID to reference API keys in `role_bindings`

#### `channels.rbac_id`
```sql
ALTER TABLE public.channels
ADD COLUMN rbac_id uuid DEFAULT gen_random_uuid() UNIQUE NOT NULL;
```
- Stable UUID to reference channels in `role_bindings`

#### `apps.id` (added constraint)
```sql
ALTER TABLE public.apps
ADD CONSTRAINT apps_id_unique UNIQUE (id);
```
- `apps.id` already existed but was not unique; constraint added for RBAC

---

## Available Roles

---

## Available Roles

The system defines 13 predefined roles covering all hierarchy levels.

### Platform Roles (internal use only)

#### `platform_super_admin`
- **Scope**: `platform`
- **Assignable**: No (Capgo team only)
- **Priority rank**: 100
- **Permissions**: ALL platform permissions
- **Usage**: Capgo admins for maintenance, support, emergency operations

### Organization Roles

#### `org_super_admin`
- **Scope**: `org`
- **Assignable**: Yes
- **Priority rank**: 95
- **Permissions**:
  - **Org**: read, update_settings, read_members, invite_user, update_user_roles, read_billing, **update_billing**, read_invoices, read_audit, read_billing_audit
  - **App**: read, update_settings, **delete**, read_bundles, upload_bundle, create_channel, read_channels, read_logs, manage_devices, read_devices, build_native, read_audit, update_user_roles
  - **Channel**: read, update_settings, **delete**, read_history, promote_bundle, rollback_bundle, manage_forced_devices, read_forced_devices, read_audit
  - **Bundle**: **delete**
- **Usage**: Organization owner, full access including billing and deletions
- **Difference vs org_admin**: Can update billing and delete apps/channels

#### `org_admin`
- **Scope**: `org`
- **Assignable**: Yes
- **Priority rank**: 90
- **Permissions**:
  - **Org**: read, update_settings, read_members, invite_user, update_user_roles, read_billing, read_invoices, read_audit, read_billing_audit
  - **App**: read, update_settings, read_bundles, upload_bundle, create_channel, read_channels, read_logs, manage_devices, read_devices, build_native, read_audit, update_user_roles
  - **Channel**: read, update_settings, read_history, promote_bundle, rollback_bundle, manage_forced_devices, read_forced_devices, read_audit
- **Usage**: Organization admin, full management except billing and deletions
- **Limitations**: Cannot update billing or delete apps/channels

#### `org_billing_admin`
- **Scope**: `org`
- **Assignable**: Yes
- **Priority rank**: 80
- **Permissions**:
  - **Org**: read, read_billing, **update_billing**, read_invoices, read_billing_audit
- **Usage**: Billing-only access (accounting, finance)
- **Use case**: Finance team manages payments without app access

#### `org_member`
- **Scope**: `org`
- **Assignable**: Yes
- **Priority rank**: 75
- **Permissions**:
  - **Org**: read, read_members
  - **App**: read, list_bundles, list_channels, read_logs, read_devices, read_audit
  - **Channel**: read, read_history, read_forced_devices, read_audit
  - **Bundle**: read
- **Usage**: Basic member, read-only across the org
- **Use case**: Observers, stakeholders, QA with visibility but no modification power

### Application Roles

#### `app_admin`
- **Scope**: `app`
- **Assignable**: Yes
- **Priority rank**: 70
- **Permissions**:
  - **App**: read, update_settings, read_bundles, upload_bundle, create_channel, read_channels, read_logs, manage_devices, read_devices, build_native, read_audit, update_user_roles
  - **Channel**: read, update_settings, **delete**, read_history, promote_bundle, rollback_bundle, manage_forced_devices, read_forced_devices, read_audit
  - **Bundle**: **delete**
- **Usage**: Full admin of a specific app (can delete channels)
- **Inheritance**: Inherits app_developer, app_uploader, app_reader, bundle_admin, channel_admin

#### `app_developer`
- **Scope**: `app`
- **Assignable**: Yes
- **Priority rank**: 68
- **Permissions**:
  - **App**: read, read_bundles, upload_bundle, read_channels, read_logs, manage_devices, read_devices, build_native, read_audit
  - **Channel**: read, update_settings, read_history, promote_bundle, rollback_bundle, manage_forced_devices, read_forced_devices, read_audit
- **Usage**: Developer with full access except deletions
- **Limitations**: Cannot create new channels or delete channels/bundles
- **Inheritance**: Inherits app_uploader, app_reader

#### `app_uploader`
- **Scope**: `app`
- **Assignable**: Yes
- **Priority rank**: 66
- **Permissions**:
  - **App**: read, read_bundles, upload_bundle, read_channels, read_logs, read_devices, read_audit
- **Usage**: CI/CD, bundle uploads only
- **Use case**: API keys for CI pipelines
- **Inheritance**: Inherits app_reader

#### `app_reader`
- **Scope**: `app`
- **Assignable**: Yes
- **Priority rank**: 65
- **Permissions**:
  - **App**: read, read_bundles, read_channels, read_logs, read_devices, read_audit
- **Usage**: Read-only on a specific app
- **Use case**: Auditors, external stakeholders

### Channel Roles

#### `channel_admin`
- **Scope**: `channel`
- **Assignable**: Yes
- **Priority rank**: 60
- **Permissions**:
  - **Channel**: read, update_settings, **delete**, read_history, promote_bundle, rollback_bundle, manage_forced_devices, read_forced_devices, read_audit
- **Usage**: Full admin of a specific channel
- **Inheritance**: Inherits channel_reader

#### `channel_reader`
- **Scope**: `channel`
- **Assignable**: Yes
- **Priority rank**: 55
- **Permissions**:
  - **Channel**: read, read_history, read_forced_devices, read_audit
- **Usage**: Read-only on a specific channel

### Bundle Roles

#### `bundle_admin`
- **Scope**: `bundle`
- **Assignable**: Yes
- **Priority rank**: 62
- **Permissions**:
  - **Bundle**: read, update, **delete**
- **Usage**: Full management of a specific bundle
- **Inheritance**: Inherits bundle_reader

#### `bundle_reader`
- **Scope**: `bundle`
- **Assignable**: Yes
- **Priority rank**: 61
- **Permissions**:
  - **Bundle**: read
- **Usage**: Read-only on a specific bundle

### Full role hierarchy

```
platform_super_admin (platform, rank 100)
    |
    +-> ALL permissions

org_super_admin (org, rank 95)
    |
    +-> org_admin (org, rank 90)
            |
            +-> app_admin (app, rank 70)
            |       |
            |       +-> app_developer (app, rank 68)
            |       |       |
            |       |       +-> app_uploader (app, rank 66)
            |       |               |
            |       |               +-> app_reader (app, rank 65)
            |       |
            |       +-> bundle_admin (bundle, rank 62)
            |       |       |
            |       |       +-> bundle_reader (bundle, rank 61)
            |       |
            |       +-> channel_admin (channel, rank 60)
            |               |
            |               +-> channel_reader (channel, rank 55)
            |
            +-> org_member (org, rank 75)

org_billing_admin (org, rank 80) [no inheritance]
```

---

## Available Permissions

The system defines **40+ atomic permissions** organized by scope.

### Organization permissions (scope: `org`)

| Permission | Description | Roles with this permission |
|-----------|-------------|----------------------------|
| `org.read` | View organization info | org_super_admin, org_admin, org_billing_admin, org_member |
| `org.update_settings` | Update org settings | org_super_admin, org_admin |
| `org.read_members` | View member list | org_super_admin, org_admin, org_member |
| `org.invite_user` | Invite members | org_super_admin, org_admin |
| `org.update_user_roles` | Manage member roles | org_super_admin, org_admin |
| `org.read_billing` | View billing info | org_super_admin, org_admin, org_billing_admin |
| `org.update_billing` | Update billing | org_super_admin, org_billing_admin |
| `org.read_invoices` | View invoices | org_super_admin, org_admin, org_billing_admin |
| `org.read_audit` | View org audit logs | org_super_admin, org_admin |
| `org.read_billing_audit` | View billing audit | org_super_admin, org_admin, org_billing_admin |

### Application permissions (scope: `app`)

| Permission | Description | Roles with this permission |
|-----------|-------------|----------------------------|
| `app.read` | View app info | All app_* roles, org_admin, org_super_admin, org_member |
| `app.update_settings` | Update app settings | app_admin, org_admin, org_super_admin |
| `app.delete` | Delete app | org_super_admin only |
| `app.read_bundles` | View bundle metadata | app_admin, app_developer, app_uploader, app_reader, org_admin, org_super_admin |
| `app.list_bundles` | List bundles | org_member |
| `app.upload_bundle` | Upload bundles | app_admin, app_developer, app_uploader, org_admin, org_super_admin |
| `app.create_channel` | Create channels | app_admin, org_admin, org_super_admin |
| `app.read_channels` | View channels | app_admin, app_developer, app_uploader, app_reader, org_admin, org_super_admin |
| `app.list_channels` | List channels | org_member |
| `app.read_logs` | View logs | app_admin, app_developer, app_uploader, app_reader, org_admin, org_super_admin, org_member |
| `app.manage_devices` | Manage devices | app_admin, app_developer, org_admin, org_super_admin |
| `app.read_devices` | View devices | All app_* roles, org_admin, org_super_admin, org_member |
| `app.build_native` | Build native versions | app_admin, app_developer, org_admin, org_super_admin |
| `app.read_audit` | View app audit | All app_* roles, org_admin, org_super_admin, org_member |
| `app.update_user_roles` | Manage user roles for this app | app_admin, org_admin, org_super_admin |

### Bundle permissions (scope: `app`)

**Note**: Bundle permissions use scope `app` because they require the app context.

| Permission | Description | Roles with this permission |
|-----------|-------------|----------------------------|
| `bundle.read` | Read bundle metadata | bundle_admin, bundle_reader, org_member |
| `bundle.update` | Update a bundle | bundle_admin |
| `bundle.delete` | Delete a bundle | bundle_admin, app_admin, org_admin, org_super_admin |

### Channel permissions (scope: `channel`)

| Permission | Description | Roles with this permission |
|-----------|-------------|----------------------------|
| `channel.read` | View a channel | All channel_* roles, app_admin, app_developer, org_admin, org_super_admin, org_member |
| `channel.update_settings` | Update channel settings | channel_admin, app_admin, app_developer, org_admin, org_super_admin |
| `channel.delete` | Delete a channel | channel_admin, app_admin, org_admin, org_super_admin |
| `channel.read_history` | View deployment history | All channel_* roles, app_admin, app_developer, org_admin, org_super_admin, org_member |
| `channel.promote_bundle` | Promote a bundle | channel_admin, app_admin, app_developer, org_admin, org_super_admin |
| `channel.rollback_bundle` | Roll back a bundle | channel_admin, app_admin, app_developer, org_admin, org_super_admin |
| `channel.manage_forced_devices` | Manage forced devices | channel_admin, app_admin, app_developer, org_admin, org_super_admin |
| `channel.read_forced_devices` | View forced devices | All channel_* roles, app_admin, app_developer, org_admin, org_super_admin, org_member |
| `channel.read_audit` | View channel audit | All channel_* roles, app_admin, app_developer, org_admin, org_super_admin, org_member |

### Platform permissions (scope: `platform`)

**Internal use only** - Reserved for the Capgo team.

| Permission | Description |
|-----------|-------------|
| `platform.impersonate_user` | Impersonate a user (support) |
| `platform.manage_orgs_any` | Manage any org |
| `platform.manage_apps_any` | Manage any app |
| `platform.manage_channels_any` | Manage any channel |
| `platform.run_maintenance_jobs` | Run maintenance jobs |
| `platform.delete_orphan_users` | Delete orphan users |
| `platform.read_all_audit` | View all audit logs |
| `platform.db_break_glass` | Break-glass DB access (emergencies) |

---

## SQL Functions
---

## SQL Functions

### 1. `rbac_is_enabled_for_org()` - RBAC flag check

Determines whether RBAC is enabled for a given organization.

```sql
CREATE OR REPLACE FUNCTION public.rbac_is_enabled_for_org(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_org_enabled boolean;
  v_global_enabled boolean;
BEGIN
  SELECT use_new_rbac INTO v_org_enabled FROM public.orgs WHERE id = p_org_id;
  SELECT use_new_rbac INTO v_global_enabled FROM public.rbac_settings WHERE id = 1;

  RETURN COALESCE(v_org_enabled, false) OR COALESCE(v_global_enabled, false);
END;
$$;
```

**Behavior**:
- Returns `true` if `orgs.use_new_rbac = true` OR `rbac_settings.use_new_rbac = true`
- Returns `false` by default (legacy mode)

**Usage**:
```sql
SELECT rbac_is_enabled_for_org('550e8400-e29b-41d4-a716-446655440000');
-- true if RBAC is enabled, false otherwise
```

### 2. `rbac_permission_for_legacy()` - Legacy to RBAC mapping

Converts a legacy `min_right` to an equivalent RBAC permission.

```sql
CREATE OR REPLACE FUNCTION public.rbac_permission_for_legacy(
  p_min_right public.user_min_right,
  p_scope text
) RETURNS text
LANGUAGE plpgsql
SET search_path = ''
IMMUTABLE AS $$
BEGIN
  IF p_scope = 'org' THEN
    IF p_min_right IN ('super_admin', 'admin', 'invite_super_admin', 'invite_admin') THEN
      RETURN 'org.update_user_roles';
    ELSIF p_min_right IN ('write', 'upload', 'invite_write', 'invite_upload') THEN
      RETURN 'org.update_settings';
    ELSE
      RETURN 'org.read';
    END IF;
  ELSIF p_scope = 'app' THEN
    IF p_min_right IN ('super_admin', 'admin', 'invite_super_admin', 'invite_admin', 'write', 'invite_write') THEN
      RETURN 'app.update_settings';
    ELSIF p_min_right IN ('upload', 'invite_upload') THEN
      RETURN 'app.upload_bundle';
    ELSE
      RETURN 'app.read';
    END IF;
  ELSIF p_scope = 'channel' THEN
    IF p_min_right IN ('super_admin', 'admin', 'invite_super_admin', 'invite_admin', 'write', 'invite_write') THEN
      RETURN 'channel.update_settings';
    ELSIF p_min_right IN ('upload', 'invite_upload') THEN
      RETURN 'channel.promote_bundle';
    ELSE
      RETURN 'channel.read';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;
```

**Mapping table**:

| Min Right (legacy) | Scope | RBAC Permission |
|-------------------|-------|-----------------|
| super_admin, admin | org | org.update_user_roles |
| write, upload | org | org.update_settings |
| read | org | org.read |
| super_admin, admin, write | app | app.update_settings |
| upload | app | app.upload_bundle |
| read | app | app.read |
| super_admin, admin, write | channel | channel.update_settings |
| upload | channel | channel.promote_bundle |
| read | channel | channel.read |

### 3. `rbac_has_permission()` - RBAC permission resolution

**Core function** that checks whether a principal has a given permission.

```sql
CREATE OR REPLACE FUNCTION public.rbac_has_permission(
  p_principal_type text,      -- 'user' or 'apikey' or 'group'
  p_principal_id uuid,        -- Principal UUID
  p_permission_key text,      -- 'app.upload_bundle'
  p_org_id uuid,              -- Optional, derived if NULL
  p_app_id character varying, -- App ID (string)
  p_channel_id bigint         -- Channel ID (integer)
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
-- [See full implementation in the migration]
$$;
```

**Detailed algorithm**:

1. **Resolve identifiers**
   - Convert `app_id` (string) to `app.id` (uuid)
   - Fetch `channel.rbac_id` (uuid) from `channel_id` (bigint)
   - Derive `org_id` from app or channel if not provided

2. **Build the scope catalog**
   ```sql
   scope_catalog:
     - platform (if applicable)
     - org (if org_id provided)
     - app (if app_id provided)
     - channel (if channel_id provided)
   ```

3. **Collect direct role_bindings**
   - Find all bindings for the principal within applicable scopes
   - Example: User X with `app_developer` on app Y

4. **Expand role hierarchy**
   - Use a recursive CTE to follow `role_hierarchy`
   - If a user has `app_admin`, automatically includes `app_developer`, `app_uploader`, `app_reader`

5. **Collect permissions**
   - Join `role_permissions` to get all permissions for the roles
   - Deduplicate permissions

6. **Check scope applicability**
   - A permission granted at org level applies to all apps in the org
   - A permission granted at app level applies to all channels in the app
   - **Downward propagation only** (no upward escalation)

7. **Return**
   - `true` if the permission is found in the collected set
   - `false` otherwise

**Propagation example**:
```
User "Alice" has role org_admin in org "Acme Corp"
  -> Alice has app.upload_bundle at org level
    -> Alice can upload to ALL apps in "Acme Corp"

User "Bob" has role app_developer on app "com.example.mobile"
  -> Bob has channel.promote_bundle at app level
    -> Bob can promote on ALL channels of "com.example.mobile"
    -> Bob cannot promote on other apps
```

**Performance**:
- Indexes optimized on `role_bindings` for fast lookup
- Recursive CTE limited in depth (max ~5-6 levels)
- Application-level caching (backend)

### 4. `rbac_check_permission()` - Public entry point (authenticated)

**Public function** used by client RPCs. It uses `auth.uid()` and delegates to the internal function.

```sql
CREATE OR REPLACE FUNCTION public.rbac_check_permission(
  p_permission_key text,        -- 'app.upload_bundle'
  p_org_id uuid DEFAULT NULL,   -- Optional
  p_app_id varchar DEFAULT NULL, -- Optional
  p_channel_id bigint DEFAULT NULL -- Optional
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.rbac_check_permission_direct(
    p_permission_key,
    auth.uid(),
    p_org_id,
    p_app_id,
    p_channel_id,
    NULL
  );
END;
$$;
```

#### `rbac_check_permission_direct()` - Internal entry point (service_role only)

**Internal function** used by backend/service_role to check permissions for arbitrary users or API keys.

```sql
CREATE OR REPLACE FUNCTION public.rbac_check_permission_direct(
  p_permission_key text,        -- 'app.upload_bundle'
  p_user_id uuid,               -- User UUID
  p_org_id uuid DEFAULT NULL,   -- Optional
  p_app_id varchar DEFAULT NULL, -- Optional
  p_channel_id bigint DEFAULT NULL, -- Optional
  p_apikey text DEFAULT NULL    -- Optional (mutually exclusive with user_id)
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid := p_org_id;
  v_principal_type text;
  v_principal_id uuid;
  v_apikey_rbac_id uuid;
BEGIN
  -- Determine the principal
  IF p_apikey IS NOT NULL THEN
    SELECT rbac_id, owner_org INTO v_apikey_rbac_id, v_org_id
    FROM public.apikeys
    WHERE key = p_apikey;

    IF v_apikey_rbac_id IS NULL THEN
      RETURN false; -- Invalid API key
    END IF;

    v_principal_type := 'apikey';
    v_principal_id := v_apikey_rbac_id;
  ELSE
    v_principal_type := 'user';
    v_principal_id := p_user_id;
  END IF;

  -- Derive org_id if needed
  IF v_org_id IS NULL AND p_app_id IS NOT NULL THEN
    SELECT owner_org INTO v_org_id FROM public.apps WHERE app_id = p_app_id LIMIT 1;
  END IF;

  IF v_org_id IS NULL AND p_channel_id IS NOT NULL THEN
    SELECT owner_org INTO v_org_id FROM public.channels WHERE id = p_channel_id LIMIT 1;
  END IF;

  -- Check whether RBAC is enabled
  IF rbac_is_enabled_for_org(v_org_id) THEN
    -- New RBAC system
    RETURN rbac_has_permission(
      v_principal_type,
      v_principal_id,
      p_permission_key,
      v_org_id,
      p_app_id,
      p_channel_id
    );
  ELSE
    -- Legacy system via check_min_rights
    DECLARE
      v_min_right public.user_min_right;
      v_scope text;
    BEGIN
      -- Derive scope from parameters
      IF p_channel_id IS NOT NULL THEN
        v_scope := 'channel';
      ELSIF p_app_id IS NOT NULL THEN
        v_scope := 'app';
      ELSE
        v_scope := 'org';
      END IF;

      -- Map permission -> legacy min_right
      -- (inverse logic of rbac_permission_for_legacy)
      IF p_permission_key LIKE 'org.%' THEN
        IF p_permission_key IN ('org.update_user_roles', 'org.update_settings') THEN
          v_min_right := 'admin';
        ELSE
          v_min_right := 'read';
        END IF;
      ELSIF p_permission_key LIKE 'app.%' THEN
        IF p_permission_key IN ('app.delete', 'app.update_user_roles') THEN
          v_min_right := 'admin';
        ELSIF p_permission_key IN ('app.update_settings', 'app.create_channel') THEN
          v_min_right := 'write';
        ELSIF p_permission_key = 'app.upload_bundle' THEN
          v_min_right := 'upload';
        ELSE
          v_min_right := 'read';
        END IF;
      ELSIF p_permission_key LIKE 'channel.%' THEN
        IF p_permission_key IN ('channel.delete') THEN
          v_min_right := 'admin';
        ELSIF p_permission_key IN ('channel.update_settings') THEN
          v_min_right := 'write';
        ELSIF p_permission_key = 'channel.promote_bundle' THEN
          v_min_right := 'upload';
        ELSE
          v_min_right := 'read';
        END IF;
      ELSE
        v_min_right := 'admin'; -- Default: require admin
      END IF;

      -- Call the legacy function
      RETURN check_min_rights_legacy(
        v_min_right,
        p_user_id,
        v_org_id,
        p_app_id,
        p_apikey
      );
    END;
  END IF;
END;
$$;
```

**Advantages**:
- Single source of truth for permission checks
- Automatic legacy/RBAC routing based on org flag
- Automatic `org_id` derivation from app/channel
- Supports API keys and users
- Graceful fallback to legacy if RBAC is not enabled

**Recommended usage**:
```sql
-- Authenticated user (client RPC)
SELECT rbac_check_permission(
  'app.upload_bundle',
  NULL, -- org_id will be derived
  'com.example.app',
  NULL
);

-- Service role / backend API key
SELECT rbac_check_permission_direct(
  'channel.promote_bundle',
  NULL::uuid,
  NULL,
  NULL,
  123, -- channel_id
  'apikey-string'
);
```

---

## Backend Integration

### TypeScript - `checkPermission()` wrapper

The backend uses a TypeScript wrapper to simplify usage.

**File**: [supabase/functions/_backend/utils/rbac.ts](supabase/functions/_backend/utils/rbac.ts)

```typescript
import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from './hono.ts'

/**
 * Type-safe permission check
 */
export type Permission
  = 'org.read' | 'org.update_settings' | 'org.invite_user' | ...
  | 'app.read' | 'app.upload_bundle' | 'app.update_settings' | ...
  | 'channel.promote_bundle' | 'channel.update_settings' | ...
  | 'bundle.read' | 'bundle.delete'
  | 'platform.impersonate_user' | ...

export interface PermissionScope {
  orgId?: string
  appId?: string
  channelId?: number
}

/**
 * Check if the authenticated principal has the given permission
 *
 * @param c Hono context (must have auth middleware)
 * @param permission Permission key (e.g., 'app.upload_bundle')
 * @param scope Scope identifiers (orgId, appId, channelId)
 * @returns Promise<boolean> - true if allowed, false otherwise
 */
export async function checkPermission(
  c: Context<MiddlewareKeyVariables>,
  permission: Permission,
  scope: PermissionScope
): Promise<boolean> {
  const requestId = c.get('requestId')
  const auth = c.get('auth')
  const apikey = c.get('apikey')

  try {
    const userId = auth?.userId || null
    const apikeyString = apikey?.key || null

    const pgClient = await getPgClient()
    const result = await pgClient`
      SELECT rbac_check_permission_direct(
        ${permission},
        ${userId}::uuid,
        ${scope.orgId || null}::uuid,
        ${scope.appId || null}::varchar,
        ${scope.channelId || null}::bigint,
        ${apikeyString}
      ) as allowed
    `

    const allowed = result[0]?.allowed || false

    cloudlog({
      requestId,
      message: `rbac_check: ${permission} ${allowed ? 'GRANTED' : 'DENIED'}`,
      userId,
      orgId: scope.orgId,
      appId: scope.appId,
      channelId: scope.channelId,
    })

    return allowed
  } catch (error) {
    cloudlogErr({
      requestId,
      message: `rbac_check_error: ${permission}`,
      error,
    })
    return false // Fail closed
  } finally {
    await closeClient()
  }
}

/**
 * Require permission or throw 403
 */
export async function requirePermission(
  c: Context<MiddlewareKeyVariables>,
  permission: Permission,
  scope: PermissionScope
): Promise<void> {
  const allowed = await checkPermission(c, permission, scope)
  if (!allowed) {
    throw new HTTPException(403, {
      message: `Access denied: missing permission ${permission}`,
    })
  }
}
```

**Usage in an endpoint**:

```typescript
import { checkPermission, requirePermission } from '../utils/rbac.ts'
import { createHono, simpleError } from '../utils/hono.ts'

const app = createHono()

// Example 1: Check with manual handling
app.post('/bundle/upload', middlewareKey(['all', 'write', 'upload']), async (c) => {
  const body = await c.req.json()

  // Check permission
  if (!(await checkPermission(c, 'app.upload_bundle', { appId: body.app_id }))) {
    return simpleError('app_access_denied', 'You cannot upload to this app')
  }

  // ... upload logic
  return c.json({ success: true })
})

// Example 2: Require with automatic throw
app.delete('/app/:appId', middlewareAuth, async (c) => {
  const appId = c.req.param('appId')

  // Throw 403 if permission denied
  await requirePermission(c, 'app.delete', { appId })

  // ... deletion logic
  return c.json({ success: true })
})

// Example 3: Channel-level permission (auto-derive appId and orgId)
app.post('/channel/:channelId/promote', middlewareKey(['all', 'upload']), async (c) => {
  const channelId = Number.parseInt(c.req.param('channelId'))

  await requirePermission(c, 'channel.promote_bundle', { channelId })

  // ... promotion logic
  return c.json({ success: true })
})
```

**Advantages**:
- **Type-safe**: strict `Permission` type with autocomplete
- **Auto-routing**: legacy/RBAC based on org flag (transparent)
- **Logging**: automatic logs in CloudFlare/Supabase
- **Fail-closed**: returns `false` on errors (secure)
- **Context-aware**: uses `c.get('auth')` and `c.get('apikey')` automatically

### Additional helpers

```typescript
/**
 * Check if principal has ANY of the given permissions (OR logic)
 */
export async function hasAnyPermission(
  c: Context<MiddlewareKeyVariables>,
  permissions: Permission[],
  scope: PermissionScope
): Promise<boolean> {
  for (const perm of permissions) {
    if (await checkPermission(c, perm, scope)) {
      return true
    }
  }
  return false
}

/**
 * Check if principal has ALL of the given permissions (AND logic)
 */
export async function hasAllPermissions(
  c: Context<MiddlewareKeyVariables>,
  permissions: Permission[],
  scope: PermissionScope
): Promise<boolean> {
  for (const perm of permissions) {
    if (!(await checkPermission(c, perm, scope))) {
      return false
    }
  }
  return true
}

/**
 * Batch check multiple permissions
 */
export async function checkPermissionsBatch(
  c: Context<MiddlewareKeyVariables>,
  checks: Array<{ permission: Permission; scope: PermissionScope }>
): Promise<Map<Permission, boolean>> {
  const results = new Map<Permission, boolean>()

  for (const check of checks) {
    const allowed = await checkPermission(c, check.permission, check.scope)
    results.set(check.permission, allowed)
  }

  return results
}
```

---

## Frontend Integration
- `org.update_settings` - Update org settings
- `org.invite_user` - Invite members
- `org.update_user_roles` - Manage member roles
- `org.read_billing` - View billing info
- `org.update_billing` - Update billing
- `org.read_invoices` - View invoices
- `org.read_audit` - View audit logs
- `org.read_billing_audit` - View billing audit

**App permissions** (scope: 'app')
- `app.read` - View app info
- `app.update_settings` - Update app settings
- `app.delete` - Delete the app
- `app.read_bundles` - View bundles
- `app.list_bundles` - List bundles
- `app.upload_bundle` - Upload bundles
- `app.create_channel` - Create channels
- `app.read_channels` - View channels
- `app.list_channels` - List channels
- `app.read_logs` - View logs
- `app.manage_devices` - Manage devices
- `app.read_devices` - View devices
- `app.build_native` - Build native versions
- `app.read_audit` - View app audit
- `app.update_user_roles` - Manage user roles for this app

**Bundle permissions** (scope: 'bundle')
- `bundle.read` - Read bundle metadata
- `bundle.update` - Update a bundle
- `bundle.delete` - Delete a bundle

**Channel permissions** (scope: 'channel')
- `channel.read` - View a channel
- `channel.update_settings` - Update channel settings
- `channel.delete` - Delete a channel
- `channel.read_history` - View history
- `channel.promote_bundle` - Promote a bundle
- `channel.rollback_bundle` - Roll back a bundle
- `channel.manage_forced_devices` - Manage forced devices
- `channel.read_forced_devices` - View forced devices
- `channel.read_audit` - View channel audit

**Platform permissions** (scope: 'platform' - internal use only)
- `platform.impersonate_user` - Impersonate a user
- `platform.manage_orgs_any` - Manage any org
- `platform.manage_apps_any` - Manage any app
- `platform.manage_channels_any` - Manage any channel
- `platform.run_maintenance_jobs` - Run maintenance jobs
- `platform.delete_orphan_users` - Delete orphan users
- `platform.read_all_audit` - View all audit logs
- `platform.db_break_glass` - Break-glass DB access

#### `role_permissions` - Role to permission mapping
This table defines which permissions are granted to each role.

**Example for `org_admin`**:
- `org.read`, `org.update_settings`, `org.read_members`, `org.invite_user`
- All `app.*` permissions (read, update_settings, delete, upload_bundle, update_user_roles, etc.)
- All `channel.*` permissions (read, update_settings, delete, promote_bundle, etc.)
- All `bundle.*` permissions (delete)

**Example for `app_developer`**:
- `app.read`, `app.update_settings`, `app.upload_bundle`, `app.create_channel`
- `channel.read`, `channel.update_settings`, `channel.promote_bundle`
- `bundle.delete`

**Example for `app_uploader`**:
- `app.read`, `app.read_bundles`, `app.upload_bundle`, `app.read_channels`, `app.read_logs`, `app.read_devices`, `app.read_audit`

**Example for `org_member`**:
- `org.read`, `org.read_members`
- `app.read`, `app.list_bundles`, `app.list_channels`, `app.read_logs`, `app.read_devices`, `app.read_audit`
- `bundle.read`
- `channel.read`, `channel.read_history`, `channel.read_forced_devices`, `channel.read_audit`

**Example for `bundle_admin`**:
- `bundle.read`, `bundle.update`, `bundle.delete`

**Example for `bundle_reader`**:
- `bundle.read`

#### `role_bindings` - Assigning roles to users
```sql
CREATE TABLE role_bindings (
  id uuid PRIMARY KEY,
  principal_type text NOT NULL,  -- 'user' or 'group' or 'apikey'
  principal_id uuid NOT NULL,    -- user.id or group.id or apikey.rbac_id
  role_id uuid NOT NULL REFERENCES roles(id),
  org_id uuid REFERENCES orgs(id),
  app_id varchar REFERENCES apps(app_id),
  channel_id bigint REFERENCES channels(id)
);
```

**Examples**:
- User `uuid-123` has role `org_admin` in org `org-abc`
- User `uuid-123` has role `app_developer` on app `com.example.app`
- API key `key-789` has role `app_uploader` on app `com.example.app`

#### `role_hierarchy` - Role inheritance
Defines that a role can inherit permissions from other roles:
- `org_super_admin` inherits all roles (org_admin, org_billing_admin, org_member, all app_*)
- `org_admin` inherits all app_* roles and org_member
- `app_admin` inherits app_developer, app_uploader, app_reader

#### `groups` and `group_members` - User groups
Allows assigning roles to a group instead of individual users.

### 2. SQL Functions

#### `rbac_has_permission()` - Permission resolution
**Main function** that checks whether a principal (user/apikey) has a given permission:

```sql
rbac_has_permission(
  p_principal_type text,    -- 'user' or 'apikey'
  p_principal_id uuid,      -- user.id or apikey.rbac_id
  p_permission_key text,    -- 'app.upload_bundle'
  p_org_id uuid,
  p_app_id varchar,
  p_channel_id bigint
) RETURNS boolean
```

**Algorithm**:
1. **Collect role_bindings** for the principal in the requested scope
2. **Expand hierarchy**: add inherited roles via `role_hierarchy`
3. **Collect permissions** via `role_permissions` for all roles
4. **Check scope**: an `app.*` permission granted at org level applies to all apps in that org
5. Return `true` if the permission is found, `false` otherwise

**Scope awareness examples**:
- User has `org_admin` in org `A` -> can do all `app.*` actions on apps in org `A`
- User has `app_developer` on app `X` -> can do `app.upload_bundle` only on app `X`
- User has `app_uploader` in org `A` -> can upload to all apps in org `A` (if the binding is at org level)

#### `rbac_check_permission()` - Public entry point (authenticated)
**Convenience wrapper** that uses `auth.uid()` and delegates to the internal function:

```sql
rbac_check_permission(
  p_permission_key text,
  p_org_id uuid,
  p_app_id varchar,
  p_channel_id bigint
) RETURNS boolean
```

#### `rbac_check_permission_direct()` - Internal entry point (service_role only)
Used by backend/service_role to check permissions for arbitrary users or API keys.

```sql
rbac_check_permission_direct(
  p_permission_key text,
  p_user_id uuid,
  p_org_id uuid,
  p_app_id varchar,
  p_channel_id bigint,
  p_apikey text DEFAULT NULL
) RETURNS boolean
```

**Logic** (applies to the internal function and therefore the wrapper):
1. Derive `org_id` from `app_id` or `channel_id` if missing
2. Check the org `use_new_rbac` flag (via `rbac_is_enabled_for_org()`)
3. **If RBAC enabled**: call `rbac_has_permission()` directly
4. **If legacy**: map the permission to a `min_right` (via `rbac_permission_for_legacy()`) and call `check_min_rights_legacy()`

**Legacy mapping examples**:
- `app.upload_bundle` -> `min_right='upload'` + scope='app'
- `app.update_settings` -> `min_right='write'` + scope='app'
- `org.invite_user` -> `min_right='admin'` + scope='org'

---

## Frontend Integration

### Legacy system (still used) - `hasPermissionsInRole()`

**File**: [src/stores/organization.ts](src/stores/organization.ts)

The organization store exposes helpers to check roles:

```typescript
import { useOrganizationStore } from '~/stores/organization'

const orgStore = useOrganizationStore()

// Check if the user has one of the required roles
if (orgStore.hasPermissionsInRole('admin', ['org_admin', 'org_super_admin'], orgId)) {
  // Show admin UI
}

// Check at app level
if (orgStore.hasPermissionsInRole('write', ['app_developer', 'org_admin'], orgId, appId)) {
  // Allow editing
}
```

**Behavior**:
- If `use_new_rbac` is enabled: checks cached `role_bindings`
- If legacy: checks `org_users.user_right`

**Limitations**:
- Checks **role names**, not granular permissions
- Mapping logic duplicated between frontend and backend
- Cache can be stale (requires manual refresh)
- Not flexible: access changes require Vue code changes

### New system (recommended) - `hasPermission()`

**File**: [src/services/permissions.ts](src/services/permissions.ts)

The new service calls the backend directly to check permissions.

```typescript
import { hasPermission, hasAnyPermission, hasAllPermissions } from '~/services/permissions'

// Simple permission check
const canUpload = await hasPermission('app.upload_bundle', { appId: 'com.example.app' })
if (canUpload) {
  // Show upload button
}

// Check org permission
const canInvite = await hasPermission('org.invite_user', { orgId })
if (canInvite) {
  // Show invite button
}

// Check channel permission (backend auto-derives appId and orgId)
const canPromote = await hasPermission('channel.promote_bundle', { channelId: 123 })
if (canPromote) {
  // Allow promotion
}

// OR logic - at least one permission
const canAccessBilling = await hasAnyPermission(
  ['org.read_billing', 'org.update_billing'],
  { orgId }
)

// AND logic - all permissions
const canFullyManageApp = await hasAllPermissions(
  ['app.update_settings', 'app.delete', 'app.update_user_roles'],
  { appId }
)
```

**Implementation**:

```typescript
// src/services/permissions.ts
import { supabase } from '~/services/supabase'

export type Permission = // ... (same type as backend)

export interface PermissionScope {
  orgId?: string
  appId?: string
  channelId?: number
}

/**
 * Check if current user has permission
 * Calls backend RPC (single source of truth)
 */
export async function hasPermission(
  permission: Permission,
  scope: PermissionScope
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('rbac_check_permission', {
      p_permission_key: permission,
      p_org_id: scope.orgId || null,
      p_app_id: scope.appId || null,
      p_channel_id: scope.channelId || null,
    })

    if (error) {
      console.error('[hasPermission] RPC error:', error)
      return false
    }

    return data === true
  } catch (err) {
    console.error('[hasPermission] Exception:', err)
    return false
  }
}

export async function hasAnyPermission(
  permissions: Permission[],
  scope: PermissionScope
): Promise<boolean> {
  for (const perm of permissions) {
    if (await hasPermission(perm, scope))
      return true
  }
  return false
}

export async function hasAllPermissions(
  permissions: Permission[],
  scope: PermissionScope
): Promise<boolean> {
  for (const perm of permissions) {
    if (!(await hasPermission(perm, scope)))
      return false
  }
  return true
}

/**
 * Batch check for performance (multiple permissions at once)
 */
export async function checkPermissionsBatch(
  checks: Array<{ permission: Permission; scope: PermissionScope }>
): Promise<Record<Permission, boolean>> {
  const results: Record<string, boolean> = {}

  // Note: Could be optimized with a batch RPC, but currently sequential
  for (const check of checks) {
    results[check.permission] = await hasPermission(check.permission, check.scope)
  }

  return results
}
```

**Advantages**:
- **Single source of truth**: calls the backend directly
- **Auto-routing**: legacy/RBAC handled server-side (transparent)
- **Type-safe**: strict `Permission` type with autocomplete
- **Flexible**: permission changes in DB, no frontend deploy
- **Always up to date**: no stale cache
- **Audit**: all checks logged server-side

**Disadvantages**:
- Async (requires `await`)
- Network overhead (negligible in practice)

### Usage in Vue components

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { hasPermission } from '~/services/permissions'

const props = defineProps<{
  appId: string
}>()

const canUpload = ref(false)
const canDeleteApp = ref(false)

onMounted(async () => {
  canUpload.value = await hasPermission('app.upload_bundle', { appId: props.appId })
  canDeleteApp.value = await hasPermission('app.delete', { appId: props.appId })
})
</script>

<template>
  <div>
    <button v-if="canUpload" @click="uploadBundle">
      Upload Bundle
    </button>

    <button v-if="canDeleteApp" @click="deleteApp" class="btn-danger">
      Delete App
    </button>
  </div>
</template>
```

**Recommended pattern: computed with cache**:

```vue
<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue'
import { hasPermission } from '~/services/permissions'

const props = defineProps<{ appId: string }>()

// Cache results
const permissions = ref<Record<string, boolean>>({})

watchEffect(async () => {
  permissions.value = {
    canUpload: await hasPermission('app.upload_bundle', { appId: props.appId }),
    canUpdate: await hasPermission('app.update_settings', { appId: props.appId }),
    canDelete: await hasPermission('app.delete', { appId: props.appId }),
  }
})

const canUpload = computed(() => permissions.value.canUpload)
const canUpdate = computed(() => permissions.value.canUpdate)
const canDelete = computed(() => permissions.value.canDelete)
</script>

<template>
  <div>
    <button v-if="canUpload">Upload</button>
    <button v-if="canUpdate">Update Settings</button>
    <button v-if="canDelete">Delete</button>
  </div>
</template>
```

### Reusable composable

```typescript
// src/composables/usePermissions.ts
import { ref, watch } from 'vue'
import { hasPermission, type Permission, type PermissionScope } from '~/services/permissions'

export function usePermissions(
  permissionsToCheck: Permission[],
  scope: PermissionScope
) {
  const permissions = ref<Record<Permission, boolean>>({})
  const loading = ref(true)

  async function checkAll() {
    loading.value = true
    const results: Record<string, boolean> = {}

    for (const perm of permissionsToCheck) {
      results[perm] = await hasPermission(perm, scope)
    }

    permissions.value = results
    loading.value = false
  }

  // Re-check when scope changes
  watch(() => scope, checkAll, { immediate: true, deep: true })

  return {
    permissions,
    loading,
    has: (perm: Permission) => permissions.value[perm] || false,
    refresh: checkAll,
  }
}
```

**Usage**:

```vue
<script setup lang="ts">
import { usePermissions } from '~/composables/usePermissions'

const props = defineProps<{ appId: string }>()

const { permissions, loading, has } = usePermissions(
  ['app.upload_bundle', 'app.update_settings', 'app.delete'],
  { appId: props.appId }
)
</script>

<template>
  <div v-if="!loading">
    <button v-if="has('app.upload_bundle')">Upload</button>
    <button v-if="has('app.update_settings')">Settings</button>
    <button v-if="has('app.delete')">Delete</button>
  </div>
  <div v-else>
    Loading permissions...
  </div>
</template>
```

## Current mapping: Roles -> Permissions

To ease migration, here is the mapping between current role checks and equivalent permissions:

### Organization-level checks
| Current check | Equivalent permission | Notes |
|-------------|-----------------------|-------|
| `hasPermissionsInRole('admin', ['org_admin', 'org_super_admin'])` | `hasPermission('org.update_settings')` | Update org settings |
| `hasPermissionsInRole('admin', ['org_super_admin'])` | `hasPermission('org.update_user_roles')` | Manage member roles |
| `hasPermissionsInRole('admin', ['org_admin', 'org_billing_admin'])` | `hasPermission('org.read_billing')` | Billing access |

### App-level checks
| Current check | Equivalent permission | Notes |
|-------------|-----------------------|-------|
| `hasPermissionsInRole('write', ['app_developer', 'org_admin'])` | `hasPermission('app.update_settings')` | Update app settings |
| `hasPermissionsInRole('upload', ['app_uploader', 'app_developer'])` | `hasPermission('app.upload_bundle')` | Upload bundles |
| `hasPermissionsInRole('admin', ['org_super_admin'])` | `hasPermission('app.delete')` | Delete app |
| `hasPermissionsInRole('admin', ['app_admin', 'org_admin'])` | `hasPermission('app.update_user_roles')` | Manage app access |

### Channel-level checks
| Current check | Equivalent permission | Notes |
|-------------|-----------------------|-------|
| `hasPermissionsInRole('write', ['app_developer', 'org_admin'])` | `hasPermission('channel.update_settings')` | Update channel |
| `hasPermissionsInRole('upload', ['app_uploader'])` | `hasPermission('channel.promote_bundle')` | Promote bundle |

### Bundle operations
| Current check | Equivalent permission | Notes |
|-------------|-----------------------|-------|
| `hasPermissionsInRole('admin', ['org_admin', 'org_super_admin'])` | `hasPermission('bundle.delete')` | Delete bundle |

---

## Debugging and Troubleshooting

### Common SQL checks

#### 1. Check if RBAC is enabled for an org

```sql
SELECT rbac_is_enabled_for_org('org-uid');
-- true if RBAC enabled, false if legacy
```

#### 2. View all role_bindings for a user

```sql
SELECT
  rb.id,
  rb.principal_type,
  r.name as role_name,
  r.scope_type,
  rb.scope_type as binding_scope,
  o.name as org_name,
  a.app_id as app_id,
  c.name as channel_name,
  rb.granted_at,
  u.email as granted_by_email
FROM role_bindings rb
JOIN roles r ON rb.role_id = r.id
LEFT JOIN orgs o ON rb.org_id = o.id
LEFT JOIN apps a ON rb.app_id = a.id
LEFT JOIN channels c ON rb.channel_id = c.rbac_id
LEFT JOIN users u ON rb.granted_by = u.id
WHERE rb.principal_type = 'user'
  AND rb.principal_id = 'user-uuid'::uuid
ORDER BY rb.granted_at DESC;
```

#### 3. View all permissions for a role

```sql
SELECT
  r.name as role_name,
  r.scope_type as role_scope,
  p.key as permission_key,
  p.scope_type as permission_scope,
  p.description
FROM role_permissions rp
JOIN roles r ON rp.role_id = r.id
JOIN permissions p ON rp.permission_id = p.id
WHERE r.name = 'org_admin'
ORDER BY p.key;
```

#### 4. View role hierarchy for a role

```sql
-- Roles inherited by org_admin
WITH RECURSIVE role_tree AS (
  -- Starting role
  SELECT
    id,
    name,
    scope_type,
    0 as depth
  FROM roles
  WHERE name = 'org_admin'

  UNION ALL

  -- Child roles (recursive)
  SELECT
    r.id,
    r.name,
    r.scope_type,
    rt.depth + 1
  FROM roles r
  JOIN role_hierarchy rh ON r.id = rh.child_role_id
  JOIN role_tree rt ON rh.parent_role_id = rt.id
)
SELECT
  REPEAT('  ', depth) || name as role_hierarchy,
  scope_type,
  depth
FROM role_tree
ORDER BY depth, name;
```

#### 5. Manually test a permission

```sql
-- Check if the authenticated user can upload to an app
SELECT rbac_check_permission(
  'app.upload_bundle',              -- permission
  NULL::uuid,                       -- org_id (derived from app_id)
  'com.example.app',                -- app_id
  NULL::bigint                      -- channel_id
) as has_permission;

-- Check if an API key can promote on a channel
SELECT rbac_check_permission_direct(
  'channel.promote_bundle',
  NULL::uuid,                       -- user_id (NULL for API key)
  NULL::uuid,
  NULL,
  123,                              -- channel_id
  'cap_1234567890abcdef'            -- apikey
) as has_permission;
```

#### 6. View all org members with their roles

```sql
SELECT
  u.email,
  u.id as user_id,
  r.name as role_name,
  rb.scope_type,
  CASE rb.scope_type
    WHEN 'org' THEN o.name
    WHEN 'app' THEN a.app_id
    WHEN 'channel' THEN c.name
    ELSE 'N/A'
  END as scope_name,
  rb.granted_at,
  granted_by_user.email as granted_by
FROM role_bindings rb
JOIN roles r ON rb.role_id = r.id
JOIN users u ON rb.principal_id = u.id
LEFT JOIN orgs o ON rb.org_id = o.id
LEFT JOIN apps a ON rb.app_id = a.id
LEFT JOIN channels c ON rb.channel_id = c.rbac_id
LEFT JOIN users granted_by_user ON rb.granted_by = granted_by_user.id
WHERE rb.principal_type = 'user'
  AND rb.org_id = 'org-uuid'::uuid
ORDER BY u.email, rb.granted_at DESC;
```

#### 7. Audit who granted which roles

```sql
SELECT
  granted_by_user.email as granter,
  recipient_user.email as recipient,
  r.name as role_granted,
  rb.scope_type,
  rb.granted_at,
  rb.reason
FROM role_bindings rb
JOIN roles r ON rb.role_id = r.id
JOIN users granted_by_user ON rb.granted_by = granted_by_user.id
JOIN users recipient_user ON rb.principal_id = recipient_user.id
WHERE rb.org_id = 'org-uuid'::uuid
  AND rb.granted_at > NOW() - INTERVAL '30 days'
ORDER BY rb.granted_at DESC;
```

#### 8. Find missing permissions for a role

```sql
-- Permissions that org_member should have but does not
SELECT DISTINCT p.key, p.description
FROM permissions p
WHERE p.scope_type IN ('org', 'app', 'channel')
  AND p.key LIKE 'app.read%'
  AND p.id NOT IN (
    SELECT permission_id
    FROM role_permissions rp
    JOIN roles r ON rp.role_id = r.id
    WHERE r.name = 'org_member'
  )
ORDER BY p.key;
```

### Backend logs

#### Search in CloudFlare/Supabase logs

**Search patterns**:
```
rbac_check: app.upload_bundle GRANTED
rbac_check: app.upload_bundle DENIED
RBAC_CHECK_PERM_DIRECT
RBAC_CHECK_PERM_NO_KEY
rbac_has_permission: checking permission
```

**Log example**:
```json
{
  "requestId": "req_abc123",
  "message": "rbac_check: app.upload_bundle GRANTED",
  "userId": "user-uuid",
  "orgId": "org-uuid",
  "appId": "com.example.app",
  "timestamp": "2026-01-08T10:30:00Z"
}
```

#### Enable verbose debug (local development)

```typescript
// supabase/functions/_backend/utils/rbac.ts

// Uncomment these lines for verbose debug:
cloudlog({
  requestId,
  message: `rbac_has_permission: checking ${permission}`,
  principal: { type: principalType, id: principalId },
  scope: { orgId, appId, channelId },
  raw_result: result,
})
```

### Frontend debugging

#### Enable console logs

```typescript
// Enable logs in the console
const allowed = await hasPermission('app.upload_bundle', { appId })
// Search in console: [hasPermission] RPC error
```

## Best Practices

### Backend

#### Always use `checkPermission()` instead of `check_min_rights_legacy()`

**Bad**:
```typescript
const allowed = await check_min_rights_legacy('upload', userId, orgId, appId)
```

**Good**:
```typescript
const allowed = await checkPermission(c, 'app.upload_bundle', { appId })
```

**Reason**: automatic legacy/RBAC routing, structured logs, type safety

#### Specify the most precise permission possible

**Less good**:
```typescript
// Too broad
await checkPermission(c, 'app.update_settings', { appId })
```

**Better**:
```typescript
// Precise per action
await checkPermission(c, 'app.upload_bundle', { appId })
await checkPermission(c, 'channel.promote_bundle', { channelId })
await checkPermission(c, 'bundle.delete', { appId, bundleId })
```

**Reason**: finer access control, easier audits

#### Log permission denials for audit

```typescript
const allowed = await checkPermission(c, 'app.delete', { appId })
if (!allowed) {
  cloudlog({
    requestId: c.get('requestId'),
    level: 'warn',
    message: `Permission denied: app.delete`,
    userId: c.get('auth')?.userId,
    appId,
    action: 'delete_app_denied',
  })
  return simpleError('access_denied', 'You cannot delete this app')
}
```

**Reason**: helps detect unauthorized access attempts, security audit

#### Use `requirePermission()` for critical endpoints

```typescript
// Auto-throw 403 if permission denied
app.delete('/app/:appId', middlewareAuth, async (c) => {
  const appId = c.req.param('appId')

  await requirePermission(c, 'app.delete', { appId })

  // ... deletion logic
  // No manual check needed
})
```

**Reason**: cleaner code, consistent error handling

#### Check permissions at the right granularity

```typescript
// If the action is on a channel, check at channel level
await checkPermission(c, 'channel.promote_bundle', { channelId })

// Not at app level (too broad)
await checkPermission(c, 'app.upload_bundle', { appId }) // BAD
```

**Reason**: respects least privilege

#### Do not hide permission errors

**Bad**:
```typescript
const allowed = await checkPermission(c, 'app.upload_bundle', { appId })
if (!allowed) {
  // Generic error
  return c.json({ error: 'Something went wrong' }, 500)
}
```

**Good**:
```typescript
const allowed = await checkPermission(c, 'app.upload_bundle', { appId })
if (!allowed) {
  // Clear message
  return c.json({
    error: 'access_denied',
    message: 'You do not have permission to upload bundles to this app',
    required_permission: 'app.upload_bundle',
  }, 403)
}
```

**Reason**: easier debugging for developers, clear for users

### Frontend

#### Use `hasPermission()` for new checks

**Legacy (avoid)**:
```typescript
if (orgStore.hasPermissionsInRole('admin', ['org_admin', 'org_super_admin'], orgId)) {
  // Show UI
}
```

**Recommended**:
```typescript
if (await hasPermission('org.update_settings', { orgId })) {
  // Show UI
}
```

**Reason**: single source of truth (backend), type safety, flexibility

#### Hide inaccessible UI instead of disabling

**Less good**:
```vue
<button :disabled="!canUpload" @click="upload">
  Upload Bundle
</button>
```

**Better**:
```vue
<button v-if="canUpload" @click="upload">
  Upload Bundle
</button>
```

**Reason**: better UX, less attack surface

#### Re-check permission right before the action (not only at mount)

```typescript
async function uploadBundle() {
  // Re-check before critical action
  if (!(await hasPermission('app.upload_bundle', { appId }))) {
    showToast('You no longer have permission to upload', 'error')
    return
  }

  // ... upload logic
}
```

**Reason**: permissions can change (revoked by admin), avoids race conditions

#### Use a composable for repeated checks

```typescript
// Reusable composable
const { permissions, loading, has } = usePermissions(
  ['app.upload_bundle', 'app.update_settings', 'app.delete'],
  { appId }
)

// Simple usage in template
<button v-if="has('app.upload_bundle')">Upload</button>
```

**Reason**: DRY, performance (batch checks), readability

#### Do not hide errors: inform the user clearly

**Bad**:
```typescript
async function deleteApp() {
  if (!(await hasPermission('app.delete', { appId }))) {
    // Silent fail
    return
  }
  // ...
}
```

**Good**:
```typescript
async function deleteApp() {
  if (!(await hasPermission('app.delete', { appId }))) {
    showToast('You do not have permission to delete this app', 'error')
    return
  }
  // ...
}
```

**Reason**: transparency for users, helps explain why the action failed

#### Preload permissions on mount to avoid flicker

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'

const canUpload = ref(false)
const loading = ref(true)

onMounted(async () => {
  canUpload.value = await hasPermission('app.upload_bundle', { appId })
  loading.value = false
})
</script>

<template>
  <div v-if="!loading">
    <button v-if="canUpload">Upload</button>
  </div>
  <div v-else>
    <Spinner />
  </div>
</template>
```

**Reason**: avoids content flash (CLS), better UX

### Database
- Always create a new migration for permission changes
- Never modify `role_permissions` directly in production
- Test permission changes in dev environment first
- Document the reasons for permission changes in migrations

## References

### Key files

| File | Description |
|---------|-------------|
| [supabase/migrations/20251222140030_rbac_system.sql](supabase/migrations/20251222140030_rbac_system.sql) | RBAC schema + permission checks (includes public wrapper + grants) |
| [supabase/functions/_backend/utils/rbac.ts](supabase/functions/_backend/utils/rbac.ts) | TypeScript backend wrapper |
| [src/services/permissions.ts](src/services/permissions.ts) | Frontend permissions service |
| [src/stores/organization.ts](src/stores/organization.ts) | Organization store (legacy `hasPermissionsInRole`) |

### Related migrations

- `20251222140030_rbac_system.sql` - Complete RBAC system (including public wrapper + grant restrictions)

### External documentation

- [RBAC Wikipedia](https://en.wikipedia.org/wiki/Role-based_access_control)
- [NIST RBAC Model](https://csrc.nist.gov/projects/role-based-access-control)
- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

---
