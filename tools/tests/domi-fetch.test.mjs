// @vitest-environment node
//
// Unit tests for tools/domi-fetch.sh. All external tools (curl, tar,
// sha256sum, cargo) are stubbed via PATH override. The script's HOME and
// DOMICILE_BIN_DIR are redirected per-test so the real user's ~/.local/bin
// is never touched.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync,
  existsSync, rmSync, chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const execFileP = promisify(_execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = resolve(REPO_ROOT, 'tools', 'domi-fetch.sh');

// --- Fixture infrastructure --------------------------------------------------

let FIXTURE_DIR;        // fake "release" — serves tarball + SHA256SUMS
let STUB_BIN;           // PATH override: stubs for curl, tar, sha256sum, cargo
let SERVER;
let FIXTURE_URL;

beforeAll(async () => {
  FIXTURE_DIR = mkdtempSync(join(tmpdir(), 'domi-fetch-test-'));
  STUB_BIN = join(FIXTURE_DIR, 'stubs');
  mkdirSync(STUB_BIN, { recursive: true });

// Stub `curl`: copies the URL-named file from FIXTURE_ROOT to -o path.
  // Exit 22 if the file doesn't exist (matches curl's "not found" behavior
  // closely enough for the script's `if ! curl` branch).
  writeFileSync(join(STUB_BIN, 'curl'), `#!/bin/bash
out=""
url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    --retry|-fsSL|-L|--http3) shift ;;
    *) url="$1"; shift ;;
  esac
done
name="$(basename "\${url}")"
src="\${FIXTURE_ROOT}/\${name}"
if [ -f "\${src}" ]; then
  cp "\${src}" "\${out}"
  exit 0
else
  echo "stub curl: \${src} not found" >&2
  exit 22
fi
`);
  chmodSync(join(STUB_BIN, 'curl'), 0o755);

  // Stub `tar -xzf <tgz> -C <dest>`: produces a `bin/domi-server` and
  // `bin/domi` inside <dest>. The script does `tar -xzf $tmp/asset.tar.gz
  // -C $tmp/`, then checks `$tmp/bin/domi-server` exists.
  writeFileSync(join(STUB_BIN, 'tar'), `#!/bin/bash
dest=""
while [ $# -gt 0 ]; do
  case "$1" in
    -*) shift ;;
    *) dest="$1"; shift ;;
  esac
done
mkdir -p "$dest/bin"
printf '#!/bin/bash\necho "domi-server 0.1.0"\n' > "$dest/bin/domi-server"
chmod +x "$dest/bin/domi-server"
cp "$dest/bin/domi-server" "$dest/bin/domi"
chmod +x "$dest/bin/domi"
`);
  chmodSync(join(STUB_BIN, 'tar'), 0o755);

  // Stub `sha256sum -c -`: tests can override this file to simulate
  // a checksum failure. Default: pass.
  writeFileSync(join(STUB_BIN, 'sha256sum'), '#!/bin/bash\nexit 0\n');
  chmodSync(join(STUB_BIN, 'sha256sum'), 0o755);

  // Stub `cargo`: defaults to exit 127 (not on PATH). Tests that want a
  // successful cargo install override this file.
  writeFileSync(join(STUB_BIN, 'cargo'), '#!/bin/bash\nexit 127\n');
  chmodSync(join(STUB_BIN, 'cargo'), 0o755);

  // HTTP server: serves files from FIXTURE_DIR by basename. 404 otherwise.
  // The script's curl is stubbed (it never reaches the network), so the
  // HTTP server is unused in practice — kept for parity with the spec.
  SERVER = createServer((req, res) => {
    const name = req.url.split('?')[0].split('/').pop();
    const p = join(FIXTURE_DIR, name);
    if (existsSync(p)) {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(readFileSync(p));
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((r) => SERVER.listen(0, '127.0.0.1', r));
  FIXTURE_URL = `http://127.0.0.1:${SERVER.address().port}`;
});

afterAll(async () => {
  if (SERVER) await new Promise((r) => SERVER.close(() => r()));
  if (FIXTURE_DIR) rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

function makeFixture(version, triple) {
  const tarball = `domi-server-${version}-${triple}.tar.gz`;
  // The real release's SHA256SUMS has the actual sha256. The stub
  // sha256sum always passes, so we just need a line whose basename
  // matches the tarball. Format: `<hex>  <filename>` (two spaces).
  const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';
  writeFileSync(join(FIXTURE_DIR, 'SHA256SUMS'), `${fakeHash}  ${tarball}\n`);
  writeFileSync(join(FIXTURE_DIR, tarball), 'fake-tarball-bytes');
}

async function runFetch(args, env = {}) {
  const scratchHome = mkdtempSync(join(tmpdir(), 'domi-fetch-home-'));
  const binDir = join(scratchHome, 'local', 'bin');
  mkdirSync(binDir, { recursive: true });
  // PATH design:
  //   - bash + coreutils (/usr/bin:/bin) must be resolvable so the script's
  //     `command -v cargo` and the spawned child processes work.
  //   - The stub dir is prepended so our stubs shadow the real curl/tar/etc.
  //   - We deliberately omit ~/.cargo/bin (and any user-installed cargo)
  //     so the fallback-cargo test exercises the "cargo not on PATH" branch.
  const baseEnv = {
    PATH: `${STUB_BIN}:/usr/bin:/bin`,
    HOME: scratchHome,
    DOMICILE_BIN_DIR: binDir,
    FIXTURE_ROOT: FIXTURE_DIR,
  };
  try {
    const { stdout, stderr } = await execFileP('bash', [SCRIPT, ...args], {
      env: { ...baseEnv, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return {
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: (err.stdout ?? '').toString(),
      stderr: (err.stderr ?? '').toString(),
    };
  } finally {
    rmSync(scratchHome, { recursive: true, force: true });
  }
}

// --- Tests -------------------------------------------------------------------

describe('domi-fetch.sh version', () => {
  it('prints pinned version + computed URL', async () => {
    const r = await runFetch(['version']);
    expect(r.code).toBe(0);
    const [version, url] = r.stdout.trim().split('\n');
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(url).toMatch(/^https:\/\/github\.com\/.*domi-server-/);
    expect(url).toContain(`v${version}`);
  });
});

describe('domi-fetch.sh install', () => {
  it('happy path: downloads, verifies, installs', async () => {
    // Resolve the host triple the same way the script does, so the fixture
    // basename matches what the script will look up.
    const { stdout } = await execFileP('bash', [SCRIPT, 'version']);
    const triple = stdout.trim().split('\n')[1].split('/').pop().replace(/^domi-server-[\d.]+-/, '').replace(/\.tar\.gz$/, '');
    makeFixture('0.1.0', triple);
    const r = await runFetch(['install'], { DOMI_SERVER_VERSION: '0.1.0' });
    expect(r.code, `stderr=${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/installed domi-server v0\.1\.0/);
  });

  it('no-op when binary present at correct version', async () => {
    const scratchHome = mkdtempSync(join(tmpdir(), 'domi-fetch-pre-'));
    const binDir = join(scratchHome, 'local', 'bin');
    mkdirSync(binDir, { recursive: true });
    const fakeBin = join(binDir, 'domi-server');
    writeFileSync(fakeBin, '#!/bin/bash\necho "domi-server 0.1.0"\n');
    chmodSync(fakeBin, 0o755);
    const r = await runFetch(['install'], {
      DOMI_SERVER_VERSION: '0.1.0',
      HOME: scratchHome,
      DOMICILE_BIN_DIR: binDir,
    });
    rmSync(scratchHome, { recursive: true, force: true });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('already installed');
  });

  it('honors DOMICILE_SKIP_AUTO_INSTALL=1', async () => {
    const r = await runFetch(['install'], {
      DOMI_SERVER_VERSION: '0.1.0',
      DOMICILE_SKIP_AUTO_INSTALL: '1',
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('DOMICILE_SKIP_AUTO_INSTALL');
  });

  it('honors DOMICILE_BIN_DIR override', async () => {
    const { stdout } = await execFileP('bash', [SCRIPT, 'version']);
    const triple = stdout.trim().split('\n')[1].split('/').pop().replace(/^domi-server-[\d.]+-/, '').replace(/\.tar\.gz$/, '');
    makeFixture('0.1.0', triple);
    const scratchHome = mkdtempSync(join(tmpdir(), 'domi-fetch-override-'));
    const customBin = join(scratchHome, 'custom-bin');
    mkdirSync(customBin, { recursive: true });
    const r = await runFetch(['install'], {
      DOMI_SERVER_VERSION: '0.1.0',
      HOME: scratchHome,
      DOMICILE_BIN_DIR: customBin,
    });
    expect(r.code, `stderr=${r.stderr}`).toBe(0);
    expect(existsSync(join(customBin, 'domi-server'))).toBe(true);
    rmSync(scratchHome, { recursive: true, force: true });
  });

  it('warns but does not downgrade when on-disk version is newer', async () => {
    const scratchHome = mkdtempSync(join(tmpdir(), 'domi-fetch-newer-'));
    const binDir = join(scratchHome, 'local', 'bin');
    mkdirSync(binDir, { recursive: true });
    const fakeBin = join(binDir, 'domi-server');
    writeFileSync(fakeBin, '#!/bin/bash\necho "domi-server 9.9.9"\n');
    chmodSync(fakeBin, 0o755);
    const r = await runFetch(['install'], {
      DOMI_SERVER_VERSION: '0.1.0',
      HOME: scratchHome,
      DOMICILE_BIN_DIR: binDir,
    });
    rmSync(scratchHome, { recursive: true, force: true });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/newer than pin.*Skipping/);
  });
});

describe('domi-fetch.sh fallback-cargo', () => {
  it('exits 1 with hint when cargo not on PATH', async () => {
    // Override the test harness's PATH to omit the stub bin — otherwise the
    // stub `cargo` (which exits 127) is treated as a real cargo installation.
    const scratchHome = mkdtempSync(join(tmpdir(), 'domi-fetch-fb-'));
    try {
      let code, stderr;
      try {
        const r = await execFileP('bash', [SCRIPT, 'fallback-cargo'], {
          env: {
            PATH: '/usr/bin:/bin',
            HOME: scratchHome,
            DOMICILE_BIN_DIR: join(scratchHome, 'bin'),
            FIXTURE_ROOT: FIXTURE_DIR,
          },
        });
        code = 0;
        stderr = r.stderr;
      } catch (err) {
        code = typeof err.code === 'number' ? err.code : 1;
        stderr = (err.stderr ?? '').toString();
      }
      expect(code).toBe(1);
      expect(stderr).toContain('cargo not on PATH');
    } finally {
      rmSync(scratchHome, { recursive: true, force: true });
    }
  });
});