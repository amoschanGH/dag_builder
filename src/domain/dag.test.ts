import { describe, expect, it } from 'vitest'
import { getRoundGridBounds, layoutVerticesByRounds, createLocalDag, insertVertex, type DagVertex } from './dag'

function vertex(id: string, source: number, round: number): DagVertex {
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

describe('round-grid layout', () => {
  it('keeps rounds as columns and sources as rows', () => {
    const bounds = getRoundGridBounds([
      vertex('v1', 1, 8),
      vertex('v2', 4, 5),
    ])

    expect(bounds).toMatchObject({
      minRound: 5,
      maxRound: 8,
      minSource: 1,
      maxSource: 4,
    })
  })

  it('lays vertices out in ascending round columns', () => {
    let dag = createLocalDag()
    dag = insertVertex(dag, vertex('newest', 1, 8)) ?? dag
    dag = insertVertex(dag, vertex('oldest', 3, 5)) ?? dag
    dag = layoutVerticesByRounds(dag)

    expect(dag.vertices.get('oldest')?.position).toEqual({ x: 100, y: 330 })
    expect(dag.vertices.get('newest')?.position).toEqual({ x: 760, y: 80 })
  })
})
