---
title: "Migrating from App Center to Capgo"
description: "Migrating from Microsoft App Center to Capgo in just a few simple steps. In this guide, we’ll walk through the complete migration for Live Updates a CodePush alternative."
author: "Martin Donadieu"
date: "2022-03-22"
head_image: /migrate_appcenter.webp
head_image_alt: Capacitor Dev looking for alternative
tag: migration
published: true
next_blog: /blog/automatic-build-and-release-with-github-actions
---


## Migration Summary [#](https://capgo.app/blog/appcenter-migration#migration-summary "Direct link to heading")

-   Capgo is service that helps development teams send live app to deployed apps.
-   Capacitor apps written in jQuery Mobile, Framework 7, Sencha, KendoUI, or even your own custom solution can be migrated. **An existing Ionic app is not required.** To see which versions of the Cordova CLI and other tools are supported, view the [Build Stacks page](https://ionic.io/docs/Capgo/build-stacks).
-   Capgo offers equivalent services for App Center Build (build Android/iOS apps) and App Center Distribute (CodePush). For Test, Diagnostics, and Analytics services, please see Ionic's recommendations below.
-   Ionic has [Advisory services](https://ionicframework.com/advisory) available if you need migration assistance.

##### note

If your app is still using Cordova it's necessary to [migrate to Capatitor](https://capacitorjs.com/docs/cordova/migrating-from-cordova-to-capacitor) first before migrating to Capgo.


Built by the Ionic team as a spiritual successor to Cordova, Capacitor allows development to move close to the native tooling and capabilities with the goal of providing an even better user experience and performance.

Fortunately, the migration process is easy and the majority of Cordova plugins are backward compatible with Capacitor. [Start migrating here](https://capacitorjs.com/docs/cordova/migrating-from-cordova-to-capacitor).


## About Capgo [#](https://capgo.app/blog/appcenter-migration#about-ionic-Capgo "Direct link to heading")

Capgo, handles updating apps over time. Development teams can focus completely on the unique features of their app and outsource the complicated app delivery process to Capgo.

Capgo fills in the gaps between web delivery and mobile.

## Capgo Prerequisites [#](https://capgo.app/blog/appcenter-migration#Capgo-prerequisites "Direct link to heading")

Like App Center, Capgo supports apps hosted in Git repositories on Azure DevOps, Bitbucket, GitHub, and GitLab.

### Install Capgo CLI [#](https://capgo.app/blog/appcenter-migration#install-capgo-cli "Direct link to heading")

##### note

If you do not have Node or npm installed on your computer, you will need to do this before proceeding. If you need to install Node, please select the [current LTS version](https://nodejs.org/).

The Capgo CLI is required to integrate and manage Capgo's Live Updates feature.

```
npm install -g capgo
```

### Create package.json and Capacitor config files [#](https://capgo.app/blog/appcenter-migration#create-packagejson-and-ionic-config-files "Direct link to heading")

##### note

Before you begin, i recommend making changes on a fresh Git branch.

Since Capgo was created to automate capacitor apps, it requires one file that your app may not have. First, create a `capacitor.config.json` file. The easiest way to create it is to run in the root of your app:

```shell
npm install @capacitor/core
npm install @capacitor/cli --save-dev
```

Then, initialize Capacitor using the CLI questionnaire:
```shell
npx cap init
```

The CLI will ask you a few questions, starting with your app name, and the package id you would like to use for your app.

Finally, commit the new files to your project:

```
git add .git commit -m "added package json and capacitor config" && git push
```

### Migrate the Code [#](https://capgo.app/blog/appcenter-migration#migrate-the-code "Direct link to heading")

Now that you have the new required Capgo files in place, you can turn our attention to the actual app itself. Capgo expects the entire builded app to be inside of a directory named `dist`.
If your builded code is not in a `dist` directory, change this value in the Capacitor config file.

Here is what the app’s directory structure should look like:

![App Structure](/directory_looklike.webp)

## Capgo Configuration [#](https://capgo.app/blog/appcenter-migration#Capgo-configuration "Direct link to heading")

With your app ready for Capgo integration, it’s time to sign up, and get your API key to upload your first version! Begin by [signing up for an Capgo account](https://capgo.app/register).

Once you’re logged into Capgo, navigate to the Account page then click on API key, then click on the write key to copy it in your clipboard.

### Install the Capgo SDK [#](https://capgo.app/blog/appcenter-migration#install-the-Capgo-sdk "Direct link to heading")

From a command line, directly into the root of your Capacitor app run:

`npm i capacitor-updater && npx cap sync`
To install the plugin into your Capacitor app.

And then add to your app this code as replacement of CodePush one:

```javascript
  import { CapacitorUpdater } from 'capacitor-updater'

  CapacitorUpdater.notifyAppReady()
```

This wil tell the native plugin the install as succeeded.

## Deploying Live Updates (CodePush Alternative) [#](https://capgo.app/blog/appcenter-migration#deploying-live-updates-codepush-alternative "Direct link to heading")

The Live Update feature works by using the installed Capgo SDK in your native application to listen to a particular Deploy Channel Destination. When a Web build is assigned to a Channel Destination, that update will be deployed to user devices running binaries that are configured to listen to the specified Channel Destination.

### Send your first App [#](https://capgo.app/blog/appcenter-migration#send-first-app "Direct link to heading")

Next, you need to send to Capgo this local project. Run this command to add your app to Capgo:

`npx capgo add -a YOURKEY`
This command will use all variable defined in the Capacitor config file to create the app.

Run the command to build your code and send it to Capgo with:
`npx capgo upload -a YOURKEY -channel production`
By default the version name will be the one in your package.json file.

Check in [Capgo](https://capgo.app/app) is the build is present.

You can even test it with my [mobile sandbox app](https://capgo.app/app_mobile).

### Create public channel [#](https://capgo.app/blog/appcenter-migration#create-public-channel "Direct link to heading")

After you have sent your app to Capgo, you need to create a public channel to let app receive updates from Capgo.

Connect to Capgo to see the list of your app: 

![List apps](/list_app.webp)

Select the app you want to create a channel for:

![List version and channels](/list_versions.webp)

Select the channel previously created `production`:

![Channel settings](/make_public.webp)

Make it public and copy the link:

![Public channel](/channel_public.webp)

### Configure app to listen for a Live Update [#](https://capgo.app/blog/appcenter-migration#configure-app-to-listen-for-live-update "Direct link to heading")

Add this config to your Capacitor config file:
```json
{
	"plugins": {
		"CapacitorUpdater": {
			"autoUpdateUrl": "https://capgo.app/api/latest?appid=**.****.***&channel=dev"
		}
}
```
replace the `autoUpdateUrl` by the one you copied from Capgo.

and then do a `npx cap copy` to update your app.

### Receive a Live Update on a Device [#](https://capgo.app/blog/appcenter-migration#receive-a-live-update-on-a-device "Direct link to heading")

For your application to receive a live update from Deploy, you'll need to run the app on a device or an emulator. The easiest way to do this is simply to use the following command to launch your local app in an emulator or a device connected to your computer.

```
npc cap run [ios | android]
```

Open the app, put it in background and open it again, you should see in the logs the app did the update.

Congrats! 🎉 You have successfully deployed your first Live Update. This is just the start of what you can do with Live Updates. To learn more, view the complete [Live Updates docs](https://doc.capgo.app/).

## Remove App Center Dependencies [#](https://capgo.app/blog/appcenter-migration#remove-app-center-dependencies "Direct link to heading")

Now that we've integrated Capgo's services, you should remove any references to App Center. Besides being a best practice to remove unused code/services, removing the SDK should reduce the size of your apps.

First, open a terminal then uninstall the App Center plugins:

```
cordova plugin remove cordova-plugin-appcenter-analytics cordova-plugin-appcenter-crashes cordova-plugin-code-push
```

Next, open `config.xml` and remove the following `preference` values. They will look similar to:

```
<preference name="APP_SECRET" value="0000-0000-0000-0000-000000000000" /><preference name="CodePushDeploymentKey" value="YOUR-ANDROID-DEPLOYMENT-KEY" /><preference name="CodePushPublicKey" value="YOUR-PUBLIC-KEY" />
```

If you were using App Center Analytics in your app, remove the following `preferences` elements: `APPCENTER_ANALYTICS_ENABLE_IN_JS` and `APPCENTER_CRASHES_ALWAYS_SEND`.

Remove the following `<access />` elements:

```
<access origin="https://codepush.appcenter.ms" /><access origin="https://codepush.blob.core.windows.net" /><access origin="https://codepushupdates.azureedge.net" />
```

Remove the reference to CodePush in the CSP `meta` tag in the `index.html` file (`https://codepush.appcenter.ms`):

```
<meta http-equiv="Content-Security-Policy" content="default-src https://codepush.appcenter.ms 'self' data: gap: https://ssl.gstatic.com 'unsafe-eval'; style-src 'self' 'unsafe-inline'; media-src *" />
```

Finally, within your app, remove any code references to App Center services, such as `codePush.sync();`.

## Next Steps [#](https://capgo.app/blog/appcenter-migration#next-steps "Direct link to heading")

You've migrated from App Center to Capgo, utilizing the Live Updates and Native Builds features before removing all App Center dependencies. This is just the beginning of what you can use Capgo for. Explore the rest of the service includes Automations (multiple environments and native configurations), App Store Publishing (build native apps in the cloud then deploy them directly to the app stores), and the Cloud CLI (use Capgo inside your CI/CD platform of choice (such as Azure DevOps, Gitlab, Jenkins, and more).

## Bonus: Automatic send app update [#](https://capgo.app/blog/appcenter-migration#bonus-automatic-send-app-updates "Direct link to heading")

If your code is hosted on github you can setup automatic build and release in few more step, thanks to github actions.

i have made a second article to allow you to so.