import { describe, expect, it } from 'vitest'
import type { DagEdge, DagVertex } from '../domain/dag'
import { SimpleDelayedBroadcast, type BroadcastStrategy } from './broadcast'
import { Simulator } from './simulator'
import type { SimulationConfig, SimulationSnapshot, VertexContent } from './types'

function content(
  id: string,
  source: number,
  round = 1,
  position = { x: 0, y: 0 },
): VertexContent {
  return {
    id,
    source,
    round,
    wave: Math.ceil(round / 4),
    position,
    blockData: { proposer: source, payload: `payload-${id}`, metadata: {} },
  }
}

function dagVertex(id: string, source: number, round = 1): DagVertex {
  return {
    ...content(id, source, round),
    status: 'committed',
    timestamp: 99,
  }
}

function edge(id: string, source: string, target: string): DagEdge {
  return { id, source, target, kind: 'strong' }
}

function createSimulator(
  processIds: number[] = [0, 1, 2],
  delay = 2,
  seed?: SimulationConfig['seed'],
  strategy: BroadcastStrategy = new SimpleDelayedBroadcast(delay),
) {
  return new Simulator({
    processIds,
    strategy,
    seed,
    faultTolerance: 0,
  })
}

function canonicalSnapshot(snapshot: SimulationSnapshot) {
  return {
    tick: snapshot.currentTick,
    nextEventSequence: snapshot.nextEventSequence,
    nextBroadcastSequence: snapshot.nextBroadcastSequence,
    queue: snapshot.queue,
    processes: Array.from(snapshot.processes.entries()).map(([id, process]) => ({
      id,
      vertices: Array.from(process.dag.vertices.entries()),
      rounds: Array.from(process.dag.rounds.entries()),
      edges: Array.from(process.edges.entries()),
      buffer: Array.from(process.buffer.entries()),
      pendingEdges: Array.from(process.pendingEdges.entries()),
    })),
    log: snapshot.log,
  }
}

