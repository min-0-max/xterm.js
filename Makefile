SHELL := /bin/sh

NODE_VERSION := 26.7.0
NPM_VERSION := 11.19.0
PNPM_VERSION := 11.22.0

.PHONY: preflight lock prepare build verify require-out require-commit require-registry release publish

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
	@node --test scripts/*.test.mjs
	@pnpm lint-api
	@pnpm test-unit
	@pnpm esbuild
	@pnpm esbuild-demo
	@node ./bin/test_integration.js --suite=core --workers=1 --project=ChromeStable --grep effectiveTheme

require-out:
	@case "$(origin OUT)" in "command line") ;; *) echo 'OUT must be an absolute command-line path' >&2; exit 64 ;; esac
	@case "$(OUT)" in /*) ;; *) echo 'OUT must be an absolute path' >&2; exit 64 ;; esac

require-commit:
	@case "$(origin COMMIT)" in "command line") ;; *) echo 'COMMIT must be an exact command-line Git SHA' >&2; exit 64 ;; esac
	@node -e 'if (!/^[a-f0-9]{40}$$/.test(process.argv[1])) process.exit(64)' "$(COMMIT)"

require-registry:
	@case "$(origin REGISTRY)" in "command line") ;; *) echo 'REGISTRY must be an absolute command-line URL' >&2; exit 64 ;; esac
	@case "$(REGISTRY)" in http://*|https://*) ;; *) echo 'REGISTRY must be an absolute URL' >&2; exit 64 ;; esac

release: require-out require-commit verify
	@node scripts/build-package-release.mjs --commit "$(COMMIT)" --out "$(OUT)"

publish: require-registry release
	@archive="$$(node -e 'const p=require("./package.json");process.stdout.write(`soksak-xterm-$${p.version}.tgz`)')"; \
		pnpm publish "$(OUT)/$$archive" --registry "$(REGISTRY)" --@soksak:registry="$(REGISTRY)" --no-git-checks
