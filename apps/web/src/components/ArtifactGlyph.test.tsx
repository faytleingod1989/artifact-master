import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { artifactSetNames } from '../assets/artifacts/manifest'
import placeholderMissing from '../assets/artifacts/placeholder-missing.svg'
import * as artworkResolver from '../artifacts/resolveArtwork'
import { ARTIFACT_SLOTS, type ArtifactRecord } from '../artifacts/types'
import { ArtifactGlyph } from './ArtifactGlyph'

const artifact: ArtifactRecord = { id: 1, name: 'test', set: artifactSetNames['heiyao-midian'], setKey: 'heiyao-midian', slot: ARTIFACT_SLOTS[3], level: 0, score: 0, main: 'test', subs: [], locked: false, hue: 'red' }
const otherArtifact: ArtifactRecord = { ...artifact, id: 2, set: artifactSetNames['shenlang-zhongqu'], setKey: 'shenlang-zhongqu', slot: ARTIFACT_SLOTS[0], hue: 'blue' }
const firstArtwork = { src: '/artwork/first.png', alt: 'first artwork', status: 'ready' as const, setKey: 'heiyao-midian' as const }
const secondArtwork = { src: '/artwork/second.png', alt: 'second artwork', status: 'ready' as const, setKey: 'shenlang-zhongqu' as const }

afterEach(() => vi.restoreAllMocks())

test('renders the resolved set-slot alt text', () => {
  render(<ArtifactGlyph artifact={artifact} />)
  expect(screen.getByRole('img', { name: '黑曜秘典·空之杯原版图标' })).toBeInTheDocument()
})

test('switches image load failures to the shared placeholder', () => {
  vi.spyOn(artworkResolver, 'getArtifactArtwork').mockReturnValue(firstArtwork)
  const { container } = render(<ArtifactGlyph artifact={artifact} />)
  const image = container.querySelector('img')
  expect(image).not.toBeNull()
  if (!image) throw new Error('Artifact glyph image was not rendered')
  expect(image).toHaveAttribute('src', firstArtwork.src)
  fireEvent.error(image)
  expect(image.closest('[data-artwork-status]')).toHaveAttribute('data-artwork-status', 'missing')
  expect(image).toHaveAttribute('src', placeholderMissing)
})

test('resets a failed image when the resolved artwork changes', () => {
  vi.spyOn(artworkResolver, 'getArtifactArtwork').mockImplementation((item) => item.setKey === artifact.setKey ? firstArtwork : secondArtwork)
  const { container, rerender } = render(<ArtifactGlyph artifact={artifact} />)
  const image = container.querySelector('img')
  expect(image).not.toBeNull()
  if (!image) throw new Error('Artifact glyph image was not rendered')

  fireEvent.error(image)
  rerender(<ArtifactGlyph artifact={otherArtifact} />)

  expect(image.closest('[data-artwork-status]')).toHaveAttribute('data-artwork-status', 'ready')
  expect(image).toHaveAttribute('src', secondArtwork.src)
})
