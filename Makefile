SHELL := /bin/sh

NODE_VERSION := 26.7.0
NPM_VERSION := 11.19.0

.PHONY: preflight lock prepare build verify

preflight:
	@scripts/check-build-environment.sh

lock: preflight
	@npm install --package-lock-only --ignore-scripts

prepare: preflight
	@npm ci

build: prepare
	@npm run build

verify: build
	@npm run lint-api
	@npm run test-unit
	@npm run esbuild
	@npm run esbuild-demo
	@node ./bin/test_integration.js --suite=core --workers=1 --project=ChromeStable --grep effectiveTheme
