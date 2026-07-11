# Publish-readiness command sheet

Generated from the publish-readiness audit. Each block is one decision. Run them in order; each one is independent.

> **Note:** All URLs in this doc use `zaco-tm/DOMicile`. Update if you fork.

---

## 1. Flip `Cargo.lock` from gitignored to tracked

```bash
# Edit .gitignore: remove the line that says `Cargo.lock`
rtk edit /Users/zaco/Projects/Personal/DOMicile/.gitignore

# Stage and commit the lockfile alongside the metadata work
git -C /Users/zaco/Projects/Personal/DOMicile add Cargo.lock .gitignore
git -C /Users/zaco/Projects/Personal/DOMicile commit -m "chore: track Cargo.lock for reproducible builds (pre-publish)"
```

AGENTS.md currently says "Don't `git add Cargo.lock` unless the user asks." Flip that mental model: this command IS that ask.

---

## 2. Flip `domi-egui` `publish = false` → `publish = true`

```bash
# Edit crates/domi-egui/Cargo.toml: change `publish = false` to `publish = true`
rtk edit /Users/zaco/Projects/Personal/DOMicile/crates/domi-egui/Cargo.toml

# Verify the dry-run is clean
cargo publish --dry-run -p domi-egui --allow-dirty --no-verify

# Commit
git -C /Users/zaco/Projects/Personal/DOMicile add crates/domi-egui/Cargo.toml
git -C /Users/zaco/Projects/Personal/DOMicile commit -m "feat(domi-egui): enable crates.io publish"
```

The metadata I added (repository, homepage, documentation, keywords, categories) is already in place — flipping `publish = true` is the only remaining edit.

---

## 3. Resolve the `domi.css` dirty state

The file is modified on disk but uncommitted since v0.1.0. The wrappers (React, Astro) consume it. Three possible moves:

### 3a. Inspect and decide
```bash
git -C /Users/zaco/Projects/Personal/DOMicile diff components/domi.css
```
Review what's changed. If the diff aligns with the 15 primitives + the design tokens, **commit it**. If it adds something not in `tokens/tokens.json`, **either revert that piece or add it to the tokens first**, then commit.

### 3b. Document why it's safe
If the dirty state is intentional (e.g., design tweaks that haven't been re-codegen'd from tokens yet), add a one-paragraph note to `docs/STANDARDS.md` explaining why publishing wrappers that consume this CSS is still safe. Then commit the note.

### 3c. Revert
```bash
git -C /Users/zaco/Projects/Personal/DOMicile checkout components/domi.css
```
If you don't remember why it's dirty and don't have time to investigate, revert. The CSS goes back to whatever was in v0.1.0.

AGENTS.md says "Don't touch unless the user explicitly asks." This whole block IS that ask — choose 3a, 3b, or 3c and execute.

---

## 4. Showcase site — DEFERRED

The showcase site is real work but **cannot ship before the v1.0 publish lands**. The constraint: the site UI must be generated *by* DOMicile v1.0 itself (the "skill builds its own site" bootstrapping loop). That means:

1. Publish v1.0 to crates.io + npm first.
2. Then use v1.0 of the skill, in a fresh project, to generate the site's UI through the working-doc → deliverable flow.
3. Then deploy the result.

Until step 1 happens, this section stays empty. When you get there, options:

### 4a. GitHub Pages (cheapest)
```bash
mkdir -p /Users/zaco/Projects/Personal/DOMicile/.github/workflows
# Add a deploy-pages.yml workflow that builds the generated site and pushes to gh-pages branch
# (See: https://docs.github.com/en/pages)
```

### 4b. Cloudflare Pages (faster CDN, custom domain)
```bash
# Add a wrangler.toml or pages.toml at the repo root
# Wire a Cloudflare API token in repo secrets as CLOUDFLARE_API_TOKEN
# Then a deploy workflow: .github/workflows/deploy.yml
```

---

## 5. GH About box + topics

Once the repo is created at `zaco-tm/DOMicile`:

```bash
gh repo edit zaco-tm/DOMicile \
  --description "Design system + AI-agent skill for building and reviewing UI work in shared HTML documents." \
  --homepage "https://github.com/zaco-tm/DOMicile#readme" \
  --add-topic design-system \
  --add-topic ui-components \
  --add-topic ai-agent \
  --add-topic working-document \
  --add-topic feedback-loop \
  --add-topic html
```

The description is derived from the README lede. The topics are derived from the actual functionality. Adjust to taste.

---

## Order of execution

Recommended sequence for v1.0 publish readiness:

1. **#3 (domi.css)** — internal cleanup; do first so the wrappers publish against a clean CSS.
2. **#1 (Cargo.lock)** — track the lockfile; needed for reproducible builds.
3. **#2 (domi-egui publish flip)** — one-character change.
4. **#5 (GH About)** — once the repo exists.
5. **#4 (showcase site)** — optional; can ship v1.0 without it.

Then run the publish commands:

```bash
# Crates.io (domi-server first, then domi-egui after flip)
cargo login
cargo publish -p domi-server
cargo publish -p domi-egui

# npm (each workspace package)
npm login
cd packages/react && npm run build && npm publish --access public && cd -
cd packages/astro && npm publish --access public && cd -
```

---

## Verification after publish

```bash
# Confirm crates.io pages have metadata
cargo search domi-server
cargo search domi-egui

# Confirm npm pages have metadata
npm view @domi/react
npm view @domi/astro

# Smoke-test the published versions
mkdir /tmp/domi-smoke && cd /tmp/domi-smoke
npm init -y
npm install @domi/react
# (write a one-liner that imports DomButton and renders it)
```

If any of those fail or look incomplete, the most likely cause is the URLs not yet matching the real fork.