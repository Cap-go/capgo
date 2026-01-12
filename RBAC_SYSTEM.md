# Système RBAC Capgo - Documentation Technique Complète

Ce document explique en détail le système de permissions RBAC (Role-Based Access Control) de Capgo, permettant un contrôle d'accès granulaire aux ressources de la plateforme.

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture du système](#architecture-du-système)
3. [Tables de la base de données](#tables-de-la-base-de-données)
4. [Rôles disponibles](#rôles-disponibles)
5. [Permissions disponibles](#permissions-disponibles)
6. [Fonctions SQL](#fonctions-sql)
7. [Intégration backend](#intégration-backend)
8. [Intégration frontend](#intégration-frontend)
9. [Debugging et troubleshooting](#debugging-et-troubleshooting)
10. [Bonnes pratiques](#bonnes-pratiques)

---

## Vue d'ensemble

Capgo utilise un système **hybride** qui supporte deux modes de gestion des permissions :

### Système Legacy (ancien)
- **Table principale** : `org_users`
- **Rôles simples** : `super_admin`, `admin`, `write`, `upload`, `read`
- **Limitation** : un seul rôle par utilisateur par organisation
- **Granularité** : limitée, pas de contrôle au niveau app/channel individuel

### Système RBAC (nouveau)
- **Tables principales** : `roles`, `permissions`, `role_bindings`, `role_permissions`
- **Rôles multiples** : un utilisateur peut avoir plusieurs rôles à différents scopes
- **Granularité fine** : permissions au niveau org, app, channel, et bundle
- **Flexibilité** : ajout/modification de permissions sans changement de code

### Basculement automatique

Le système bascule automatiquement entre legacy et RBAC via :
- **Flag au niveau org** : colonne `use_new_rbac` dans la table `orgs`
- **Flag global** : table `rbac_settings` (singleton) pour activer RBAC pour toutes les orgs
- **Auto-détection** : la fonction `rbac_is_enabled_for_org()` vérifie les deux flags

```sql
-- L'org utilise RBAC si :
-- 1. orgs.use_new_rbac = true OU
-- 2. rbac_settings.use_new_rbac = true
SELECT rbac_is_enabled_for_org('org-uuid');
```

---

## Architecture du système

Le système RBAC de Capgo suit le modèle standard RBAC avec des extensions pour le multi-scope :

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Principal  │────▶│ Role Binding │────▶│     Role     │
│ (User/API)  │     │  (au scope)  │     │              │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                                 │
                                          ┌──────▼────────┐
                                          │ Role Perms    │
                                          └──────┬────────┘
                                                 │
                                          ┌──────▼────────┐
                                          │  Permission   │
                                          └───────────────┘
```

### Concepts clés

1. **Principal** : L'entité qui effectue l'action
   - User (utilisateur authentifié)
   - API Key (clé API)
   - Group (groupe d'utilisateurs)

2. **Role** : Ensemble cohérent de permissions
   - Exemple : `org_admin`, `app_developer`, `app_uploader`
   - Défini pour un scope spécifique (platform, org, app, channel, bundle)

3. **Permission** : Action atomique autorisée
   - Exemple : `app.upload_bundle`, `channel.promote_bundle`
   - Granularité fine pour un contrôle précis

4. **Role Binding** : Attribution d'un rôle à un principal dans un scope
   - Exemple : User X a le rôle `app_developer` sur l'app Y
   - Un principal peut avoir plusieurs bindings à différents scopes

5. **Scope** : Niveau de la hiérarchie où s'applique le binding
   - `platform` : Toute la plateforme (admins Capgo uniquement)
   - `org` : Organisation (s'applique à toutes les apps de l'org)
   - `app` : Application spécifique
   - `channel` : Channel spécifique
   - `bundle` : Bundle spécifique

### Hiérarchie des scopes

Les permissions se propagent vers le bas dans la hiérarchie :

```
Platform (global)
    │
    └─▶ Organization
            │
            └─▶ Application
                    │
                    ├─▶ Channel
                    │
                    └─▶ Bundle
```

**Exemple de propagation** :
- User avec `org_admin` au niveau org → accès à toutes les apps de cette org
- User avec `app_developer` au niveau app → accès à tous les channels de cette app
- User avec `channel_admin` au niveau channel → accès seulement à ce channel

---

## Tables de la base de données

### 1. `roles` - Définition des rôles

Stocke tous les rôles disponibles dans le système.

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

**Colonnes importantes** :
- `name` : Nom unique du rôle (ex: `org_admin`)
- `scope_type` : Niveau natif du rôle (où il peut être assigné)
- `priority_rank` : Ordre de priorité (plus élevé = plus de permissions)
- `is_assignable` : Si `false`, ne peut pas être assigné aux clients (usage interne)

**Index** :
- Primary key sur `id`
- Unique sur `name`

### 2. `permissions` - Actions atomiques

Définit toutes les permissions disponibles.

```sql
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('platform', 'org', 'app', 'channel')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Colonnes importantes** :
- `key` : Identifiant unique de la permission (ex: `app.upload_bundle`)
- `scope_type` : Scope minimal requis pour cette permission
- `description` : Explication de l'action autorisée

**Convention de nommage** : `{scope}.{action}`
- Exemples : `org.read`, `app.update_settings`, `channel.promote_bundle`

### 3. `role_permissions` - Mapping rôle → permissions

Table de liaison entre rôles et permissions.

```sql
CREATE TABLE public.role_permissions (
  role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
```

**Utilisation** :
- Définit quelles permissions sont accordées à chaque rôle
- Un rôle peut avoir plusieurs permissions
- Une permission peut appartenir à plusieurs rôles

### 4. `role_bindings` - Attribution des rôles

Assigne des rôles aux principals dans des scopes spécifiques.

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

**Colonnes importantes** :
- `principal_type` / `principal_id` : Qui reçoit le rôle (user, group, apikey)
- `role_id` : Quel rôle est assigné
- `scope_type` : À quel niveau (org, app, channel, etc.)
- `org_id` / `app_id` / `channel_id` / `bundle_id` : Identifiants du scope
- `granted_by` : Qui a accordé ce rôle (audit)
- `expires_at` : Date d'expiration optionnelle
- `is_direct` : Si `true`, assigné manuellement; si `false`, hérité

**Contraintes d'intégrité** :
- **SSD (Static Separation of Duty)** : Un principal ne peut avoir qu'un seul rôle par scope
  - Exemple : User X ne peut pas être à la fois `org_admin` ET `org_member` dans la même org
  - Implémenté via index uniques sur `(principal_type, principal_id, scope_type, {scope_id})`

**Index** :
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

### 5. `role_hierarchy` - Héritage entre rôles

Définit les relations parent-enfant entre rôles.

```sql
CREATE TABLE public.role_hierarchy (
  parent_role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
  child_role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_role_id, child_role_id),
  CHECK (parent_role_id IS DISTINCT FROM child_role_id)
);
```

**Utilisation** :
- Un rôle parent hérite automatiquement de toutes les permissions de ses enfants
- Permet de simplifier la gestion : `org_admin` hérite de tous les rôles app_*

**Exemples d'héritage** :
```
org_super_admin ──▶ org_admin ──▶ app_admin ──▶ app_developer ──▶ app_uploader ──▶ app_reader
                                       │
                                       ├──▶ bundle_admin ──▶ bundle_reader
                                       │
                                       └──▶ channel_admin ──▶ channel_reader
```

### 6. `groups` - Groupes d'utilisateurs

Permet de regrouper des utilisateurs pour une gestion simplifiée.

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

**Utilisation** :
- Créer des groupes au niveau org (ex: "Équipe Backend", "Admins")
- Assigner un rôle au groupe au lieu d'utilisateurs individuels
- Tous les membres du groupe héritent automatiquement du rôle

### 7. `group_members` - Membres des groupes

```sql
CREATE TABLE public.group_members (
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
```

### 8. `rbac_settings` - Configuration globale

Table singleton pour activer RBAC globalement.

```sql
CREATE TABLE public.rbac_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  use_new_rbac boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Utilisation** :
- Une seule ligne avec `id = 1`
- Si `use_new_rbac = true`, RBAC activé pour TOUTES les orgs (sauf si override au niveau org)

### 9. Tables auxiliaires

#### `orgs.use_new_rbac`
```sql
ALTER TABLE public.orgs
ADD COLUMN use_new_rbac boolean NOT NULL DEFAULT false;
```
- Flag au niveau org pour activer RBAC pour une org spécifique

#### `apikeys.rbac_id`
```sql
ALTER TABLE public.apikeys
ADD COLUMN rbac_id uuid DEFAULT gen_random_uuid() UNIQUE NOT NULL;
```
- UUID stable pour référencer les API keys dans `role_bindings`

#### `channels.rbac_id`
```sql
ALTER TABLE public.channels
ADD COLUMN rbac_id uuid DEFAULT gen_random_uuid() UNIQUE NOT NULL;
```
- UUID stable pour référencer les channels dans `role_bindings`

#### `apps.id` (constraint ajoutée)
```sql
ALTER TABLE public.apps
ADD CONSTRAINT apps_id_unique UNIQUE (id);
```
- `apps.id` était déjà présent mais pas unique; contrainte ajoutée pour RBAC

---

## Rôles disponibles

---

## Rôles disponibles

Le système définit 13 rôles prédéfinis couvrant tous les niveaux de la hiérarchie.

### Rôles Platform (usage interne uniquement)

#### `platform_super_admin`
- **Scope** : `platform`
- **Assignable** : ❌ Non (équipe Capgo uniquement)
- **Priority rank** : 100
- **Permissions** : TOUTES les permissions de la plateforme
- **Usage** : Admins Capgo pour maintenance, support, opérations d'urgence

### Rôles Organization

#### `org_super_admin`
- **Scope** : `org`
- **Assignable** : ✅ Oui
- **Priority rank** : 95
- **Permissions** :
  - **Org** : read, update_settings, read_members, invite_user, update_user_roles, read_billing, **update_billing**, read_invoices, read_audit, read_billing_audit
  - **App** : read, update_settings, **delete**, read_bundles, upload_bundle, create_channel, read_channels, read_logs, manage_devices, read_devices, build_native, read_audit, update_user_roles
  - **Channel** : read, update_settings, **delete**, read_history, promote_bundle, rollback_bundle, manage_forced_devices, read_forced_devices, read_audit
  - **Bundle** : **delete**
- **Usage** : Propriétaire de l'organisation, accès total incluant facturation et suppressions
- **Différence avec org_admin** : Peut modifier la facturation et supprimer apps/channels

#### `org_admin`
- **Scope** : `org`
- **Assignable** : ✅ Oui
- **Priority rank** : 90
- **Permissions** :
  - **Org** : read, update_settings, read_members, invite_user, update_user_roles, read_billing, read_invoices, read_audit, read_billing_audit
  - **App** : read, update_settings, read_bundles, upload_bundle, create_channel, read_channels, read_logs, manage_devices, read_devices, build_native, read_audit, update_user_roles
  - **Channel** : read, update_settings, read_history, promote_bundle, rollback_bundle, manage_forced_devices, read_forced_devices, read_audit
- **Usage** : Administrateur de l'organisation, gestion complète sauf facturation et suppressions
- **Limitations** : Ne peut pas modifier la facturation ni supprimer apps/channels

#### `org_billing_admin`
- **Scope** : `org`
- **Assignable** : ✅ Oui
- **Priority rank** : 80
- **Permissions** :
  - **Org** : read, read_billing, **update_billing**, read_invoices, read_billing_audit
- **Usage** : Accès limité à la facturation uniquement (comptabilité, finance)
- **Cas d'usage** : Équipe finance qui doit gérer les paiements sans accès aux apps

#### `org_member`
- **Scope** : `org`
- **Assignable** : ✅ Oui
- **Priority rank** : 75
- **Permissions** :
  - **Org** : read, read_members
  - **App** : read, list_bundles, list_channels, read_logs, read_devices, read_audit
  - **Channel** : read, read_history, read_forced_devices, read_audit
  - **Bundle** : read
- **Usage** : Membre de base, lecture seule sur toute l'org
- **Cas d'usage** : Observateurs, stakeholders, QA avec visibilité mais sans pouvoir de modification

### Rôles Application

#### `app_admin`
- **Scope** : `app`
- **Assignable** : ✅ Oui
- **Priority rank** : 70
- **Permissions** :
  - **App** : read, update_settings, read_bundles, upload_bundle, create_channel, read_channels, read_logs, manage_devices, read_devices, build_native, read_audit, update_user_roles
  - **Channel** : read, update_settings, **delete**, read_history, promote_bundle, rollback_bundle, manage_forced_devices, read_forced_devices, read_audit
  - **Bundle** : **delete**
- **Usage** : Admin complet d'une app spécifique (peut supprimer channels)
- **Héritage** : Hérite de app_developer, app_uploader, app_reader, bundle_admin, channel_admin

#### `app_developer`
- **Scope** : `app`
- **Assignable** : ✅ Oui
- **Priority rank** : 68
- **Permissions** :
  - **App** : read, read_bundles, upload_bundle, read_channels, read_logs, manage_devices, read_devices, build_native, read_audit
  - **Channel** : read, update_settings, read_history, promote_bundle, rollback_bundle, manage_forced_devices, read_forced_devices, read_audit
- **Usage** : Développeur avec accès complet sauf suppressions
- **Limitations** : Ne peut pas créer de nouveaux channels ni supprimer channels/bundles
- **Héritage** : Hérite de app_uploader, app_reader

#### `app_uploader`
- **Scope** : `app`
- **Assignable** : ✅ Oui
- **Priority rank** : 66
- **Permissions** :
  - **App** : read, read_bundles, upload_bundle, read_channels, read_logs, read_devices, read_audit
- **Usage** : CI/CD, upload de bundles uniquement
- **Cas d'usage** : Clés API pour pipelines d'intégration continue
- **Héritage** : Hérite de app_reader

#### `app_reader`
- **Scope** : `app`
- **Assignable** : ✅ Oui
- **Priority rank** : 65
- **Permissions** :
  - **App** : read, read_bundles, read_channels, read_logs, read_devices, read_audit
- **Usage** : Lecture seule sur une app spécifique
- **Cas d'usage** : Auditeurs, stakeholders externes

### Rôles Channel

#### `channel_admin`
- **Scope** : `channel`
- **Assignable** : ✅ Oui
- **Priority rank** : 60
- **Permissions** :
  - **Channel** : read, update_settings, **delete**, read_history, promote_bundle, rollback_bundle, manage_forced_devices, read_forced_devices, read_audit
- **Usage** : Admin complet d'un channel spécifique
- **Héritage** : Hérite de channel_reader

#### `channel_reader`
- **Scope** : `channel`
- **Assignable** : ✅ Oui
- **Priority rank** : 55
- **Permissions** :
  - **Channel** : read, read_history, read_forced_devices, read_audit
- **Usage** : Lecture seule sur un channel spécifique

### Rôles Bundle

#### `bundle_admin`
- **Scope** : `bundle`
- **Assignable** : ✅ Oui
- **Priority rank** : 62
- **Permissions** :
  - **Bundle** : read, update, **delete**
- **Usage** : Gestion complète d'un bundle spécifique
- **Héritage** : Hérite de bundle_reader

#### `bundle_reader`
- **Scope** : `bundle`
- **Assignable** : ✅ Oui
- **Priority rank** : 61
- **Permissions** :
  - **Bundle** : read
- **Usage** : Lecture seule sur un bundle spécifique

### Hiérarchie complète des rôles

```
platform_super_admin (platform, rank 100)
    │
    └─▶ TOUTES les permissions

org_super_admin (org, rank 95)
    │
    └─▶ org_admin (org, rank 90)
            │
            ├─▶ app_admin (app, rank 70)
            │       │
            │       ├─▶ app_developer (app, rank 68)
            │       │       │
            │       │       └─▶ app_uploader (app, rank 66)
            │       │               │
            │       │               └─▶ app_reader (app, rank 65)
            │       │
            │       ├─▶ bundle_admin (bundle, rank 62)
            │       │       │
            │       │       └─▶ bundle_reader (bundle, rank 61)
            │       │
            │       └─▶ channel_admin (channel, rank 60)
            │               │
            │               └─▶ channel_reader (channel, rank 55)
            │
            └─▶ org_member (org, rank 75)

org_billing_admin (org, rank 80) [pas d'héritage]
```

---

## Permissions disponibles

Le système définit **40+ permissions atomiques** organisées par scope.

### Permissions Organization (scope: `org`)

| Permission | Description | Rôles ayant cette permission |
|-----------|-------------|------------------------------|
| `org.read` | Voir les infos de l'organisation | org_super_admin, org_admin, org_billing_admin, org_member |
| `org.update_settings` | Modifier les paramètres org | org_super_admin, org_admin |
| `org.read_members` | Voir la liste des membres | org_super_admin, org_admin, org_member |
| `org.invite_user` | Inviter des membres | org_super_admin, org_admin |
| `org.update_user_roles` | Gérer les rôles des membres | org_super_admin, org_admin |
| `org.read_billing` | Voir les infos de facturation | org_super_admin, org_admin, org_billing_admin |
| `org.update_billing` | Modifier la facturation | org_super_admin, org_billing_admin |
| `org.read_invoices` | Voir les factures | org_super_admin, org_admin, org_billing_admin |
| `org.read_audit` | Voir les logs d'audit org | org_super_admin, org_admin |
| `org.read_billing_audit` | Voir l'audit facturation | org_super_admin, org_admin, org_billing_admin |

### Permissions Application (scope: `app`)

| Permission | Description | Rôles ayant cette permission |
|-----------|-------------|------------------------------|
| `app.read` | Voir les infos de l'app | Tous les rôles app_*, org_admin, org_super_admin, org_member |
| `app.update_settings` | Modifier les paramètres app | app_admin, org_admin, org_super_admin |
| `app.delete` | Supprimer l'app | org_super_admin uniquement |
| `app.read_bundles` | Voir les métadonnées bundles | app_admin, app_developer, app_uploader, app_reader, org_admin, org_super_admin |
| `app.list_bundles` | Lister les bundles | org_member |
| `app.upload_bundle` | Uploader des bundles | app_admin, app_developer, app_uploader, org_admin, org_super_admin |
| `app.create_channel` | Créer des channels | app_admin, org_admin, org_super_admin |
| `app.read_channels` | Voir les channels | app_admin, app_developer, app_uploader, app_reader, org_admin, org_super_admin |
| `app.list_channels` | Lister les channels | org_member |
| `app.read_logs` | Voir les logs | app_admin, app_developer, app_uploader, app_reader, org_admin, org_super_admin, org_member |
| `app.manage_devices` | Gérer les devices | app_admin, app_developer, org_admin, org_super_admin |
| `app.read_devices` | Voir les devices | Tous les rôles app_*, org_admin, org_super_admin, org_member |
| `app.build_native` | Builder des versions natives | app_admin, app_developer, org_admin, org_super_admin |
| `app.read_audit` | Voir l'audit app | Tous les rôles app_*, org_admin, org_super_admin, org_member |
| `app.update_user_roles` | Gérer les rôles users pour cette app | app_admin, org_admin, org_super_admin |

### Permissions Bundle (scope: `app`)

**Note** : Les permissions bundle ont un scope `app` car elles requièrent le contexte de l'app.

| Permission | Description | Rôles ayant cette permission |
|-----------|-------------|------------------------------|
| `bundle.read` | Lire les métadonnées bundle | bundle_admin, bundle_reader, org_member |
| `bundle.update` | Modifier un bundle | bundle_admin |
| `bundle.delete` | Supprimer un bundle | bundle_admin, app_admin, org_admin, org_super_admin |

### Permissions Channel (scope: `channel`)

| Permission | Description | Rôles ayant cette permission |
|-----------|-------------|------------------------------|
| `channel.read` | Voir un channel | Tous les rôles channel_*, app_admin, app_developer, org_admin, org_super_admin, org_member |
| `channel.update_settings` | Modifier les paramètres channel | channel_admin, app_admin, app_developer, org_admin, org_super_admin |
| `channel.delete` | Supprimer un channel | channel_admin, app_admin, org_admin, org_super_admin |
| `channel.read_history` | Voir l'historique de déploiement | Tous les rôles channel_*, app_admin, app_developer, org_admin, org_super_admin, org_member |
| `channel.promote_bundle` | Promouvoir un bundle | channel_admin, app_admin, app_developer, org_admin, org_super_admin |
| `channel.rollback_bundle` | Rollback un bundle | channel_admin, app_admin, app_developer, org_admin, org_super_admin |
| `channel.manage_forced_devices` | Gérer les devices forcés | channel_admin, app_admin, app_developer, org_admin, org_super_admin |
| `channel.read_forced_devices` | Voir les devices forcés | Tous les rôles channel_*, app_admin, app_developer, org_admin, org_super_admin, org_member |
| `channel.read_audit` | Voir l'audit channel | Tous les rôles channel_*, app_admin, app_developer, org_admin, org_super_admin, org_member |

### Permissions Platform (scope: `platform`)

**Usage interne uniquement** - Réservées à l'équipe Capgo.

| Permission | Description |
|-----------|-------------|
| `platform.impersonate_user` | Se faire passer pour un user (support) |
| `platform.manage_orgs_any` | Gérer n'importe quelle org |
| `platform.manage_apps_any` | Gérer n'importe quelle app |
| `platform.manage_channels_any` | Gérer n'importe quel channel |
| `platform.run_maintenance_jobs` | Lancer des jobs de maintenance |
| `platform.delete_orphan_users` | Supprimer les users orphelins |
| `platform.read_all_audit` | Voir tous les logs d'audit |
| `platform.db_break_glass` | Accès break-glass à la DB (urgences) |

---

## Fonctions SQL
---

## Fonctions SQL

### 1. `rbac_is_enabled_for_org()` - Vérification du flag RBAC

Détermine si RBAC est activé pour une organisation donnée.

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

**Comportement** :
- Retourne `true` si `orgs.use_new_rbac = true` OU `rbac_settings.use_new_rbac = true`
- Retourne `false` par défaut (mode legacy)

**Usage** :
```sql
SELECT rbac_is_enabled_for_org('550e8400-e29b-41d4-a716-446655440000');
-- true si RBAC activé, false sinon
```

### 2. `rbac_permission_for_legacy()` - Mapping legacy → RBAC

Convertit un `min_right` legacy vers une permission RBAC équivalente.

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

**Table de mapping** :

| Min Right (legacy) | Scope | Permission RBAC |
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

### 3. `rbac_has_permission()` - Résolution de permissions RBAC

**Fonction cœur** du système qui vérifie si un principal a une permission donnée.

```sql
CREATE OR REPLACE FUNCTION public.rbac_has_permission(
  p_principal_type text,      -- 'user' ou 'apikey' ou 'group'
  p_principal_id uuid,        -- UUID du principal
  p_permission_key text,      -- 'app.upload_bundle'
  p_org_id uuid,              -- Optionnel, dérivé si NULL
  p_app_id character varying, -- App ID (string)
  p_channel_id bigint         -- Channel ID (integer)
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
-- [Voir implémentation complète dans la migration]
$$;
```

**Algorithme détaillé** :

1. **Résolution des identifiants**
   - Convertit `app_id` (string) vers `app.id` (uuid)
   - Récupère `channel.rbac_id` (uuid) depuis `channel_id` (bigint)
   - Dérive `org_id` depuis app ou channel si non fourni

2. **Construction du catalogue de scopes**
   ```sql
   scope_catalog:
     - platform (si applicable)
     - org (si org_id fourni)
     - app (si app_id fourni)
     - channel (si channel_id fourni)
   ```

3. **Collecte des role_bindings directs**
   - Trouve tous les bindings du principal dans les scopes applicables
   - Exemple : User X avec `app_developer` sur app Y

4. **Expansion de la hiérarchie de rôles**
   - Utilise CTE récursif pour suivre `role_hierarchy`
   - Si User a `app_admin`, inclut automatiquement `app_developer`, `app_uploader`, `app_reader`

5. **Collecte des permissions**
   - Joint avec `role_permissions` pour obtenir toutes les permissions des rôles
   - Déduplique les permissions

6. **Vérification du scope**
   - Une permission donnée au niveau org s'applique à toutes les apps de cette org
   - Une permission donnée au niveau app s'applique à tous les channels de cette app
   - **Propagation descendante uniquement** (pas de remontée)

7. **Retour**
   - `true` si permission trouvée dans le set collecté
   - `false` sinon

**Exemple de propagation** :
```
User "Alice" a le rôle org_admin dans org "Acme Corp"
  → Alice a app.upload_bundle au niveau org
    → Alice peut uploader sur TOUTES les apps de "Acme Corp"

User "Bob" a le rôle app_developer sur app "com.example.mobile"
  → Bob a channel.promote_bundle au niveau app
    → Bob peut promouvoir sur TOUS les channels de "com.example.mobile"
    → Bob ne peut PAS promouvoir sur d'autres apps
```

**Performance** :
- Index optimisés sur `role_bindings` pour lookup rapide
- CTE récursif limité en profondeur (max ~5-6 niveaux)
- Cache des résultats au niveau application (backend)

### 4. `rbac_check_permission_direct()` - Point d'entrée unifié

**Fonction principale** utilisée par le backend pour vérifier les permissions.

```sql
CREATE OR REPLACE FUNCTION public.rbac_check_permission_direct(
  p_permission_key text,        -- 'app.upload_bundle'
  p_user_id uuid,               -- User UUID
  p_org_id uuid DEFAULT NULL,   -- Optionnel
  p_app_id varchar DEFAULT NULL, -- Optionnel
  p_channel_id bigint DEFAULT NULL, -- Optionnel
  p_apikey text DEFAULT NULL    -- Optionnel (mutually exclusive with user_id)
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
  -- Déterminer le principal
  IF p_apikey IS NOT NULL THEN
    SELECT rbac_id, owner_org INTO v_apikey_rbac_id, v_org_id
    FROM public.apikeys
    WHERE key = p_apikey;

    IF v_apikey_rbac_id IS NULL THEN
      RETURN false; -- API key invalide
    END IF;

    v_principal_type := 'apikey';
    v_principal_id := v_apikey_rbac_id;
  ELSE
    v_principal_type := 'user';
    v_principal_id := p_user_id;
  END IF;

  -- Dériver org_id si nécessaire
  IF v_org_id IS NULL AND p_app_id IS NOT NULL THEN
    SELECT owner_org INTO v_org_id FROM public.apps WHERE app_id = p_app_id LIMIT 1;
  END IF;

  IF v_org_id IS NULL AND p_channel_id IS NOT NULL THEN
    SELECT owner_org INTO v_org_id FROM public.channels WHERE id = p_channel_id LIMIT 1;
  END IF;

  -- Vérifier si RBAC est activé
  IF rbac_is_enabled_for_org(v_org_id) THEN
    -- Nouveau système RBAC
    RETURN rbac_has_permission(
      v_principal_type,
      v_principal_id,
      p_permission_key,
      v_org_id,
      p_app_id,
      p_channel_id
    );
  ELSE
    -- Legacy système via check_min_rights
    DECLARE
      v_min_right public.user_min_right;
      v_scope text;
    BEGIN
      -- Dériver scope depuis les paramètres
      IF p_channel_id IS NOT NULL THEN
        v_scope := 'channel';
      ELSIF p_app_id IS NOT NULL THEN
        v_scope := 'app';
      ELSE
        v_scope := 'org';
      END IF;

      -- Mapper permission → min_right legacy
      -- (logique inverse de rbac_permission_for_legacy)
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
        v_min_right := 'admin'; -- Par défaut, requiert admin
      END IF;

      -- Appeler la fonction legacy
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

**Avantages** :
- ✅ Single source of truth pour la vérification de permissions
- ✅ Routing automatique legacy/RBAC selon le flag org
- ✅ Dérivation automatique de `org_id` depuis app/channel
- ✅ Support des API keys et users
- ✅ Fallback gracieux vers legacy si RBAC non activé

**Usage recommandé** :
```sql
-- Vérifier si un user peut uploader un bundle
SELECT rbac_check_permission_direct(
  'app.upload_bundle',
  'user-uuid'::uuid,
  NULL, -- org_id sera dérivé
  'com.example.app',
  NULL
);

-- Vérifier si une API key peut promouvoir un bundle
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

## Intégration backend

### TypeScript - Wrapper `checkPermission()`

Le backend utilise un wrapper TypeScript pour simplifier l'utilisation.

**Fichier** : [supabase/functions/_backend/utils/rbac.ts](supabase/functions/_backend/utils/rbac.ts)

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

**Usage dans un endpoint** :

```typescript
import { checkPermission, requirePermission } from '../utils/rbac.ts'
import { createHono, simpleError } from '../utils/hono.ts'

const app = createHono()

// Exemple 1: Check avec gestion manuelle
app.post('/bundle/upload', middlewareKey(['all', 'write', 'upload']), async (c) => {
  const body = await c.req.json()

  // Vérifier la permission
  if (!(await checkPermission(c, 'app.upload_bundle', { appId: body.app_id }))) {
    return simpleError('app_access_denied', 'You cannot upload to this app')
  }

  // ... logique d'upload
  return c.json({ success: true })
})

// Exemple 2: Require avec throw automatique
app.delete('/app/:appId', middlewareAuth, async (c) => {
  const appId = c.req.param('appId')

  // Throw 403 si permission refusée
  await requirePermission(c, 'app.delete', { appId })

  // ... logique de suppression
  return c.json({ success: true })
})

// Exemple 3: Channel-level permission (auto-dérive appId et orgId)
app.post('/channel/:channelId/promote', middlewareKey(['all', 'upload']), async (c) => {
  const channelId = Number.parseInt(c.req.param('channelId'))

  await requirePermission(c, 'channel.promote_bundle', { channelId })

  // ... logique de promotion
  return c.json({ success: true })
})
```

**Avantages** :
- ✅ **Type-safe** : `Permission` type strict avec autocomplete
- ✅ **Auto-routing** : legacy/RBAC selon flag org (transparent)
- ✅ **Logging** : logs automatiques dans CloudFlare/Supabase
- ✅ **Fail-closed** : retourne `false` en cas d'erreur (sécurisé)
- ✅ **Context-aware** : utilise automatiquement `c.get('auth')` et `c.get('apikey')`

### Helpers additionnels

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

## Intégration frontend
- `org.update_settings` - Modifier les paramètres org
- `org.invite_user` - Inviter des membres
- `org.update_user_roles` - Gérer les rôles des membres
- `org.read_billing` - Voir les infos de facturation
- `org.update_billing` - Modifier la facturation
- `org.read_invoices` - Voir les factures
- `org.read_audit` - Voir les logs d'audit
- `org.read_billing_audit` - Voir l'audit facturation

**App permissions** (scope: 'app')
- `app.read` - Voir les infos de l'app
- `app.update_settings` - Modifier les paramètres app
- `app.delete` - Supprimer l'app
- `app.read_bundles` - Voir les bundles
- `app.list_bundles` - Lister les bundles
- `app.upload_bundle` - Uploader des bundles
- `app.create_channel` - Créer des channels
- `app.read_channels` - Voir les channels
- `app.list_channels` - Lister les channels
- `app.read_logs` - Voir les logs
- `app.manage_devices` - Gérer les devices
- `app.read_devices` - Voir les devices
- `app.build_native` - Builder des versions natives
- `app.read_audit` - Voir l'audit app
- `app.update_user_roles` - Gérer les rôles utilisateurs pour cette app

**Bundle permissions** (scope: 'bundle')
- `bundle.read` - Lire les métadonnées d'un bundle
- `bundle.update` - Modifier un bundle
- `bundle.delete` - Supprimer un bundle

**Channel permissions** (scope: 'channel')
- `channel.read` - Voir un channel
- `channel.update_settings` - Modifier les paramètres channel
- `channel.delete` - Supprimer un channel
- `channel.read_history` - Voir l'historique
- `channel.promote_bundle` - Promouvoir un bundle
- `channel.rollback_bundle` - Rollback un bundle
- `channel.manage_forced_devices` - Gérer les devices forcés
- `channel.read_forced_devices` - Voir les devices forcés
- `channel.read_audit` - Voir l'audit channel

**Platform permissions** (scope: 'platform' - usage interne uniquement)
- `platform.impersonate_user` - Se faire passer pour un user
- `platform.manage_orgs_any` - Gérer n'importe quelle org
- `platform.manage_apps_any` - Gérer n'importe quelle app
- `platform.manage_channels_any` - Gérer n'importe quel channel
- `platform.run_maintenance_jobs` - Lancer des jobs de maintenance
- `platform.delete_orphan_users` - Supprimer les users orphelins
- `platform.read_all_audit` - Voir tous les logs d'audit
- `platform.db_break_glass` - Accès break-glass à la DB

#### `role_permissions` - Mapping rôle → permissions
Cette table définit quelles permissions sont accordées à chaque rôle.

**Exemple pour `org_admin`** :
- `org.read`, `org.update_settings`, `org.read_members`, `org.invite_user`
- Toutes les permissions `app.*` (read, update_settings, delete, upload_bundle, update_user_roles, etc.)
- Toutes les permissions `channel.*` (read, update_settings, delete, promote_bundle, etc.)
- Toutes les permissions `bundle.*` (delete)

**Exemple pour `app_developer`** :
- `app.read`, `app.update_settings`, `app.upload_bundle`, `app.create_channel`
- `channel.read`, `channel.update_settings`, `channel.promote_bundle`
- `bundle.delete`

**Exemple pour `app_uploader`** :
- `app.read`, `app.read_bundles`, `app.upload_bundle`, `app.read_channels`, `app.read_logs`, `app.read_devices`, `app.read_audit`

**Exemple pour `org_member`** :
- `org.read`, `org.read_members`
- `app.read`, `app.list_bundles`, `app.list_channels`, `app.read_logs`, `app.read_devices`, `app.read_audit`
- `bundle.read`
- `channel.read`, `channel.read_history`, `channel.read_forced_devices`, `channel.read_audit`

**Exemple pour `bundle_admin`** :
- `bundle.read`, `bundle.update`, `bundle.delete`

**Exemple pour `bundle_reader`** :
- `bundle.read`

#### `role_bindings` - Attribution des rôles aux utilisateurs
```sql
CREATE TABLE role_bindings (
  id uuid PRIMARY KEY,
  principal_type text NOT NULL,  -- 'user' ou 'group' ou 'apikey'
  principal_id uuid NOT NULL,    -- user.id ou group.id ou apikey.rbac_id
  role_id uuid NOT NULL REFERENCES roles(id),
  org_id uuid REFERENCES orgs(id),
  app_id varchar REFERENCES apps(app_id),
  channel_id bigint REFERENCES channels(id)
);
```

**Exemples** :
- User `uuid-123` a le rôle `org_admin` dans l'org `org-abc`
- User `uuid-123` a le rôle `app_developer` sur l'app `com.example.app`
- API key `key-789` a le rôle `app_uploader` sur l'app `com.example.app`

#### `role_hierarchy` - Héritage entre rôles
Définit qu'un rôle peut hériter des permissions d'autres rôles :
- `org_super_admin` hérite de tous les rôles (org_admin, org_billing_admin, org_member, tous les app_*)
- `org_admin` hérite de tous les rôles app_* et org_member
- `app_admin` hérite de app_developer, app_uploader, app_reader

#### `groups` et `group_members` - Groupes d'utilisateurs
Permet d'attribuer des rôles à un groupe au lieu d'utilisateurs individuels.

### 2. Fonctions SQL

#### `rbac_has_permission()` - Résolution de permissions
**Fonction principale** qui vérifie si un principal (user/apikey) a une permission donnée :

```sql
rbac_has_permission(
  p_principal_type text,    -- 'user' ou 'apikey'
  p_principal_id uuid,      -- user.id ou apikey.rbac_id
  p_permission_key text,    -- 'app.upload_bundle'
  p_org_id uuid,
  p_app_id varchar,
  p_channel_id bigint
) RETURNS boolean
```

**Algorithme** :
1. **Collecte les role_bindings** du principal dans le scope demandé
2. **Expand la hiérarchie** : ajoute les rôles hérités via `role_hierarchy`
3. **Collecte les permissions** via `role_permissions` pour tous les rôles
4. **Vérifie le scope** : une permission `app.*` donnée au niveau org s'applique à toutes les apps de cette org
5. Retourne `true` si la permission est trouvée, `false` sinon

**Exemples de scope awareness** :
- User a `org_admin` dans org `A` → peut faire toutes les actions `app.*` sur les apps de org `A`
- User a `app_developer` sur app `X` → peut faire `app.upload_bundle` seulement sur app `X`
- User a `app_uploader` dans org `A` → peut upload sur toutes les apps de org `A` (si le binding est au niveau org)

#### `rbac_check_permission_direct()` - Point d'entrée unifié
**Wrapper pratique** qui détecte automatiquement si on doit utiliser RBAC ou legacy :

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

**Logique** :
1. Dérive `org_id` depuis `app_id` ou `channel_id` si manquant
2. Vérifie le flag `use_new_rbac` de l'org (via `rbac_is_enabled_for_org()`)
3. **Si RBAC activé** : appelle `rbac_has_permission()` directement
4. **Si legacy** : mappe la permission vers un `min_right` (via `rbac_permission_for_legacy()`) et appelle `check_min_rights_legacy()`

**Exemples de mapping legacy** :
- `app.upload_bundle` → `min_right='upload'` + scope='app'
- `app.update_settings` → `min_right='write'` + scope='app'
- `org.invite_user` → `min_right='admin'` + scope='org'

---

## Intégration frontend

### Ancien système (toujours utilisé) - `hasPermissionsInRole()`

**Fichier** : [src/stores/organization.ts](src/stores/organization.ts)

Le store organisation expose des helpers pour vérifier les rôles :

```typescript
import { useOrganizationStore } from '~/stores/organization'

const orgStore = useOrganizationStore()

// Vérifier si l'user a un des rôles requis
if (orgStore.hasPermissionsInRole('admin', ['org_admin', 'org_super_admin'], orgId)) {
  // Show admin UI
}

// Vérifier au niveau app
if (orgStore.hasPermissionsInRole('write', ['app_developer', 'org_admin'], orgId, appId)) {
  // Allow editing
}
```

**Comportement** :
- Si `use_new_rbac` activé : vérifie les `role_bindings` chargés en cache
- Si legacy : vérifie `org_users.user_right`

**Limitations** :
- ❌ Vérifie des **noms de rôles**, pas des permissions granulaires
- ❌ Logique de mapping dupliquée frontend/backend
- ❌ Cache peut être obsolète (nécessite refresh manuel)
- ❌ Pas flexible : changement d'accès = changement de code Vue

### Nouveau système (recommandé) - `hasPermission()`

**Fichier** : [src/services/permissions.ts](src/services/permissions.ts)

Le nouveau service appelle directement le backend pour vérifier les permissions.

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

// Check channel permission (backend auto-dérive appId et orgId)
const canPromote = await hasPermission('channel.promote_bundle', { channelId: 123 })
if (canPromote) {
  // Allow promotion
}

// OR logic - au moins une permission
const canAccessBilling = await hasAnyPermission(
  ['org.read_billing', 'org.update_billing'],
  { orgId }
)

// AND logic - toutes les permissions
const canFullyManageApp = await hasAllPermissions(
  ['app.update_settings', 'app.delete', 'app.update_user_roles'],
  { appId }
)
```

**Implémentation** :

```typescript
// src/services/permissions.ts
import { supabase } from '~/services/supabase'

export type Permission = // ... (même type que backend)

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
    const { data, error } = await supabase.rpc('rbac_check_permission_direct', {
      p_permission_key: permission,
      p_user_id: supabase.auth.user()?.id || null,
      p_org_id: scope.orgId || null,
      p_app_id: scope.appId || null,
      p_channel_id: scope.channelId || null,
      p_apikey: null, // Frontend n'utilise jamais d'API key
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

  // Note: On pourrait optimiser avec un RPC batch, mais pour l'instant séquentiel
  for (const check of checks) {
    results[check.permission] = await hasPermission(check.permission, check.scope)
  }

  return results
}
```

**Avantages** :
- ✅ **Single source of truth** : appelle le backend directement
- ✅ **Auto-routing** : legacy/RBAC géré côté serveur (transparent)
- ✅ **Type-safe** : type `Permission` strict avec autocomplete
- ✅ **Flexible** : changements de permissions en DB, pas de déploiement frontend
- ✅ **Toujours à jour** : pas de cache obsolète
- ✅ **Audit** : tous les checks loggés côté backend

**Inconvénients** :
- ⚠️ Asynchrone (requiert `await`)
- ⚠️ Overhead réseau (mais négligeable en pratique)

### Usage dans les composants Vue

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

**Pattern recommandé : Computed avec cache** :

```vue
<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue'
import { hasPermission } from '~/services/permissions'

const props = defineProps<{ appId: string }>()

// Cache les résultats
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

### Composable réutilisable

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

**Usage** :

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

## Mapping actuel : Rôles → Permissions

Pour faciliter la migration, voici le mapping entre les checks de rôles actuels et les permissions équivalentes :

### Organization-level checks
| Check actuel | Permission équivalente | Notes |
|-------------|----------------------|-------|
| `hasPermissionsInRole('admin', ['org_admin', 'org_super_admin'])` | `hasPermission('org.update_settings')` | Modification des paramètres org |
| `hasPermissionsInRole('admin', ['org_super_admin'])` | `hasPermission('org.update_user_roles')` | Gestion des rôles membres |
| `hasPermissionsInRole('admin', ['org_admin', 'org_billing_admin'])` | `hasPermission('org.read_billing')` | Accès à la facturation |

### App-level checks
| Check actuel | Permission équivalente | Notes |
|-------------|----------------------|-------|
| `hasPermissionsInRole('write', ['app_developer', 'org_admin'])` | `hasPermission('app.update_settings')` | Modification settings app |
| `hasPermissionsInRole('upload', ['app_uploader', 'app_developer'])` | `hasPermission('app.upload_bundle')` | Upload de bundles |
| `hasPermissionsInRole('admin', ['org_super_admin'])` | `hasPermission('app.delete')` | Suppression d'app |
| `hasPermissionsInRole('admin', ['app_admin', 'org_admin'])` | `hasPermission('app.update_user_roles')` | Gestion des accès app |

### Channel-level checks
| Check actuel | Permission équivalente | Notes |
|-------------|----------------------|-------|
| `hasPermissionsInRole('write', ['app_developer', 'org_admin'])` | `hasPermission('channel.update_settings')` | Modification channel |
| `hasPermissionsInRole('upload', ['app_uploader'])` | `hasPermission('channel.promote_bundle')` | Promotion de bundle |

### Bundle operations
| Check actuel | Permission équivalente | Notes |
|-------------|----------------------|-------|
| `hasPermissionsInRole('admin', ['org_admin', 'org_super_admin'])` | `hasPermission('bundle.delete')` | Suppression de bundle |

---

## Debugging et troubleshooting

### Vérifications SQL courantes

#### 1. Vérifier si RBAC est activé pour une org

```sql
SELECT rbac_is_enabled_for_org('org-uid');
-- true si RBAC activé, false si legacy
```

#### 2. Voir tous les role_bindings d'un user

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

#### 3. Voir toutes les permissions d'un rôle

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

#### 4. Voir la hiérarchie d'un rôle

```sql
-- Rôles dont hérite org_admin
WITH RECURSIVE role_tree AS (
  -- Rôle de départ
  SELECT
    id,
    name,
    scope_type,
    0 as depth
  FROM roles
  WHERE name = 'org_admin'

  UNION ALL

  -- Rôles enfants (récursif)
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

#### 5. Tester manuellement une permission

```sql
-- Vérifier si un user peut uploader sur une app
SELECT rbac_check_permission_direct(
  'app.upload_bundle',              -- permission
  'user-uuid'::uuid,                -- user_id
  NULL::uuid,                       -- org_id (sera dérivé depuis app_id)
  'com.example.app',                -- app_id
  NULL::bigint,                     -- channel_id
  NULL                              -- apikey
) as has_permission;

-- Vérifier si une API key peut promouvoir sur un channel
SELECT rbac_check_permission_direct(
  'channel.promote_bundle',
  NULL::uuid,                       -- user_id (NULL car API key)
  NULL::uuid,
  NULL,
  123,                              -- channel_id
  'cap_1234567890abcdef'            -- apikey
) as has_permission;
```

#### 6. Voir tous les membres d'une org avec leurs rôles

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

#### 7. Auditer qui a accordé quels rôles

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

#### 8. Trouver les permissions manquantes pour un rôle

```sql
-- Permissions que org_member devrait avoir mais n'a pas
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

### Logs backend

#### Rechercher dans les logs CloudFlare/Supabase

**Patterns de recherche** :
```
rbac_check: app.upload_bundle GRANTED
rbac_check: app.upload_bundle DENIED
RBAC_CHECK_PERM_DIRECT
RBAC_CHECK_PERM_NO_KEY
rbac_has_permission: checking permission
```

**Exemple de log** :
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

#### Activer le debug verbose (développement local)

```typescript
// supabase/functions/_backend/utils/rbac.ts

// Décommenter ces lignes pour debug verbose :
cloudlog({
  requestId,
  message: `rbac_has_permission: checking ${permission}`,
  principal: { type: principalType, id: principalId },
  scope: { orgId, appId, channelId },
  raw_result: result,
})
```

### Frontend debugging

#### Activer les logs dans la console

```typescript
// Activer les logs dans la console
const allowed = await hasPermission('app.upload_bundle', { appId })
// Chercher dans console: [hasPermission] RPC error
```

## Bonnes pratiques

### Backend

#### ✅ Toujours utiliser `checkPermission()` au lieu de `check_min_rights_legacy()`

**Mauvais** :
```typescript
const allowed = await check_min_rights_legacy('upload', userId, orgId, appId)
```

**Bon** :
```typescript
const allowed = await checkPermission(c, 'app.upload_bundle', { appId })
```

**Raison** : Routing automatique legacy/RBAC, logs structurés, type-safety

#### ✅ Spécifier la permission la plus précise possible

**Moins bon** :
```typescript
// Trop large
await checkPermission(c, 'app.update_settings', { appId })
```

**Meilleur** :
```typescript
// Précis selon l'action
await checkPermission(c, 'app.upload_bundle', { appId })
await checkPermission(c, 'channel.promote_bundle', { channelId })
await checkPermission(c, 'bundle.delete', { appId, bundleId })
```

**Raison** : Permet un contrôle d'accès plus fin, facilite l'audit

#### ✅ Logger les refus de permission pour l'audit

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

**Raison** : Aide à détecter les tentatives d'accès non autorisé, audit de sécurité

#### ✅ Utiliser `requirePermission()` pour les endpoints critiques

```typescript
// Auto-throw 403 si permission refusée
app.delete('/app/:appId', middlewareAuth, async (c) => {
  const appId = c.req.param('appId')

  await requirePermission(c, 'app.delete', { appId })

  // ... logique de suppression
  // Pas besoin de check manuel
})
```

**Raison** : Code plus concis, gestion d'erreur cohérente

#### ✅ Vérifier les permissions au bon niveau de granularité

```typescript
// Si l'action concerne un channel, vérifier au niveau channel
await checkPermission(c, 'channel.promote_bundle', { channelId })

// Pas au niveau app (trop large)
await checkPermission(c, 'app.upload_bundle', { appId }) // ❌
```

**Raison** : Respecte le principe du moindre privilège

#### ❌ Ne pas cacher les erreurs de permission

**Mauvais** :
```typescript
const allowed = await checkPermission(c, 'app.upload_bundle', { appId })
if (!allowed) {
  // Erreur générique
  return c.json({ error: 'Something went wrong' }, 500)
}
```

**Bon** :
```typescript
const allowed = await checkPermission(c, 'app.upload_bundle', { appId })
if (!allowed) {
  // Message clair
  return c.json({
    error: 'access_denied',
    message: 'You do not have permission to upload bundles to this app',
    required_permission: 'app.upload_bundle',
  }, 403)
}
```

**Raison** : Facilite le debugging pour les développeurs, clarté pour l'utilisateur

### Frontend

#### ✅ Utiliser `hasPermission()` pour les nouveaux checks

**Ancien (à éviter)** :
```typescript
if (orgStore.hasPermissionsInRole('admin', ['org_admin', 'org_super_admin'], orgId)) {
  // Show UI
}
```

**Nouveau (recommandé)** :
```typescript
if (await hasPermission('org.update_settings', { orgId })) {
  // Show UI
}
```

**Raison** : Single source of truth (backend), type-safety, flexibilité

#### ✅ Cacher les UI inaccessibles plutôt que les disabled

**Moins bon** :
```vue
<button :disabled="!canUpload" @click="upload">
  Upload Bundle
</button>
```

**Meilleur** :
```vue
<button v-if="canUpload" @click="upload">
  Upload Bundle
</button>
```

**Raison** : Meilleure UX (pas de boutons frustrés), moins de surface d'attaque

#### ✅ Vérifier la permission juste avant l'action (pas seulement au mount)

```typescript
async function uploadBundle() {
  // Re-check avant l'action critique
  if (!(await hasPermission('app.upload_bundle', { appId }))) {
    showToast('You no longer have permission to upload', 'error')
    return
  }

  // ... logique d'upload
}
```

**Raison** : Les permissions peuvent changer (révoquées par un admin), évite les race conditions

#### ✅ Utiliser un composable pour les checks répétitifs

```typescript
// Composable réutilisable
const { permissions, loading, has } = usePermissions(
  ['app.upload_bundle', 'app.update_settings', 'app.delete'],
  { appId }
)

// Usage simple dans le template
<button v-if="has('app.upload_bundle')">Upload</button>
```

**Raison** : DRY, performance (batch checks), meilleure lisibilité

#### ❌ Ne pas cacher d'erreur : informer l'utilisateur clairement

**Mauvais** :
```typescript
async function deleteApp() {
  if (!(await hasPermission('app.delete', { appId }))) {
    // Silent fail
    return
  }
  // ...
}
```

**Bon** :
```typescript
async function deleteApp() {
  if (!(await hasPermission('app.delete', { appId }))) {
    showToast('You do not have permission to delete this app', 'error')
    return
  }
  // ...
}
```

**Raison** : Transparence pour l'utilisateur, aide à comprendre pourquoi l'action a échoué

#### ✅ Précharger les permissions au mount pour éviter les flickerings

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

**Raison** : Évite le flash de contenu (CLS), meilleure UX

### Database
- ✅ Toujours créer une nouvelle migration pour les changements de permissions
- ✅ Ne jamais modifier directement `role_permissions` en production
- ✅ Tester les changements de permissions sur l'environnement de dev d'abord
- ✅ Documenter les raisons des changements de permissions dans les migrations

## Références

### Fichiers clés

| Fichier | Description |
|---------|-------------|
| [supabase/migrations/20251222140030_rbac_system.sql](supabase/migrations/20251222140030_rbac_system.sql) | Migration principale RBAC (tables + seed) |
| [supabase/migrations/20260106133353_rbac_check_permission_direct.sql](supabase/migrations/20260106133353_rbac_check_permission_direct.sql) | Fonction `rbac_check_permission_direct()` |
| [supabase/functions/_backend/utils/rbac.ts](supabase/functions/_backend/utils/rbac.ts) | Wrapper TypeScript backend |
| [src/services/permissions.ts](src/services/permissions.ts) | Service permissions frontend |
| [src/stores/organization.ts](src/stores/organization.ts) | Store organisation (legacy `hasPermissionsInRole`) |

### Migrations liées

- `20251222140030_rbac_system.sql` - Système RBAC complet

### Documentation externe

- [RBAC Wikipedia](https://en.wikipedia.org/wiki/Role-based_access_control)
- [NIST RBAC Model](https://csrc.nist.gov/projects/role-based-access-control)
- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

---
