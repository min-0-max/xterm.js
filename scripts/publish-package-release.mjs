#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

const COMMIT_RE = /^[a-f0-9]{40}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const regularFile = (filename, label) => {
  const info = lstatSync(filename);
  if (!info.isFile() || info.isSymbolicLink() || realpathSync(filename) !== filename) {
    throw new Error(`${label} must be a regular file with no symbolic path`);
  }
  return readFileSync(filename);
};

export function collectPackageReleaseAssets({ directory, repository, commit }) {
  if (!isAbsolute(directory) || !REPOSITORY_RE.test(repository) || !COMMIT_RE.test(commit)) {
    throw new Error("absolute directory, repository, and exact commit are required");
  }
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(directory) !== directory) {
    throw new Error("package release directory must be real and non-symbolic");
  }
  const releaseBytes = regularFile(join(directory, "release.json"), "release.json");
  const release = JSON.parse(releaseBytes.toString("utf8"));
  if (
    release?.kind !== "package" || release.package?.name !== "@soksak/xterm"
    || !/^\d+\.\d+\.\d+$/.test(release.package?.version ?? "")
    || release.source?.repository !== `https://github.com/${repository}` || release.source?.commit !== commit
  ) throw new Error("release.json does not match the owner package and source");
  const archiveName = `soksak-xterm-${release.package.version}.tgz`;
  if (release.artifact?.file !== archiveName) throw new Error("release.json names the wrong package archive");
  const archiveBytes = regularFile(join(directory, archiveName), "package archive");
  if (release.artifact.size !== archiveBytes.length || release.artifact.sha256 !== sha256(archiveBytes)) {
    throw new Error("package archive bytes differ from release.json");
  }
  const names = readdirSync(directory, { withFileTypes: true }).map((entry) => {
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("package release assets must be regular files");
    return entry.name;
  }).sort();
  const expected = ["release.json", archiveName];
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error("asset set does not equal release.json");
  const asset = (name, bytes, contentType) => ({
    name, bytes, size: bytes.length, digest: `sha256:${sha256(bytes)}`, contentType,
  });
  return {
    tag: `v${release.package.version}`,
    prerelease: false,
    assets: [
      asset("release.json", releaseBytes, "application/json"),
      asset(archiveName, archiveBytes, "application/gzip"),
    ],
  };
}

const options = (argv) => {
  const allowed = new Set(["repository", "commit", "directory", "publisher"]);
  if (argv.length !== 8) throw new Error("four named publication options are required");
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index].replace(/^--/, "");
    if (!allowed.has(key) || values[key] !== undefined) throw new Error("invalid publication option");
    values[key] = argv[index + 1];
  }
  return values;
};

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const input = options(process.argv.slice(2));
    if (!isAbsolute(input.publisher)) throw new Error("publisher must be an absolute materialized Spec module");
    const { GitHubApi, publishImmutableRelease } = await import(pathToFileURL(realpathSync(input.publisher)).href);
    const release = collectPackageReleaseAssets(input);
    const api = new GitHubApi({ repository: input.repository, token: process.env.SOKSAK_RELEASE_TOKEN });
    const result = await publishImmutableRelease({
      repository: input.repository, commit: input.commit, ...release, api,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
