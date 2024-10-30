<!-- omit in toc -->
# Contributing to Capgo

First off, thanks for taking the time to contribute! ❤️

All types of contributions are encouraged and valued. Please make sure to read the relevant section before making your contribution. It will make it a lot easier for us maintainers and smooth out the experience for all involved. The community looks forward to your contributions. 🎉

### Running tests localy

This project uses a custom test runner located in [tests_backend](https://github.com/Cap-go/capgo/tree/main/tests_backend).
There exists some requirements to run the tests:
 * Having `bun` installed (Only for CLI tests)
 * Having the [supabase cli](https://supabase.com/docs/guides/cli) installed
 * Having a running supabase (`supabase start`)

The tests can be run with the following commands:
 * `CLI_PATH=/home/user/CLI/ bun test:backend` (backend only)
 * `CLI_PATH=/home/user/CLI/ bun test:cli` (cli only)
 * `bun test:backend`

**Running tests localy WILL make changes to supabase**

After you submit a PR a contributor will run the full test suite on your changes.

### Github capgo bot

There exists a bot that will run your tests if a capgo oranization member requests it. You CANNOT run the test on the CI/CD by yourself if you do not have merge permissions. If you want to run the tests on your change please ask someone from the organization to do it
