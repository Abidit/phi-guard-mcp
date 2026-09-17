# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-09-17

Packaging, documentation, and error-behaviour release. Tool inputs and
successful tool outputs are unchanged from 0.1.4.

### Added

- `--help` and `--version` flags on the binary, so a stdio server started by
  hand no longer looks hung.
- `engines: { node: ">=20.10.0" }`. The entrypoint uses JSON import
  attributes, which Node added in 20.10; the previous "Node 18+" claim was
  wrong.
- `npm run verify` — one command for typecheck, build, and the fixture suite.
- `prepare` script, so `npm ci` leaves a runnable `dist/` with no separate
  build step.
- `prepublishOnly` gate running `npm run verify`, so a stale or empty `dist/`
  cannot be published.
- GitHub Actions CI running `npm run verify` on Node 22 and 24.
- Test coverage for the README's worked-example fixture
  (`test/fixtures/leaky-example.ts`) and for `scan_code` error behaviour.
- README: npm/`npx` install path, Claude Code / Claude Desktop / Cursor
  configuration, complete tables of supported languages and sink categories,
  a dedicated section on the same-line rule, troubleshooting, and an explicit
  security boundary.

### Changed

- `scan_code` now fails with a named, actionable error instead of a raw errno
  when a path is missing, is a file, or cannot be read. A scan that cannot
  read every file aborts rather than returning a shorter list, because a
  partial result reads as a clean result.
- `CodeFinding.severity` narrowed from `"high" | "medium"` to `"high"`;
  `"medium"` was never emitted.
- PHI categories are now a `PhiType` union rather than `string`.
- `.mcp.json` no longer hardcodes an absolute path from the author's machine.
- Evaluation language throughout is now "detected all 7 representative leak
  fixtures and flagged none of 5 clean fixtures", never a detection rate or a
  false-positive rate.

### Fixed

- README said scanning `test/fixtures` returns 8 findings. It returns 9.
- README showed relative `file` paths in a `scan_code` example whose input was
  an absolute path.

## [0.1.4] — 2026-09-01

- `redact_suggest` withholds matched values and the original text by default;
  `includeMatchedValues: true` opts back in.
- `start`/`end` offsets on every detection.
