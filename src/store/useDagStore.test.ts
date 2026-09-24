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
      source: 1,
      round: 1,
      position: { x: 100, y: 80 },
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

  it('automatically builds strong edges to the previous round', () => {
    useDagStore.getState().addVertex()
    useDagStore.getState().addVertex()
    useDagStore.getState().addVertex()

    const { dag, edges } = useDagStore.getState()
    const newest = Array.from(dag.vertices.values()).find((vertex) => vertex.round === 3)
    expect(newest).toBeDefined()
    expect(
      Array.from(edges.values()).filter(
        (edge) => edge.source === newest?.id && edge.kind === 'strong',
      ),
    ).toHaveLength(1)
    expect(Array.from(edges.values()).every((edge) => edge.kind === 'strong')).toBe(true)
  })

  it('rejects duplicate source-round slots', () => {
    const first = useDagStore.getState().addVertex()
    const second = useDagStore.getState().addVertex()

    expect(
      useDagStore.getState().updateVertex(second, { source: 1, round: 1 }),
    ).toBe(
      'duplicate-slot',
    )
    expect(useDagStore.getState().dag.vertices.get(second)?.source).toBe(1)
    expect(useDagStore.getState().dag.vertices.has(first)).toBe(true)
  })

  it('keeps editor edges strong-only and rejects non-predecessor links', () => {
    const first = useDagStore.getState().addVertex()
    const second = useDagStore.getState().addVertex()
    const third = useDagStore.getState().addVertex()

    const invalid = useDagStore.getState().addEdge(third, first, 'strong')
    expect(invalid).toEqual({ ok: false, reason: 'invalid-edge' })
    expect(useDagStore.getState().edges.size).toBe(2)
    expect(Array.from(useDagStore.getState().edges.values()).every((edge) => edge.kind === 'strong')).toBe(true)
    expect(useDagStore.getState().dag.vertices.has(first)).toBe(true)
    expect(useDagStore.getState().dag.vertices.has(second)).toBe(true)
    expect(useDagStore.getState().dag.vertices.has(third)).toBe(true)
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