describe('Simulator', () => {
  it('clones and normalizes the seed graph', () => {
    const seedVertex = dagVertex('v1', 0)
    const seedEdge = edge('e1', 'v1', 'v1')
    const simulator = createSimulator([0, 1], 1, {
      processId: 0,
      vertices: [seedVertex],
      edges: [seedEdge],
    })
    seedVertex.blockData.payload = 'mutated'
    const process = simulator.snapshot().processes.get(0)

    expect(process?.dag.vertices.get('v1')).toMatchObject({
      status: 'in-dag',
      timestamp: 0,
      blockData: { payload: 'payload-v1' },
    })
    expect(process?.edges.size).toBe(0)
  })

  it('creates vertices in the buffer before inserting them into a DAG', () => {
    const simulator = createSimulator([0], 1)
    const result = simulator.createVertex(0, content('local-1', 1))

    expect(result.ok).toBe(true)
    expect(simulator.snapshot().processes.get(0)?.buffer.has('local-1')).toBe(true)
    expect(simulator.snapshot().processes.get(0)?.dag.vertices.size).toBe(0)

    const flushed = simulator.flushBuffer(0, 'local-1')
    expect(flushed.ok).toBe(true)
    const snapshot = simulator.snapshot()
    expect(snapshot.processes.get(0)?.buffer.size).toBe(0)
    expect(snapshot.processes.get(0)?.dag.vertices.has('local-1')).toBe(true)
    expect(snapshot.processes.get(0)?.dag.rounds.get(1)).toEqual(new Set(['local-1']))
  })

  it('broadcasts delayed messages without delivering immediately', () => {
    const simulator = createSimulator([0, 1, 2], 3, {
      vertices: [dagVertex('v1', 0)],
      edges: [],
    })

    const result = simulator.broadcast(0, 'v1')
    expect(result.ok).toBe(true)
    expect(simulator.snapshot().queue).toHaveLength(2)
    expect(simulator.snapshot().currentTick).toBe(0)

    const delivery = simulator.step()
    expect(delivery).toMatchObject({ tick: 3, outcome: 'delivered' })
    expect(delivery?.message.receiver).toBe(1)
    expect(simulator.snapshot().processes.get(1)?.buffer.has('v1')).toBe(true)
    expect(simulator.snapshot().processes.get(1)?.dag.vertices.size).toBe(0)
  })

  it('orders equal-tick deliveries by receiver', () => {
    const simulator = createSimulator([0, 3, 1, 2], 2, {
      vertices: [dagVertex('v1', 0)],
      edges: [],
    })
    simulator.broadcast(0, 'v1')

    const batch = simulator.runOneTick()
    expect(batch.deliveries.map((delivery) => delivery.message.receiver)).toEqual([
      1, 2, 3,
    ])
  })

  it('makes duplicate delivery idempotent', () => {
    const simulator = createSimulator([0, 1], 1, {
      vertices: [dagVertex('v1', 0)],
      edges: [],
    })
    simulator.broadcast(0, 'v1')
    simulator.step()
    simulator.flushBuffer(1, 'v1')
    simulator.broadcast(1, 'v1')

    const delivery = simulator.step()
    expect(delivery?.outcome).toBe('duplicate')
    expect(simulator.snapshot().processes.get(0)?.dag.vertices.size).toBe(1)
  })

  it('captures strong edges to local previous-round blocks at creation', () => {
    const simulator = createSimulator(
      [0],
      1,
      {
        vertices: [
          dagVertex('r1-a', 2, 1),
          dagVertex('r1-b', 3, 1),
          dagVertex('r1-c', 4, 1),
        ],
        edges: [],
      },
    )

    const created = simulator.createVertex(0, content('r2-a', 1, 2))
    expect(created.ok).toBe(true)
    expect(simulator.snapshot().processes.get(0)?.pendingEdges.size).toBe(3)
    expect(
      Array.from(simulator.snapshot().processes.get(0)?.pendingEdges.values() ?? []).every(
        (edge) => edge.kind === 'strong' && edge.target.startsWith('r1-'),
      ),
    ).toBe(true)

    const flushed = simulator.flushBuffer(0, 'r2-a')
    expect(flushed.ok).toBe(true)
    expect(simulator.snapshot().processes.get(0)?.edges.size).toBe(3)
    expect(simulator.snapshot().processes.get(0)?.pendingEdges.size).toBe(0)
  })

  it('holds strong incident edges until their endpoints are inserted', () => {
    const seedVertices = [
      dagVertex('a', 1, 1),
      dagVertex('b', 2, 1),
      dagVertex('c', 3, 1),
    ]
    const simulator = new Simulator({
      processIds: [0, 1],
      strategy: new SimpleDelayedBroadcast(1),
      faultTolerance: 1,
      seed: { vertices: seedVertices, edges: [] },
    })
    simulator.createVertex(0, content('r2', 1, 2))
    simulator.flushBuffer(0, 'r2')
    simulator.broadcast(0, 'r2')
    simulator.broadcast(0, 'a')
    simulator.broadcast(0, 'b')
    simulator.broadcast(0, 'c')
    simulator.runUntilIdle()

    expect(simulator.snapshot().processes.get(1)?.pendingEdges.size).toBe(3)
    simulator.flushAllBuffers()
    const process = simulator.snapshot().processes.get(1)
    expect(process?.dag.vertices.size).toBe(4)
    expect(process?.edges.size).toBe(3)
    expect(process?.pendingEdges.size).toBe(0)
  })

  it('rejects duplicate messages produced for one receiver', () => {
    const malformed: BroadcastStrategy = {
      broadcast: ({ sender, vertex }) => [
        {
          sender,
          receiver: 1,
          payload: { vertex, incidentEdges: [] },
          delay: 1,
        },
        {
          sender,
          receiver: 1,
          payload: { vertex, incidentEdges: [] },
          delay: 1,
        },
      ],
    }
    const simulator = createSimulator(
      [0, 1],
      1,
      { vertices: [dagVertex('v1', 0)], edges: [] },
      malformed,
    )
    const result = simulator.broadcast(0, 'v1')

    expect(result).toMatchObject({ ok: false, reason: 'invalid-broadcast' })
    expect(simulator.snapshot().queue).toHaveLength(0)
  })

  it('rejects conflicting source-round content without overwriting', () => {
    const simulator = createSimulator([0, 1], 1, {
      vertices: [dagVertex('v1', 2)],
      edges: [],
    })
    simulator.createVertex(1, content('local-1', 2))
    const result = simulator.broadcast(0, 'v1')
    expect(result.ok).toBe(true)
    simulator.step()

    const process = simulator.snapshot().processes.get(1)
    expect(process?.buffer.has('local-1')).toBe(true)
    expect(process?.buffer.has('v1')).toBe(false)
  })

  it('enforces the per-tick event budget', () => {
    const simulator = new Simulator({
      processIds: [0, 1, 2, 3],
      strategy: new SimpleDelayedBroadcast(0),
      seed: { vertices: [dagVertex('v1', 0)], edges: [] },
      maxEventsPerTick: 2,
    })
    simulator.broadcast(0, 'v1')

    const firstBatch = simulator.runOneTick()
    expect(firstBatch.deliveries).toHaveLength(2)
    expect(firstBatch.budgetExhausted).toBe(true)
    expect(simulator.runOneTick().deliveries).toHaveLength(1)
  })

  it('truncates imported seeds at the first round that misses quorum', () => {
    const simulator = new Simulator({
      processIds: [0],
      strategy: new SimpleDelayedBroadcast(1),
      faultTolerance: 1,
      seed: {
        vertices: [
          dagVertex('r1-a', 1, 1),
          dagVertex('r1-b', 2, 1),
          dagVertex('r2-a', 3, 2),
        ],
        edges: [],
      },
    })

    const dag = simulator.snapshot().processes.get(0)?.dag
    expect(dag?.rounds.get(1)?.size).toBe(2)
    expect(dag?.rounds.has(2)).toBe(false)
  })

  it('blocks round advancement until 2f+1 vertices exist', () => {
    const simulator = new Simulator({
      processIds: [0, 1, 2],
      strategy: new SimpleDelayedBroadcast(1),
      faultTolerance: 1,
      seed: {
        vertices: [dagVertex('r1-a', 1, 1), dagVertex('r1-b', 2, 1)],
        edges: [],
      },
    })

    expect(
      simulator.createVertex(0, content('r2-a', 1, 2)),
    ).toMatchObject({ ok: false, reason: 'round-gated' })

    simulator.createVertex(2, content('remote-r1', 3, 1))
    simulator.flushBuffer(2, 'remote-r1')
    simulator.broadcast(2, 'remote-r1')
    simulator.step()
    simulator.flushBuffer(0, 'remote-r1')

    expect(
      simulator.createVertex(0, content('r2-a', 1, 2)).ok,
    ).toBe(true)
  })

  it('replays deterministically after reset', () => {
    const config: SimulationConfig = {
      processIds: [0, 1, 2],
      strategy: new SimpleDelayedBroadcast(3),
      faultTolerance: 0,
      seed: { vertices: [dagVertex('v1', 0)], edges: [] },
    }
    const simulator = new Simulator(config)
    simulator.createVertex(0, content('local-1', 1, 2))
    simulator.flushBuffer(0, 'local-1')
    simulator.broadcast(0, 'v1')
    simulator.runOneTick()
    const firstRun = canonicalSnapshot(simulator.snapshot())

    simulator.reset()
    simulator.createVertex(0, content('local-1', 1, 2))
    simulator.flushBuffer(0, 'local-1')
    simulator.broadcast(0, 'v1')
    simulator.runOneTick()
    const secondRun = canonicalSnapshot(simulator.snapshot())

    expect(secondRun).toEqual(firstRun)
  })
})
