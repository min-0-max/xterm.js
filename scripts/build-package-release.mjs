#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync,
  renameSync, rmSync, writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const COMMIT_RE = /^[a-f0-9]{40}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const VERSION_RE = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const regularDirectory = (directory, label) => {
  if (!isAbsolute(directory) || !existsSync(directory)) throw new Error(`${label} must be an absolute directory`);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(directory) !== directory) {
    throw new Error(`${label} must be a real directory with no symbolic path`);
  }
};

const regularFiles = (directory, label) => {
  regularDirectory(directory, label);
  return readdirSync(directory, { withFileTypes: true }).map((entry) => {
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`${label} must contain only regular files`);
    const filename = join(directory, entry.name);
    if (realpathSync(filename) !== filename) throw new Error(`${label} contains a symbolic file path`);
    return entry.name;
  }).sort();
};

const archiveName = (name, version) => `${name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;

export function buildReleaseDocument({ repository, commit, name, version, archive, bytes }) {
  if (!REPOSITORY_RE.test(repository) || !COMMIT_RE.test(commit)) throw new Error("exact repository and commit are required");
  if (name !== "@soksak/xterm" || !VERSION_RE.test(version)) throw new Error("owner package identity is invalid");
  if (archive !== archiveName(name, version) || !Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new Error("owner package archive is invalid");
  }
  return {
    kind: "package",
    package: { name, version },
    source: { repository: `https://github.com/${repository}`, commit },
    artifact: { file: archive, size: bytes.length, sha256: sha256(bytes) },
  };
}

export function publishVerifiedOutput(candidate, output) {
  if (!isAbsolute(candidate) || !isAbsolute(output)) throw new Error("candidate and output must be absolute paths");
  const candidateFiles = regularFiles(candidate, "package release candidate");
  const release = JSON.parse(readFileSync(join(candidate, "release.json"), "utf8"));
  const archive = release?.artifact?.file;
  if (
    release?.kind !== "package" || release.package?.name !== "@soksak/xterm"
    || typeof archive !== "string"
    || JSON.stringify(candidateFiles) !== JSON.stringify(["release.json", archive].sort())
  ) {
    throw new Error("package release candidate has an undeclared asset set");
  }
  regularDirectory(dirname(output), "package release output parent");
  if (!existsSync(output)) {
    renameSync(candidate, output);
    return { state: "created", output };
  }
  const outputFiles = regularFiles(output, "package release output");
  if (JSON.stringify(candidateFiles) !== JSON.stringify(outputFiles)) {
    throw new Error("package release differs from the existing immutable output");
  }
  for (const name of candidateFiles) {
    if (!readFileSync(join(candidate, name)).equals(readFileSync(join(output, name)))) {
      throw new Error("package release differs from the existing immutable output");
    }
  }
  return { state: "unchanged", output };
}

const options = (argv) => {
  if (argv.length !== 4 || argv[0] !== "--commit" || argv[2] !== "--out") {
    throw new Error("usage: build-package-release.mjs --commit <sha> --out <absolute-directory>");
  }
  return { commit: argv[1], out: argv[3] };
};

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
};

const output = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}${result.stderr}`);
  return result.stdout.trim();
};

const isEntry = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isEntry) {
  let stage;
  try {
    const { commit, out } = options(process.argv.slice(2));
    if (!COMMIT_RE.test(commit) || !isAbsolute(out)) throw new Error("exact commit and absolute output are required");
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    if (output("git", ["rev-parse", "--verify", "HEAD"], root) !== commit) throw new Error("release commit does not equal source HEAD");
    if (output("git", ["status", "--porcelain=v1", "--untracked-files=all"], root) !== "") {
      throw new Error("package release requires a clean source checkout");
    }
    regularDirectory(dirname(out), "package release output parent");
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (manifest.repository !== "https://github.com/min-median-max/xterm.js") throw new Error("package repository is invalid");
    stage = mkdtempSync(join(dirname(out), `.${basename(out)}.package-`));
    run("pnpm", ["pack", "--pack-destination", stage], root);
    const archive = archiveName(manifest.name, manifest.version);
    if (JSON.stringify(regularFiles(stage, "packed package")) !== JSON.stringify([archive])) {
      throw new Error("pnpm pack emitted an unexpected asset set");
    }
    const bytes = readFileSync(join(stage, archive));
    const release = buildReleaseDocument({
      repository: "min-median-max/xterm.js", commit,
      name: manifest.name, version: manifest.version, archive, bytes,
    });
    writeFileSync(join(stage, "release.json"), `${JSON.stringify(release, null, 2)}\n`);
    const result = publishVerifiedOutput(stage, out);
    stage = undefined;
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    if (stage && existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
}
