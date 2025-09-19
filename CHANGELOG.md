# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### 12.29.6-alpha.1 (2025-09-19)


### Bug Fixes

* test ci ([cdf7af9](https://github.com/Cap-go/capgo/commit/cdf7af930e53467601b40796dcf8eeea7a92ba6c))

### 12.29.6 (2025-09-19)

### Bug Fixes

- update development supa_anon key in configs.json
  ([3be2013](https://github.com/Cap-go/capgo/commit/3be201347789e5e5ebfa82bc44efde290081d835))

### 12.29.5 (2025-09-18)

### 12.29.4 (2025-09-18)

### 12.29.3 (2025-09-18)

### 12.29.2 (2025-09-18)

### 12.29.1 (2025-09-18)

## 12.29.0 (2025-09-18)

### Features

- add first name, last name, and country fields to user insertion; remove
  obsolete customer_id and billing_email fields
  ([d54e376](https://github.com/Cap-go/capgo/commit/d54e376e3fa412b1c7cc85d4ac5f7c5a98c6aef4))

### 12.28.3 (2025-09-18)

### 12.28.2 (2025-09-18)

### 12.28.1 (2025-09-17)

## 12.28.0 (2025-09-16)

### Features

- implement plan validation logic for app metrics and streamline database
  queries
  ([b763858](https://github.com/Cap-go/capgo/commit/b7638581c48a0b812a25e168cf1910b97ca966c9))

## 12.27.0 (2025-09-16)

### Features

- enhance plan validation checks and streamline database queries across plugins
  ([bd5069c](https://github.com/Cap-go/capgo/commit/bd5069c00d2bce271a16386caadde23c06b18966))

### 12.26.8 (2025-09-16)

### 12.26.7 (2025-09-16)

### 12.26.6 (2025-09-16)

### 12.26.5 (2025-09-16)

### Bug Fixes

- correct schema reference in update_app_versions_retention function
  ([b33f618](https://github.com/Cap-go/capgo/commit/b33f618827f8c1d2e8f434802950ddc62a4a60f2))

### 12.26.4 (2025-09-16)

### 12.26.3 (2025-09-16)

### 12.26.2 (2025-09-16)

### 12.26.1 (2025-09-15)

## 12.26.0 (2025-09-15)

### Features

- prevent to large retention in frontend
  ([5bd635c](https://github.com/Cap-go/capgo/commit/5bd635c4496158b4fa77600066e1057b9a51b7b8))

### 12.25.9 (2025-09-15)

### 12.25.8 (2025-09-15)

### Bug Fixes

- update registration URL handling in delete_account and login pages
  ([99f9bf9](https://github.com/Cap-go/capgo/commit/99f9bf97e44993d7371b0b6edeb4d7aa882d90e5))

### 12.25.7 (2025-09-15)

### 12.25.6 (2025-09-15)

### 12.25.5 (2025-09-15)

### 12.25.4 (2025-09-15)

### 12.25.3 (2025-09-14)

### 12.25.2 (2025-09-14)

### 12.25.1 (2025-09-14)

## 12.25.0 (2025-09-14)

### Features

- implement simpleRateLimit function and update error handling in stats,
  updates, and updates_lite plugins
  ([6411973](https://github.com/Cap-go/capgo/commit/64119733a143000b53e65638704fb47f1041b74f))

### 12.24.10 (2025-09-14)

### 12.24.9 (2025-09-14)

### 12.24.8 (2025-09-13)

### 12.24.7 (2025-09-13)

### 12.24.6 (2025-09-12)

### 12.24.5 (2025-09-12)

### Bug Fixes

- improve error handling and logging in various utility functions
  ([1c76159](https://github.com/Cap-go/capgo/commit/1c76159eb127a2168cf4180a3079aebfe813e5e4))

### 12.24.4 (2025-09-12)

### 12.24.3 (2025-09-12)

### 12.24.2 (2025-09-10)

### 12.24.1 (2025-09-10)

## 12.24.0 (2025-09-10)

### Features

- implement account deletion process with RLS and cron job
  ([f88d933](https://github.com/Cap-go/capgo/commit/f88d933f6c7a3c1ad602026d66318a30287494cb))

### 12.23.8 (2025-09-10)

### 12.23.7 (2025-09-09)

### 12.23.6 (2025-09-09)

### 12.23.5 (2025-09-09)

### 12.23.4 (2025-09-09)

### Bug Fixes

- correct spelling of 'email' in set_org_email function and related tests
  ([e7bff6a](https://github.com/Cap-go/capgo/commit/e7bff6a6976c5c99dc9c3c8ec1c3c7978e1af6f7))

### 12.23.3 (2025-09-09)

### 12.23.2 (2025-09-08)

### 12.23.1 (2025-09-08)

## 12.23.0 (2025-09-08)

### Features

- update PostgrestVersion to 13.0.4 and add success_rate field to database types
  ([2ece160](https://github.com/Cap-go/capgo/commit/2ece160ba48f3111ae41026e879f603c06e4870e))

### 12.22.5 (2025-09-08)

### 12.22.4 (2025-09-06)

### 12.22.3 (2025-09-06)

### 12.22.2 (2025-09-06)

### Bug Fixes

- update cron job calls from CALL to SELECT for proper execution
  ([b64d49a](https://github.com/Cap-go/capgo/commit/b64d49ab302618e51628feab79df7031bad01f7e))

### 12.22.1 (2025-09-05)

### Bug Fixes

- update notifications primary key constraint to include owner_org
  ([dad0de1](https://github.com/Cap-go/capgo/commit/dad0de1be3145c559574babad050d952ddfd6e11))

## 12.22.0 (2025-09-04)

### Features

- add new enum values to stats_action and update get_identity_org_appid calls
  ([2dd5c0b](https://github.com/Cap-go/capgo/commit/2dd5c0b72e4a092d4eba5f05112a79b587365ad0))

### 12.21.1 (2025-09-04)

## 12.21.0 (2025-09-04)

### Features

- add error handling tests for /private/stats endpoint
  ([ff0a955](https://github.com/Cap-go/capgo/commit/ff0a9553bc7a30a07d6f4b86168504ae417949e5))

### 12.20.5 (2025-09-04)

### 12.20.4 (2025-09-04)

### 12.20.3 (2025-09-02)

### 12.20.2 (2025-09-02)

### 12.20.1 (2025-09-01)

## 12.20.0 (2025-09-01)

### Features

- add @types/bun dependency and refactor environment variable access in multiple
  scripts
  ([ba6ee30](https://github.com/Cap-go/capgo/commit/ba6ee303e3bd67b8ba76bbe44c2b6623a6893778))

### 12.19.6 (2025-08-30)

### Bug Fixes

- 2fa for admins && semi-fix account deletion
  ([292ad27](https://github.com/Cap-go/capgo/commit/292ad27411ce3467d4697184f4a9c2ead2dc230b))

### 12.19.5 (2025-08-30)

### Bug Fixes

- account deletion
  ([321c209](https://github.com/Cap-go/capgo/commit/321c209cf26e675c58c0afd8291129d499aae9bf))

### 12.19.4 (2025-08-30)

### Bug Fixes

- update device value assignment in getDevice function
  ([579b0ed](https://github.com/Cap-go/capgo/commit/579b0ed5bc044258e4bfbf8c14ec9dbe4d5bc2f2))

### 12.19.3 (2025-08-29)

### Bug Fixes

- public POST device endpoint
  ([adee18e](https://github.com/Cap-go/capgo/commit/adee18eeb43759e39646aa39cb0b391b2908340b))

### 12.19.2 (2025-08-29)

### Bug Fixes

- better logging for device POST endpoint
  ([b7941b3](https://github.com/Cap-go/capgo/commit/b7941b3139e58007de79d207c2c26f31f82e2d91))

### 12.19.1 (2025-08-25)

### Bug Fixes

- licence missing
  ([c5a7353](https://github.com/Cap-go/capgo/commit/c5a7353e445de0a0a443f1a6d6ae7cfa24495529))

## 12.19.0 (2025-08-21)

### Features

- add table_counts for tracking record counts and triggers for app_versions,
  manifest, channels, channel_devices, apps, orgs, and stripe_info
  ([c19d9a8](https://github.com/Cap-go/capgo/commit/c19d9a81012d583aa27f7c8ceeec0f419c4b3798))

### 12.18.10 (2025-08-21)

### 12.18.9 (2025-08-21)

### Bug Fixes

- update localization strings for development build and demo placeholders in
  multiple languages
  ([2b86e42](https://github.com/Cap-go/capgo/commit/2b86e42be168e71e3b7464e0cf285ffb0c2aae9d))

### 12.18.8 (2025-08-21)

### 12.18.7 (2025-08-21)

### 12.18.6 (2025-08-21)

### Bug Fixes

- improve subscription metered check in setMetered function and add eventName
  validation in recordUsage function
  ([94db03b](https://github.com/Cap-go/capgo/commit/94db03ba9e60476717ac9f047110fa3794576799))

### 12.18.5 (2025-08-20)

### 12.18.4 (2025-08-20)

### Bug Fixes

- update button classes in Table.vue and remove unused import in
  DropdownOrganization.vue
  ([3c26953](https://github.com/Cap-go/capgo/commit/3c2695335e94aad4e1816ed7996572bfa127ba56))

### 12.18.3 (2025-08-20)

### 12.18.2 (2025-08-20)

### 12.18.1 (2025-08-20)

## 12.18.0 (2025-08-20)

### Features

- add modal to prevent pay for plan if no apps
  ([db550a0](https://github.com/Cap-go/capgo/commit/db550a0566395e971279e131af79a1a622fea209))

### 12.17.4 (2025-08-20)

### 12.17.3 (2025-08-20)

### 12.17.2 (2025-08-20)

### 12.17.1 (2025-08-20)

## 12.17.0 (2025-08-20)

### Features

- add Memory Bank documentation and project brief for Capgo; update VSCode
  settings and adjust Deno imports
  ([f45c356](https://github.com/Cap-go/capgo/commit/f45c35618ee2297f6bd6bf9af899e1fea6fb3f6e))

### 12.16.16 (2025-08-18)

### 12.16.15 (2025-08-18)

### Bug Fixes

- correct plan number in identity functions test and remove obsolete error test
  ([cf482c6](https://github.com/Cap-go/capgo/commit/cf482c6b4bcf3c8cfaff27028a3ac3262d42907a))

### 12.16.14 (2025-08-18)

### 12.16.13 (2025-08-18)

### 12.16.12 (2025-08-18)

### 12.16.11 (2025-08-18)

### 12.16.10 (2025-08-17)

### 12.16.9 (2025-08-17)

### 12.16.8 (2025-08-16)

### 12.16.7 (2025-08-16)

### 12.16.6 (2025-08-16)

### 12.16.5 (2025-08-16)

### Bug Fixes

- update Stripe API version to 2025-07-30.basil
  ([f7b4f81](https://github.com/Cap-go/capgo/commit/f7b4f817400c0d7c5a7572bd6d025d1b4a157465))

### 12.16.4 (2025-08-16)

### 12.16.3 (2025-08-16)

### 12.16.2 (2025-08-12)

### 12.16.1 (2025-08-12)

## 12.16.0 (2025-08-07)

### Features

- implement channel override logic for device retrieval
  ([2c00911](https://github.com/Cap-go/capgo/commit/2c00911985d98458f5d875d7d8fc9342ec5f2780))

### 12.15.12 (2025-08-07)

### Bug Fixes

- add channelOverride check to prevent updates via private channels
  ([a0a6050](https://github.com/Cap-go/capgo/commit/a0a605059453dd6ea0766aa80e350baab2b13a74))

### 12.15.11 (2025-08-03)

### 12.15.10 (2025-08-03)

### 12.15.9 (2025-07-31)

### 12.15.8 (2025-07-31)

### Bug Fixes

- update Discord link in Sidebar component
  ([8e22895](https://github.com/Cap-go/capgo/commit/8e22895c19be8378e4c4af66c934570457cabdc5))

### 12.15.7 (2025-07-29)

### 12.15.6 (2025-07-27)

### 12.15.5 (2025-07-25)

### Bug Fixes

- update organization labels and validation messages in multiple languages
  ([b184d46](https://github.com/Cap-go/capgo/commit/b184d46961c3f410ff8ffa8f8d63d890b7ab8a1a))

### 12.15.4 (2025-07-24)

### 12.15.3 (2025-07-24)

### 12.15.2 (2025-07-23)

### Bug Fixes

- remove unused import from statistics test file
  ([4683edc](https://github.com/Cap-go/capgo/commit/4683edc26030bd47cd8485a167a678d66d6d3bcf))

### 12.15.1 (2025-07-23)

## 12.15.0 (2025-07-23)

### Features

- add checksum and optional session_key to createBundle API; update tests
  accordingly
  ([2b665db](https://github.com/Cap-go/capgo/commit/2b665db4e95a9130671febb24bc98fc717d66808))

### 12.14.5 (2025-07-23)

### 12.14.4 (2025-07-23)

### 12.14.3 (2025-07-23)

### 12.14.2 (2025-07-23)

### 12.14.1 (2025-07-23)

## 12.14.0 (2025-07-23)

### Features

- implement organization access check for subscription status in statistics
  endpoints
  ([8c67278](https://github.com/Cap-go/capgo/commit/8c6727890182f2c633a9ccfcf2fd591c44a032a9))

### 12.13.4 (2025-07-23)

### 12.13.3 (2025-07-23)

### 12.13.2 (2025-07-23)

### 12.13.1 (2025-07-23)

## 12.13.0 (2025-07-23)

### Features

- add new translations for API key management and validation messages in
  multiple languages
  ([5adb8aa](https://github.com/Cap-go/capgo/commit/5adb8aaa29187cdb1486afb80bccdb831c5deb26))

### 12.12.48 (2025-07-23)

### 12.12.47 (2025-07-23)

### Bug Fixes

- correct column name from 'id' to 'app_id' in cron_stats trigger
  ([c772515](https://github.com/Cap-go/capgo/commit/c772515d7c0679599d7cee1f84b6f82fe3aace92))

### 12.12.46 (2025-07-23)

### 12.12.45 (2025-07-23)

### 12.12.44 (2025-07-23)

### 12.12.43 (2025-07-22)

### 12.12.42 (2025-07-22)

### Bug Fixes

- add 'apikey' to allowed CORS headers for API requests
  ([433afaf](https://github.com/Cap-go/capgo/commit/433afafc284c7e3aa28b1dd5becdf6826e335d82))

### 12.12.41 (2025-07-22)

### Bug Fixes

- update CORS headers to specify allowed headers for API requests
  ([6d8f3cc](https://github.com/Cap-go/capgo/commit/6d8f3ccb5ecce5946312868b76b994ada80736f0))

### 12.12.40 (2025-07-22)

### 12.12.39 (2025-07-21)

### 12.12.38 (2025-07-21)

### 12.12.37 (2025-07-21)

### 12.12.36 (2025-07-21)

### 12.12.35 (2025-07-21)

### 12.12.34 (2025-07-21)

### 12.12.33 (2025-07-21)

### 12.12.32 (2025-07-20)

### Bug Fixes

- re-import version in multiple files for consistency
  ([e0a48ae](https://github.com/Cap-go/capgo/commit/e0a48ae90c131d5316c85d069525a269cb2f68a7))

### 12.12.31 (2025-07-19)

### 12.12.30 (2025-07-18)

### 12.12.29 (2025-07-15)

### 12.12.28 (2025-07-15)

### 12.12.27 (2025-07-15)

### 12.12.26 (2025-07-15)

### 12.12.25 (2025-07-15)

### 12.12.24 (2025-07-15)

### 12.12.23 (2025-07-15)

### 12.12.22 (2025-07-15)

### Bug Fixes

- update SQL procedure call to function and adjust search path in retention test
  ([88c147f](https://github.com/Cap-go/capgo/commit/88c147fc48b4d10046ff38b4aca4022889290b3e))

### 12.12.21 (2025-07-15)

### 12.12.20 (2025-07-15)

### 12.12.19 (2025-07-15)

### 12.12.18 (2025-07-15)

### 12.12.17 (2025-07-15)

### 12.12.16 (2025-07-15)

### 12.12.15 (2025-07-15)

### 12.12.14 (2025-07-14)

### 12.12.13 (2025-07-14)

### 12.12.12 (2025-07-14)

### 12.12.11 (2025-07-14)

### 12.12.10 (2025-07-14)

### 12.12.9 (2025-07-14)

### 12.12.8 (2025-07-14)

### 12.12.7 (2025-07-14)

### 12.12.6 (2025-07-14)

### 12.12.5 (2025-07-14)

### 12.12.4 (2025-07-14)

### 12.12.3 (2025-07-14)

### 12.12.2 (2025-07-14)

### 12.12.1 (2025-07-14)

## 12.12.0 (2025-07-14)

### Features

- add composite index for manifest table to optimize performance
  ([6669ce0](https://github.com/Cap-go/capgo/commit/6669ce017e04cb4f46c675a08a5a1eab11908284))

### 12.11.96 (2025-07-14)

### 12.11.95 (2025-07-11)

### 12.11.94 (2025-07-11)

### Bug Fixes

- claude config
  ([39d1a02](https://github.com/Cap-go/capgo/commit/39d1a02032af10782cc31b3dec9ba632cc5afb0d))

### 12.11.93 (2025-07-11)

### 12.11.92 (2025-07-10)

### 12.11.91 (2025-07-10)

### Bug Fixes

- add missing resolve
  ([faf8bae](https://github.com/Cap-go/capgo/commit/faf8baed3cea310448d613c3b1a797acdb45256f))

### 12.11.90 (2025-07-10)

### 12.11.89 (2025-07-10)

### 12.11.88 (2025-07-07)

### 12.11.87 (2025-07-07)

### 12.11.86 (2025-07-07)

### 12.11.85 (2025-07-07)

### 12.11.84 (2025-07-07)

### Bug Fixes

- build issues
  ([4a6ae8d](https://github.com/Cap-go/capgo/commit/4a6ae8db6eaf40d5410ee98c2574ab289071d888))

### 12.11.83 (2025-07-07)

### 12.11.82 (2025-07-07)

### 12.11.81 (2025-07-07)

### 12.11.80 (2025-07-07)

### Bug Fixes

- remove useless functions
  ([b871fca](https://github.com/Cap-go/capgo/commit/b871fca7b2be2ba63bd73575ab64314307b10693))

### 12.11.79 (2025-07-07)

### Bug Fixes

- stats return 200 even when fail
  ([e6d6140](https://github.com/Cap-go/capgo/commit/e6d6140dcfbe4825a173442a24a39e69cd77fda0))

### 12.11.78 (2025-07-07)

### Bug Fixes

- typechecks
  ([1f708a6](https://github.com/Cap-go/capgo/commit/1f708a6d49ea6782f85faa6a811fb2d0cdcaeb96))

### 12.11.77 (2025-07-07)

### 12.11.76 (2025-07-02)

### Bug Fixes

- c as any issue
  ([c0af60f](https://github.com/Cap-go/capgo/commit/c0af60feaf299599eb4fa3afadddec4a28fbf771))

### 12.11.75 (2025-07-01)

### 12.11.74 (2025-07-01)

### 12.11.73 (2025-07-01)

### 12.11.72 (2025-07-01)

### 12.11.71 (2025-07-01)

### 12.11.70 (2025-07-01)

### 12.11.69 (2025-07-01)

### 12.11.68 (2025-07-01)

### 12.11.67 (2025-07-01)

### 12.11.66 (2025-07-01)

### 12.11.65 (2025-07-01)

### 12.11.64 (2025-06-30)

### 12.11.63 (2025-06-30)

### 12.11.62 (2025-06-30)

### 12.11.61 (2025-06-30)

### 12.11.60 (2025-06-30)

### 12.11.59 (2025-06-30)

### 12.11.58 (2025-06-30)

### 12.11.57 (2025-06-30)

### 12.11.56 (2025-06-30)

### 12.11.55 (2025-06-30)

### Bug Fixes

- duplicated code issue
  ([77a7c34](https://github.com/Cap-go/capgo/commit/77a7c34cdd4d7eaeb0797c03b29f483eab81cfc6))

### 12.11.54 (2025-06-30)

### Bug Fixes

- try new bump
  ([754b747](https://github.com/Cap-go/capgo/commit/754b7474bdf45ebcdf7b1442b8c8310c8a47aba0))

### 12.11.53 (2025-06-30)

### Bug Fixes

- make changelog size never too big
  ([360b12a](https://github.com/Cap-go/capgo/commit/360b12aed6808ac992b6fef6ce0dcad56f097ea0))

### 12.11.52 (2025-06-30)

### Bug Fixes

- import type
  ([cd1e0cd](https://github.com/Cap-go/capgo/commit/cd1e0cd1c66f334213ecce1255e1c5dfe9151316))

### 12.11.51 (2025-06-30)

### 12.11.50 (2025-06-30)

### 12.11.49 (2025-06-30)

### 12.11.48 (2025-06-30)

### 12.11.47 (2025-06-30)

### 12.11.46 (2025-06-29)

### Bug Fixes

- remove shake from native as it's embed in plugin now
  ([4c1fbb8](https://github.com/Cap-go/capgo/commit/4c1fbb85b15e488ac49499a06078da44ccfb39a9))

### 12.11.45 (2025-06-29)

### 12.11.44 (2025-06-29)

### 12.11.43 (2025-06-29)

### 12.11.42 (2025-06-29)

### 12.11.41 (2025-06-29)

### 12.11.40 (2025-06-29)

### 12.11.39 (2025-06-29)

### 12.11.38 (2025-06-29)

### 12.11.37 (2025-06-29)

### 12.11.36 (2025-06-27)

### 12.11.35 (2025-06-27)

### 12.11.34 (2025-06-27)

### 12.11.33 (2025-06-27)

### 12.11.32 (2025-06-27)

### 12.11.31 (2025-06-27)

### 12.11.30 (2025-06-27)

### 12.11.29 (2025-06-27)

### Bug Fixes

- auto delete manifest
  ([6352867](https://github.com/Cap-go/capgo/commit/635286731cf25277d1bcdcbf01bc2a895e773a54))

### 12.11.28 (2025-06-26)

### 12.11.27 (2025-06-26)

### 12.11.26 (2025-06-26)

### 12.11.25 (2025-06-26)

### 12.11.24 (2025-06-26)

### Bug Fixes

- test better in local
  ([103e3fe](https://github.com/Cap-go/capgo/commit/103e3fe5b4e7966dc6d4284f83b9089dbb4f8bed))

### 12.11.23 (2025-06-25)

### Bug Fixes

- reduce complexity
  ([e269832](https://github.com/Cap-go/capgo/commit/e26983291b603ccec56afda8d8d5cdd0e0661481))

### 12.11.22 (2025-06-25)

### Bug Fixes

- plan complexity
  ([cfbe4b6](https://github.com/Cap-go/capgo/commit/cfbe4b697bca4f26a0afe9a264c97b97545b7699))

### 12.11.21 (2025-06-25)

### 12.11.20 (2025-06-25)

### 12.11.19 (2025-06-25)

### 12.11.18 (2025-06-25)

### 12.11.17 (2025-06-25)

### Bug Fixes

- missing cursor
  ([de17d1d](https://github.com/Cap-go/capgo/commit/de17d1de121a7756bdc5eebf0e78a05ce92b7f7f))

### 12.11.16 (2025-06-25)

### Bug Fixes

- backend lint
  ([f1f7c77](https://github.com/Cap-go/capgo/commit/f1f7c77a19d2a8d0e0a32864369ce0a21848580a))

### 12.11.15 (2025-06-25)

### Bug Fixes

- lint issue
  ([75847eb](https://github.com/Cap-go/capgo/commit/75847ebbe84ee7f3d81d899d86941da9c659f238))

### 12.11.14 (2025-06-25)

### 12.11.13 (2025-06-25)

### 12.11.12 (2025-06-25)

### 12.11.11 (2025-06-25)

### 12.11.10 (2025-06-25)

### 12.11.9 (2025-06-25)

### 12.11.8 (2025-06-25)

### Bug Fixes

- coverage in json
  ([ac1322f](https://github.com/Cap-go/capgo/commit/ac1322fbdec913aa9918983094744ce98c226ab2))

### 12.11.7 (2025-06-25)

### 12.11.6 (2025-06-25)

### 12.11.5 (2025-06-25)

### Bug Fixes

- ignore formkit config
  ([98c26cd](https://github.com/Cap-go/capgo/commit/98c26cd8b373cafd63b24bb25c2f166c415cb52c))

### 12.11.4 (2025-06-23)

### Bug Fixes

- test issue
  ([6f2929d](https://github.com/Cap-go/capgo/commit/6f2929d0ee7a06b4992608054eb90d358a2d7612))

### 12.11.3 (2025-06-23)

### Bug Fixes

- toast issue
  ([dbb13c7](https://github.com/Cap-go/capgo/commit/dbb13c7045f61dd7c53cf8bcccb95a1a9116296e))

### 12.11.2 (2025-06-21)

### Bug Fixes

- ts error
  ([ecfb6ad](https://github.com/Cap-go/capgo/commit/ecfb6adc4c818b2b5e95a3e27e0154af01cdad94))

### 12.11.1 (2025-06-20)

### Bug Fixes

- deno issue sentry
  ([893e679](https://github.com/Cap-go/capgo/commit/893e679cfd6cb902f5b8138e8496f18eb374e0eb))

## 12.11.0 (2025-06-20)

### Features

- add missing set bundle to channel
  ([a82ea09](https://github.com/Cap-go/capgo/commit/a82ea0946c68546009ad3cdf8bbb678fecb0fdf3))

### 12.10.1 (2025-06-19)

## 12.10.0 (2025-06-19)

### Features

- add new metric to track devices numbers
  ([38449ee](https://github.com/Cap-go/capgo/commit/38449ee4f2971918e7f06ffac0250338ba626816))

### 12.9.58 (2025-06-19)

### 12.9.57 (2025-06-19)

### Bug Fixes

- missing public
  ([6d39831](https://github.com/Cap-go/capgo/commit/6d398315b9e2db9bcaeeb4a328005b4987368206))

### 12.9.56 (2025-06-19)

### 12.9.55 (2025-06-18)

### 12.9.54 (2025-06-17)

### 12.9.53 (2025-06-17)

### Bug Fixes

- use correct types
  ([a46c56b](https://github.com/Cap-go/capgo/commit/a46c56b0a8c725d95650f44a8e0e0d75132cb4bc))

### 12.9.52 (2025-06-17)

### 12.9.51 (2025-06-17)

### 12.9.50 (2025-06-17)

### 12.9.49 (2025-06-17)

### Bug Fixes

- remove cursor mcp from sonarcloud
  ([a4f1bb4](https://github.com/Cap-go/capgo/commit/a4f1bb4cb1ca7dd26ab80f1b8c79bb120848af69))

### 12.9.48 (2025-06-17)

### Bug Fixes

- set sonar config
  ([df3ddb3](https://github.com/Cap-go/capgo/commit/df3ddb3c35156b0a3bd57f3c634328c3ba11a454))

### 12.9.47 (2025-06-17)

### Bug Fixes

- stripe
  ([ef2c276](https://github.com/Cap-go/capgo/commit/ef2c276c3bf250204421b5ecb5269403284187ac))

### 12.9.46 (2025-06-17)

### 12.9.45 (2025-06-17)

### 12.9.44 (2025-06-17)

### Bug Fixes

- lockfile ios
  ([d612524](https://github.com/Cap-go/capgo/commit/d61252404892063ca39f95c6f4fe010dbef627d3))

### 12.9.43 (2025-06-17)

### 12.9.42 (2025-06-17)

### 12.9.41 (2025-06-17)

### Bug Fixes

- lint issue
  ([a73da8f](https://github.com/Cap-go/capgo/commit/a73da8fd9d4b7811aca2afdccad7fc71133d583a))

### 12.9.40 (2025-06-16)

### 12.9.39 (2025-06-16)

### Bug Fixes

- update secrets
  ([8233155](https://github.com/Cap-go/capgo/commit/8233155450cf140eace57e4b0c2147878343266e))

### 12.9.38 (2025-06-14)

### 12.9.37 (2025-06-14)

### 12.9.36 (2025-06-14)

### 12.9.35 (2025-06-14)

### Bug Fixes

- use latest version with the fix
  ([0d17b71](https://github.com/Cap-go/capgo/commit/0d17b71b27c81faed33b315fdb012ab92c83aff6))

### 12.9.34 (2025-06-12)

### Bug Fixes

- prepare to remove api_key in exist_app_versions
  ([63891d2](https://github.com/Cap-go/capgo/commit/63891d23727100b7423bbbba8d5b9208074e6130))

### 12.9.33 (2025-06-10)

### Bug Fixes

- remove concurency issue
  ([7912dde](https://github.com/Cap-go/capgo/commit/7912ddead1dbb71d984439e39793036da00161e3))

### 12.9.32 (2025-06-09)

### 12.9.31 (2025-06-05)

### Bug Fixes

- seed
  ([dfb9208](https://github.com/Cap-go/capgo/commit/dfb920837c170cd64c4ba88a9da2e662729152d4))

### 12.9.30 (2025-06-05)

### Bug Fixes

- calculator
  ([f892fce](https://github.com/Cap-go/capgo/commit/f892fceadce6dbda78e7332bedb7e70d2cae8efd))

### 12.9.29 (2025-06-05)

### 12.9.28 (2025-06-05)

### 12.9.27 (2025-06-05)

### 12.9.26 (2025-06-05)

### 12.9.25 (2025-06-05)

### 12.9.24 (2025-06-05)

### 12.9.23 (2025-06-04)

### 12.9.22 (2025-06-04)

### 12.9.21 (2025-06-04)

### Bug Fixes

- use latest CLI
  ([ec0a12c](https://github.com/Cap-go/capgo/commit/ec0a12cc41f6d3750df3d82ca0519d06a734861a))

### 12.9.20 (2025-06-04)

### 12.9.19 (2025-06-04)

### Bug Fixes

- test meta
  ([d358a24](https://github.com/Cap-go/capgo/commit/d358a24400620fc79db8305ca35a1a5fbe6132ec))

### 12.9.18 (2025-06-04)

### 12.9.17 (2025-06-04)

### 12.9.16 (2025-06-04)

### Bug Fixes

- test in prod
  ([383576f](https://github.com/Cap-go/capgo/commit/383576f97cd30c3d2b456a6825b473648bdc714c))

### 12.9.15 (2025-06-04)

### Bug Fixes

- bypass typescheck for seed functions
  ([4cfaaa1](https://github.com/Cap-go/capgo/commit/4cfaaa15f6a357b7a2fa377e07764e91b91959c7))

### 12.9.14 (2025-06-04)

### 12.9.13 (2025-06-04)

### Bug Fixes

- use latest cloudflare
  ([4a2f0cc](https://github.com/Cap-go/capgo/commit/4a2f0cc0c42de1e248da0b8e024c14c85d1facf9))

### 12.9.12 (2025-06-04)

### 12.9.11 (2025-06-03)

### Bug Fixes

- use new version option in capacitor.config
  ([8359459](https://github.com/Cap-go/capgo/commit/8359459ce24fd89fd9a17c94c304e9240154e215))

### 12.9.10 (2025-06-03)

### 12.9.9 (2025-06-03)

### 12.9.8 (2025-06-03)

### Bug Fixes

- add logpush
  ([c25502d](https://github.com/Cap-go/capgo/commit/c25502d06cb5537d9911c377699ea492d58a4aed))

### 12.9.7 (2025-06-02)

### 12.9.6 (2025-06-01)

### 12.9.5 (2025-06-01)

### 12.9.4 (2025-06-01)

### 12.9.3 (2025-06-01)

### Bug Fixes

- remove is_app_org_owner
  ([f5ef67c](https://github.com/Cap-go/capgo/commit/f5ef67cf097c53934255058f5899739f96d95093))

### 12.9.2 (2025-06-01)

### Bug Fixes

- issue build
  ([86b16cd](https://github.com/Cap-go/capgo/commit/86b16cdf3aeeb1c144be9b93fccb93a6acf65d58))

### 12.9.1 (2025-06-01)

## 12.9.0 (2025-06-01)

### Features

- add CF log to discord
  ([068ab6b](https://github.com/Cap-go/capgo/commit/068ab6bc477f14f85ba2bd570918c5c9fbe1631b))

### 12.8.30 (2025-05-31)

### 12.8.29 (2025-05-30)

### 12.8.28 (2025-05-30)

### 12.8.27 (2025-05-30)

### 12.8.26 (2025-05-30)

### 12.8.25 (2025-05-30)

### 12.8.24 (2025-05-30)

### 12.8.23 (2025-05-30)

### 12.8.22 (2025-05-30)

### Bug Fixes

- use new system for test
  ([28cbcad](https://github.com/Cap-go/capgo/commit/28cbcadbc74b31391e012b6f29e8e7a35c3ee164))

### 12.8.21 (2025-05-29)

### Bug Fixes

- add setUser for posthog
  ([ed0456e](https://github.com/Cap-go/capgo/commit/ed0456e1fe29de1a4e8e049d27ea5e63c737f159))

### 12.8.20 (2025-05-29)

### Bug Fixes

- lint issue
  ([6cdccd4](https://github.com/Cap-go/capgo/commit/6cdccd4c49a9e7e114f5b9f129c8280d2144371a))

### 12.8.19 (2025-05-29)

### 12.8.18 (2025-05-29)

### 12.8.17 (2025-05-29)

### 12.8.16 (2025-05-29)

### 12.8.15 (2025-05-29)

### 12.8.14 (2025-05-29)

### 12.8.13 (2025-05-29)

### 12.8.12 (2025-05-29)

### 12.8.11 (2025-05-29)

### 12.8.10 (2025-05-29)

### 12.8.9 (2025-05-29)

### 12.8.8 (2025-05-28)

### Bug Fixes

- update logging to use cloudlogErr and remove unused database functions
  ([2f09023](https://github.com/Cap-go/capgo/commit/2f09023602d1e0e07c604166971e9edd60115a6a))

### 12.8.7 (2025-05-27)

### Bug Fixes

- add better info in discord error
  ([b3a3ae4](https://github.com/Cap-go/capgo/commit/b3a3ae447c36aea16e5947a11cd5780d0a3867dc))

### 12.8.6 (2025-05-27)

### Bug Fixes

- env issue
  ([c24d4a0](https://github.com/Cap-go/capgo/commit/c24d4a08884d3c7318a115ba47149be53d97cea0))

### 12.8.5 (2025-05-27)

### Bug Fixes

- typo in process_function_queue
  ([1839cc6](https://github.com/Cap-go/capgo/commit/1839cc6279ba6ababa5a0cb484d4a6bffdc25dda))

### 12.8.4 (2025-05-27)

### 12.8.3 (2025-05-27)

### 12.8.2 (2025-05-27)

### Bug Fixes

- remove unused import in queue_load test
  ([7e07221](https://github.com/Cap-go/capgo/commit/7e0722120ca5db0e75dfd58c70f1e814e417385c))

### 12.8.1 (2025-05-27)

## 12.8.0 (2025-05-27)

### Features

- add compatibility checks for native packages when set bundle to channel
  ([3eb232c](https://github.com/Cap-go/capgo/commit/3eb232c0a0ea9a8664ec052eeb184883df58850d))

### 12.7.12 (2025-05-27)

### 12.7.11 (2025-05-27)

### Bug Fixes

- update Supabase start command and replace icon imports with InformationInfo
  from heroicons
  ([2223887](https://github.com/Cap-go/capgo/commit/2223887b0ebd24689c6fac552116f41b89f5b439))

### 12.7.10 (2025-05-27)

### 12.7.9 (2025-05-27)

### 12.7.8 (2025-05-27)

### 12.7.7 (2025-05-27)

### 12.7.6 (2025-05-27)

### 12.7.5 (2025-05-27)

### 12.7.4 (2025-05-26)

### 12.7.3 (2025-05-26)

### 12.7.2 (2025-05-26)

### 12.7.1 (2025-05-26)

### Bug Fixes

- remove dependencyDashboard
  ([e2ceeed](https://github.com/Cap-go/capgo/commit/e2ceeedac4c9965d8cc54a48c92f63ffe2a2dfe8))

## 12.7.0 (2025-05-23)

### Features

- apple-app-site-association
  ([8dc6d2a](https://github.com/Cap-go/capgo/commit/8dc6d2a0d52da0a7e1e61da36a804cf06020823a))

### 12.6.45 (2025-05-19)

### 12.6.44 (2025-05-19)

### Bug Fixes

- roll analytic token
  ([5eb5e78](https://github.com/Cap-go/capgo/commit/5eb5e78251fb43e4bb29f425ad8ceabb7d9e1f07))

### 12.6.43 (2025-05-19)

### Bug Fixes

- loggin test
  ([9c6c8fa](https://github.com/Cap-go/capgo/commit/9c6c8faf73c6023226acbce187c18e79ab2a6a4d))

### 12.6.42 (2025-05-18)

### 12.6.41 (2025-05-18)

### 12.6.40 (2025-05-18)

### Bug Fixes

- issue create channel
  ([3329907](https://github.com/Cap-go/capgo/commit/3329907c7f1d0c586fab307f7705c0385e51954e))

### 12.6.39 (2025-05-18)

### 12.6.38 (2025-05-17)

### Bug Fixes

- try to remove usage supabase deploy api
  ([f3f4e21](https://github.com/Cap-go/capgo/commit/f3f4e219ced0168685bb2d8dd688ceb755ded4d4))

### 12.6.37 (2025-05-17)

### Bug Fixes

- perf isssue
  ([a6a37cb](https://github.com/Cap-go/capgo/commit/a6a37cb1371d145108867ad183ca54af1dbcc80a))

### 12.6.36 (2025-05-17)

### 12.6.35 (2025-05-17)

### 12.6.34 (2025-05-17)

### 12.6.33 (2025-05-16)

### 12.6.32 (2025-05-16)

### 12.6.31 (2025-05-16)

### 12.6.30 (2025-05-16)

### Bug Fixes

- add index for http_response
  ([579d4e5](https://github.com/Cap-go/capgo/commit/579d4e59465c0c9f4b2b81da962813025b2161d9))

### 12.6.29 (2025-05-16)

### 12.6.28 (2025-05-16)

### 12.6.27 (2025-05-16)

### 12.6.26 (2025-05-16)

### Bug Fixes

- improves cron jobs
  ([e528504](https://github.com/Cap-go/capgo/commit/e528504eef461d197bef7ce44123d2c160b18ed1))

### 12.6.25 (2025-05-15)

### Bug Fixes

- make sure the test never fail
  ([69f2600](https://github.com/Cap-go/capgo/commit/69f2600bb67eab85ccfa10b1f2f6d936e4046946))

### 12.6.24 (2025-05-15)

### Bug Fixes

- test issue
  ([b3d8b53](https://github.com/Cap-go/capgo/commit/b3d8b53d0d0f188e4658b450f2061ee6d889338b))

### 12.6.23 (2025-05-15)

### 12.6.22 (2025-05-15)

### 12.6.21 (2025-05-15)

### 12.6.20 (2025-05-13)

### 12.6.19 (2025-05-12)

### 12.6.18 (2025-05-12)

### 12.6.17 (2025-05-08)

### Bug Fixes

- prevent size effect of queue
  ([559a3c3](https://github.com/Cap-go/capgo/commit/559a3c314d7edbaa05fff1a4f857358d7dcbc5f1))

### 12.6.16 (2025-05-08)

### 12.6.15 (2025-05-08)

### 12.6.14 (2025-05-08)

### Bug Fixes

- only
  ([4953e04](https://github.com/Cap-go/capgo/commit/4953e040f3b98cb29aed380fb0d0fa4b3800ed22))

### 12.6.13 (2025-05-08)

### Bug Fixes

- display usage to all users
  ([826e5d4](https://github.com/Cap-go/capgo/commit/826e5d47731a7a1cf8978585b01be3a8226f95c7))

### 12.6.12 (2025-05-07)

### 12.6.11 (2025-05-07)

### 12.6.10 (2025-05-07)

### Bug Fixes

- filename issue with name with special characters
  ([3a0e249](https://github.com/Cap-go/capgo/commit/3a0e249b1e2bcdbc1f19cd23e98fa5360ea6c0b2))

### 12.6.9 (2025-05-06)

### 12.6.8 (2025-05-06)

### Bug Fixes

- error handling stripe events
  ([337de3e](https://github.com/Cap-go/capgo/commit/337de3e0944720abed770974c170395bdc00721f))

### 12.6.7 (2025-05-06)

### 12.6.6 (2025-05-06)

### Bug Fixes

- event parse for invoice.upcoming
  ([7f490cb](https://github.com/Cap-go/capgo/commit/7f490cb80477aa4c21bfaefdb95869902f185955))

### 12.6.5 (2025-05-06)

### Bug Fixes

- better log to help debug stats
  ([afc4cd5](https://github.com/Cap-go/capgo/commit/afc4cd52c21332350f687ee935426b082d87044c))

### 12.6.4 (2025-05-05)

### 12.6.3 (2025-05-05)

### Bug Fixes

- triple reload table
  ([07dbbbf](https://github.com/Cap-go/capgo/commit/07dbbbf52a3bb9c90ade6ef375c5a333659dd01b))

### 12.6.2 (2025-05-05)

### Bug Fixes

- reload page loosing tab url param
  ([9c1807d](https://github.com/Cap-go/capgo/commit/9c1807dae1c1b5998605a3839b893cbeed31b7ee))

### 12.6.1 (2025-05-02)

## 12.6.0 (2025-05-02)

### Features

- add test for channel
  ([9f4fb7b](https://github.com/Cap-go/capgo/commit/9f4fb7b000c752dc24ccae72d77ae26ba2582b40))

### 12.5.19 (2025-05-01)

### Bug Fixes

- add test for events and fix event
  ([6696be7](https://github.com/Cap-go/capgo/commit/6696be7ebe932f686180c837dca90bccb11637d1))

### 12.5.18 (2025-04-30)

### 12.5.17 (2025-04-30)

### 12.5.16 (2025-04-30)

### Bug Fixes

- allow to search by version name
  ([c2aa0e0](https://github.com/Cap-go/capgo/commit/c2aa0e0ee15e55615ebeca7e47a3f628c1ab48d8))

### 12.5.15 (2025-04-30)

### 12.5.14 (2025-04-30)

### Bug Fixes

- delete all bundle
  ([078238f](https://github.com/Cap-go/capgo/commit/078238f074bf791358ce2e64f210511fa0e8404a))

### 12.5.13 (2025-04-28)

### 12.5.12 (2025-04-27)

### 12.5.11 (2025-04-27)

### 12.5.10 (2025-04-27)

### 12.5.9 (2025-04-27)

### 12.5.8 (2025-04-26)

### Bug Fixes

- missing indexes
  ([b6752b9](https://github.com/Cap-go/capgo/commit/b6752b9449c9a70b2a1ffefc40d383d97ec6da78))

### 12.5.7 (2025-04-26)

### Bug Fixes

- make deploy run in parallel
  ([5052fb9](https://github.com/Cap-go/capgo/commit/5052fb9d948b52391b2682149480d00947331b57))

### 12.5.6 (2025-04-25)

### Bug Fixes

- console log backend
  ([441c757](https://github.com/Cap-go/capgo/commit/441c7577b3420fb68b72d48663f48fd8a07051e5))

### 12.5.5 (2025-04-25)

### 12.5.4 (2025-04-25)

### 12.5.3 (2025-04-25)

### Bug Fixes

- use correct name for lite v2
  ([fdf1f90](https://github.com/Cap-go/capgo/commit/fdf1f908a04f7fecd0afb11c0da65c9a68293f50))

### 12.5.2 (2025-04-25)

### Bug Fixes

- typecheck
  ([cdc253b](https://github.com/Cap-go/capgo/commit/cdc253b1915146165a90806190ed7780cdd6c243))

### 12.5.1 (2025-04-25)

## 12.5.0 (2025-04-25)

### Features

- add update_lite
  ([075731f](https://github.com/Cap-go/capgo/commit/075731fa6a2807f9559f8c24b273170e67bb349a))

### 12.4.9 (2025-04-25)

### 12.4.8 (2025-04-25)

### 12.4.7 (2025-04-24)

### Bug Fixes

- test D1 in prod again
  ([8566fa3](https://github.com/Cap-go/capgo/commit/8566fa3dadcf9c8c1585bacff5d34633404a3471))

### 12.4.6 (2025-04-24)

### 12.4.5 (2025-04-24)

### Bug Fixes

- session with d1
  ([5b1369a](https://github.com/Cap-go/capgo/commit/5b1369aaa7cfe35d55ed62c3bead120de747f7b6))

### 12.4.4 (2025-04-23)

### 12.4.3 (2025-04-23)

### 12.4.2 (2025-04-23)

### Bug Fixes

- stats and secu issue with sub key
  ([a39df4e](https://github.com/Cap-go/capgo/commit/a39df4e2a66b2468222d5d79066996ea5ea4ac6c))

### 12.4.1 (2025-04-23)

## 12.4.0 (2025-04-23)

### Features

- add subkey system + fix public api and org dropdown
  ([eb96ab4](https://github.com/Cap-go/capgo/commit/eb96ab4e48b4ce1dc0394caea1896429d36ac958))

### 12.3.2 (2025-04-22)

### Bug Fixes

- allow to delete the org creator
  ([ee9f7ce](https://github.com/Cap-go/capgo/commit/ee9f7ce6f183169459b3f0f7b3c755abc6c5ad77))

### 12.3.1 (2025-04-22)

## 12.3.0 (2025-04-21)

### Features

- allow modify apikey org or app
  ([939f0ac](https://github.com/Cap-go/capgo/commit/939f0ac2ab7a25d4e23e404d85d047296b208ed4))

### 12.2.22 (2025-04-20)

### 12.2.21 (2025-04-20)

### 12.2.20 (2025-04-20)

### Bug Fixes

- make replication even more smart
  ([7f6497f](https://github.com/Cap-go/capgo/commit/7f6497f4022b8b82ee0bf3644c94670bacb58aeb))

### 12.2.19 (2025-04-20)

### 12.2.18 (2025-04-19)

### 12.2.17 (2025-04-19)

### Bug Fixes

- navbar design and app info location
  ([1f3f9c9](https://github.com/Cap-go/capgo/commit/1f3f9c904be6c7744dd3a22594ba491370d8bdc3))

### 12.2.16 (2025-04-19)

### 12.2.15 (2025-04-18)

### 12.2.14 (2025-04-18)

### 12.2.13 (2025-04-18)

### 12.2.12 (2025-04-17)

### Bug Fixes

- security issue in API
  ([d407407](https://github.com/Cap-go/capgo/commit/d40740744959a549b326b1f1ff275d65b321ea94))

### 12.2.11 (2025-04-17)

### Bug Fixes

- apikeys
  ([4dabfef](https://github.com/Cap-go/capgo/commit/4dabfef994e6b1608799c26f8f6b2692d3a37db6))

### 12.2.10 (2025-04-17)

### 12.2.9 (2025-04-17)

### Bug Fixes

- stripe issue and missing app endpoint
  ([14bfc0e](https://github.com/Cap-go/capgo/commit/14bfc0e04514d7bcfbfc4007e3c29ae950815631))

### 12.2.8 (2025-04-17)

### Bug Fixes

- delete API key
  ([a9c78c7](https://github.com/Cap-go/capgo/commit/a9c78c77ce179bf9b05397506e99cea01baf260d))

### 12.2.7 (2025-04-15)

### Bug Fixes

- banner
  ([777bf3b](https://github.com/Cap-go/capgo/commit/777bf3bcd1bf3267e203b3ec956efb9adedb7ba3))

### 12.2.6 (2025-04-15)

### 12.2.5 (2025-04-15)

### Bug Fixes

- not show add bundle auto on filter
  ([a531868](https://github.com/Cap-go/capgo/commit/a531868fc21c4e087d00d0cfaad0fbce5ef97574))

### 12.2.4 (2025-04-15)

---

_Older entries truncated to keep file size manageable_
