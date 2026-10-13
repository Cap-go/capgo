#!/usr/bin/env bash

set -euo pipefail

service_name="${BACKGROUND_SERVICE_NAME:-}"
run_command="${BACKGROUND_RUN_COMMAND:-}"
wait_on_resources_raw="${BACKGROUND_WAIT_ON:-}"
log_path="${BACKGROUND_LOG_PATH:-}"
workdir="${BACKGROUND_WORKDIR:-$PWD}"
wait_timeout_ms="${BACKGROUND_WAIT_TIMEOUT_MS:-60000}"
wait_interval_ms="${BACKGROUND_WAIT_INTERVAL_MS:-500}"
ready_log_text="${BACKGROUND_READY_LOG_TEXT:-}"
tail_lines="${BACKGROUND_TAIL_LINES:-200}"
wait_on_version="${BACKGROUND_WAIT_ON_VERSION:-8.0.1}"

if [[ -z "${service_name}" || -z "${run_command}" || -z "${wait_on_resources_raw}" || -z "${log_path}" ]]; then
  printf '%s\n' "::error::BACKGROUND_SERVICE_NAME, BACKGROUND_RUN_COMMAND, BACKGROUND_WAIT_ON, and BACKGROUND_LOG_PATH are required." >&2
  exit 1
fi

mkdir -p "$(dirname "${log_path}")"
: > "${log_path}"

wait_on_resources=()
while IFS= read -r resource; do
  if [[ -n "${resource}" ]]; then
    wait_on_resources+=("${resource}")
  fi
done < <(printf '%s\n' "${wait_on_resources_raw}" | sed '/^[[:space:]]*$/d')

if [[ "${#wait_on_resources[@]}" -eq 0 ]]; then
  printf '%s\n' "::error::${service_name} is missing wait-on resources." >&2
  exit 1
fi

dump_log_tail() {
  if [[ ! -f "${log_path}" ]]; then
    echo "No log file found at ${log_path}"
    return
  fi

  echo "::group::${service_name} log tail"
  tail -n "${tail_lines}" "${log_path}" || true
  echo "::endgroup::"
}

echo "::group::Start ${service_name}"
echo "Working directory: ${workdir}"
echo "Log file: ${log_path}"
printf 'Wait-on targets:\n'
printf ' - %s\n' "${wait_on_resources[@]}"
echo "::endgroup::"

pushd "${workdir}" >/dev/null
nohup bash -lc "${run_command}" >"${log_path}" 2>&1 &
pid=$!
disown "${pid}" 2>/dev/null || true
popd >/dev/null

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "pid=${pid}"
    echo "log_path=${log_path}"
  } >> "${GITHUB_OUTPUT}"
fi

sleep 1
if ! kill -0 "${pid}" 2>/dev/null; then
  printf '%s\n' "::error::${service_name} exited before it became ready." >&2
  dump_log_tail
  exit 1
fi

# A previous service can still answer the same health URL during replacement.
# Require the new process's own readiness banner before probing that URL.
if [[ -n "${ready_log_text}" ]]; then
  readiness_started_at=${SECONDS}
  readiness_timeout_seconds=$(( (wait_timeout_ms + 999) / 1000 ))
  until grep -Fq -- "${ready_log_text}" "${log_path}"; do
    if ! kill -0 "${pid}" 2>/dev/null; then
      printf '%s\n' "::error::${service_name} exited before its readiness banner." >&2
      dump_log_tail
      exit 1
    fi
    if (( SECONDS - readiness_started_at >= readiness_timeout_seconds )); then
      printf '%s\n' "::error::${service_name} did not emit its readiness banner." >&2
      dump_log_tail
      exit 1
    fi
    sleep 0.2
  done
  # Share the readiness timeout between the banner and the HTTP probe.
  wait_timeout_ms=$(( wait_timeout_ms - (SECONDS - readiness_started_at) * 1000 ))
  if (( wait_timeout_ms <= 0 )); then
    printf '%s\n' "::error::${service_name} failed to become ready within its startup budget." >&2
    dump_log_tail
    exit 1
  fi
fi

if ! bunx "wait-on@${wait_on_version}" "${wait_on_resources[@]}" --timeout "${wait_timeout_ms}" --interval "${wait_interval_ms}" --log --verbose; then
  printf '%s\n' "::error::${service_name} failed to become ready." >&2
  dump_log_tail
  exit 1
fi

if ! kill -0 "${pid}" 2>/dev/null; then
  printf '%s\n' "::error::${service_name} exited before it became ready." >&2
  dump_log_tail
  exit 1
fi

echo "::notice::${service_name} is ready (pid ${pid})."
