## i18n

This directory is to serve your locale translation files. YAML under this folder would be loaded automatically and register with their filenames as locale code.

Check out [`vue-i18n`](https://github.com/intlify/vue-i18n-next) for more details.

If you are using VS Code, [`i18n Ally`](https://github.com/lokalise/i18n-ally) is recommended to make the i18n experience better.


## Generating Translations

To generate translations, follow these steps:

1. Add your English text to be translated in `translate-data.json` file.
2. If you haven't installed TSX, install it by running 
```bash
 bun install -g tsx
 ```
3. Run the `translate.ts` script by using the command 
```bash
OPENAI_API_KEY=MY_OPENAI_KY tsx translate.ts
```

This script uses OpenAI to translate the text from English to the target language.

The translated text will be saved in the respective `.yml` file for each locale.

Please ensure you have the OpenAI API key set in your environment variables.
