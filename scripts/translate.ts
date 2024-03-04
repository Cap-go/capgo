import * as fs from 'node:fs'
import { basename, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import OpenAI from 'openai'

const openai = new OpenAI({
  // eslint-disable-next-line n/prefer-global/process
  apiKey: process.env.OPENAI_API_KEY,
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function translateText(text: string, targetLanguage: string) {
  const chatCompletion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: `You are a helpful assistant that translates text. translate the following text from English to ${targetLanguage}`,
      },
      { role: 'user', content: text },
    ],
  })
  return chatCompletion.choices[0].message.content
}

const supported_locales: string[] = []

fs.readdirSync(__dirname).forEach((file) => {
  if (extname(file) === '.yml' && !file.includes('en'))
    supported_locales.push(basename(file, '.yml'))
})

async function translateAndSaveLocales() {
  const text = JSON.parse(
    fs.readFileSync(`${__dirname}/translate-data.json`, 'utf8'),
  ) as Record<string, string>

  for (const locale of supported_locales) {
    console.log(`Translating ${locale}`)

    const localeFile = `${__dirname}/${locale}.yml`
    if (!fs.existsSync(localeFile))
      return

    const localeData = yaml.load(fs.readFileSync(localeFile, 'utf8')) as Record<string, string>

    for (const key in text) {
      const translatedText = await translateText(text[key], locale)
      localeData[key] = translatedText!
    }

    fs.writeFileSync(localeFile, yaml.dump(localeData))
  }
}

translateAndSaveLocales().then(() => {
  console.log('Successfully translated to all locales')
}).catch(console.error)
