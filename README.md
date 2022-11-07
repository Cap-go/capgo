<p align='center'>
  <img src='https://raw.githubusercontent.com/Cap-go/capgo/main/assets/capgo_banner.png' alt='Capgo - Instant updates for capacitor'/>
</p>

[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=Cap-go_capgo&metric=bugs)](https://sonarcloud.io/summary/new_code?id=Cap-go_capgo)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=Cap-go_capgo&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=Cap-go_capgo)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=Cap-go_capgo&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=Cap-go_capgo)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=Cap-go_capgo&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=Cap-go_capgo)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=Cap-go_capgo&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=Cap-go_capgo)
[![Technical Debt](https://sonarcloud.io/api/project_badges/measure?project=Cap-go_capgo&metric=sqale_index)](https://sonarcloud.io/summary/new_code?id=Cap-go_capgo)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=Cap-go_capgo&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=Cap-go_capgo)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=Cap-go_capgo&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=Cap-go_capgo)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=Cap-go_capgo&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=Cap-go_capgo)

<br>

<p align='center'>
<a href="https://capgo.app/">Capgo - Instant updates for capacitor</a>
</p>

<br>

## Features

- ⚡️ Test webapp direct in your phone with native API

- 😃 Share your dev with your teamate

- ↕️ Manage your channels for auto update system.

<br>

## Documentation

https://github.com/Cap-go/capacitor-updater/wiki/Capgo-Sandbox-App

## Plugins

All official plugin are install and preconfigured

- [Action Sheet](https://github.com/ionic-team/capacitor-plugins/tree/main/action-sheet) - Provides access to native Action Sheets.
- [App](https://github.com/ionic-team/capacitor-plugins/tree/main/app) - Handles high level App state and events. 
- [App Launcher](https://github.com/ionic-team/capacitor-plugins/tree/main/app-launcher) - Allows to check if an app can be opened and open it.
- [Browser](https://github.com/ionic-team/capacitor-plugins/tree/main/browser) - Provides the ability to open an in-app browser and subscribe to browser events.
- [Camera](https://github.com/ionic-team/capacitor-plugins/tree/main/camera) - Provides the ability to take a photo with the camera or choose an existing one from the photo album.
- [Clipboard](https://github.com/ionic-team/capacitor-plugins/tree/main/clipboard) - Enables copy and pasting to/from the system clipboard.
- [Device](https://github.com/ionic-team/capacitor-plugins/tree/main/device) - Exposes internal information about the device, such as the model and operating system version, along with user information such as unique ids.
- [Dialog](https://github.com/ionic-team/capacitor-plugins/tree/main/dialog) - Provides methods for triggering native dialog windows for alerts, confirmations, and input prompts.
- [Filesystem](https://github.com/ionic-team/capacitor-plugins/tree/main/filesystem) - Provides a NodeJS-like API for working with files on the device.
- [Geolocation](https://github.com/ionic-team/capacitor-plugins/tree/main/geolocation) - Provides simple methods for getting and tracking the current position of the device using GPS, along with altitude, heading, and speed information if available.
- [Haptics](https://github.com/ionic-team/capacitor-plugins/tree/main/haptics) - Provides physical feedback to the user through touch or vibration.
- [Keyboard](https://github.com/ionic-team/capacitor-plugins/tree/main/keyboard) - Provides keyboard display and visibility control, along with event tracking when the keyboard shows and hides.
- [Local Notifications](https://github.com/ionic-team/capacitor-plugins/tree/main/local-notifications) - Provides a way to schedule device notifications locally (i.e. without a server sending push notifications).
- [Motion](https://github.com/ionic-team/capacitor-plugins/tree/main/motion) - Tracks accelerometer and device orientation (compass heading, etc.).
- [Network](https://github.com/ionic-team/capacitor-plugins/tree/main/network) - Provides network and connectivity information.
- [Push Notifications](https://github.com/ionic-team/capacitor-plugins/tree/main/push-notifications) - Provides access to native push notifications.
- [Screen Reader](https://github.com/ionic-team/capacitor-plugins/tree/main/screen-reader) - Provides access to TalkBack/VoiceOver/etc. and Provides simple text-to-speech capabilities for visual accessibility.
- [Share](https://github.com/ionic-team/capacitor-plugins/tree/main/share) - Provides methods for sharing content in any sharing-enabled apps the user may have installed.
- [Splash Screen](https://github.com/ionic-team/capacitor-plugins/tree/main/splash-screen) - Provides methods for showing or hiding a Splash image.
- [Status Bar](https://github.com/ionic-team/capacitor-plugins/tree/main/status-bar) - Provides methods for configuring the style of the Status Bar, along with showing or hiding it.
- [Storage](https://github.com/ionic-team/capacitor-plugins/tree/main/storage) - Provides a simple key/value persistent store for lightweight data.
- [Text Zoom](https://github.com/ionic-team/capacitor-plugins/tree/main/text-zoom) - Provides the ability to change Web View text size for visual accessibility.
- [Toast](https://github.com/ionic-team/capacitor-plugins/tree/main/toast) - Provides a notification pop up for displaying important information to a user. Just like real toast!

## Dev contribution

### Coding Style

- Use Composition API with [`<script setup>` SFC syntax](https://github.com/vuejs/rfcs/pull/227)
- [ESLint](https://eslint.org/) with [@antfu/eslint-config](https://github.com/antfu/eslint-config), single quotes, no semi.

### Dev tools

- [TypeScript](https://www.typescriptlang.org/)
- [Cypress](https://cypress.io/) - E2E Testing
- [pnpm](https://pnpm.js.org/) - fast, disk space efficient package manager
  - [critters](https://github.com/GoogleChromeLabs/critters) - Critical CSS
- [Netlify](https://www.netlify.com/) - zero-config deployment
- [VS Code Extensions](./.vscode/extensions.json)
  - [Vite](https://marketplace.visualstudio.com/items?itemName=antfu.vite) - Fire up Vite server automatically
  - [Volar](https://marketplace.visualstudio.com/items?itemName=johnsoncodehk.volar) - Vue 3 `<script setup>` IDE support
  - [Iconify IntelliSense](https://marketplace.visualstudio.com/items?itemName=antfu.iconify) - Icon inline display and autocomplete
  - [i18n Ally](https://marketplace.visualstudio.com/items?itemName=lokalise.i18n-ally) - All in one i18n support
  - [Windi CSS Intellisense](https://marketplace.visualstudio.com/items?itemName=voorjaar.windicss-intellisense) - IDE support for Windi CSS
  - [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)

## Usage

### Development

Just run and visit http://localhost:3334

```bash
pnpm dev
```

### Build

To build the App in mobile, run

```bash
pnpm mobile
```

And you will see the generated file in `dist` that ready to be served.

### Deploy on Netlify

Go to [Netlify](https://app.netlify.com/start) and select your clone, `OK` along the way, and your App will be live in a minute.
