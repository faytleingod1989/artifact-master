import { useState } from 'react'
import { getGameCharacterPortrait } from '../assets/characters/portraits'
import './CharacterPortrait.css'
export function CharacterPortrait({ name, customSrc, label = `${name} 的头像` }: { name: string; customSrc?: string; label?: string }) {
  const [failedSources, setFailedSources] = useState<string[]>([])
  const original = getGameCharacterPortrait(name)
  const source = [customSrc, original].find(src => src && !failedSources.includes(src))
  return source
    ? <img className="character-portrait-image" src={source} alt={label} onError={() => setFailedSources(current => [...current, source])} />
    : <span className="character-portrait-missing" role="img" aria-label={label} title={`${name}：原版头像未提供或加载失败`}>?</span>
}
