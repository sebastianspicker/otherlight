#!/usr/bin/env bash
# Serves the production bundle and checks the shell plus referenced assets over HTTP.

set -euo pipefail

host="${SMOKE_HOST:-127.0.0.1}"
port="${SMOKE_PORT:-4173}"
base_url="http://${host}:${port}"
tmp_dir="$(mktemp -d)"
server_pid=""

cleanup() {
  if [[ -n "${server_pid}" ]] && kill -0 "${server_pid}" >/dev/null 2>&1; then
    kill "${server_pid}" >/dev/null 2>&1 || true
    wait "${server_pid}" >/dev/null 2>&1 || true
  fi
  rm -rf "${tmp_dir}"
}

trap cleanup EXIT

pnpm build >/dev/null
pnpm preview --host "${host}" --port "${port}" --strictPort >"${tmp_dir}/preview.log" 2>&1 &
server_pid=$!

for _ in $(seq 1 50); do
  if ! kill -0 "${server_pid}" >/dev/null 2>&1; then
    echo "smoke-served-app: preview exited before becoming ready at ${base_url}" >&2
    cat "${tmp_dir}/preview.log" >&2 || true
    exit 1
  fi
  if curl --fail --silent "${base_url}/" >"${tmp_dir}/index.html"; then
    break
  fi
  sleep 0.2
done

if [[ ! -s "${tmp_dir}/index.html" ]]; then
  echo "smoke-served-app: preview did not become ready at ${base_url}" >&2
  cat "${tmp_dir}/preview.log" >&2 || true
  exit 1
fi

grep -q 'id="appShellRoot"' "${tmp_dir}/index.html"
main_path="$(
  grep -Eo 'src="/assets/[^"]+\.js"' "${tmp_dir}/index.html" |
    head -n 1 |
    sed 's/^src="//; s/"$//'
)"
if [[ -z "${main_path}" ]]; then
  echo "smoke-served-app: could not locate built module asset in served preview HTML" >&2
  exit 1
fi

curl --fail --silent --head "${base_url}${main_path}" >"${tmp_dir}/main.headers"
grep -qi 'content-type:.*javascript' "${tmp_dir}/main.headers"
