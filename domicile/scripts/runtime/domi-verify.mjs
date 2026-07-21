#!/usr/bin/env node
// scripts/runtime/domi-verify.mjs
//
// First-run install verification for the DOMicile Agent Skill.
//
// Run once after install (or any time you suspect the install is stale).
// Prints a structured JSON report and exits non-zero if any required
// component is missing.
//
// Usage:
//   node domi-verify.mjs [install-path]
//   install-path defaults to ~/.agents/skills/domicile
//
// Exit codes:
//   0  all required skill components present (standalone-ready)
//   1  one or more required components missing — skill will not work
//
// The `domi_server` field in the JSON is always populated when found;
// when it's null and the user wants server mode, the agent should run
// `tools/domi-serve.sh start` (which auto-installs the binary).
// Standalone mode never needs domi-server.
//
// The Agent Skill's SKILL.md points at this script with a one-liner;
// the agent runs it once per fresh install and acts on the report.

import { accessSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, delimiter, resolve } from 'node:path';

const HOME = process.env.HOME || homedir();
const installArg = process.argv[2];
const INSTALL_PATH = installArg
  ? resolve(installArg)
  : join(HOME, '.agents', 'skills', 'domicile');

// Files the skill must have at the install path. The CSS, runtime JS,
// and the working-doc starter template. SKILL.md is the agent's prompt
// entry — without it the skill is invisible.
const REQUIRED_FILES = [
  'SKILL.md',
  'components/domi.css',
  'scripts/runtime/domi.js',
  'scripts/runtime/domi-audit.js',
  'scripts/runtime/domi-audit-render.js',
  'scripts/runtime/domi-server.js',
  'scripts/runtime/domi-wire.js',
  'scripts/runtime/domi-verify.mjs',
  'templates/working-doc/index.html',
];

// Best-effort search locations for the `domi-server` binary. The agent
// does not need it for standalone mode, but server mode requires it.
// The skill's own `tools/domi-serve.sh start` is the canonical install
// path (auto-installs from GitHub Releases).
const SERVER_BIN_CANDIDATES = [
  join(HOME, '.local', 'bin', 'domi-server'),
  join(HOME, '.cargo', 'bin', 'domi-server'),
  '/usr/local/bin/domi-server',
  '/opt/homebrew/bin/domi-server',
];

function isExecutable(p) {
  try {
    accessSync(p, 1 /* X_OK */);
    return true;
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function findDomiserver() {
  for (const p of SERVER_BIN_CANDIDATES) {
    if (isExecutable(p)) return p;
  }
  const pathVar = process.env.PATH || '';
  for (const dir of pathVar.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, 'domi-server');
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

const report = {
  install_path: INSTALL_PATH,
  install_path_exists: false,
  files: {},
  missing_files: [],
  domi_server: null,
  domi_server_note:
    'null means standalone mode is the only option. For server mode, run `tools/domi-serve.sh start` (auto-installs).',
  ok: false,
};

// 1. Install dir present?
try {
  report.install_path_exists = statSync(INSTALL_PATH).isDirectory();
} catch {
  // leave false
}

if (!report.install_path_exists) {
  report.missing_files.push(`(install dir not found: ${INSTALL_PATH})`);
} else {
  // 2. Each required file present?
  for (const f of REQUIRED_FILES) {
    const exists = isFile(join(INSTALL_PATH, f));
    report.files[f] = exists;
    if (!exists) report.missing_files.push(f);
  }
}

// 3. domi-server best-effort lookup. Never fails the report by itself.
report.domi_server = findDomiserver();

// 4. Decide exit. The skill is "ok" when the install dir exists and
// every required file is present. domi-server is informational only.
report.ok =
  report.install_path_exists && report.missing_files.length === 0;

process.stdout.write(JSON.stringify(report, null, 2) + '\n');
process.exit(report.ok ? 0 : 1);
