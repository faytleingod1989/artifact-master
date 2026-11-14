import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadLibrary, saveLibrary } from './storage/libraryRepository'
import {
  decodeAvatarDataUrl,
  estimateDataUrlDecodedBytes,
  MAX_BACKUP_FILE_BYTES,
  MAX_CHARACTER_ASSETS_COUNT,
  MAX_CHARACTER_ASSETS_TOTAL_BYTES,
  MAX_SINGLE_ASSET_BYTES,
  parseLibraryBackup,
  type LibraryState,
} from './storage/libraryValidation'
import { applyImportDecisions, findDuplicateIds, recordToDraft, type ArtifactDraft, type ImportDecision } from './artifacts/artifactDraft'
import { ManualEntry } from './imports/ManualEntry'
import { ImportReview, type DraftReviewItem } from './imports/ImportReview'
import { UidShowcaseImport } from './imports/UidShowcaseImport'
import { createManualDraft } from './imports/manualDraft'
import { RealtimeCapturePanel } from './capture/RealtimeCapturePanel'
import { ScreenshotImport } from './imports/ScreenshotImport'
import { recommendBuild, type ScoringOptions } from './scoring'
import { Warehouse } from './warehouse/Warehouse'
import { createWarehouseSession } from './warehouse/warehouseSession'
import { PAGE_ITEMS, type PageId } from './pages/navigation'
import { PageNavigation } from './pages/PageNavigation'
import { AssetsPage } from './pages/AssetsPage'
import { TrashPage } from './pages/TrashPage'
import { CHARACTERS as characters } from './pages/characterProfiles'
import { CharactersPage } from './pages/CharactersPage'
import { RecommendationsPage } from './pages/RecommendationsPage'
import { QueuePage } from './pages/QueuePage'
import { CatalogPage } from './pages/CatalogPage'
import { createCatalogState } from './pages/catalogState'
import { DEFAULT_FILTERS, filterAndSort } from './warehouse/warehouseModel'
import { cleanupIgnoredArtifactAssets, getLegacyArtifactAssetStats, mergeRetainedCharacterAssets, migrateArtifactLibrary } from './artifacts/migrateArtifactData'
import { readStoredAssetMap } from './assetStorage'
import type { ArtifactRecord } from './artifacts/types'
import {
  Download, Plus, ScanLine, Sparkles, Upload, MonitorUp,
} from 'lucide-react'
import archiveBackground from './assets/archive/archive-observatory-bg-opt.jpg'
import './App.css'
import './mobile.css'
import './realtime.css'
import './warehouse/warehouse.css'
import './imports/imports.css'
import './queue.css'
import './pages/page.css'

type Artifact = ArtifactRecord

