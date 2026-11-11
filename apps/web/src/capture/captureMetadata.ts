import { GAME_DATA } from '../artifacts/gameData'
export function parseEquippedCharacter(text: string): number | undefined {
  const compact = text.replace(/\s/g, '')
  const match = compact.match(/^([^\d]{1,24})已装备$/u)
  if (!match) return undefined
  const choices = Object.entries(GAME_DATA.characters).filter(([, value]) => value.name === match[1])
  return choices.length === 1 ? Number(choices[0][0]) : undefined
}
export async function prepareEquippedFooter(image: Blob): Promise<Blob | null> {
  const bitmap = await createImageBitmap(image)
  try {
    if (bitmap.width / bitmap.height < 1.3) return null
    const x = Math.floor(bitmap.width * .70), y = Math.floor(bitmap.height * .78)
    const width = bitmap.width - x, height = Math.floor(bitmap.height * .12)
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d'); if (!context) return null
    context.drawImage(bitmap, x, y, width, height, 0, 0, width, height)
    return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  } finally { bitmap.close() }
}
