import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { verifyCharacterPortraits } from './verify-character-portraits.mjs'

test('official wiki portraits keep wiki identity separate from unknown game IDs and enforce source/hash isolation', () => {
  const root = mkdtempSync(join(tmpdir(), 'wiki-portrait-gate-'))
  try {
    const artworkRoot = join(root, 'art'), output = join(root, 'out'); mkdirSync(artworkRoot); mkdirSync(output)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6HHUAAAAASUVORK5CYII=', 'base64')
    const row = { identityKind: 'hoyowiki', wikiEntryId: 11661, name: '薇斯纳', displayName: '薇斯纳', iconName: 'HoYoWiki_11661', url: 'https://act-webstatic.hoyoverse.com/event-static-hoyowiki-admin/2026/09/20/test.png', sha256: createHash('sha256').update(png).digest('hex'), bytes: png.length, width: 1, height: 1 }
    const registerPath = join(root, 'source.json'), config = { registerPath, artworkRoot, outputRoots: [output] }
    writeFileSync(join(artworkRoot, 'HoYoWiki_11661.png'), png); writeFileSync(registerPath, JSON.stringify({ entries: [row] }))
    assert.equal(verifyCharacterPortraits(config).checked, 1)
    for (const invalid of [{ ...row, url: 'https://untrusted.example/p.png' }, { ...row, wikiEntryId: 11702 }, { ...row, characterId: 11661 }]) {
      writeFileSync(registerPath, JSON.stringify({ entries: [invalid] })); assert.throws(() => verifyCharacterPortraits(config), /来源/)
    }
    writeFileSync(registerPath, JSON.stringify({ entries: [row] })); copyFileSync(join(artworkRoot, 'HoYoWiki_11661.png'), join(output, 'bundled.png'))
    assert.throws(() => verifyCharacterPortraits(config), /公开/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('game portraits need exact identity/hash and local bundle reachability, and cannot leak into public output', () => {
  const root = mkdtempSync(join(tmpdir(), 'character-portrait-gate-'))
  try {
    const artworkRoot = join(root, 'art'); const output = join(root, 'output'); mkdirSync(artworkRoot); mkdirSync(output)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6HHUAAAAASUVORK5CYII=', 'base64')
    const row = { characterId: 10000052, displayName: '雷电将军', name: '雷电将军', iconName: 'UI_AvatarIcon_Shougun', url: 'https://enka.network/ui/UI_AvatarIcon_Shougun.png', sha256: createHash('sha256').update(png).digest('hex'), bytes: png.length, width: 1, height: 1 }
    const registerPath = join(root, 'source.json'); writeFileSync(registerPath, JSON.stringify({ entries: [row] }))
    const config = { registerPath, artworkRoot, outputRoots: [output] }
    assert.throws(() => verifyCharacterPortraits(config), /缺少/)
    writeFileSync(join(artworkRoot, 'UI_AvatarIcon_Shougun.png'), png)
    assert.equal(verifyCharacterPortraits(config).checked, 1)
    copyFileSync(join(artworkRoot, 'UI_AvatarIcon_Shougun.png'), join(output, 'renamed.png'))
    assert.throws(() => verifyCharacterPortraits(config), /公开/)
    assert.throws(() => verifyCharacterPortraits({ ...config, local: true }), /不可达/)
    writeFileSync(join(output, 'bundle.js'), 'const portrait="./renamed.png";')
    assert.equal(verifyCharacterPortraits({ ...config, local: true }).checked, 1)
    writeFileSync(join(artworkRoot, 'UI_AvatarIcon_Shougun.png'), Buffer.from('tampered'))
    assert.throws(() => verifyCharacterPortraits(config), /哈希/)
    writeFileSync(registerPath, JSON.stringify({ entries: [{ ...row, iconName: '../untrusted' }] }))
    assert.throws(() => verifyCharacterPortraits(config), /来源/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
