<!-- omit in toc -->
# Contributing to Capgo

First off, thanks for taking the time to contribute! ❤️

All types of contributions are encouraged and valued. Please make sure to read the relevant section before making your contribution. It will make it a lot easier for us maintainers and smooth out the experience for all involved. The community looks forward to your contributions. 🎉

### Running tests localy

This project uses a custom test runner located in [tests_backend](https://github.com/Cap-go/capgo/tree/main/tests_backend).
There exists some requirements to run the tests:
 * Have minio running (see `tests_backend/gh_actions` for referance) For testing the CLI this is not enough, you have to set up the `MINIO_URL` variable. In linux you can use 
 ```sh
 export MINIO_URL=$(docker inspect minio1 | grep 'Gateway' | head -n 1 | sed -e 's/            "Gateway": "//g' | sed -e 's/",//g')
 ```
 * Have redis running (see `tests_backend/gh_actions` for referance, only if `USE_LOCAL_REDIS` env variable is set to true, tests run fine without it)
 * Having the `UPSTASH_TOKEN` and `UPSTASH_URL` env variables set (Only if you want to test upstash, tests run fine without it)
 * Having `node`, `npx`, `pnpm` installed (Only for CLI tests)
 * Having the [supabase cli](https://supabase.com/docs/guides/cli) installed
 * Having a running supabase (`supabase start`)

The tests can be run with the following commands:
 * `CLI_PATH=/home/user/CLI/ pnpm test:backend` (backend only)
 * `CLI_PATH=/home/user/CLI/ pnpm test:cli` (cli only)
 * `pnpm test:backend`

**Running tests localy WILL make changes to supabase**

After you submit a PR a contributor will run the full test suite on your changes.

### Github capgo bot

There exists a bot that will run your tests if a capgo oranization member requests it. You CANNOT run the test on the CI/CD by yourself if you do not have merge permissions. If you want to run the tests on your change please ask someone from the organization to do it
