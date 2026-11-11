# Task 6 — Final integration and release verification

Date: 2026-08-15 (Asia/Shanghai)

## Scope and clean build

- Working directory: `E:\\AI Project\\YS\\apps\\web`
- Existing `dist` was rebuilt with the ordinary `npm run build` command (Vite's default empty-output behavior cleaned it).
- The exact pre-existing release target was validated as `E:\\AI Project\\YS\\apps\\web\\release` and moved, without deletion, to `E:\\AI Project\\YS\\apps\\web\\release.stale-task6-20260815-212539`.
- Fresh build result: `npm run build` exited 0 (`tsc -b && vite build`, Vite 8.1.5). The production bundle contains only the shared placeholder for artifact artwork; private originals are excluded.

## Verification commands

| Command | Result |
|---|---|
| `npm run build` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0; oxlint reported no diagnostics |
| `npm test` | PASS, exit 0: 7 files passed, 1 production-mode file skipped; 31 passed / 1 skipped. |
| `npm test -- --run src/assets/artifacts/manifest.production.test.ts --mode production` | PASS, exit 0: production manifest regression confirms all 220 entries use the shared missing placeholder. |
| `node scripts/verify-artifact-release.test.mjs` | PASS: `dynamic artifact release gate tests passed` |
| `npm run verify:artifact-release` | PASS, exit 0: `220/220 原版素材与来源签收通过`. |
| `npm run desktop:build` (bounded packaging attempt) | Build and release gate passed in the corrected order; electron-builder entered Windows packaging but was stopped after the bounded wait due to no further output. No packaging success is claimed. |

## Source and output exclusion checks

- Public source scan (`apps/web/src`, excluding the private `src/assets/artifacts/originals` tree) and `apps/web/public` found no remote original-art URLs.
- The fresh `dist` scan and release gate found no private original bytes, literal private path, or remote original URL. The glob now lives behind a dev/test-only dynamic import that is eliminated from production output.
- Private original source tree contains 220 image files (9,097,242 bytes) under `apps/web/src/assets/artifacts/originals`; it is present in this no-Git workspace for local verification. `git ls-files -- apps/web/src/assets/artifacts/originals/*` could not be used because the workspace is not a Git repository (`fatal: not a git repository`).

## Windows portable package

- Root cause of the earlier long-running packaging attempt: electron-builder was not configured to reuse the locally installed Electron distribution, so it tried to download `electron-v43.2.0-win32-x64.zip` again. The observed network transfer advanced from 1% to 3% over several minutes, with an ETA of roughly 50–75 minutes.
- Resolution: `build.electronDist` now points to `node_modules/electron/dist`, which is the verified local Electron 43.2.0 distribution.
- Final command: `npm run desktop:build` — PASS (build → release gate → electron-builder portable packaging).
- Artifact: `apps/web/release/圣遗物管理大师 0.1.0.exe`
- Size: 96,853,552 bytes
- SHA-256: `5684B3DD240C8E432B8DB56F8E37C498DFBE3A960602A81B668FC9AE522C4479`

## Status

The packaging boundary, test suite, lint, production build, 220/220 release gate, and fresh Windows portable package are all complete and verified.
