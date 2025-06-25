const fs = require('node:fs')
const readline = require('node:readline')
const Database = require('better-sqlite3')

const db = new Database(':memory:')

// Create the table and indexes (same as before)
db.exec(`
CREATE TABLE IF NOT EXISTS store_apps (
    "created_at" datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "app_id" varchar(50) NOT NULL,
    "url" varchar(256) NOT NULL,
    "title" varchar(256) DEFAULT '' NOT NULL,
    "summary" varchar(256) DEFAULT '' NOT NULL,
    "icon" varchar(256) DEFAULT '' NOT NULL,
    "free" integer DEFAULT 1 NOT NULL,
    "category" varchar(50) NOT NULL,
    "capacitor" integer DEFAULT 0 NOT NULL,
    "developer_email" varchar(256) DEFAULT '' NOT NULL,
    "installs" integer DEFAULT 0 NOT NULL,
    "developer" varchar(50) NOT NULL,
    "score" real DEFAULT 0.0 NOT NULL,
    "to_get_framework" integer DEFAULT 1 NOT NULL,
    "onprem" integer DEFAULT 0 NOT NULL,
    "updates" integer DEFAULT 0 NOT NULL,
    "to_get_info" integer DEFAULT 1 NOT NULL,
    "to_get_similar" integer DEFAULT 1 NOT NULL,
    "updated_at" datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "cordova" integer DEFAULT 0 NOT NULL,
    "react_native" integer DEFAULT 0 NOT NULL,
    "capgo" integer DEFAULT 0 NOT NULL,
    "kotlin" integer DEFAULT 0 NOT NULL,
    "flutter" integer DEFAULT 0 NOT NULL,
    "native_script" integer DEFAULT 0 NOT NULL,
    "lang" varchar(50),
    "developer_id" varchar(50),
    PRIMARY KEY (app_id)
);

CREATE INDEX IF NOT EXISTS "idx_store_apps" ON store_apps ("capacitor");
CREATE INDEX IF NOT EXISTS "idx_store_apps_capacitor" ON store_apps ("capacitor", "installs" DESC);
CREATE INDEX IF NOT EXISTS "idx_store_apps_cordova" ON store_apps ("cordova", "capacitor", "installs" DESC);
CREATE INDEX IF NOT EXISTS "idx_store_apps_flutter" ON store_apps ("flutter", "installs" DESC);
CREATE INDEX IF NOT EXISTS "idx_store_apps_install" ON store_apps ("capacitor", "installs");
CREATE INDEX IF NOT EXISTS "idx_store_apps_kotlin" ON store_apps ("kotlin", "installs" DESC);
CREATE INDEX IF NOT EXISTS "idx_store_apps_native_script" ON store_apps ("native_script", "installs" DESC);
CREATE INDEX IF NOT EXISTS "idx_store_apps_react_native" ON store_apps ("react_native", "installs" DESC);
CREATE INDEX IF NOT EXISTS "idx_store_capgo" ON store_apps ("capgo");
CREATE INDEX IF NOT EXISTS "idx_store_on_prem" ON store_apps ("onprem");
CREATE UNIQUE INDEX IF NOT EXISTS "store_app_pkey" ON store_apps ("app_id");
`)

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO store_apps (
    created_at, app_id, url, title, summary, icon, free, category, capacitor, developer_email,
    installs, developer, score, to_get_framework, onprem, updates, to_get_info,
    to_get_similar, updated_at, cordova, react_native, capgo, kotlin, flutter, native_script,
    lang, developer_id
  ) VALUES (
    @created_at, @app_id, @url, @title, @summary, @icon, @free, @category, @capacitor, @developer_email,
    @installs, @developer, @score, @to_get_framework, @onprem, @updates, @to_get_info,
    @to_get_similar, @updated_at, @cordova, @react_native, @capgo, @kotlin, @flutter, @native_script,
    @lang, @developer_id
  )
`)

const boolFields = new Set(['free', 'capacitor', 'to_get_framework', 'onprem', 'to_get_info', 'to_get_similar', 'cordova', 'react_native', 'capgo', 'kotlin', 'flutter', 'native_script'])

const transaction = db.transaction((data) => {
  for (const item of data) {
    for (const field of boolFields) {
      item[field] = (item[field] === '1' || item[field] === 1 || item[field] === true) ? 1 : 0
    }
    item.installs = Number.parseInt(item.installs, 10)?? 0
    item.updates = Number.parseInt(item.updates, 10)?? 0
    item.score = Number.parseFloat(item.score)?? 0.0

    insertStmt.run(item)
  }
})

async function processFile() {
  const fileStream = fs.createReadStream('store_apps_export.json')
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  })

  const batchSize = 10000
  let batch = []

  for await (const line of rl) {
    batch.push(JSON.parse(line))

    if (batch.length >= batchSize) {
      transaction(batch)
      batch = []
    }
  }

  if (batch.length > 0) {
    transaction(batch)
  }

  // Save in-memory database to file
  const outputPath = 'store_apps.sqlite'
  db.backup(outputPath)
    .then(() => {
      db.close()
      console.log('Import completed. Data saved to', outputPath)
    })
    .catch((err) => {
      console.error('Backup failed:', err)
      db.close()
    })
}

processFile()
