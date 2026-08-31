import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildReleaseDocument, publishVerifiedOutput } from "./build-package-release.mjs";
import { collectPackageReleaseAssets, repositoryImmutableSetting } from "./publish-package-release.mjs";

const COMMIT = "a".repeat(40);
const REPOSITORY = "min-median-max/xterm.js";
const ARCHIVE = "soksak-xterm-6.0.0.tgz";

const candidate = (root, bytes = Buffer.from("package-bytes")) => {
  mkdirSync(root);
  writeFileSync(join(root, ARCHIVE), bytes);
  writeFileSync(join(root, "release.json"), `${JSON.stringify(buildReleaseDocument({
    repository: REPOSITORY, commit: COMMIT, name: "@soksak/xterm", version: "6.0.0",
    archive: ARCHIVE, bytes,
  }), null, 2)}\n`);
};

test("one owner package version has one repeatable release output", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "soksak-xterm-release-")));
  const first = join(root, "first");
  const repeated = join(root, "repeated");
  const changed = join(root, "changed");
  const output = join(root, "output");
  candidate(first);
  assert.deepEqual(publishVerifiedOutput(first, output), { state: "created", output });
  candidate(repeated);
  assert.deepEqual(publishVerifiedOutput(repeated, output), { state: "unchanged", output });
  candidate(changed, Buffer.from("different-package-bytes"));
  assert.throws(() => publishVerifiedOutput(changed, output), /differs from the existing immutable output/);
  assert.equal(JSON.parse(readFileSync(join(output, "release.json"))).source.commit, COMMIT);
});

test("publication reads only the declared owner asset set", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "soksak-xterm-assets-")));
  const directory = join(root, "release");
  candidate(directory);
  const release = collectPackageReleaseAssets({ directory, repository: REPOSITORY, commit: COMMIT });
  assert.equal(release.tag, "v6.0.0");
  assert.equal(release.prerelease, false);
  assert.deepEqual(release.assets.map(({ name }) => name), ["release.json", ARCHIVE]);
  writeFileSync(join(directory, "undeclared.txt"), "no");
  assert.throws(
    () => collectPackageReleaseAssets({ directory, repository: REPOSITORY, commit: COMMIT }),
    /asset set does not equal release.json/,
  );
});

test("repository immutability is required even without an organization policy", () => {
  assert.equal(repositoryImmutableSetting({ enabled: true, enforced_by_owner: false }), true);
  assert.equal(repositoryImmutableSetting({ enabled: true, enforced_by_owner: true }), true);
  assert.equal(repositoryImmutableSetting({ enabled: false, enforced_by_owner: false }), false);
  assert.equal(repositoryImmutableSetting(null), false);
});

test("the owner workflow proves, then seals, the exact package bytes", () => {
  const root = new URL("..", import.meta.url);
  const makefile = readFileSync(new URL("Makefile", root), "utf8");
  const workflow = readFileSync(new URL(".github/workflows/release.yml", root), "utf8");
  assert.match(makefile, /^release: require-out require-commit verify$/m);
  assert.match(makefile, /build-package-release[.]mjs/);
  assert.doesNotMatch(makefile, /soksak-xterm-6[.]0[.]0[.]tgz/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github[.]ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow, /refs\/heads\/soksak-provider/);
  assert.match(workflow, /make release COMMIT="\$GITHUB_SHA" OUT="\$RUNNER_TEMP\/release"/);
  assert.match(workflow, /immutable-releases.*[.]enabled/);
  assert.doesNotMatch(workflow, /enforced_by_owner/);
  assert.match(workflow, /publish-package-release[.]mjs/);
  assert.match(workflow, /publish-release[.]mjs/);
  assert.doesNotMatch(workflow, /npm publish|pnpm publish|NPM_TOKEN/);
});

test("the portable package preflight validates the effective supported host", () => {
  const source = readFileSync(new URL("scripts/check-build-environment.sh", new URL("..", import.meta.url)), "utf8");
  assert.match(source, /Linux-x86_64/);
  assert.match(source, /Darwin-arm64/);
  assert.match(source, /packageManager/);
  assert.match(source, /node_platform.*platform/);
  assert.match(source, /node_arch.*arch/);
  assert.doesNotMatch(source, /actual_arch.*!= "arm64"/);
  assert.doesNotMatch(source, /actual_platform.*!= "darwin"/);
});

test("the clean checkout declares the Playwright type import directly", () => {
  const root = new URL("..", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  assert.equal(manifest.devDependencies["@playwright/test"], "1.37.1");
  assert.equal(manifest.devDependencies["playwright-core"], "1.37.1");
  assert.match(readFileSync(new URL("test/playwright/TestUtils.ts", root), "utf8"), /from 'playwright-core\/types\/structs'/);
});

test("the typings linter uses the declared consolidated stylistic plugin", () => {
  const root = new URL("..", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  const config = readFileSync(new URL(".eslintrc.json.typings", root), "utf8");
  assert.equal(typeof manifest.devDependencies["@stylistic/eslint-plugin"], "string");
  assert.match(config, /^\s*"@stylistic",?$/m);
  assert.doesNotMatch(config, /"@stylistic\/ts"/);
  for (const rule of ["indent", "semi", "quotes"]) assert.match(config, new RegExp(`"@stylistic/${rule}"`));
});
