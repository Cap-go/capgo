#!/usr/bin/env bash
set -euo pipefail

if [ ! -d "$RESULTS_DIR" ]; then
  echo "::warning::No results directory was produced at $RESULTS_DIR; skipping R2 upload."
  exit 0
fi

missing=()
for name in CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN R2_BUCKET REPORTS_BASE_URL; do
  if [ -z "${!name:-}" ]; then
    missing+=("$name")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'Missing required R2 preview configuration: %s\n' "${missing[*]}" >&2
  exit 1
fi

upload_concurrency="${R2_UPLOAD_CONCURRENCY:-16}"
if ! [[ "$upload_concurrency" =~ ^[1-9][0-9]*$ ]]; then
  printf 'R2_UPLOAD_CONCURRENCY must be a positive integer, got: %s\n' "$upload_concurrency" >&2
  exit 1
fi

short_sha="${HEAD_SHA:0:12}"
prefix="builder-onboarding-tui/pr-${PR_NUMBER}/${short_sha}"

content_type_for() {
  case "$1" in
    *.html) printf '%s\n' 'text/html; charset=utf-8' ;;
    *.md) printf '%s\n' 'text/markdown; charset=utf-8' ;;
    *.json) printf '%s\n' 'application/json; charset=utf-8' ;;
    *.cast) printf '%s\n' 'application/x-asciicast; charset=utf-8' ;;
    *.txt) printf '%s\n' 'text/plain; charset=utf-8' ;;
    *) printf '%s\n' 'application/octet-stream' ;;
  esac
}

upload_result_file() {
  local file="$1"
  local rel="${file#"$RESULTS_DIR"/}"
  local key="$prefix/$rel"

  bunx wrangler r2 object put "$R2_BUCKET/$key" \
    --remote \
    --file "$file" \
    --content-type "$(content_type_for "$file")" \
    --cache-control "no-store"
}

mapfile -d '' result_files < <(find "$RESULTS_DIR" -type f ! -name ".gitkeep" -print0 | sort -z)
uploaded="${#result_files[@]}"

if [ "$uploaded" -eq 0 ]; then
  echo "::warning::No result files found under $RESULTS_DIR; skipping R2 summary links."
  exit 0
fi

export R2_BUCKET RESULTS_DIR prefix
export -f content_type_for upload_result_file

echo "Checking remote R2 write access with one result file before parallel upload."
upload_result_file "${result_files[0]}"

if [ "$uploaded" -gt 1 ]; then
  printf '%s\0' "${result_files[@]:1}" \
    | xargs -0 -r -n 1 -P "$upload_concurrency" bash -c 'upload_result_file "$1"' _
fi

if [ -f "$REPORT_PATH" ]; then
  bunx wrangler r2 object put "$R2_BUCKET/$prefix/index.html" \
    --remote \
    --file "$REPORT_PATH" \
    --content-type "text/html; charset=utf-8" \
    --cache-control "no-store"
fi

report_url="${REPORTS_BASE_URL%/}/$prefix/index.html"
summary_url="${REPORTS_BASE_URL%/}/$prefix/summary.md"
run_url="${REPORTS_BASE_URL%/}/$prefix/run.json"
files_url="${REPORTS_BASE_URL%/}/$prefix/files.txt"
echo "url=$report_url" >> "$GITHUB_OUTPUT"
{
  echo "### Builder onboarding TUI report"
  echo
  echo "[Open protected HTML report]($report_url)"
  echo
  echo "- [Markdown summary]($summary_url)"
  echo "- [Raw run.json]($run_url)"
  echo "- [Uploaded file list]($files_url)"
  echo
  echo "Uploaded $uploaded result files to protected R2 prefix with concurrency $upload_concurrency:"
  echo
  echo "\`$prefix/\`"
} >> "$GITHUB_STEP_SUMMARY"
