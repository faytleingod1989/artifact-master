import { FIVE_STAR_ARTIFACT_SETS } from '../artifacts/catalog'
import type { SetPlan } from './profileTypes'

export const setPlanLabel = (plan: SetPlan) => plan.pieces.map(p => `${FIVE_STAR_ARTIFACT_SETS.find(s => s.key === p.key)?.name ?? p.key}×${p.count}`).join(' + ')
