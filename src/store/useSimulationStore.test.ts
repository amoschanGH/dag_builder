import { beforeEach, describe, expect, it } from 'vitest'
import { useDagStore } from './useDagStore'
import { useSimulationStore } from './useSimulationStore'

describe('useSimulationStore', () => {
  beforeEach(() => {
    useDagStore.getState().clearDag()
    useDagStore.getState().loadExample()
    useSimulationStore.getState().initialize(3, 2)
  })

  it('loads a detached editor snapshot into process 0 only', () => {
    const simulation = useSimulationStore.getState().snapshot
    const editorVertex = useDagStore.getState().dag.vertices.get('v1')

    expect(simulation.processes.get(0)?.dag.vertices.size).toBe(13)
    expect(simulation.processes.get(1)?.dag.vertices.size).toBe(0)
    expect(simulation.processes.get(2)?.dag.vertices.size).toBe(0)
    expect(simulation.processes.get(0)?.dag.vertices.get('v1')).not.toBe(editorVertex)
    expect(useDagStore.getState().dag.vertices.size).toBe(13)
  })

  it('creates, flushes, and broadcasts a local simulation vertex', () => {
    useSimulationStore.getState().setActiveProcess(1)
    const store = useSimulationStore.getState()
    store.createBufferedVertex()
    const selectedVertexId = useSimulationStore.getState().selectedVertexId
    expect(selectedVertexId).not.toBeNull()

    useSimulationStore.getState().flushSelectedVertex()
    expect(
      useSimulationStore.getState().snapshot.processes.get(1)?.dag.vertices.has(
        selectedVertexId ?? '',
      ),
    ).toBe(true)

    useSimulationStore.getState().broadcastSelectedVertex()
    const snapshot = useSimulationStore.getState().snapshot
    expect(snapshot.queue).toHaveLength(2)
    expect(snapshot.queue.map((message) => message.receiver)).toEqual([0, 2])
    expect(snapshot.queue.every((message) => message.deliveryTime === 2)).toBe(true)
  })

  it('advances a receiver only after distinct-source blocks fill the quorum', () => {
    useDagStore.getState().clearDag()
    const first = useDagStore.getState().addVertex()
    const second = useDagStore.getState().addVertex()
    const third = useDagStore.getState().addVertex()
    useDagStore.getState().updateVertex(second, { source: 2, round: 1 })
    useDagStore.getState().updateVertex(third, { source: 3, round: 1 })
    useSimulationStore.getState().initialize(3, 1, 1)

    useSimulationStore.getState().setActiveProcess(0)
    for (const vertexId of [first, second, third]) {
      useSimulationStore.getState().selectVertex(vertexId)
      useSimulationStore.getState().broadcastSelectedVertex()
    }
    useSimulationStore.getState().runUntilIdle()
    useSimulationStore.getState().flushAllBuffers()

    expect(useSimulationStore.getState().snapshot.processes.get(1)?.dag.rounds.get(1)?.size).toBe(3)
    useSimulationStore.getState().setActiveProcess(1)
    useSimulationStore.getState().createBufferedVertex()
    const nextVertex = useSimulationStore.getState().selectedVertexId
    expect(nextVertex).not.toBeNull()
    useSimulationStore.getState().flushVertex(nextVertex ?? '')
    expect(useSimulationStore.getState().snapshot.processes.get(1)?.dag.rounds.get(2)?.size).toBe(1)
  })

  it('reconfigures a fresh simulation without clearing the editor', () => {
    useSimulationStore.getState().configure(4, 5)
    const snapshot = useSimulationStore.getState().snapshot

    expect(snapshot.queue).toHaveLength(0)
    expect(snapshot.currentTick).toBe(0)
    expect(snapshot.processes.size).toBe(4)
    expect(snapshot.processes.get(0)?.dag.vertices.size).toBe(13)
    expect(useDagStore.getState().dag.vertices.size).toBe(13)
  })
})
