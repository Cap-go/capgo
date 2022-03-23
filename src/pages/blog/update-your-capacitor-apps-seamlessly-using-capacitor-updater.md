---
title: Update your Capacitor apps seamlessly using Capacitor-updater
description: Greetings Capacitor Community, today I'll be helping you setup Capacitor-updater
  into your app. So that you can do seamless releases.
author: Martin Donadieu
date: 2022-02-27
head_image: "/update_flow.webp"
head_image_alt: Capacitor Dev looking for alternative
tag: Tutorial
published: true
next_blog: ''

---
Inspired by https://dev.to/karanpratapsingh/update-your-react-native-apps-seamlessly-using-microsoft-s-codepush-f61

Greetings Capacitor Community, today I'll be helping you setup Capacitor-updater into your app. So that you can do seamless releases.

# What is Capacitor-updater?

Capacitor-updater a technology that helps in the delivery of app updates and improvements to the end users instantly.

This is especially great if you want to do critical bug fixes and deliver instantly without going through the app store reviews.

You can think of it as "web-like" agility of side-loading updates as soon as they are available.

Moreover, it provides rollbacks if the new update crashed the app

# How does it work?

Capgo keeps your app's JavaScript bundle in sync with the Capgo server, and every time the user opens the app it checks with the Capgo server if a new update is available to the bundle. And of course, it comes with tons of awesome configuration which can help us fine-tune our user's experience.

I use Capgo in all my projects I work with as it is a very promising technology.

You can read more about it [here](https://capgo.app).

# Let's get started 🚀

## Capgo Configuration [#](https://capgo.app/blog/appcenter-migration#Capgo-configuration "Direct link to heading")

It’s time to sign up, and get your API key to upload your first version! Begin by [signing up for a Capgo account](https://capgo.app/register).

Once you’re logged into Capgo, navigate to the Account page then click on API key:

![Account page](/capgo.app_app_account.webp)

Then click on the "write" key to copy it in your clipboard.

![Api key page](/capgo.app_app_account_api_key.webp "Api key page")

## Install the Capgo SDK [#](https://capgo.app/blog/appcenter-migration#install-the-Capgo-sdk "Direct link to heading")

From a command line, directly into the root of your Capacitor app run:

`npm i capacitor-updater && npx cap sync`
To install the plugin into your Capacitor app.

And then add to your app this code as replacement of CodePush one:

```javascript
  import { CapacitorUpdater } from 'capacitor-updater'

  CapacitorUpdater.notifyAppReady()
```

This will tell the native plugin the installation as succeeded.

## Insatall Capgo CLI

The Capgo CLI is required to integrate and manage Capgo's Live Updates feature.

Install it with this command:

```shell
npm install -g capgo
```

## Add your first version

Let's get started by first creating app in Capgo Cloud with the CLI.

`npx capgo add -a YOU_KEY`

This command will use all variable defined in the Capacitor config file to create the app.

## Upload your first version

Run the command to build your code and send it to Capgo with:
`npx capgo upload -a YOURKEY -channel production` 

By default, the version name will be the one in your package.json file.

Check in [Capgo](https://capgo.app/app) if the build is present.

You can even test it with my [mobile sandbox app](https://capgo.app/app_mobile).

## Create public channel [#](https://capgo.app/blog/appcenter-migration#create-public-channel "Direct link to heading")

After you have sent your app to Capgo, you need to create a public channel to let app receive updates from Capgo.

Connect to Capgo to see the list of your app:

![List apps](/list_app.webp)

Select the app you want to create a channel for:

![List version and channels](/list_versions.webp)

Select the channel previously created `production`:

![Channel settings](/make_public.webp)

Make it public and copy the link:

![Public channel](/channel_public.webp)

## Configure app to listen for a Live Update [#](https://capgo.app/blog/appcenter-migration#configure-app-to-listen-for-live-update "Direct link to heading")

Add this config to your Capacitor config file:

```json
{
	"plugins": {
		"CapacitorUpdater": {
			"autoUpdateUrl": "https://capgo.app/api/latest?appid=**.****.***&channel=dev"
		}
}
```

Replace the `autoUpdateUrl` by the one you copied from Capgo.

Then do a `npx cap copy` to update your app.

## Receive a Live Update on a Device [#](https://capgo.app/blog/appcenter-migration#receive-a-live-update-on-a-device "Direct link to heading")

For your application to receive a live update from Deploy, you'll need to run the app on a device or an emulator. The easiest way to do this is simply to use the following command to launch your local app in an emulator or a device connected to your computer.

    npc cap run [ios | android]

Open the app, put it in background and open it again, you should see in the logs the app did the update.

Congrats! 🎉 You have successfully deployed your first Live Update. This is just the start of what you can do with Live Updates. To learn more, view the complete [Live Updates docs](https://doc.capgo.app/).