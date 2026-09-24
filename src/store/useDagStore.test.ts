import { beforeEach, describe, expect, it } from 'vitest'
import { useDagStore } from './useDagStore'

describe('useDagStore', () => {
  beforeEach(() => {
    useDagStore.getState().clearDag()
  })

  it('indexes vertices by ID and round', () => {
    const vertexId = useDagStore.getState().addVertex({ x: 20, y: 40 })
    const { dag } = useDagStore.getState()

    expect(dag.vertices.get(vertexId)).toMatchObject({
      id: vertexId,
      source: 0,
      round: 1,
      position: { x: 20, y: 40 },
      status: 'buffered',
    })
    expect(dag.rounds.get(1)).toEqual(new Set([vertexId]))
  })

  it('moves vertices without changing the round index', () => {
    const vertexId = useDagStore.getState().addVertex({ x: 0, y: 0 })

    expect(
      useDagStore.getState().updateVertex(vertexId, {
        position: { x: 120, y: 80 },
      }),
    ).toBe('updated')

    const { dag } = useDagStore.getState()
    expect(dag.vertices.get(vertexId)?.position).toEqual({ x: 120, y: 80 })
    expect(dag.rounds.get(1)).toEqual(new Set([vertexId]))
  })

  it('rejects duplicate source-round slots', () => {
    const first = useDagStore.getState().addVertex()
    const second = useDagStore.getState().addVertex()

    expect(useDagStore.getState().updateVertex(second, { source: 0 })).toBe(
      'duplicate-slot',
    )
    expect(useDagStore.getState().dag.vertices.get(second)?.source).toBe(1)
    expect(useDagStore.getState().dag.vertices.has(first)).toBe(true)
  })

  it('adds typed edges and rejects cycles', () => {
    const first = useDagStore.getState().addVertex()
    const second = useDagStore.getState().addVertex()
    const third = useDagStore.getState().addVertex()

    const forward = useDagStore.getState().addEdge(first, second, 'strong')
    expect(forward.ok).toBe(true)
    expect(useDagStore.getState().addEdge(second, third, 'weak').ok).toBe(true)

    const cycle = useDagStore.getState().addEdge(third, first, 'strong')
    expect(cycle).toEqual({ ok: false, reason: 'cycle' })
    expect(useDagStore.getState().edges.size).toBe(2)
  })

  it('removes incident edges with a deleted vertex', () => {
    const first = useDagStore.getState().addVertex()
    const middle = useDagStore.getState().addVertex()
    const last = useDagStore.getState().addVertex()
    useDagStore.getState().addEdge(first, middle)
    useDagStore.getState().addEdge(middle, last)

    useDagStore.getState().removeVertex(middle)

    const state = useDagStore.getState()
    expect(state.dag.vertices.has(middle)).toBe(false)
    expect(state.edges.size).toBe(0)
  })
})
