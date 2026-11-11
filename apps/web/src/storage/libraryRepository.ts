import { getMany, setMany } from 'idb-keyval'
import { validateLibraryState, type LibraryState } from './libraryValidation'
export { isArtifactRecord, type LibraryState } from './libraryValidation'
export async function loadLibrary(): Promise<LibraryState> {
  const [artifacts = [], trash = [], queueIds = [], assets] = await getMany(['artifact-master:artifacts', 'artifact-master:trash', 'artifact-master:queue', 'artifact-master:assets'])
  return validateLibraryState({ artifacts, trash, queueIds, ...(assets === undefined ? {} : { assets }) })
}
let lastWrite: Promise<void> = Promise.resolve()
export function saveLibrary(next: LibraryState): Promise<void> {
  const write = () => {
    validateLibraryState(next)
    const entries: [string, unknown][] = [['artifact-master:artifacts', next.artifacts], ['artifact-master:trash', next.trash], ['artifact-master:queue', next.queueIds]]
    if (next.assets !== undefined) entries.push(['artifact-master:assets', next.assets])
    return setMany(entries)
  }
  const current = lastWrite.catch(() => undefined).then(write)
  lastWrite = current
  return current
}