function App() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const artifactsRef = useRef<Artifact[]>(artifacts)
  artifactsRef.current = artifacts
  const [, setSelectedId] = useState(1)
  const [warehouseScope, setWarehouseScope] = useState<'all' | 'character'>('all')
  const [scoringOptions, setScoringOptions] = useState<ScoringOptions>({ setMode: 'recommended' })
  const [warehouseSession, setWarehouseSession] = useState(createWarehouseSession)
  const [pendingViewId, setPendingViewId] = useState<number | undefined>()
  const [catalogState, setCatalogState] = useState(createCatalogState)
  const [manualDraft, setManualDraft] = useState<ArtifactDraft | undefined>()
  const [manualTargetId, setManualTargetId] = useState<number | undefined>()
  const [reviewItems, setReviewItems] = useState<DraftReviewItem[] | null>(null)
  const continueEntryRef = useRef(false)
  const reviewSavedRef = useRef(false)
  const lastSavedRef = useRef('')
  const pendingSignatureRef = useRef('')
  const saveRequestRef = useRef(0)
  const mountedRef = useRef(false)
  const storageBusyRef = useRef(false)
  const mutationEpochRef = useRef(0)
  const pendingMigrationReportRef = useRef<ReturnType<typeof migrateArtifactLibrary>['migrationReport'] | undefined>(undefined)
  const [showModal, setShowModal] = useState(false)
  const [showOcr, setShowOcr] = useState(false)
  const [showRealtime, setShowRealtime] = useState(false)
  const [showUidImport, setShowUidImport] = useState(false)
  const [multipleScreenshots, setMultipleScreenshots] = useState(false)
  const [activePage, setActivePage] = useState<PageId>('warehouse')
  const pageHeadingRef = useRef<HTMLHeadingElement>(null)
  const [activeCharacter, setActiveCharacter] = useState(0)
  const [assetMap, setAssetMap] = useState<Record<string, string>>(readStoredAssetMap)
  const [trash, setTrash] = useState<Artifact[]>([])
  const [queueIds, setQueueIds] = useState<number[]>([])
  const [storageReady, setStorageReady] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [reloadStorage, setReloadStorage] = useState(0)
  const [storageBusy, setStorageBusy] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'failed'>('saved')
  const [savedSignature, setSavedSignature] = useState('')
  const [assetWarning, setAssetWarning] = useState('')
  const [queueFeedback, setQueueFeedback] = useState('')
  const snapshot = useMemo(() => ({ artifacts, trash, queueIds, assets: assetMap }), [artifacts, trash, queueIds, assetMap])
  const artifactsJson = useMemo(() => JSON.stringify(artifacts), [artifacts])
  const trashJson = useMemo(() => JSON.stringify(trash), [trash])
  const queueJson = useMemo(() => JSON.stringify(queueIds), [queueIds])
  const assetsJson = useMemo(() => JSON.stringify(assetMap), [assetMap])
  const signature = useMemo(() => `{"artifacts":${artifactsJson},"trash":${trashJson},"queueIds":${queueJson},"assets":${assetsJson}}`, [artifactsJson, trashJson, queueJson, assetsJson])
  const snapshotRef = useRef<LibraryState>(snapshot)
  const signatureRef = useRef(signature)
  snapshotRef.current = snapshot
  signatureRef.current = signature

  useEffect(() => {
    const saveRequests = saveRequestRef
    const mutationEpoch = mutationEpochRef
    mountedRef.current = true
    return () => { mountedRef.current = false; saveRequests.current++; mutationEpoch.current++ }
  }, [])

  const persistCharacterAssets = useCallback((assets: Record<string, string>) => {
    const characterAssets = Object.fromEntries(Object.entries(assets).filter(([key]) => key.startsWith('character:')))
    localStorage.setItem('artifact-master-assets-v2', JSON.stringify(characterAssets))
  }, [])

  const mirrorCharacterAssets = useCallback((assets: Record<string, string>, report?: unknown, preserveReport = false) => {
    try {
      persistCharacterAssets(assets)
      if (report !== undefined && (!preserveReport || localStorage.getItem('artifact-master-artwork-migration-v1') === null)) localStorage.setItem('artifact-master-artwork-migration-v1', JSON.stringify(report))
      setAssetWarning('')
    } catch {
      setAssetWarning('头像兼容缓存写入失败，无法同步。请以仓库保存状态为准，必要时导出备份。')
    }
  }, [persistCharacterAssets])

  useEffect(() => {
    let cancelled = false
    setStorageReady(false)
    loadLibrary().then(({ artifacts: savedArtifacts, trash: savedTrash, queueIds: savedQueue, assets: savedAssets }) => {
      if (cancelled) return
      const startupAssets = savedAssets ?? readStoredAssetMap()
      const migration = migrateArtifactLibrary({ artifacts: [...savedArtifacts, ...savedTrash], assets: startupAssets })
      const mergedAssets = mergeRetainedCharacterAssets({ retainedAssets: migration.retainedAssets, currentAssets: startupAssets })
      pendingMigrationReportRef.current = migration.migrationReport
      setArtifacts(migration.artifacts.slice(0, savedArtifacts.length))
      setSelectedId(migration.artifacts[0]?.id ?? 0)
      setAssetMap(mergedAssets)
      setTrash(migration.artifacts.slice(savedArtifacts.length))
      setQueueIds(savedQueue)
      setStorageError('')
      setStorageReady(true)
    }).catch((error: unknown) => { if (!cancelled) setStorageError(`读取本地仓库失败，未覆盖任何数据。请重试或先保留备份。${error instanceof Error ? error.message : ''}`) })
    return () => { cancelled = true }
  }, [reloadStorage])

  const saveCurrentSnapshot = useCallback(async () => {
    if (!storageReady || storageBusyRef.current) return
    const next = snapshotRef.current
    const currentSignature = signatureRef.current
    if (pendingSignatureRef.current === currentSignature) return
    const request = ++saveRequestRef.current
    // A previous committed signature is no longer sufficient once another snapshot
    // is queued: reverting an edit must enqueue the reverted state behind it.
    lastSavedRef.current = ''
    pendingSignatureRef.current = currentSignature
    setSaveStatus('saving')
    try {
      await saveLibrary(next)
      if (!mountedRef.current || request !== saveRequestRef.current || signatureRef.current !== currentSignature) return
      lastSavedRef.current = currentSignature
      setSavedSignature(currentSignature)
      pendingSignatureRef.current = ''
      setStorageError('')
      setSaveStatus('saved')
      const migrationReport = pendingMigrationReportRef.current
      pendingMigrationReportRef.current = undefined
      if (next.assets) mirrorCharacterAssets(next.assets, migrationReport, migrationReport !== undefined)
    } catch {
      if (!mountedRef.current || request !== saveRequestRef.current || signatureRef.current !== currentSignature) return
      pendingSignatureRef.current = ''
      setStorageError('本地保存失败，修改尚未保存。请先保留备份再重试。')
      setSaveStatus('failed')
    }
  }, [storageReady, mirrorCharacterAssets])

  useEffect(() => {
    if (!storageReady || storageBusy || lastSavedRef.current === signature || pendingSignatureRef.current === signature) return
    void saveCurrentSnapshot()
  }, [signature, storageReady, storageBusy, saveCurrentSnapshot])

  const activeCharacterName = characters[activeCharacter][0]
  const recommendation = useMemo(() => recommendBuild(artifacts, activeCharacterName, scoringOptions), [activeCharacterName, artifacts, scoringOptions])
  const warehouseRecords = useMemo(() => warehouseScope === 'character' ? artifacts.filter(item => recommendation.picks.some(pick => pick.id === item.id)) : artifacts, [warehouseScope, artifacts, recommendation])
  const visibleWarehouseRecords = useMemo(() => filterAndSort(warehouseRecords, warehouseSession.filters, warehouseSession.sort), [warehouseRecords, warehouseSession.filters, warehouseSession.sort])
  const hiddenViewTarget = activePage === 'warehouse' && pendingViewId === warehouseSession.detailId && artifacts.some(item => item.id === pendingViewId) && !visibleWarehouseRecords.some(item => item.id === pendingViewId)
  const queuedArtifacts = queueIds.map((id) => artifacts.find((item) => item.id === id)).filter((item): item is Artifact => Boolean(item))

  function toggleLock(id: number) {
    if (!storageReady || storageBusyRef.current) return
    setArtifacts((items) => items.map((item) => item.id === id ? { ...item, locked: !item.locked } : item))
  }

  function addToQueue(incoming: number[]) {
    if (!storageReady || storageBusyRef.current) return
    const eligible = incoming.filter(id => artifacts.some(item => item.id === id && item.level < 20))
    const next = [...queueIds]
    let duplicates = 0; let overflow = 0; let added = 0
    for (const id of eligible) {
      if (next.includes(id)) { duplicates++; continue }
      if (next.length >= 5) { overflow++; continue }
      next.push(id); added++
    }
    setQueueIds(next)
    setQueueFeedback([added ? `已加入 ${added} 件。` : '', duplicates ? `${duplicates} 件已在队列中，无需重复加入。` : '', overflow ? `队列已满（5/5），${overflow} 件未加入，请先移出一件。` : '', !eligible.length ? '所选藏品没有可加入的未满级项。' : ''].join(''))
  }

  function removeFromQueue(id?: number) {
    if (!storageReady || storageBusyRef.current) return
    setQueueIds(current => id === undefined ? [] : current.filter(value => value !== id))
    setQueueFeedback(id === undefined ? '队列已清空，库存未改变。' : '已移出队列，库存未改变。')
  }

  const navigationBlocked = showModal || showOcr || showRealtime || showUidImport || reviewItems !== null
  const page = PAGE_ITEMS.find(item => item.id === activePage)!
  useEffect(() => { window.scrollTo(0, 0); pageHeadingRef.current?.focus({ preventScroll: true }) }, [activePage])
  function navigateTo(page: PageId) {
    if (navigationBlocked) return
    setActivePage(page)
  }
  function viewRecord(id: number) {
    if (!artifacts.some(item => item.id === id) || navigationBlocked) return
    setPendingViewId(id)
    setWarehouseSession(current => ({ ...current, detailId: id, comparing: false }))
    navigateTo('warehouse')
  }
  function revealViewedRecord() {
    setWarehouseScope('all')
    setWarehouseSession(current => ({ ...current, filters: { ...DEFAULT_FILTERS }, detailId: pendingViewId, comparing: false }))
    setPendingViewId(undefined)
  }

  function reviewManual(draft: ArtifactDraft, continueEntry: boolean) {
    continueEntryRef.current = continueEntry; reviewSavedRef.current = false
    setManualDraft(draft); setShowModal(false); setReviewItems([{ draft }])
  }
  async function confirmImport(decisions: ImportDecision[]) {
    if (!storageReady || storageBusyRef.current) throw new Error('本地仓库正在加载或保存，请稍后重试。')
    const result = applyImportDecisions(artifacts, decisions, trash.map(item => item.id))
    if (result.added || result.updated) {
      const next = { artifacts: result.artifacts, trash, queueIds, assets: assetMap }
      storageBusyRef.current = true; setStorageBusy(true)
      mutationEpochRef.current++
      ++saveRequestRef.current; pendingSignatureRef.current = ''
      try {
        await saveLibrary(next)
        if (!mountedRef.current) return
        lastSavedRef.current = JSON.stringify(next)
        setSavedSignature(lastSavedRef.current)
        setArtifacts(result.artifacts)
        setStorageError(''); setSaveStatus('saved')
      } finally {
        storageBusyRef.current = false
        if (mountedRef.current) setStorageBusy(false)
      }
    }
    reviewSavedRef.current = true
  }
  function handleAutoCommit(draft: ArtifactDraft, batchId: string): { committed: boolean; duplicateIds?: number[] } {
    if (!storageReady || storageBusyRef.current) return { committed: false }
    const existingBeforeBatch = artifactsRef.current.filter(item => item.source?.batchId !== batchId)
    const duplicateIds = findDuplicateIds(draft, existingBeforeBatch)
    if (duplicateIds.length > 0) return { committed: false, duplicateIds }
    const result = applyImportDecisions(artifactsRef.current, [{ draft: { ...draft, batchId }, action: 'add' }], snapshotRef.current.trash.map(item => item.id))
    if (!result.added) return { committed: false }
    artifactsRef.current = result.artifacts
    setArtifacts(result.artifacts)
    return { committed: true }
  }
  function handleRollbackBatch(batchId: string): number {
    if (!storageReady || storageBusyRef.current || !batchId) return 0
    const removedIds = new Set(artifactsRef.current.filter(item => item.source?.batchId === batchId).map(item => item.id))
    if (!removedIds.size) return 0
    const nextArtifacts = artifactsRef.current.filter(item => !removedIds.has(item.id))
    artifactsRef.current = nextArtifacts
    setArtifacts(nextArtifacts)
    setQueueIds(current => current.filter(id => !removedIds.has(id)))
    setQueueFeedback(`已撤销本次自动入库的 ${removedIds.size} 件圣遗物。`)
    return removedIds.size
  }
  function closeImportReview() {
    setReviewItems(null); setManualTargetId(undefined)
    if (reviewSavedRef.current && continueEntryRef.current) { setManualDraft(createManualDraft(manualDraft?.setKey, manualDraft?.slot)); setShowModal(true) }
    continueEntryRef.current = false; reviewSavedRef.current = false
  }

  function importAsset(key: string, file: File) {
    if (!storageReady || storageBusyRef.current) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_SINGLE_ASSET_BYTES) {
      window.alert('图片需为 PNG、JPG 或 WebP，且单张不超过 3 MB。')
      return
    }
    const existingCharacterEntries = Object.entries(assetMap).filter(([assetKey]) => assetKey.startsWith('character:') && assetKey !== key)
    if (existingCharacterEntries.length >= MAX_CHARACTER_ASSETS_COUNT) {
      window.alert(`自定义角色头像最多 ${MAX_CHARACTER_ASSETS_COUNT} 张，请先替换已有头像。`)
      return
    }
    const otherBytes = existingCharacterEntries.reduce((sum, [, value]) => sum + estimateDataUrlDecodedBytes(value), 0)
    if (otherBytes + file.size > MAX_CHARACTER_ASSETS_TOTAL_BYTES) {
      window.alert('全部角色自定义头像总量不能超过 32 MB，请先替换或减少大图后重试。')
      return
    }
    const reader = new FileReader()
    const epoch = mutationEpochRef.current
    reader.onload = () => {
      if (!mountedRef.current || storageBusyRef.current || epoch !== mutationEpochRef.current) return
      const value = String(reader.result)
      void decodeAvatarDataUrl(value).then(() => {
        if (!mountedRef.current || storageBusyRef.current || epoch !== mutationEpochRef.current) return
        setAssetMap(current => ({ ...current, [key]: value }))
      }, (error: unknown) => {
        if (!mountedRef.current || epoch !== mutationEpochRef.current) return
        window.alert(`头像导入失败：${error instanceof Error ? error.message : '图片无法解码。'}`)
      })
    }
    reader.readAsDataURL(file)
  }

  function cleanupLegacyArtifactAssets() {
    if (!storageReady || storageBusyRef.current) return
    const stats = getLegacyArtifactAssetStats(assetMap)
    if (!stats.count) return
    const sizeText = stats.totalBytes >= 1024 * 1024 ? `${(stats.totalBytes / (1024 * 1024)).toFixed(2)} MB` : `${Math.max(1, Math.round(stats.totalBytes / 1024))} KB`
    if (!window.confirm(`确定永久清理 ${stats.count} 项旧版圣遗物自定义图片（约 ${sizeText}）吗？当前原版图标显示不受影响，清理后无法恢复。`)) return
    setAssetMap(current => cleanupIgnoredArtifactAssets(current))
  }

  function moveToTrash(ids: number[]) {
    if (!storageReady || storageBusyRef.current) return
    const visibleIds = new Set(visibleWarehouseRecords.map(item => item.id))
    const chosen = artifacts.filter(item => ids.includes(item.id) && !item.locked && visibleIds.has(item.id))
    if (!chosen.length) return
    const chosenIds = new Set(chosen.map(item => item.id))
    setArtifacts(items => items.filter(item => !chosenIds.has(item.id)))
    setTrash(items => [...chosen.map(item => ({ ...item, deletedAt: Date.now() })), ...items])
    setQueueIds(current => current.filter(id => !chosenIds.has(id)))
    setWarehouseSession(current => ({ ...current, selectedIds: current.selectedIds.filter(id => !chosenIds.has(id)), detailId: current.detailId !== undefined && chosenIds.has(current.detailId) ? undefined : current.detailId, comparing: false }))
  }

  function exportLibrary() {
    const liveIds = new Set(artifacts.map(item => item.id))
    const exportedQueue = Array.from(new Set(queueIds.filter(id => liveIds.has(id)))).slice(0, 5)
    if (exportedQueue.length !== queueIds.length) setQueueFeedback('导出备份已忽略无效、重复或超额队列引用；库存和队列未改变。')
    const exportedAssets = Object.fromEntries(Object.entries(assetMap).filter(([key]) => key.startsWith('character:')))
    const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), artifacts, trash, queueIds: exportedQueue, assets: exportedAssets }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `圣遗物管理大师-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importLibrary(file: File) {
    if (!storageReady || storageBusyRef.current) return
    if (file.size > MAX_BACKUP_FILE_BYTES) {
      window.alert('导入文件超过 64 MB 上限。请先拆分或移除超限素材后重试。')
      return
    }
    storageBusyRef.current = true; setStorageBusy(true)
    mutationEpochRef.current++
    ++saveRequestRef.current; pendingSignatureRef.current = ''
    let committing = false
    try {
      const payload = parseLibraryBackup(await file.text())
      for (const [assetKey, assetValue] of Object.entries(payload.assets ?? {})) {
        if (assetKey.startsWith('character:')) await decodeAvatarDataUrl(assetValue)
      }
      if (!mountedRef.current) return
      if (artifacts.length && !window.confirm('导入会替换当前本地仓库。建议先导出 JSON 备份，是否继续？')) return
      const migration = migrateArtifactLibrary({ artifacts: [...payload.artifacts, ...payload.trash], assets: payload.assets ?? {} })
      const migratedArtifacts = migration.artifacts.slice(0, payload.artifacts.length)
      const migratedTrash = migration.artifacts.slice(payload.artifacts.length)
      const retainedLegacyArtifacts = Object.fromEntries(Object.entries(assetMap).filter(([key]) => key.startsWith('artifact:')))
      const retainedExistingCharacters = Object.fromEntries(Object.entries(assetMap).filter(([key]) => key.startsWith('character:')))
      const mergedAssets = { ...retainedLegacyArtifacts, ...retainedExistingCharacters, ...migration.retainedAssets }
      const next = { artifacts: migratedArtifacts, trash: migratedTrash, queueIds: payload.queueIds, assets: mergedAssets }
      committing = true
      await saveLibrary(next)
      if (!mountedRef.current) return
      pendingMigrationReportRef.current = undefined
      lastSavedRef.current = JSON.stringify(next)
      setSavedSignature(lastSavedRef.current)
      setArtifacts(migratedArtifacts)
      setTrash(migratedTrash)
      setQueueIds(payload.queueIds); setQueueFeedback('')
      setAssetMap(mergedAssets)
      mirrorCharacterAssets(mergedAssets, migration.migrationReport)
      setSelectedId(migratedArtifacts[0]?.id ?? 0)
      setWarehouseSession(current => ({ ...current, selectedIds: [], detailId: undefined, comparing: false }))
      setPendingViewId(undefined)
      setStorageError(''); setSaveStatus('saved')
    } catch (error) {
      if (mountedRef.current) window.alert(`导入失败：${committing ? '本地保存失败，原仓库未替换。' : ''}${error instanceof Error ? error.message : '请选择有效 JSON 备份。'}`)
    } finally {
      storageBusyRef.current = false
      if (mountedRef.current) setStorageBusy(false)
    }
  }

  function restoreArtifact(id: number) {
    if (!storageReady || storageBusyRef.current) return
    const target = trash.find((item) => item.id === id)
    if (!target) return
    setArtifacts((items) => [target, ...items])
    setTrash((items) => items.filter((item) => item.id !== id))
    setSelectedId(id)
  }

  function emptyTrash() {
    if (!storageReady || storageBusyRef.current) return
    if (trash.length && window.confirm('确定永久清空回收站吗？此操作无法恢复。')) setTrash([])
  }

  return <main className="app-shell" style={{ '--archive-background': `url(${archiveBackground})` } as CSSProperties}>
    <header className="archive-nav">
      <div className="brand"><div className="brand-mark"><Sparkles size={22} /></div><div><strong>星穹典藏</strong><small>圣遗物管理系统</small></div></div>
      <PageNavigation active={activePage} onNavigate={navigateTo} disabled={navigationBlocked} />
      <div className="archive-local-state">本地私有仓库<br /><small>非官方工具</small></div>
    </header>

    <section className="workspace">
      {storageError && <div role="alert">{storageError}{!storageReady ? <button onClick={() => setReloadStorage(count => count + 1)}>重试读取</button> : <button disabled={storageBusy || saveStatus === 'saving'} onClick={() => void saveCurrentSnapshot()}>重试保存当前修改</button>}</div>}
      {assetWarning && <div role="alert">{assetWarning}</div>}
      <p className="library-save-state" aria-live="polite">{!storageReady ? '正在读取本地仓库' : storageBusy || saveStatus === 'saving' || savedSignature !== signature && saveStatus !== 'failed' ? '正在保存，请勿关闭程序' : saveStatus === 'failed' ? '修改尚未保存' : '已保存'}</p>
      {queueFeedback && <p className="queue-global-feedback" aria-live="polite">{queueFeedback}</p>}
      <section className="page-body" data-page={activePage} aria-labelledby="page-title">
      <div className="archive-page-heading"><div><p>{page.caption} · 本地保存</p><h1 id="page-title" ref={pageHeadingRef} tabIndex={-1}>{page.title}</h1></div><span>{page.description}</span></div>
      {activePage === 'warehouse' && <>
      <fieldset className="toolbar" disabled={!storageReady || storageBusy}><button className="primary-button realtime-button" onClick={() => setShowRealtime(true)}><MonitorUp size={16} />实时录入</button><button className="secondary-button" onClick={() => { setManualDraft(createManualDraft()); setManualTargetId(undefined); setShowModal(true) }}><Plus size={17} />手动录入</button><button className="secondary-button" onClick={() => setShowUidImport(true)}>UID 展柜导入</button><details className="warehouse-menu"><summary>更多录入</summary><div><button className="filter-button" onClick={() => { setMultipleScreenshots(false); setShowOcr(true) }}><ScanLine size={16} />识别截图</button><button className="filter-button" onClick={() => { setMultipleScreenshots(true); setShowOcr(true) }}>选择多张截图</button></div></details><details className="warehouse-menu warehouse-backup-menu"><summary>仓库备份</summary><div><label className="filter-button file-action"><Upload size={16} />导入 JSON<input type="file" accept="application/json" onChange={event => { const file = event.target.files?.[0]; if (file) void importLibrary(file); event.target.value = '' }} /></label><button className="filter-button" onClick={exportLibrary}><Download size={16} />导出 JSON</button></div></details></fieldset>

      <fieldset className="library-edit-controls" disabled={!storageReady || storageBusy}>
      {hiddenViewTarget && <div className="page-callout" role="status">目标藏品被当前筛选或角色范围隐藏，筛选未改变。<button className="secondary-button" onClick={revealViewedRecord}>清除筛选并查看</button></div>}
      <Warehouse scoringOptions={scoringOptions} session={warehouseSession} onSessionChange={setWarehouseSession} records={warehouseRecords} scope={warehouseScope} characterName={activeCharacterName} onScopeChange={setWarehouseScope} onEdit={id => { const record = artifacts.find(item => item.id === id); if (record) { setManualDraft(recordToDraft(record, 'manual')); setManualTargetId(id); setShowModal(true) } }} onCopy={id => { const record = artifacts.find(item => item.id === id); if (record) { setManualDraft(recordToDraft(record, 'manual')); setManualTargetId(undefined); setShowModal(true) } }} onToggleLock={toggleLock} onBulkTrash={moveToTrash} onQueue={addToQueue} />
      </fieldset></>}
        {activePage === 'characters' && <CharactersPage characterIndex={activeCharacter} onCharacterChange={(index, buildId) => { setActiveCharacter(index); setScoringOptions({ setMode: 'recommended', buildId }) }} assets={assetMap} picks={recommendation.picks as Artifact[]} scoringOptions={scoringOptions} onScoringChange={setScoringOptions} onRecommend={() => navigateTo('recommendations')} onWarehouse={() => { setWarehouseScope('character'); navigateTo('warehouse') }} />}
        {activePage === 'recommendations' && <RecommendationsPage characterName={activeCharacterName} picks={recommendation.picks as Artifact[]} score={recommendation.score} missingSlots={recommendation.missingSlots} recommendation={recommendation} scoringOptions={scoringOptions} onScoringChange={setScoringOptions} disabled={!storageReady || storageBusy} onCharacter={() => navigateTo('characters')} onView={viewRecord} onQueue={addToQueue} />}
      {activePage === 'queue' && <QueuePage scoringOptions={scoringOptions} records={queuedArtifacts} hasMembership={queueIds.length > 0} characterName={activeCharacterName} disabled={!storageReady || storageBusy} onRemove={removeFromQueue} onView={viewRecord} />}
      {activePage === 'catalog' && <CatalogPage state={catalogState} onChange={setCatalogState} />}
      {activePage === 'assets' && <AssetsPage characters={characters} assets={assetMap} disabled={!storageReady || storageBusy} onImport={importAsset} onCleanupLegacy={cleanupLegacyArtifactAssets} />}
      {activePage === 'trash' && <TrashPage trash={trash} disabled={!storageReady || storageBusy} onRestore={restoreArtifact} onEmpty={emptyTrash} />}
      </section>
    </section>
    <PageNavigation active={activePage} onNavigate={navigateTo} disabled={navigationBlocked} mobile />

    {showRealtime && <div className="modal-backdrop"><RealtimeCapturePanel existing={artifacts} onConfirm={confirmImport} onAutoCommit={handleAutoCommit} onRollbackBatch={handleRollbackBatch} onClose={() => setShowRealtime(false)} /></div>}

    {showModal && <div className="modal-backdrop"><ManualEntry key={manualDraft?.draftId} initial={manualDraft} onReview={reviewManual} onCancel={() => { setShowModal(false); setManualTargetId(undefined) }} /></div>}
    {reviewItems && <div className="modal-backdrop"><ImportReview key={reviewItems.map(item => item.draft.draftId).join(':')} items={reviewItems} existing={artifacts} editTargetId={manualTargetId} onConfirm={confirmImport} onCancel={closeImportReview} /></div>}
    {showUidImport && <div className="modal-backdrop"><UidShowcaseImport existing={artifacts} onConfirm={confirmImport} onClose={() => setShowUidImport(false)} /></div>}
    {showOcr && <div className="modal-backdrop"><ScreenshotImport existing={artifacts} multiple={multipleScreenshots} onConfirm={confirmImport} onClose={() => setShowOcr(false)} /></div>}
  </main>
}

export default App
