---
title: Automatic build and release with Github actions
description: Create your own CI/CD pipeline with Github actions for free, to deploy
  your app every time you push to main.
author: Martin Donadieu
date: 2022-03-23
head_image: "/github_actions.webp"
head_image_alt: Github action illustration
tag: CI/CD
published: true

---
This tutorial focuses on the GitHub hosting, but you can adapt it with little tweak to any other CI/CD platform.

# Commit convention

First you need to start following the commit convention [`conventionalcommits`](https://www.conventionalcommits.org/en/v1.0.0/)\` this will help the tooling understand how upgrade the version number, it's 5 min to learn it.

![Conventional commits](/conventional_commits.webp)

# GitHub actions for tag

Then you need to create your first GitHub action to automatically build and create tag.

Create a file at this path: `.github/workflows/bump_version.yml`

with this content:

```toml
name: Bump version

on:
  push:
    branches:
      - main

jobs:
  bump-version:
    if: "!startsWith(github.event.head_commit.message, 'bump:')"
    runs-on: ubuntu-latest
    name: "Bump version and create changelog with commitizen"
    steps:
      - name: Check out
        uses: actions/checkout@v2
        with:
          fetch-depth: 0
          token: '${{ secrets.PERSONAL_ACCESS_TOKEN }}'
      - name: Create bump and changelog
        uses: commitizen-tools/commitizen-action@0.7.0
        with:
          github_token: '${{ secrets.PERSONAL_ACCESS_TOKEN }}'
          branch: 'main'
```

This will release a tag for every commit in your main branch. And add a changelog entry for each commit in the main branch in `CHANGELOG.md`.

Don't worry if you don't have this file it will be created for you.

To make this work, you need to create a [PERSONAL_ACCESS](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) _it in_ your GitHub [secret](https://docs.github.com/en/actions/security-guides/encrypted-secrets "GitHub secrets") as `PERSONAL_ACCESS_TOKEN`.

This is necessary to let the CI commit the changelog.

When you create the token, choose expiration as `never` and the scope as `repo`.

Lastly, to let the tool understand where your version is saved you have to create the file `.cz.toml` at the root of your repository.

And add this inside :

```toml
[tool.commitizen]
name = "cz_conventional_commits"
tag_format = "$major.$minor.$patch$prerelease"
version = "0.11.5"
version_files = [
    "package.json:version",
    ".cz.toml"
]
```

Set the version in this file as the same you have in your `package.json` file.

This is only necessary the first time, then the tools will keep it up to date.

You can now commit this both file and see your first tag appear in GitHub!

# GitHub actions for build

Create a file at this path: `.github/workflows/build.yml`

with this content:

```toml
name: Build source code and send to Capgo

on:
  push:
    tags:
      - '*'
      
jobs:
  deploy:
    runs-on: ubuntu-latest
    name: "Build code and release"
    steps:
      - name: Check out
        uses: actions/checkout@v2
      - name: Install dependencies
        id: install_code
        run: npm i
      - name: Build
        id: build_code
        run: npm run build
        env: # Remove both lines  if you don't need it
          FIREBASE_CONFIG: ${{ secrets.FIREBASE_CONFIG }} # Exemple of env var coming from a secret
      - name: Create Release
        id: create_release
        run: npx capgo upload -a ${{ secrets.CAPGO_TOKEN }} -c production
```

This will install and build your dependency before sending it to Capgo.

If your command for build is different you can change it in the `build_code` step.

To make this work, you need to get your API key for Capgo add it in the [secret of your GitHub repository](https://docs.github.com/en/actions/security-guides/encrypted-secrets) as `CAPGO_TOKEN`.

You can now commit this both file and see your first tag appear in GitHub!

Add the commit will generate a new build for production channel.

You should add your test in the build step to be sure your code is working.

Go To your Capgo dashboard and check your build who just appear, you now have you own CI/CD system.