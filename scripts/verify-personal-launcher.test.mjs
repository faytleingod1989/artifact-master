import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, copyFile, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const name = 'ArtifactMaster-0.1.0-fullpage-candidate-20261110-r3.exe'
test('launcher dry-run refuses public/old packages and resolves only the exact personal package', { skip: process.platform !== 'win32' }, async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'artifact-launcher-'))
  try {
    await copyFile(path.join(root, '启动圣遗物管理大师.vbs'), path.join(fixtureRoot, 'launcher.vbs'))
    await copyFile(path.join(root, '启动圣遗物管理大师.cmd'), path.join(fixtureRoot, 'launcher.cmd'))
    const personal = path.join(fixtureRoot, 'apps/web/release-fullpage-candidate-r3')
    const publicFolder = path.join(fixtureRoot, 'apps/web/release/win-unpacked')
    await mkdir(personal, { recursive: true }); await mkdir(publicFolder, { recursive: true })
    // Non-executable fixtures: dry-run must never try to run any of these.
    await writeFile(path.join(publicFolder, 'public.exe'), 'not executable')
    await writeFile(path.join(personal, 'ArtifactMaster-0.1.0-avatars-20261001-local.exe'), 'not executable')
    const run = () => spawnSync('cscript.exe', ['//nologo', path.join(fixtureRoot, 'launcher.vbs'), '--dry-run'], { encoding: 'utf8', timeout: 5000, windowsHide: true })
    const missing = run()
    assert.equal(missing.status, 1)
    assert.ok(missing.stdout.includes(path.join(personal, name)))
    assert.match(missing.stdout, /MISSING/)
    const runCmd = () => spawnSync('cmd.exe', ['/d', '/c', path.join(fixtureRoot, 'launcher.cmd'), '--dry-run'], { encoding: 'utf8', timeout: 5000, windowsHide: true })
    const missingCmd = runCmd()
    assert.equal(missingCmd.status, 1)
    assert.ok(missingCmd.stdout.includes(path.join(personal, name)))
    assert.match(missingCmd.stdout, /MISSING/)
    await writeFile(path.join(personal, name), 'not executable')
    const found = run()
    assert.equal(found.status, 0)
    assert.ok(found.stdout.includes(path.join(personal, name)))
    assert.match(found.stdout, /FOUND: path verified only; app was not started/)
    const foundCmd = runCmd()
    assert.equal(foundCmd.status, 0)
    assert.ok(foundCmd.stdout.includes(path.join(personal, name)))
    assert.match(foundCmd.stdout, /FOUND: path verified only; app was not started/)
  } finally {
    // Only remove the explicit mkdtemp fixture, never a workspace/profile path.
    assert.ok(path.resolve(fixtureRoot).startsWith(path.resolve(os.tmpdir()) + path.sep))
    assert.ok(path.basename(fixtureRoot).startsWith('artifact-launcher-'))
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})
