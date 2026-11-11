import type { CharacterProfile } from './profileTypes'

export const CHARACTER_ELEMENTS = ['火', '水', '风', '雷', '草', '冰', '岩'] as const
export type CharacterElement = typeof CHARACTER_ELEMENTS[number]
export type CharacterDirectoryFilter = { element: 'all' | CharacterElement; order: 'newest' | 'oldest'; search: string }
export function matchesElement(profile: CharacterProfile, element: CharacterDirectoryFilter['element']) {
  return element === 'all' || (profile.elements ?? [profile.element]).includes(element)
}
function versionNumber(version: string) {
  const [major = 0, minor = 0] = version.split('.').map(Number)
  return major * 100 + minor
}
export function selectCharacterProfiles(profiles: readonly CharacterProfile[], filter: CharacterDirectoryFilter) {
  const search = filter.search.trim().toLocaleLowerCase()
  return profiles.map((profile, index) => ({ profile, index }))
    .filter(({ profile: p }) => matchesElement(p, filter.element) && `${p.name} ${(p.elements ?? [p.element]).join(' ')} ${p.weapon} ${p.version} ${p.role}`.toLocaleLowerCase().includes(search))
    .sort((a, b) => b.profile.rarity - a.profile.rarity || (filter.order === 'newest' ? -1 : 1) * (versionNumber(a.profile.version) - versionNumber(b.profile.version) || (a.profile.releaseOrder ?? '').localeCompare(b.profile.releaseOrder ?? '')) || a.profile.name.localeCompare(b.profile.name, 'zh-CN'))
}
