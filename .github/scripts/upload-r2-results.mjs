#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const requiredEnv = [
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "REPORTS_BASE_URL",
  "PR_NUMBER",
  "HEAD_SHA",
  "RESULTS_DIR",
  "REPORT_PATH",
  "GITHUB_OUTPUT",
  "GITHUB_STEP_SUMMARY",
];

const missing = requiredEnv.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing required R2 preview configuration: ${missing.join(" ")}`);
  process.exit(1);
}

const resultsDir = process.env.RESULTS_DIR;
const reportPath = process.env.REPORT_PATH;
const shortSha = process.env.HEAD_SHA.slice(0, 12);
const prefix = `builder-onboarding-tui/pr-${process.env.PR_NUMBER}/${shortSha}`;
const concurrency = parseConcurrency(process.env.R2_UPLOAD_CONCURRENCY ?? "16");

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const resultFiles = await collectFiles(resultsDir);
if (resultFiles.length === 0) {
  console.warn(`::warning::No result files found under ${resultsDir}; skipping R2 summary links.`);
  process.exit(0);
}

const uploads = resultFiles.map((file) => {
  const relativePath = toObjectPath(path.relative(resultsDir, file));
  return {
    file,
    key: `${prefix}/${relativePath}`,
    contentType: contentTypeFor(file),
  };
});

await uploadMany(uploads, concurrency);

if (await fileExists(reportPath)) {
  await uploadOne({
    file: reportPath,
    key: `${prefix}/index.html`,
    contentType: "text/html; charset=utf-8",
  });
}

const reportUrl = `${trimTrailingSlash(process.env.REPORTS_BASE_URL)}/${prefix}/index.html`;
const summaryUrl = `${trimTrailingSlash(process.env.REPORTS_BASE_URL)}/${prefix}/summary.md`;
const runUrl = `${trimTrailingSlash(process.env.REPORTS_BASE_URL)}/${prefix}/run.json`;
const filesUrl = `${trimTrailingSlash(process.env.REPORTS_BASE_URL)}/${prefix}/files.txt`;

await appendFile(process.env.GITHUB_OUTPUT, `url=${reportUrl}\n`);
await appendFile(
  process.env.GITHUB_STEP_SUMMARY,
  [
    "### Builder onboarding TUI report",
    "",
    `[Open protected HTML report](${reportUrl})`,
    "",
    `- [Markdown summary](${summaryUrl})`,
    `- [Raw run.json](${runUrl})`,
    `- [Uploaded file list](${filesUrl})`,
    "",
    `Uploaded ${resultFiles.length} result files to protected R2 prefix with concurrency ${concurrency}:`,
    "",
    `\`${prefix}/\``,
    "",
  ].join("\n"),
);

async function collectFiles(dir) {
  if (!(await fileExists(dir))) {
    console.warn(`::warning::No results directory was produced at ${dir}; skipping R2 upload.`);
    process.exit(0);
  }

  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name !== ".gitkeep") {
      files.push(entryPath);
    }
  }

  return files.sort();
}

async function uploadMany(items, limit) {
  const failures = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;

      try {
        await uploadOne(item);
      } catch (error) {
        failures.push({ item, error });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  if (failures.length > 0) {
    for (const { item, error } of failures.slice(0, 10)) {
      console.error(`Failed to upload ${item.file} to ${item.key}: ${formatError(error)}`);
    }

    if (failures.length > 10) {
      console.error(`...and ${failures.length - 10} more upload failures.`);
    }

    process.exit(1);
  }
}

async function uploadOne({ file, key, contentType }) {
  console.log(`Uploading ${key}`);
  const { size } = await stat(file);
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: createReadStream(file),
      ContentLength: size,
      ContentType: contentType,
      CacheControl: "no-store",
    }),
  );
}

async function fileExists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function contentTypeFor(file) {
  switch (path.extname(file)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".cast":
      return "application/x-asciicast; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function parseConcurrency(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.error(`R2_UPLOAD_CONCURRENCY must be a positive integer, got: ${value}`);
    process.exit(1);
  }
  return parsed;
}

function toObjectPath(file) {
  return file.split(path.sep).join("/");
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function formatError(error) {
  const status = error?.$metadata?.httpStatusCode;
  const code = error?.Code || error?.name;
  const message = error?.message || String(error);
  return [status && `HTTP ${status}`, code, message].filter(Boolean).join(" - ");
}

async function appendFile(file, content) {
  const { appendFile: append } = await import("node:fs/promises");
  await append(file, content);
}
