#!/bin/sh
set -eu

required_node=26.7.0
required_npm=11.19.0
required_pnpm=11.22.0

actual_node="$(node -p 'process.versions.node')"
actual_arch="$(node -p 'process.arch')"
actual_platform="$(node -p 'process.platform')"
actual_npm="$(npm --version)"
actual_pnpm="$(pnpm --version)"

if [ "$actual_node" != "$required_node" ] || [ "$actual_arch" != "arm64" ] || [ "$actual_platform" != "darwin" ] || [ "$actual_npm" != "$required_npm" ] || [ "$actual_pnpm" != "$required_pnpm" ]; then
  echo "TOOLCHAIN_MISMATCH required=node@$required_node npm@$required_npm pnpm@$required_pnpm darwin/arm64 actual=node@$actual_node npm@$actual_npm pnpm@$actual_pnpm $actual_platform/$actual_arch" >&2
  exit 78
fi

echo "BUILD_ENVIRONMENT_READY node=v$actual_node npm=$actual_npm pnpm=$actual_pnpm runtime=$actual_platform/$actual_arch"
