import { expect, test } from 'vitest'
import { mergeRetainedCharacterAssets, migrateArtifactLibrary } from './migrateArtifactData'
import { findArtifactSetByName } from './catalog'

test('adds a stable key and preserves only character asset behavior', () => {
  const result = migrateArtifactLibrary({
    artifacts: [{ id: 42, name: '花', set: '逐影猎人', slot: '生之花', level: 0, score: 0, main: '生命值 717', subs: [], locked: false, hue: 'blue' }],
    assets: { 'artifact:42': 'data:image/png;base64,old', 'character:芙宁娜': 'data:image/png;base64,avatar' },
  })
  expect(result.artifacts[0].setKey).toBe('zhuying-lieren')
  expect(result.retainedAssets).toEqual({ 'character:芙宁娜': 'data:image/png;base64,avatar' })
  expect(result.migrationReport.ignoredArtifactOverrideIds).toEqual([42])
})

test('records an unresolved historical set without guessing', () => {
  const result = migrateArtifactLibrary({ artifacts: [{ id: 7, name: '未知', set: '旧套装', slot: '理之冠', level: 0, score: 0, main: '暴击率 4.7%', subs: [], locked: false, hue: 'blue' }], assets: {} })
  expect(result.artifacts[0].setKey).toBeUndefined()
  expect(result.migrationReport.unresolvedArtifactIds).toEqual([7])
})

test('strips a stale key when an imported set name is unknown', () => {
  const result = migrateArtifactLibrary({
    artifacts: [{ id: 10, name: '未知羽', set: '未知套装', setKey: 'shenlang-zhongqu', slot: '死之羽', level: 0, score: 0, main: '攻击力 311', subs: [], locked: false, hue: 'blue' }],
    assets: {},
  })
  expect(result.artifacts[0].setKey).toBeUndefined()
  expect(result.migrationReport.unresolvedArtifactIds).toEqual([10])
})

test('resolves a catalog name when a persisted key is missing', () => {
  const name = '翠绿之影'
  const result = migrateArtifactLibrary({
    artifacts: [{ id: 8, name: '新花', set: name, slot: '生之花', level: 0, score: 0, main: '生命值 717', subs: [], locked: false, hue: 'blue' }],
    assets: {},
  })
  expect(result.artifacts[0].setKey).toBe(findArtifactSetByName(name)?.key)
})

test('trusts the Chinese set name when it conflicts with a stale persisted key', () => {
  const result = migrateArtifactLibrary({
    artifacts: [{ id: 9, name: '新花', set: '翠绿之影', setKey: 'shenlang-zhongqu', slot: '生之花', level: 0, score: 0, main: '生命值 717', subs: [], locked: false, hue: 'blue' }],
    assets: {},
  })
  expect(result.artifacts[0].setKey).toBe(findArtifactSetByName('翠绿之影')?.key)
})

test('retains a character asset imported before deferred initial migration finishes', () => {
  const migrated = migrateArtifactLibrary({
    artifacts: [],
    assets: { 'character:legacy': 'data:image/png;base64,legacy' },
  })

  const assetsAfterDeferredLoad = mergeRetainedCharacterAssets({
    retainedAssets: migrated.retainedAssets,
    currentAssets: {
      'artifact:42': 'data:image/png;base64,legacy-artifact',
      'character:legacy': 'data:image/png;base64,replaced-before-load',
      'character:imported-before-load': 'data:image/png;base64,new-avatar',
    },
  })

  expect(assetsAfterDeferredLoad).toEqual({
    'character:legacy': 'data:image/png;base64,replaced-before-load',
    'character:imported-before-load': 'data:image/png;base64,new-avatar',
  })
})
