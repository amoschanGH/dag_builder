import { describe, expect, it } from 'vitest'
import type { DagEdge, DagVertex } from './dag'
import { getStrongReferenceDetails } from './strongReferences'

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

function edge(id: string, source: string, target: string): DagEdge {
  return {
    id,
    source,
    target,
    kind: 'strong',
    reference: { capturedAt: 7, originProcess: 0 },
  }
}

describe('strong reference details', () => {
  it('describes the new-to-previous relation and causal history', () => {
    const vertices = new Map(
      [vertex('c', 1, 3), vertex('b', 2, 2), vertex('a', 3, 1)].map((item) => [
        item.id,
        item,
      ]),
    )
    const edges = [edge('c-b', 'c', 'b'), edge('b-a', 'b', 'a')]
    const details = getStrongReferenceDetails(edges[0], vertices, edges)

    expect(details).toMatchObject({
      from: { id: 'c', round: 3 },
      to: { id: 'b', round: 2 },
      roundDelta: 1,
    })
    expect(details?.history.map((entry) => entry.vertex.id)).toEqual(['b', 'a'])
    expect(details?.history[0]?.viaEdgeId).toBe('c-b')
    expect(details?.history[1]?.viaEdgeId).toBe('b-a')
  })

  it('does not treat weak edges as strong references', () => {
    const vertices = new Map([
      ['b', vertex('b', 1, 2)],
      ['a', vertex('a', 2, 1)],
    ])
    const weakEdge: DagEdge = {
      id: 'weak',
      source: 'b',
      target: 'a',
      kind: 'weak',
    }

    expect(getStrongReferenceDetails(weakEdge, vertices, [weakEdge])).toBeNull()
  })
})
