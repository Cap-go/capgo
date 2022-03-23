---
title: "How to update Capacitor Apps without the App Store review."
description: "How can Capgo Feature allow you to push code updates to live iOS apps and be fully compliant with Apple’s guidelines? "
author: "Martin Donadieu"
date: "2022-01-13"
head_image: /bypass_illustration.webp
head_image_alt: Crossfit Men looking for alternative
tag: Tutorial
published: true
next_blog: /blog/update-your-capacitor-apps-seamlessly-using-capacitor-updater
---

*Glad you asked.*

My lawyers asked me to let you know that this isn't legal advice, but you don't need a law degree to understand the wording in Apple's official guidelines. Apple’s guidelines explicitly permit you to push executable code directly to your app, bypassing the App Store, under these three conditions:

- The code is run by Apple's built-in WebKit framework

- The code does not provide, unlock or enable additional features or functionality

- The user don't see the update is happening

With Capgo capacitor plugin you can only update and modify your HTML CSS and JavaScript so we’re good on the first condition.
On a side note, the ability for apps to update themselves without the App Store has been around for a quite a while, though only for apps created using JavaScript frameworks such as facebook's React Native and services such as Expo.

A proof that React Native is not more Native than Capacitor 😆

Capgo is simply the first affordable solution that provides the ability to push code-level updates to native Capacitor apps.
The second condition, no new features or functionality, is really up to you. 

Capgo isn't intended to push new features or functionality. It is meant to tweak or fix them, avoiding the minor releases needed to fix bugs, add logging or tracking, update messages, force users to upgrade, etc.

For new features or functionality you need to release through the app store. FYI, Ionic Appflow (the alternative for big corporate) is installed on over 50 million iOS devices and there's never been an app rejected because it uses it.

I'm just saying that because it's good to know that thousands of other developers are using live updates, so you're not alone.
The relevant sections are here: 3.3.2 [...] The only exception to the foregoing is scripts and code downloaded and run by Apple's built-in WebKit framework or JavascriptCore [...] 3.3.3 [...] an Application may not provide, unlock or enable additional features or functionality through distribution mechanisms other than the App Store [...]

Check our next article for more information on how to install Capgo to bypass review.


