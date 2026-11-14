import { CharacterPortrait } from '../components/CharacterPortrait'
import { getLegacyArtifactAssetStats } from '../artifacts/migrateArtifactData'

function formatAssetSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function AssetsPage({ characters, assets, disabled, onImport, onCleanupLegacy }: { characters: readonly (readonly string[])[]; assets: Record<string, string>; disabled: boolean; onImport: (key: string, file: File) => void; onCleanupLegacy?: () => void }) {
  const legacyStats = getLegacyArtifactAssetStats(assets)
  return <section className="page-panel"><p className="page-note">内置头像来自游戏；自定义图片只保存在本机，不会上传或写入发布包。PNG、JPG 或 WebP，每张不超过 3 MB，全部头像总量不超过 32 MB。</p>{legacyStats.count > 0 && <div className="page-callout" role="status"><span>保留了 {legacyStats.count} 项旧版圣遗物自定义图片（约 {formatAssetSize(legacyStats.totalBytes)}），已改用原版图标且不会覆盖显示；确认原版图标正常后可手动清理。</span><button className="secondary-button" disabled={disabled} onClick={onCleanupLegacy}>清理旧版圣遗物图片</button></div>}<fieldset className="page-fieldset" disabled={disabled}><div className="asset-grid">{characters.map(([name]) => <label className="asset-row" key={name}><span className="asset-preview"><CharacterPortrait name={name} customSrc={assets[`character:${name}`]} label={name} /></span><strong>{name}</strong><span className="asset-upload">选择图片<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) onImport(`character:${name}`, file); event.target.value = '' }} /></span></label>)}</div></fieldset>{import.meta.env.MODE !== 'personal' && !import.meta.env.DEV ? <p className="page-note">此构建未包含游戏头像，可使用自行提供或获得授权的自定义头像。</p> : null}</section>
}
