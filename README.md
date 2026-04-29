# Capgo CLI
  <a href="https://capgo.app/"><img src='https://raw.githubusercontent.com/Cap-go/capgo/main/assets/capgo_banner.png' alt='Capgo - Instant updates for capacitor'/></a>

<div align="center">
<h2><a href="https://capgo.app/">Check out: Capgo — Instant updates for capacitor</a></h2>
</div>

A CLI to upload and download files from the Capgo Cloud.

You can find the most up to date version of this doc in our web doc:
https://capgo.app/docs/cli/overview/

## Usage

Before using the CLI, you should register here: https://capgo.app/

Then go to your account in `apikey` section and click in the `all` key to copy it.

Follow the documentation here: https://capacitorjs.com/docs/getting-started/

<!-- AUTO-GENERATED-DOCS-START -->
## 📑 Capgo CLI Commands

## 📋 Table of Contents

- 🚀 [Init](#init)
- 📱 [Run](#run)
  - [Device](#run-device)
- 🔹 [Star](#star)
- 🔹 [Star-all](#star-all)
- 👨‍⚕️ [Doctor](#doctor)
- 🔑 [Login](#login)
- 📦 [Bundle](#bundle)
  - [Upload](#bundle-upload)
  - [Compatibility](#bundle-compatibility)
  - [ReleaseType](#bundle-releaseType)
  - [Delete](#bundle-delete)
  - [List](#bundle-list)
  - [Cleanup](#bundle-cleanup)
  - [Encrypt](#bundle-encrypt)
  - [Decrypt](#bundle-decrypt)
  - [Zip](#bundle-zip)
- 📱 [App](#app)
  - [Add](#app-add)
  - [Delete](#app-delete)
  - [List](#app-list)
  - [Debug](#app-debug)
  - [Setting](#app-setting)
  - [Set](#app-set)
- 📢 [Channel](#channel)
  - [Add](#channel-add)
  - [Delete](#channel-delete)
  - [List](#channel-list)
  - [CurrentBundle](#channel-currentBundle)
  - [Set](#channel-set)
- 🔐 [Key](#key)
  - [Save](#key-save)
  - [Create](#key-create)
  - [Delete_old](#key-delete_old)
- 👤 [Account](#account)
  - [Id](#account-id)
- 🔹 [Organization](#organization)
  - [List](#organization-list)
  - [Add](#organization-add)
  - [Members](#organization-members)
  - [Set](#organization-set)
  - [Delete](#organization-delete)
- 🔹 [Organisation](#organisation)
  - [List](#organisation-list)
  - [Add](#organisation-add)
  - [Set](#organisation-set)
  - [Delete](#organisation-delete)
- 🔹 [Build](#build)
  - [Init](#build-init)
  - [Request](#build-request)
  - [Credentials](#build-credentials)
- 🔹 [Probe](#probe)
- 🔹 [Mcp](#mcp)

## <a id="init"></a> 🚀 **Init**

**Alias:** `i`

```bash
npx @capgo/cli@latest init
```

🚀 Initialize a new app in Capgo Cloud with step-by-step guidance.
This includes adding code for updates, building, uploading your app, and verifying update functionality.
Capgo bundles are web assets and can be fetched by anyone who knows the URL. Use encryption for banking, regulated, or other high-security apps.
During the iOS run-on-device step, choose a physical iPhone/iPad or simulator. If you choose a physical device, the CLI lets you connect, unlock, and check again before it launches the app.

**Example:**

```bash
npx @capgo/cli@latest init YOUR_API_KEY com.example.app
```

### <a id="init-options"></a> Options

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-n,** | <code>string</code> | App name for display in Capgo Cloud |
| **-i,** | <code>string</code> | App icon path for display in Capgo Cloud |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |


## <a id="run"></a> 📱 **Run**

📱 Run Capacitor apps on devices from the CLI.

### <a id="run-device"></a> 🔹 **Device**

```bash
npx @capgo/cli@latest run device
```

📱 Run your Capacitor app on a connected device or simulator.
If you omit the platform in an interactive terminal, the command asks whether to start on iOS or Android.
The command lists available devices and simulators, lets you reload the list, and runs with your selection.
For iOS, this asks whether to use a physical iPhone/iPad or simulator before showing devices.
Use --no-launch to print the resolved command without starting the app.

**Example:**

```bash
npx @capgo/cli@latest run device ios --no-launch
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **--no-launch** | <code>boolean</code> | Resolve and print the run command without starting the app |


## <a id="star"></a> 🔹 **Star**

```bash
npx @capgo/cli@latest star
```

⭐ Star a Capgo GitHub repository to support the project.
If you do not pass a repository name, this defaults to capacitor-updater in the Cap-go org.


## <a id="star-all"></a> 🔹 **Star-all**

```bash
npx @capgo/cli@latest star-all
```

⭐ Star all Capgo GitHub repositories with a small random delay between each request.
If you do not pass repositories, this defaults to all Cap-go repositories whose name starts with `capacitor-`.

### <a id="star-all-options"></a> Options

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **--min-delay-ms** | <code>string</code> | Minimum delay in ms between each star action (default: 20) |
| **--max-delay-ms** | <code>string</code> | Maximum delay in ms between each star action (default: 180) |
| **--max-concurrency** | <code>string</code> | Maximum number of star requests running in parallel (default: 4) |


## <a id="doctor"></a> 👨‍⚕️ **Doctor**

```bash
npx @capgo/cli@latest doctor
```

👨‍⚕️ Check if your Capgo app installation is up-to-date and gather information useful for bug reports.
This command helps diagnose issues with your setup.

**Example:**

```bash
npx @capgo/cli@latest doctor
```

### <a id="doctor-options"></a> Options

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **--package-json** | <code>string</code> | Paths to package.json files for monorepos (comma-separated) |


## <a id="login"></a> 🔑 **Login**

**Alias:** `l`

```bash
npx @capgo/cli@latest login
```

🔑 Save your Capgo API key to your machine or local folder for easier access to Capgo Cloud services.
Use --apikey=******** in any command to override it.

**Example:**

```bash
npx @capgo/cli@latest login YOUR_API_KEY
```

### <a id="login-options"></a> Options

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **--local** | <code>boolean</code> | Only save in local folder, git ignored for security. |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |


## <a id="bundle"></a> 📦 **Bundle**

📦 Manage app bundles for deployment in Capgo Cloud, including upload, compatibility checks, and encryption.

### <a id="bundle-upload"></a> ⬆️ **Upload**

**Alias:** `u`

```bash
npx @capgo/cli@latest bundle upload
```

⬆️ Upload a new app bundle to Capgo Cloud for distribution.
Version must be > 0.0.0 and unique. Deleted versions cannot be reused for security.
External option: Store only a URL link (useful for apps >200MB or privacy requirements).
Capgo never inspects external content. Add encryption for trustless security.

**Example:**

```bash
npx @capgo/cli@latest bundle upload com.example.app --path ./dist --channel production
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **-p,** | <code>string</code> | Path of the folder to upload, if not provided it will use the webDir set in capacitor.config |
| **-c,** | <code>string</code> | Channel to link to |
| **-e,** | <code>string</code> | Link to external URL instead of upload to Capgo Cloud |
| **--iv-session-key** | <code>string</code> | Set the IV and session key for bundle URL external |
| **--s3-region** | <code>string</code> | Region for your S3 bucket |
| **--s3-apikey** | <code>string</code> | API key for your S3 endpoint |
| **--s3-apisecret** | <code>string</code> | API secret for your S3 endpoint |
| **--s3-endpoint** | <code>string</code> | URL of S3 endpoint |
| **--s3-bucket-name** | <code>string</code> | Name for your AWS S3 bucket |
| **--s3-port** | <code>string</code> | Port for your S3 endpoint |
| **--no-s3-ssl** | <code>boolean</code> | Disable SSL for S3 upload |
| **--key-v2** | <code>string</code> | Custom path for private signing key (v2 system) |
| **--key-data-v2** | <code>string</code> | Private signing key (v2 system) |
| **--bundle-url** | <code>boolean</code> | Prints bundle URL into stdout |
| **--no-key** | <code>boolean</code> | Ignore signing key and send clear update |
| **--no-code-check** | <code>boolean</code> | Ignore checking if notifyAppReady() is called in source code and index present in root folder |
| **--display-iv-session** | <code>boolean</code> | Show in the console the IV and session key used to encrypt the update |
| **-b,** | <code>string</code> | Bundle version number of the bundle to upload |
| **--link** | <code>string</code> | Link to external resource (e.g. GitHub release) |
| **--comment** | <code>string</code> | Comment about this version, could be a release note, a commit hash, a commit message, etc. |
| **--min-update-version** | <code>string</code> | Minimal version required to update to this version. Used only if the disable auto update is set to metadata in channel |
| **--auto-min-update-version** | <code>boolean</code> | Set the min update version based on native packages |
| **--ignore-metadata-check** | <code>boolean</code> | Ignores the metadata (node_modules) check when uploading |
| **--ignore-checksum-check** | <code>boolean</code> | Ignores the checksum check when uploading |
| **--force-crc32-checksum** | <code>boolean</code> | Force CRC32 checksum for upload (override auto-detection) |
| **--timeout** | <code>string</code> | Timeout for the upload process in seconds |
| **--multipart** | <code>boolean</code> | [DEPRECATED] Use --tus instead. Uses multipart protocol for S3 uploads |
| **--zip** | <code>boolean</code> | Upload the bundle using zip to Capgo cloud (legacy) |
| **--tus** | <code>boolean</code> | Upload the bundle using TUS to Capgo cloud |
| **--tus-chunk-size** | <code>string</code> | Chunk size in bytes for TUS resumable uploads (default: auto) |
| **--partial** | <code>boolean</code> | [DEPRECATED] Use --delta instead. Upload incremental updates |
| **--partial-only** | <code>boolean</code> | [DEPRECATED] Use --delta-only instead. Upload only incremental updates, skip full bundle |
| **--delta** | <code>boolean</code> | Upload delta updates (only changed files) for instant, super fast updates instead of big zip downloads |
| **--delta-only** | <code>boolean</code> | Upload only delta updates without full bundle for maximum speed (useful for large apps) |
| **--no-delta** | <code>boolean</code> | Disable delta updates even if Direct Update is enabled |
| **--encrypted-checksum** | <code>string</code> | An encrypted checksum (signature). Used only when uploading an external bundle. |
| **--auto-set-bundle** | <code>boolean</code> | Set the bundle in capacitor.config.json |
| **--dry-upload** | <code>boolean</code> | Dry upload the bundle process, mean it will not upload the files but add the row in database (Used by Capgo for internal testing) |
| **--package-json** | <code>string</code> | Paths to package.json files for monorepos (comma-separated) |
| **--node-modules** | <code>string</code> | Paths to node_modules directories for monorepos (comma-separated) |
| **--encrypt-partial** | <code>boolean</code> | Encrypt delta update files (auto-enabled for updater > 6.14.4) |
| **--delete-linked-bundle-on-upload** | <code>boolean</code> | Locates the currently linked bundle in the channel you are trying to upload to, and deletes it |
| **--no-brotli-patterns** | <code>string</code> | Files to exclude from Brotli compression (comma-separated globs, e.g., "*.jpg,*.png") |
| **--disable-brotli** | <code>boolean</code> | Completely disable brotli compression even if updater version supports it |
| **--version-exists-ok** | <code>boolean</code> | Exit successfully if bundle version already exists, useful for CI/CD workflows with monorepos |
| **--self-assign** | <code>boolean</code> | Allow devices to auto-join this channel (updates channel setting) |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |
| **--verbose** | <code>boolean</code> | Enable verbose output with detailed logging |

### <a id="bundle-compatibility"></a> 🧪 **Compatibility**

```bash
npx @capgo/cli@latest bundle compatibility
```

🧪 Check compatibility of a bundle with a specific channel in Capgo Cloud to ensure updates are safe.

**Example:**

```bash
npx @capgo/cli@latest bundle compatibility com.example.app --channel production
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **-c,** | <code>string</code> | Channel to check the compatibility with |
| **--text** | <code>boolean</code> | Output text instead of emojis |
| **--package-json** | <code>string</code> | Paths to package.json files for monorepos (comma-separated) |
| **--node-modules** | <code>string</code> | Paths to node_modules directories for monorepos (comma-separated) |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="bundle-releaseType"></a> 🔹 **ReleaseType**

```bash
npx @capgo/cli@latest bundle releaseType
```

🧭 Print "native" or "OTA" based on compatibility with a channel's latest metadata.

**Example:**

```bash
npx @capgo/cli@latest bundle releaseType com.example.app --channel production
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **-c,** | <code>string</code> | Channel to compare against |
| **--package-json** | <code>string</code> | Paths to package.json files for monorepos (comma-separated) |
| **--node-modules** | <code>string</code> | Paths to node_modules directories for monorepos (comma-separated) |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="bundle-delete"></a> 🗑️ **Delete**

**Alias:** `d`

```bash
npx @capgo/cli@latest bundle delete
```

🗑️ Delete a specific bundle from Capgo Cloud, optionally targeting a single version.

**Example:**

```bash
npx @capgo/cli@latest bundle delete BUNDLE_ID com.example.app
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="bundle-list"></a> 📋 **List**

**Alias:** `l`

```bash
npx @capgo/cli@latest bundle list
```

📋 List all bundles uploaded for an app in Capgo Cloud.

**Example:**

```bash
npx @capgo/cli@latest bundle list com.example.app
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="bundle-cleanup"></a> 🧹 **Cleanup**

**Alias:** `c`

```bash
npx @capgo/cli@latest bundle cleanup
```

🧹 Delete old bundles in Capgo Cloud, keeping specified number of recent versions.
Bundles linked to channels are preserved unless --ignore-channel is used.

**Example:**

```bash
npx @capgo/cli@latest bundle cleanup com.example.app --bundle=1.0 --keep=3
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-b,** | <code>string</code> | Bundle version number of the app to delete |
| **-a,** | <code>string</code> | API key to link to your account |
| **-k,** | <code>string</code> | Number of versions to keep |
| **-f,** | <code>string</code> | Force removal |
| **--ignore-channel** | <code>boolean</code> | Delete bundles even if linked to channels (WARNING: deletes channels too) |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="bundle-encrypt"></a> 🔒 **Encrypt**

```bash
npx @capgo/cli@latest bundle encrypt
```

🔒 Encrypt a zip bundle for secure external storage.
Returns ivSessionKey for upload/decryption. Get checksum using 'bundle zip --json'.

**Example:**

```bash
npx @capgo/cli@latest bundle encrypt ./myapp.zip CHECKSUM
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **--key** | <code>string</code> | Custom path for private signing key |
| **--key-data** | <code>string</code> | Private signing key |
| **-j,** | <code>string</code> | Output in JSON |
| **--package-json** | <code>string</code> | Paths to package.json files for monorepos (comma-separated) |

### <a id="bundle-decrypt"></a> 🔓 **Decrypt**

```bash
npx @capgo/cli@latest bundle decrypt
```

🔓 Decrypt an encrypted bundle (mainly for testing).
Prints base64 session key for verification.

**Example:**

```bash
npx @capgo/cli@latest bundle decrypt ./myapp_encrypted.zip CHECKSUM
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **--key** | <code>string</code> | Custom path for private signing key |
| **--key-data** | <code>string</code> | Private signing key |
| **--checksum** | <code>string</code> | Checksum of the bundle, to verify the integrity of the bundle |
| **--package-json** | <code>string</code> | Paths to package.json files for monorepos (comma-separated) |

### <a id="bundle-zip"></a> 🔹 **Zip**

```bash
npx @capgo/cli@latest bundle zip
```

🗜️ Create a zip file of your app bundle.
Returns checksum for use with encryption. Use --json for machine-readable output.

**Example:**

```bash
npx @capgo/cli@latest bundle zip com.example.app --path ./dist
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-p,** | <code>string</code> | Path of the folder to upload, if not provided it will use the webDir set in capacitor.config |
| **-b,** | <code>string</code> | Bundle version number to name the zip file |
| **-n,** | <code>string</code> | Name of the zip file |
| **-j,** | <code>string</code> | Output in JSON |
| **--no-code-check** | <code>boolean</code> | Ignore checking if notifyAppReady() is called in source code and index present in root folder |
| **--key-v2** | <code>boolean</code> | Use encryption v2 |
| **--package-json** | <code>string</code> | Paths to package.json files for monorepos (comma-separated) |


## <a id="app"></a> 📱 **App**

📱 Manage your Capgo app settings and configurations in Capgo Cloud.

### <a id="app-add"></a> ➕ **Add**

**Alias:** `a`

```bash
npx @capgo/cli@latest app add
```

➕ Add a new app to Capgo Cloud with a unique app ID in the format com.test.app.
All options can be guessed from config if not provided.

**Example:**

```bash
npx @capgo/cli@latest app add com.example.app --name "My App" --icon ./icon.png
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-n,** | <code>string</code> | App name for display in Capgo Cloud |
| **-i,** | <code>string</code> | App icon path for display in Capgo Cloud |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="app-delete"></a> 🗑️ **Delete**

```bash
npx @capgo/cli@latest app delete
```

🗑️ Delete an app from Capgo Cloud, optionally specifying a version to delete only that bundle.

**Example:**

```bash
npx @capgo/cli@latest app delete com.example.app
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="app-list"></a> 📋 **List**

**Alias:** `l`

```bash
npx @capgo/cli@latest app list
```

📋 List all apps registered under your account in Capgo Cloud.

**Example:**

```bash
npx @capgo/cli@latest app list
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="app-debug"></a> 🐞 **Debug**

```bash
npx @capgo/cli@latest app debug
```

🐞 Listen for live update events in Capgo Cloud to debug your app.
Optionally target a specific device for detailed diagnostics.

**Example:**

```bash
npx @capgo/cli@latest app debug com.example.app --device DEVICE_ID
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **-d,** | <code>string</code> | The specific device ID to debug |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="app-setting"></a> ⚙️ **Setting**

```bash
npx @capgo/cli@latest app setting
```

⚙️ Modify Capacitor configuration programmatically.
Specify setting path (e.g., plugins.CapacitorUpdater.defaultChannel) with --string or --bool.

**Example:**

```bash
npx @capgo/cli@latest app setting plugins.CapacitorUpdater.defaultChannel --string "Production"
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **--bool** | <code>string</code> | A value for the setting to modify as a boolean, ex: --bool true |
| **--string** | <code>string</code> | A value for the setting to modify as a string, ex: --string "Production" |

### <a id="app-set"></a> ⚙️ **Set**

**Alias:** `s`

```bash
npx @capgo/cli@latest app set
```

⚙️ Update settings for an existing app in Capgo Cloud, such as name, icon, or retention period for bundles.
Retention of 0 means infinite storage.

**Example:**

```bash
npx @capgo/cli@latest app set com.example.app --name "Updated App" --retention 30
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-n,** | <code>string</code> | App name for display in Capgo Cloud |
| **-i,** | <code>string</code> | App icon path for display in Capgo Cloud |
| **-a,** | <code>string</code> | API key to link to your account |
| **-r,** | <code>string</code> | Days to keep old bundles (0 = infinite, default: 0) |
| **--expose-metadata** | <code>string</code> | Expose bundle metadata (link and comment) to the plugin (true/false, default: false) |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |


## <a id="channel"></a> 📢 **Channel**

📢 Manage distribution channels for app updates in Capgo Cloud, controlling how updates are delivered to devices.

### <a id="channel-add"></a> ➕ **Add**

**Alias:** `a`

```bash
npx @capgo/cli@latest channel add
```

➕ Create a new channel for app distribution in Capgo Cloud to manage update delivery.

**Example:**

```bash
npx @capgo/cli@latest channel add production com.example.app --default
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-d,** | <code>string</code> | Set the channel as default |
| **--self-assign** | <code>boolean</code> | Allow device to self-assign to this channel |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="channel-delete"></a> 🗑️ **Delete**

**Alias:** `d`

```bash
npx @capgo/cli@latest channel delete
```

🗑️ Delete a channel from Capgo Cloud, optionally removing associated bundles to free up resources.

**Example:**

```bash
npx @capgo/cli@latest channel delete production com.example.app
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **--delete-bundle** | <code>boolean</code> | Delete the bundle associated with the channel |
| **--success-if-not-found** | <code>boolean</code> | Success if the channel is not found |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="channel-list"></a> 📋 **List**

**Alias:** `l`

```bash
npx @capgo/cli@latest channel list
```

📋 List all channels configured for an app in Capgo Cloud to review distribution settings.

**Example:**

```bash
npx @capgo/cli@latest channel list com.example.app
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="channel-currentBundle"></a> 📦 **CurrentBundle**

```bash
npx @capgo/cli@latest channel currentBundle
```

📦 Get the current bundle linked to a specific channel in Capgo Cloud for update tracking.

**Example:**

```bash
npx @capgo/cli@latest channel currentBundle production com.example.app
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-c,** | <code>string</code> | Channel to get the current bundle from |
| **-a,** | <code>string</code> | API key to link to your account |
| **--quiet** | <code>boolean</code> | Only print the bundle version |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="channel-set"></a> ⚙️ **Set**

**Alias:** `s`

```bash
npx @capgo/cli@latest channel set
```

⚙️ Configure settings for a channel, such as linking a bundle, setting update strategies (major, minor, metadata, patch, none), or device targeting (iOS, Android, dev, prod, emulator, device).
One channel must be default.

**Example:**

```bash
npx @capgo/cli@latest channel set production com.example.app --bundle 1.0.0 --state default
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **-b,** | <code>string</code> | Bundle version number of the file to set |
| **-s,** | <code>string</code> | Set the state of the channel, default or normal |
| **--latest-remote** | <code>boolean</code> | Get the latest bundle uploaded in capgo cloud and set it to the channel |
| **--latest** | <code>boolean</code> | Get the latest version key in the package.json to set it to the channel |
| **--downgrade** | <code>boolean</code> | Allow to downgrade to version under native one |
| **--no-downgrade** | <code>boolean</code> | Disable downgrade to version under native one |
| **--ios** | <code>boolean</code> | Allow sending update to iOS devices |
| **--no-ios** | <code>boolean</code> | Disable sending update to iOS devices |
| **--android** | <code>boolean</code> | Allow sending update to Android devices |
| **--no-android** | <code>boolean</code> | Disable sending update to Android devices |
| **--self-assign** | <code>boolean</code> | Allow device to self-assign to this channel |
| **--no-self-assign** | <code>boolean</code> | Disable devices to self-assign to this channel |
| **--disable-auto-update** | <code>string</code> | Block updates by type: major, minor, metadata, patch, or none (allows all) |
| **--dev** | <code>boolean</code> | Allow sending update to development devices |
| **--no-dev** | <code>boolean</code> | Disable sending update to development devices |
| **--prod** | <code>boolean</code> | Allow sending update to production devices |
| **--no-prod** | <code>boolean</code> | Disable sending update to production devices |
| **--emulator** | <code>boolean</code> | Allow sending update to emulator devices |
| **--no-emulator** | <code>boolean</code> | Disable sending update to emulator devices |
| **--device** | <code>boolean</code> | Allow sending update to physical devices |
| **--no-device** | <code>boolean</code> | Disable sending update to physical devices |
| **--package-json** | <code>string</code> | Paths to package.json files for monorepos (comma-separated) |
| **--ignore-metadata-check** | <code>boolean</code> | Ignore checking node_modules compatibility if present in the bundle |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |


## <a id="key"></a> 🔐 **Key**

🔐 Manage encryption keys for secure bundle distribution in Capgo Cloud, supporting end-to-end encryption with RSA and AES combination.

### <a id="key-save"></a> 🔹 **Save**

```bash
npx @capgo/cli@latest key save
```

💾 Save the public key in the Capacitor config, useful for CI environments.
Recommended not to commit the key for security.

**Example:**

```bash
npx @capgo/cli@latest key save --key ./path/to/key.pub
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-f,** | <code>string</code> | Force generate a new one |
| **--key** | <code>string</code> | Key path to save in Capacitor config |
| **--key-data** | <code>string</code> | Key data to save in Capacitor config |

### <a id="key-create"></a> 🔨 **Create**

```bash
npx @capgo/cli@latest key create
```

🔨 Create RSA key pair for end-to-end encryption.
Creates .capgo_key_v2 (private) and .capgo_key_v2.pub (public) in project root.
Public key is saved to capacitor.config for mobile app decryption.
NEVER commit the private key - store it securely!

**Example:**

```bash
npx @capgo/cli@latest key create
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-f,** | <code>string</code> | Force generate a new one |

### <a id="key-delete_old"></a> 🗑️ **Delete_old**

```bash
npx @capgo/cli@latest key delete_old
```

🧹 Delete the old encryption key from the Capacitor config to ensure only the current key is used.

**Example:**

```bash
npx @capgo/cli@latest key delete_old
```


## <a id="account"></a> 👤 **Account**

👤 Manage your Capgo account details and retrieve information for support or collaboration.

### <a id="account-id"></a> 🔹 **Id**

```bash
npx @capgo/cli@latest account id
```

🪪 Retrieve your account ID, safe to share for collaboration or support purposes in Discord or other platforms.

**Example:**

```bash
npx @capgo/cli@latest account id
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |


## <a id="organization"></a> 🔹 **Organization**

🏢 Manage your organizations in Capgo Cloud for team collaboration and app management.

### <a id="organization-list"></a> 📋 **List**

**Alias:** `l`

```bash
npx @capgo/cli@latest organization list
```

📋 List all organizations you have access to in Capgo Cloud.

**Example:**

```bash
npx @capgo/cli@latest organization list
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="organization-add"></a> ➕ **Add**

**Alias:** `a`

```bash
npx @capgo/cli@latest organization add
```

➕ Create a new organization in Capgo Cloud for team collaboration.

**Example:**

```bash
npx @capgo/cli@latest organization add --name "My Company" --email admin@mycompany.com
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-n,** | <code>string</code> | Organization name |
| **-e,** | <code>string</code> | Management email for the organization |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="organization-members"></a> 🔹 **Members**

**Alias:** `m`

```bash
npx @capgo/cli@latest organization members
```

👥 List organization members and their 2FA status.
Shows all members of an organization with their roles and whether they have 2FA enabled.
Useful before enabling 2FA enforcement to see which members will be affected.
> ℹ️ Viewing 2FA status requires super_admin rights in the organization.


**Example:**

```bash
npx @capgo/cli@latest organization members ORG_ID
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="organization-set"></a> ⚙️ **Set**

**Alias:** `s`

```bash
npx @capgo/cli@latest organization set
```

⚙️ Update organization settings including name, email, security policies, and enforcement options.
Security settings require super_admin role.

**Example:**

```bash
npx @capgo/cli@latest organization set ORG_ID --name "New Name"
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-n,** | <code>string</code> | Organization name |
| **-e,** | <code>string</code> | Management email for the organization |
| **--enforce-2fa** | <code>boolean</code> | Enable 2FA enforcement for all organization members |
| **--no-enforce-2fa** | <code>boolean</code> | Disable 2FA enforcement for organization |
| **--password-policy** | <code>boolean</code> | Enable password policy enforcement for organization |
| **--no-password-policy** | <code>boolean</code> | Disable password policy enforcement |
| **--min-length** | <code>string</code> | Minimum password length (6-128, default: 10) |
| **--require-uppercase** | <code>boolean</code> | Require uppercase letter in password |
| **--no-require-uppercase** | <code>boolean</code> | Do not require uppercase letter |
| **--require-number** | <code>boolean</code> | Require number in password |
| **--no-require-number** | <code>boolean</code> | Do not require number |
| **--require-special** | <code>boolean</code> | Require special character in password |
| **--no-require-special** | <code>boolean</code> | Do not require special character |
| **--require-apikey-expiration** | <code>boolean</code> | Require all API keys to have an expiration date |
| **--no-require-apikey-expiration** | <code>boolean</code> | Do not require API key expiration |
| **--max-apikey-expiration-days** | <code>string</code> | Maximum days before API key expiration (1-365, null for no limit) |
| **--enforce-hashed-api-keys** | <code>boolean</code> | Enforce hashed/secure API keys (key value stored as hash, shown only once) |
| **--no-enforce-hashed-api-keys** | <code>boolean</code> | Allow plain-text API keys |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="organization-delete"></a> 🗑️ **Delete**

**Alias:** `d`

```bash
npx @capgo/cli@latest organization delete
```

🗑️ Delete an organization from Capgo Cloud. This action cannot be undone.
Only organization owners can delete organizations.

**Example:**

```bash
npx @capgo/cli@latest organization delete ORG_ID
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |


## <a id="organisation"></a> 🔹 **Organisation**

[DEPRECATED] Use "organization" instead. This command will be removed in a future version.

### <a id="organisation-list"></a> 📋 **List**

**Alias:** `l`

```bash
npx @capgo/cli@latest organisation list
```

[DEPRECATED] Use "organization list" instead.

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="organisation-add"></a> ➕ **Add**

**Alias:** `a`

```bash
npx @capgo/cli@latest organisation add
```

[DEPRECATED] Use "organization add" instead.

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-n,** | <code>string</code> | Organization name |
| **-e,** | <code>string</code> | Management email for the organization |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="organisation-set"></a> ⚙️ **Set**

**Alias:** `s`

```bash
npx @capgo/cli@latest organisation set
```

[DEPRECATED] Use "organization set" instead.

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-n,** | <code>string</code> | Organization name |
| **-e,** | <code>string</code> | Management email for the organization |
| **--enforce-2fa** | <code>boolean</code> | Enable 2FA enforcement for all organization members |
| **--no-enforce-2fa** | <code>boolean</code> | Disable 2FA enforcement for organization |
| **--password-policy** | <code>boolean</code> | Enable password policy enforcement for organization |
| **--no-password-policy** | <code>boolean</code> | Disable password policy enforcement |
| **--min-length** | <code>string</code> | Minimum password length (6-128, default: 10) |
| **--require-uppercase** | <code>boolean</code> | Require uppercase letter in password |
| **--no-require-uppercase** | <code>boolean</code> | Do not require uppercase letter |
| **--require-number** | <code>boolean</code> | Require number in password |
| **--no-require-number** | <code>boolean</code> | Do not require number |
| **--require-special** | <code>boolean</code> | Require special character in password |
| **--no-require-special** | <code>boolean</code> | Do not require special character |
| **--require-apikey-expiration** | <code>boolean</code> | Require all API keys to have an expiration date |
| **--no-require-apikey-expiration** | <code>boolean</code> | Do not require API key expiration |
| **--max-apikey-expiration-days** | <code>string</code> | Maximum days before API key expiration (1-365, null for no limit) |
| **--enforce-hashed-api-keys** | <code>boolean</code> | Enforce hashed/secure API keys (key value stored as hash, shown only once) |
| **--no-enforce-hashed-api-keys** | <code>boolean</code> | Allow plain-text API keys |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |

### <a id="organisation-delete"></a> 🗑️ **Delete**

**Alias:** `d`

```bash
npx @capgo/cli@latest organisation delete
```

[DEPRECATED] Use "organization delete" instead.

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |


## <a id="build"></a> 🔹 **Build**

🏗️  Manage native iOS/Android builds through Capgo Cloud.
⚠️ This feature is currently in PUBLIC BETA and cannot be used by anyone at this time.
 🔒 SECURITY GUARANTEE:
    Build credentials are NEVER stored on Capgo servers.
    They are used only during the build and auto-deleted after.
    Build outputs may optionally be uploaded for time-limited download links.
📋 BEFORE BUILDING:
   Save your credentials first:
   npx @capgo/cli build credentials save --appId <your-app-id> --platform ios
   npx @capgo/cli build credentials save --appId <your-app-id> --platform android

### <a id="build-init"></a> 🚀 **Init**

**Alias:** `onboarding`

```bash
npx @capgo/cli@latest build init
```

Set up iOS build credentials interactively (creates certificates and profiles automatically)

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **-a,** | <code>string</code> | API key to link to your account |

### <a id="build-request"></a> 🔹 **Request**

```bash
npx @capgo/cli@latest build request
```

Request a native build from Capgo Cloud.
This command will zip your project directory and upload it to Capgo for building.
The build will be processed and sent directly to app stores.
 🔒 SECURITY: Credentials are never stored on Capgo servers. They are auto-deleted
    after build completion. Build outputs may optionally be uploaded for time-limited download links.
📋 PREREQUISITE: Save credentials first with:
   `npx @capgo/cli build credentials save --appId <app-id> --platform <ios|android>`

**Example:**

```bash
npx @capgo/cli@latest build request com.example.app --platform ios --path .
```

**Options:**

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **--path** | <code>string</code> | Path to the project directory to build (default: current directory) |
| **--platform** | <code>string</code> | Target platform: ios or android (required) |
| **--build-mode** | <code>string</code> | Build mode: debug or release (default: release) |
| **--build-certificate-base64** | <code>string</code> | iOS: Base64-encoded .p12 certificate |
| **--p12-password** | <code>string</code> | iOS: Certificate password (optional if cert has no password) |
| **--apple-id** | <code>string</code> | iOS: Apple ID email |
| **--apple-app-specific-password** | <code>string</code> | iOS: App-specific password |
| **--apple-key-id** | <code>string</code> | iOS: App Store Connect API Key ID |
| **--apple-issuer-id** | <code>string</code> | iOS: App Store Connect Issuer ID |
| **--apple-key-content** | <code>string</code> | iOS: Base64-encoded App Store Connect API key (.p8) |
| **--app-store-connect-team-id** | <code>string</code> | iOS: App Store Connect Team ID |
| **--ios-scheme** | <code>string</code> | iOS: Xcode scheme to build (default: App) |
| **--ios-target** | <code>string</code> | iOS: Xcode target for reading build settings (default: same as scheme) |
| **--ios-distribution** | <code>string</code> | iOS: Distribution mode |
| **--ios-provisioning-profile** | <code>string</code> | iOS: Provisioning profile path or bundleId=path mapping (repeatable) |
| **--android-keystore-file** | <code>string</code> | Android: Base64-encoded keystore file |
| **--keystore-key-alias** | <code>string</code> | Android: Keystore key alias |
| **--keystore-key-password** | <code>string</code> | Android: Keystore key password |
| **--keystore-store-password** | <code>string</code> | Android: Keystore store password |
| **--play-config-json** | <code>string</code> | Android: Base64-encoded Google Play service account JSON |
| **--android-flavor** | <code>string</code> | Android: Product flavor to build (e.g. production). Required if your project has multiple flavors. |
| **--no-playstore-upload** | <code>boolean</code> | Skip Play Store upload for this build (nulls out saved play config). Requires --output-upload. |
| **--output-upload** | <code>boolean</code> | Override output upload behavior for this build only (enable). Precedence: CLI > env > saved credentials |
| **--no-output-upload** | <code>boolean</code> | Override output upload behavior for this build only (disable). Precedence: CLI > env > saved credentials |
| **--output-retention** | <code>string</code> | Override output link TTL for this build only (1h to 7d). Examples: 1h, 6h, 2d. Precedence: CLI > env > saved credentials |
| **--skip-build-number-bump** | <code>boolean</code> | Skip automatic build number/version code incrementing. Uses whatever version is already in the project files. |
| **--no-skip-build-number-bump** | <code>boolean</code> | Override saved credentials to re-enable automatic build number incrementing for this build only. |
| **-a,** | <code>string</code> | API key to link to your account |
| **--supa-host** | <code>string</code> | Custom Supabase host URL (for self-hosting or Capgo development) |
| **--supa-anon** | <code>string</code> | Custom Supabase anon key (for self-hosting) |
| **--verbose** | <code>boolean</code> | Enable verbose output with detailed logging |

### <a id="build-credentials"></a> 🔹 **Credentials**

```bash
npx @capgo/cli@latest build credentials
```

Manage build credentials stored locally on your machine.
🔒 SECURITY:
   - Credentials saved to ~/.capgo-credentials/credentials.json (global) or .capgo-credentials.json (local)
   - When building, sent to Capgo but NEVER stored permanently
   - Deleted from Capgo immediately after build
   - Build outputs may optionally be uploaded for time-limited download links
📚 DOCUMENTATION:
   iOS setup: https://capgo.app/docs/cli/cloud-build/ios/
   Android setup: https://capgo.app/docs/cli/cloud-build/android/


## <a id="probe"></a> 🔹 **Probe**

```bash
npx @capgo/cli@latest probe
```

🔎 Probe the Capgo updates endpoint to check if an update is available for your app.
Sends a single request to the updates endpoint using your project's capacitor config
and reports whether an update would be delivered, or explains why not.

**Example:**

```bash
npx @capgo/cli@latest probe --platform ios
```

### <a id="probe-options"></a> Options

| Param          | Type          | Description          |
| -------------- | ------------- | -------------------- |
| **--platform** | <code>string</code> | Platform to probe: ios or android |


## <a id="mcp"></a> 🔹 **Mcp**

```bash
npx @capgo/cli@latest mcp
```

🤖 Start the Capgo MCP (Model Context Protocol) server for AI agent integration.
This command starts an MCP server that exposes Capgo functionality as tools for AI agents.
The server communicates via stdio and is designed for non-interactive, programmatic use.
Available tools exposed via MCP:
  - capgo_list_apps, capgo_add_app, capgo_update_app, capgo_delete_app
  - capgo_upload_bundle, capgo_list_bundles, capgo_delete_bundle, capgo_cleanup_bundles
  - capgo_list_channels, capgo_add_channel, capgo_update_channel, capgo_delete_channel
  - capgo_get_current_bundle, capgo_check_compatibility
  - capgo_list_organizations, capgo_add_organization
  - capgo_star_repository
  - capgo_star_all_repositories
  - capgo_get_account_id, capgo_doctor, capgo_get_stats
  - capgo_request_build, capgo_generate_encryption_keys
Example usage with Claude Desktop:
  Add to claude_desktop_config.json:
  {
    "mcpServers": {
      "capgo": {
        "command": "npx",
        "args": ["@capgo/cli", "mcp"]
      }
    }
  }

**Example:**

```bash
npx @capgo/cli mcp
```



<!-- AUTO-GENERATED-DOCS-END -->

## Programmatic Usage (SDK)

You can use the Capgo CLI programmatically in your Node.js/TypeScript projects for automation and CI/CD pipelines.

### Installation

```bash
npm install @capgo/cli
```

### Example: Upload a Bundle

```typescript
import { CapgoSDK } from '@capgo/cli/sdk'

const sdk = new CapgoSDK({
  apikey: 'your-api-key'
})

await sdk.uploadBundle({
  appId: 'com.example.app',
  bundle: '1.0.0',
  path: './dist',
  channel: 'production'
})
```

### Example: CI/CD Automation

```typescript
import { CapgoSDK } from '@capgo/cli/sdk'

const sdk = new CapgoSDK({
  apikey: process.env.CAPGO_API_KEY
})

// Upload new version
await sdk.uploadBundle({
  appId: 'com.example.app',
  bundle: process.env.VERSION,
  path: './dist',
  channel: 'production'
})

// Cleanup old bundles
await sdk.cleanupBundles({
  appId: 'com.example.app',
  keep: 10
})
```

All CLI features are available as SDK methods. See the [TypeScript types](./src/sdk.ts) for the complete API reference.
