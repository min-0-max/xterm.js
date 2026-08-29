SHELL := /bin/sh

NODE_VERSION := 26.7.0
NPM_VERSION := 11.19.0
PNPM_VERSION := 11.22.0

.PHONY: preflight lock prepare build verify require-out require-registry release publish

preflight:
	@scripts/check-build-environment.sh

lock: preflight
	@pnpm install --lockfile-only

prepare: preflight
	@pnpm install --frozen-lockfile

build: prepare
	@pnpm build

verify: build
	@node scripts/check-package-entry.mjs
	@pnpm lint-api
	@pnpm test-unit
	@pnpm esbuild
	@pnpm esbuild-demo
	@node ./bin/test_integration.js --suite=core --workers=1 --project=ChromeStable --grep effectiveTheme

require-out:
	@case "$(origin OUT)" in "command line") ;; *) echo 'OUT must be an absolute command-line path' >&2; exit 64 ;; esac
	@case "$(OUT)" in /*) ;; *) echo 'OUT must be an absolute path' >&2; exit 64 ;; esac

require-registry:
	@case "$(origin REGISTRY)" in "command line") ;; *) echo 'REGISTRY must be an absolute command-line URL' >&2; exit 64 ;; esac
	@case "$(REGISTRY)" in http://*|https://*) ;; *) echo 'REGISTRY must be an absolute URL' >&2; exit 64 ;; esac

release: require-out verify
	@mkdir -p "$(OUT)"
	@pnpm pack --pack-destination "$(OUT)"

publish: require-registry release
	@pnpm publish "$(OUT)/soksak-xterm-6.0.0.tgz" --registry "$(REGISTRY)" --@soksak:registry="$(REGISTRY)" --no-git-checks
