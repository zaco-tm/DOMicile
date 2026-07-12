# tools/agent-rules.md

> Renamed from `.diracrules` in the 2026-07-10 agent-friendly refactor.
> Phase 4 handoff flagged `.diracrules` as confusingly named; this
> move places it under `tools/` where agent-related config belongs.
> Content preserved verbatim.

# DOMicile — Dirac Rules

# File reading limits
# Most files in this project (especially Rust source under crates/) exceed
# 100 lines and 50 KB. The defaults below are intentionally generous so
# files are read in full rather than truncated.

max_lines: 3000          # per single read_file / get_file_skeleton call
max_file_bytes: 512000   # ~500 KB per single read
truncate_long_files: false  # never silently chop files; if a file exceeds the
                            # limit, surface a warning and continue

# Multiple-file / parallel reads are still encouraged to minimise round-trips,
# but each individual file may be up to the limits above.

# When you already have a file's contents in conversation context from an
# earlier read this session, do NOT re-read it — reference the prior read
# instead. This applies even if the file is within the limits above.
