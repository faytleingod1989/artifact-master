import { CHARACTER_PROFILES } from '../characters/profiles'
export { CHARACTER_PROFILES, getCharacterProfile, getBuildProfile } from '../characters/profiles'
export const CHARACTERS: readonly (readonly [string, string, string])[] = CHARACTER_PROFILES.map(p => [p.name, p.role, '参考规则'] as const)
