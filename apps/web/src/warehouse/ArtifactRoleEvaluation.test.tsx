import { useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { ArtifactRoleEvaluation } from './ArtifactRoleEvaluation'
import { calculatePotential } from '../potential/scorePotential'
import type { PotentialInput } from '../potential/potentialTypes'
import type { ArtifactRecord } from '../artifacts/types'
const calls = vi.hoisted(() => ({ inputs: [] as PotentialInput[] }))
vi.mock('../potential/potentialClient', () => ({ createPotentialClient: () => ({ evaluate: async (input: PotentialInput) => { calls.inputs.push(input); return calculatePotential(input) }, dispose() {} }) }))
const piece: ArtifactRecord = { id: 1, name: 'test', set: '逐影猎人', setKey: 'zhuying-lieren', slot: '生之花', level: 0, main: '生命值 717', subs: ['暴击率 3.1%', '攻击力 19', '暴击伤害 5.4%'], locked: false, hue: 'blue', score: 0 }
afterEach(() => { cleanup(); calls.inputs.length = 0 })
function Harness({ record = piece }: { record?: ArtifactRecord }) {
  const [comparison, change] = useState<{ characterName: string; buildId: string }>()
  return <ArtifactRoleEvaluation record={record} characterName="雷电将军" scoringOptions={{ buildId: 'burst', extraCritRate: 45 }} comparison={comparison} onComparisonChange={change} />
}
test('single-piece role comparison can switch builds and restore global context without altering the piece', async () => {
  const user = userEvent.setup(); const original = JSON.stringify(piece)
  render(<Harness />)
  await waitFor(() => expect(screen.getByLabelText('+20理论评分范围')).toHaveTextContent('—'))
  expect(screen.getByText(/外部暴击率.*45/)).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('评估角色'), '芙宁娜')
  await waitFor(() => expect(calls.inputs.at(-1)?.characterName).toBe('芙宁娜'))
  expect(calls.inputs.at(-1)?.options.extraCritRate).toBeUndefined()
  await user.selectOptions(screen.getByLabelText('评估角色'), '雷电将军')
  await user.selectOptions(screen.getByLabelText('评估玩法'), 'hyperbloom')
  await waitFor(() => expect(screen.getByLabelText('+20理论评分范围')).toHaveTextContent('25.0 — 60.1'))
  expect(screen.getByText(/未知第四词条/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: '跟随配装角色' }))
  expect(screen.getByLabelText('评估玩法')).toHaveValue('burst'); expect(JSON.stringify(piece)).toBe(original)
})
test('explicit role survives switching pieces and malformed old data is not rated as zero potential', async () => {
  const user = userEvent.setup(); const view = render(<Harness />)
  await user.selectOptions(screen.getByLabelText('评估角色'), '芙宁娜')
  view.rerender(<Harness record={{ ...piece, id: 2, subs: ['乱码'] }} />)
  expect(screen.getByLabelText('评估角色')).toHaveValue('芙宁娜')
  await waitFor(() => expect(screen.getByLabelText('+20理论评分范围')).toHaveTextContent('需核实'))
})
