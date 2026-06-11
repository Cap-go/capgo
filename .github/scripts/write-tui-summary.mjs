#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const STATUS_ORDER = ["fail", "xpass", "flaky", "blocked", "xfail", "pass"];
const PASS_LIKE_STATUSES = new Set(["pass", "flaky", "xfail", "xpass"]);

const [runPath, outPath] = process.argv.slice(2);
if (!runPath || !outPath) {
  console.error("Usage: write-tui-summary.mjs <run.json> <summary.md>");
  process.exit(1);
}

const run = JSON.parse(await readFile(runPath, "utf8"));
const journeys = run.journeys;
if (!Array.isArray(journeys)) {
  console.error(`Malformed TUI run file: ${runPath} is missing journeys[]`);
  process.exit(1);
}

const counts = countStatuses(journeys);
const failed = counts.fail ?? 0;
const passLike = journeys.filter((journey) => PASS_LIKE_STATUSES.has(journey.status)).length;
const statusSummary = STATUS_ORDER
  .filter((status) => counts[status] > 0)
  .map((status) => `${counts[status]} ${status}`)
  .join(" | ");
const sortedJourneys = [...journeys].sort((left, right) => {
  const byStatus = statusRank(left.status) - statusRank(right.status);
  if (byStatus !== 0) return byStatus;
  return String(left.name).localeCompare(String(right.name));
});

const lines = [
  `## TUI E2E - ${failed} failed / ${journeys.length} total`,
  "",
  `${passLike}/${journeys.length} non-failing. ${statusSummary || "No tests recorded."}`,
  "",
  "| Status | Journey | World | Failure |",
  "| --- | --- | --- | --- |",
];

for (const journey of sortedJourneys) {
  lines.push(
    `| ${mdCell(journey.status)} | ${mdCell(journey.name)} | ${mdCell(journey.world ?? "")} | ${mdCell(failureSummary(journey))} |`,
  );
}

lines.push("");
lines.push("Full HTML report, raw run.json, casts, and detailed Markdown failure output are uploaded to the protected R2 report prefix.");

await writeFile(outPath, `${lines.join("\n")}\n`);

function countStatuses(items) {
  const result = {};
  for (const item of items) {
    result[item.status] = (result[item.status] ?? 0) + 1;
  }
  return result;
}

function statusRank(status) {
  const index = STATUS_ORDER.indexOf(status);
  return index === -1 ? STATUS_ORDER.length : index;
}

function failureSummary(journey) {
  if (journey.status !== "fail" || !journey.failure) {
    return "";
  }

  const failure = typeof journey.failure === "string"
    ? { message: journey.failure }
    : journey.failure;
  const node = failure.nodeId ? `@ ${failure.nodeId}: ` : "";
  const message = String(failure.message ?? "").split("\n")[0] ?? "";
  return truncate(`${node}${cleanPaths(message)}`, 180);
}

function cleanPaths(value) {
  const cwdPrefix = `${process.cwd().replace(/\/+$/, "")}/`;

  return value
    .replaceAll(cwdPrefix, "")
    .replaceAll(process.cwd(), ".")
    .replace(/\/home\/runner\/work\/[^/]+\/[^/]+\//g, "")
    .replace(/\/[^ ]*private\/cli-mcp-tests\//g, "private/cli-mcp-tests/");
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function mdCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}
