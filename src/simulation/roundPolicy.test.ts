import { describe, expect, it } from 'vitest'
import { canInsertAtRound, quorumSize, summarizeRound } from './roundPolicy'
import { createLocalDag, insertVertex, type DagVertex } from '../domain/dag'

function vertex(id: string, round: number, source: number): DagVertex {
  return {
    id,
    source,
    round,
    wave: Math.ceil(round / 4),
    position: { x: 0, y: 0 },
    blockData: { proposer: source, payload: '', metadata: {} },
    status: 'in-dag',
    timestamp: 0,
  }
}

describe('round policy', () => {
  it('uses a 2f+1 quorum', () => {
    expect(quorumSize(0)).toBe(1)
    expect(quorumSize(1)).toBe(3)
    expect(quorumSize(2)).toBe(5)
  })

  it('blocks a new round until the current round reaches quorum', () => {
    const dag = createLocalDag()
    const first = insertVertex(dag, vertex('v1', 4, 1))
    expect(first).not.toBeNull()
    if (!first) return

    expect(canInsertAtRound(first, 5, 1, true)).toMatchObject({
      ok: false,
      reason: 'quorum-not-met',
    })
    expect(canInsertAtRound(first, 6, 1, true)).toMatchObject({
      ok: false,
      reason: 'round-out-of-order',
    })

    let withTwo = insertVertex(first, vertex('v2', 4, 2)) ?? first
    withTwo = insertVertex(withTwo, vertex('v3', 4, 3)) ?? withTwo
    expect(canInsertAtRound(withTwo, 5, 1).ok).toBe(true)
    expect(summarizeRound(withTwo, 1)).toMatchObject({
      currentRound: 4,
      vertexCount: 3,
      quorumSize: 3,
      canAdvance: true,
      nextRound: 5,
    })
  })

  it('allows a genesis round but not skipping from an empty DAG', () => {
    const dag = createLocalDag()
    expect(canInsertAtRound(dag, 1, 1).ok).toBe(true)
    expect(canInsertAtRound(dag, 4, 1)).toMatchObject({
      ok: false,
      reason: 'initial-round',
    })
    expect(canInsertAtRound(dag, 4, 1, true).ok).toBe(true)
  })
})
