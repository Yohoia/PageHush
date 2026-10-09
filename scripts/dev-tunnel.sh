#!/usr/bin/env sh
# PageHush 本地开发隧道：断线自动重连。
# 用法：sh scripts/dev-tunnel.sh   （前台运行，Ctrl+C 退出）
set -u

SERVER_ALIAS="${PAGEHUSH_TUNNEL_HOST:-blog-aliyun}"
RETRY_SECONDS=5

echo "[dev-tunnel] connecting to ${SERVER_ALIAS} ..."
while true; do
  ssh -N \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=4 \
    -o TCPKeepAlive=yes \
    -L 15432:127.0.0.1:15432 \
    -L 19000:127.0.0.1:19000 \
    "$SERVER_ALIAS"
  status=$?
  # 正常退出（Ctrl+C / kill）直接结束，不再重连。
  if [ "$status" -eq 0 ] || [ "$status" -eq 130 ]; then
    echo "[dev-tunnel] stopped."
    exit "$status"
  fi
  echo "[dev-tunnel] connection lost (exit ${status}), retrying in ${RETRY_SECONDS}s ..."
  sleep "$RETRY_SECONDS"
done
