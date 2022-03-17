---
title: "Update your React Native apps seamlessly using Microsoft's CodePush"
description: "Greetings Capacitor Community, today I'll be helping you setup Capacitor-updater into your app. So that you can do seamless releases."
author: "Martin Donadieu"
date: "2022-02-27"
head_image: /update_flow.webp
head_image_alt: Capacitor Dev looking for alternative
tag: How-to
published: false
---

inspired by https://dev.to/karanpratapsingh/update-your-react-native-apps-seamlessly-using-microsoft-s-codepush-f61

Greetings Capacitor Community, today I'll be helping you setup Capacitor-updater into your app. So that you can do seamless releases.


  
# What is Capacitor-updater?


capacitor-updater a technology that helps in the delivery of app updates and improvements to the end users instantly.

This is especially great if you want to do critical bug fixes and deliver instantly without going through the app store reviews.

You can think of it as "web-like" agility of side-loading updates as soon as they are available.

Moreover, it provides rollbacks if the new update crashed the app

# How does it work?

CodePush keeps your app's javascript bundle in sync with the CodePush server, and every time the user opens the app it checks with the CodePush server if a new update is available to the bundle. And of course, it comes with tons of awesome configuration which can help us fine-tune our user's experience.

I personally use CodePush in almost all the React Native projects I work with as it is a very promising technology.

You can read more about it here
  
# Let's get started 🚀


Let's get started by first creating standard deployments for CodePush in AppCenter.

I'll be assuming that you already know how to log in with AppCenter and create or link a new Android/iOS app, if you don't then please check out adding/linking part of this guide here


Navigate to Codepush under Distribute and click on Create Standard Deployment
=> image 

Now, to the top right you should be able to select your environment

=> image 

Click on the settings items at the top right and keys panel should open reveling your keys (we'll be needing them later)

# Integration


With the keys now available, let's integrate CodePush into our apps. For this we'll need to install react-native-code-push


```bash
yarn add react-native-code-push
```

Or if you prefer npm then,


```bash
npm i --save react-native-code-push
```

# Initialization

In this section we'll be following a simple example for initializing our CodePush plugin as there's no way I can do justice to all the options and configuration available in this plugin, so make sure to checkout the official CodePush js api reference here

```javascript
import codePush from 'react-native-code-push';

...

const codePushOptions = {
  installMode: codePush.InstallMode.IMMEDIATE,
  deploymentKey: "<YOUR KEY HERE>",
  checkFrequency: codePush.CheckFrequency.ON_APP_START,
};

export default codePush(codePushOptions)(App);
```