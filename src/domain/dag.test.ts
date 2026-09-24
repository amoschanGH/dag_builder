import { describe, expect, it } from 'vitest'
import {
  createLocalDag,
  getLocalDagRoundGridBounds,
  getRoundGridBounds,
  getVertexSlotInfo,
  insertVertex,
  layoutVerticesByRounds,
  roundGridColumnCenter,
  roundGridPosition,
  roundGridRowCenter,
  type DagVertex,
} from './dag'

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
      minRound: 1,
      maxRound: 8,
      minSource: 1,
      maxSource: 4,
    })
  })

  it('derives the grid extent from the local DAG round index', () => {
    let dag = createLocalDag()
    dag = insertVertex(dag, vertex('first', 1, 1)) ?? dag
    dag = insertVertex(dag, vertex('latest', 4, 3)) ?? dag
    const bounds = getLocalDagRoundGridBounds(dag)

    expect(bounds).toMatchObject({
      minRound: 1,
      maxRound: 3,
      nextRound: 4,
      maxSource: 4,
      rounds: [1, 2, 3, 4],
    })
  })

  it('keeps grid axes centered on vertex cells', () => {
    const bounds = getRoundGridBounds([vertex('v1', 2, 3)])
    const position = roundGridPosition(3, 2, bounds)

    expect(roundGridColumnCenter(3, bounds)).toBe(position.x + bounds.nodeWidth / 2)
    expect(roundGridRowCenter(2, bounds)).toBe(position.y + bounds.nodeHeight / 2)
  })

  it('uses the vertex range instead of a fixed number of round columns', () => {
    const bounds = getRoundGridBounds([vertex('single', 1, 3)])

    expect(bounds).toMatchObject({
      minRound: 1,
      maxRound: 3,
      rounds: [1, 2, 3, 4],
    })
  })

  it('allows multiple vertices in one source-round slot and offsets them', () => {
    let dag = createLocalDag()
    dag = insertVertex(dag, vertex('equivocation-a', 1, 1)) ?? dag
    dag = insertVertex(dag, vertex('equivocation-b', 1, 1)) ?? dag
    dag = layoutVerticesByRounds(dag)
    const slotInfo = getVertexSlotInfo(dag.vertices.values())

    expect(dag.vertices.size).toBe(2)
    expect(dag.rounds.get(1)).toEqual(new Set(['equivocation-a', 'equivocation-b']))
    expect(slotInfo.get('equivocation-a')).toEqual({ index: 0, count: 2 })
    expect(slotInfo.get('equivocation-b')).toEqual({ index: 1, count: 2 })
    expect(dag.vertices.get('equivocation-a')?.position).not.toEqual(
      dag.vertices.get('equivocation-b')?.position,
    )
  })

  it('lays vertices out in ascending round columns', () => {
    let dag = createLocalDag()
    dag = insertVertex(dag, vertex('newest', 1, 8)) ?? dag
    dag = insertVertex(dag, vertex('oldest', 3, 5)) ?? dag
    dag = layoutVerticesByRounds(dag)

    expect(dag.vertices.get('oldest')?.position).toEqual({ x: 980, y: 330 })
    expect(dag.vertices.get('newest')?.position).toEqual({ x: 1640, y: 80 })
  })
})
