// Committed, audited identity contract. Keep private URLs and binary assets out of this file.
export const AUDITED_MIRROR_SET_BY_CATALOG_SET = Object.freeze({
  'shenlang-zhongqu': 'fodg', 'heiyao-midian': 'odcx', 'zhuying-lieren': 'mcht', 'xishi-zhige': 'sodp',
  'a-day-carved-from-rising-winds': 'dcrw', 'aubade-of-morningstar-and-moon': 'amam', 'night-of-the-skys-unveiling': 'ntsu', 'silken-moons-serenade': 'smsn',
  'celestial-gift': 'csgt', 'disenchantment-in-deep-shadow': 'dids', 'emblem-of-severed-fate': 'eosf', 'husk-of-opulent-dreams': 'hood',
  'blizzard-strayer': 'bzst', 'thundering-fury': 'tdfr', 'thundersoother': 'tdst', 'archaic-petra': 'acpt',
  'bloodstained-chivalry': 'bscv', 'heart-of-depth': 'hodp', 'wanderers-troupe': 'wdtp', 'ocean-hued-clam': 'ochc',
  lavawalker: 'lvwk', 'crimson-witch-of-flames': 'cwof', 'viridescent-venerer': 'vdvn', 'maiden-beloved': 'mdbv',
  'retracing-bolide': 'rcbl', 'deepwood-memories': 'dwmm', 'flower-of-paradise-lost': 'fopl', 'desert-pavilion-chronicle': 'dspc',
  'nymphs-dream': 'nmdr', 'vourukashas-glow': 'vkgw', 'golden-troupe': 'gdtp', 'nighttime-whispers-in-the-echoing-woods': 'nwiw',
  'scroll-of-the-hero-of-cinder-city': 'shcc', 'tenacity-of-the-millelith': 'totm', 'noblesse-oblige': 'nlob', 'echoes-of-an-offering': 'eoao',
  'pale-flame': 'plfm', 'gladiators-finale': 'gdfl', 'vermillion-hereafter': 'vmha', 'shimenawas-reminiscence': 'smrm',
  'gilded-dreams': 'gldr', 'fragment-of-harmonic-whimsy': 'fohw', 'unfinished-reverie': 'ufrv', 'long-nights-oath': 'lnso',
})
export const AUDITED_MIRROR_SLOT_BY_CATALOG_SLOT = Object.freeze({ flower: 'fwol', plume: 'pmod', sands: 'sdoe', goblet: 'gboe', circlet: 'ccol' })
export const AUDITED_MIRROR_REPOSITORY = 'gridhead/gi-loadouts'
export const AUDITED_MIRROR_COMMIT = 'e12211c914dbaf91f5e23b7986b3d9dea4e8e85d'
export function auditedMirrorUrl(setKey, slot) {
  const mirrorSet = AUDITED_MIRROR_SET_BY_CATALOG_SET[setKey]
  const mirrorSlot = AUDITED_MIRROR_SLOT_BY_CATALOG_SLOT[slot]
  if (!mirrorSet || !mirrorSlot) return undefined
  return `https://raw.githubusercontent.com/${AUDITED_MIRROR_REPOSITORY}/${AUDITED_MIRROR_COMMIT}/assets/imgs/arti/${mirrorSet}/${mirrorSlot}.webp`
}
