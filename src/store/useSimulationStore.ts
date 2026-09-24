import { create } from 'zustand'
import { getRoundGridBounds, roundGridPosition, type EdgeId, type VertexId } from '../domain/dag'
import { SimpleDelayedBroadcast } from '../simulation/broadcast'
import { DEFAULT_FAULT_TOLERANCE, MAX_FAULT_TOLERANCE } from '../simulation/roundPolicy'
import {
  createEmptySimulationSnapshot,
  Simulator,
} from '../simulation/simulator'
import type {
  ProcessId,
  ProcessView,
  SimulationResult,
  SimulationSnapshot,
  VertexContent,
} from '../simulation/types'
import { useDagStore } from './useDagStore'

export interface SimulationNotice {
  tone: 'info' | 'success' | 'error'
  message: string
}

interface SimulationActions {
  initialize: (processCount?: number, delay?: number, faultTolerance?: number) => void
  configure: (processCount: number, delay: number, faultTolerance?: number) => void
  setActiveProcess: (processId: ProcessId) => void
  selectVertex: (vertexId: VertexId | null) => void
  selectEdge: (edgeId: EdgeId | null) => void
  createBufferedVertex: () => void
  flushVertex: (vertexId: VertexId) => void
  flushSelectedVertex: () => void
  flushAllBuffers: () => void
  broadcastSelectedVertex: () => void
  step: () => void
  runOneTick: () => void
  runUntilIdle: () => void
  clearNotice: () => void
}

export interface SimulationStore {
  simulator: Simulator | null
  snapshot: SimulationSnapshot
  activeProcessId: ProcessId
  selectedVertexId: VertexId | null
  selectedEdgeId: EdgeId | null
  processCount: number
  delay: number
  faultTolerance: number
  nextLocalVertexSequence: number
  notice: SimulationNotice | null
}

function clampProcessCount(value: number) {
  if (!Number.isSafeInteger(value)) return 4
  return Math.min(5, Math.max(2, value))
}

function normalizeDelay(value: number) {
  if (!Number.isSafeInteger(value)) return 3
  return Math.min(12, Math.max(1, value))
}

function normalizeUiFaultTolerance(value: number | undefined) {
  if (value === undefined) return DEFAULT_FAULT_TOLERANCE
  if (!Number.isSafeInteger(value)) return DEFAULT_FAULT_TOLERANCE
  return Math.min(MAX_FAULT_TOLERANCE, Math.max(0, value))
}

function processLabel(processId: ProcessId) {
  return processId + 1
}

function noticeForResult<T>(
  result: SimulationResult<T>,
  successMessage: string,
): SimulationNotice {
  return result.ok
    ? { tone: 'success', message: successMessage }
    : { tone: 'error', message: result.message }
}

function nextAvailableSource(
  process: ProcessView,
  preferred: number,
  round: number,
) {
  const usedSources = new Set(
    [
      ...process.dag.vertices.values(),
      ...Array.from(process.buffer.values(), (buffered) => buffered.vertex),
    ]
      .filter((vertex) => vertex.round === round)
      .map((vertex) => vertex.source),
  )
  let source = Math.max(1, preferred)
  while (usedSources.has(source)) source += 1
  return source
}

function localVertexContent(
  sequence: number,
  processId: ProcessId,
  process: ProcessView,
  tick: number,
): VertexContent {
  const round = process.statusRound
  const source = nextAvailableSource(process, processId + 1, round)
  const content: VertexContent = {
    id: `sim-v${sequence}`,
    source,
    round,
    wave: Math.ceil(round / 4),
    position: { x: 0, y: 0 },
    blockData: {
      proposer: source,
      payload: `Created locally at tick ${tick}`,
      metadata: { origin: 'local' },
    },
  }
  const bounds = getRoundGridBounds([
    ...process.dag.vertices.values(),
    ...Array.from(process.buffer.values(), (buffered) => buffered.vertex),
    { ...content, status: 'buffered', timestamp: tick },
  ])

  return {
    ...content,
    position: roundGridPosition(round, content.source, bounds),
  }
}

function makeSimulator(
  processCount: number,
  delay: number,
  faultTolerance: number,
) {
  const editor = useDagStore.getState()
  return new Simulator({
    processIds: Array.from({ length: processCount }, (_, processId) => processId),
    strategy: new SimpleDelayedBroadcast(delay),
    faultTolerance,
    seed: {
      processId: 0,
      vertices: Array.from(editor.dag.vertices.values()),
      edges: Array.from(editor.edges.values()),
    },
  })
}

export const useSimulationStore = create<SimulationStore & SimulationActions>()(
  (set, get) => ({
    simulator: null,
    snapshot: createEmptySimulationSnapshot(),
    activeProcessId: 0,
    selectedVertexId: null,
    selectedEdgeId: null,
    processCount: 4,
    delay: 3,
    faultTolerance: DEFAULT_FAULT_TOLERANCE,
    nextLocalVertexSequence: 1,
    notice: null,

    initialize: (
      processCount = 4,
      delay = 3,
      faultTolerance = DEFAULT_FAULT_TOLERANCE,
    ) => {
      const normalizedProcesses = clampProcessCount(processCount)
      const normalizedDelay = normalizeDelay(delay)
      const normalizedFaultTolerance = normalizeUiFaultTolerance(faultTolerance)
      const simulator = makeSimulator(
        normalizedProcesses,
        normalizedDelay,
        normalizedFaultTolerance,
      )
      set({
        simulator,
        snapshot: simulator.snapshot(),
        activeProcessId: 0,
        selectedVertexId: null,
        selectedEdgeId: null,
        processCount: normalizedProcesses,
        delay: normalizedDelay,
        faultTolerance: normalizedFaultTolerance,
        nextLocalVertexSequence: 1,
        notice: {
          tone: 'info',
          message: `Loaded the editor graph into process 1. Other views start empty. Quorum is 2f+1 = ${2 * normalizedFaultTolerance + 1}.`,
        },
      })
    },

    configure: (processCount, delay, faultTolerance) => {
      get().initialize(
        processCount,
        delay,
        faultTolerance ?? get().faultTolerance,
      )
    },

    setActiveProcess: (processId) => {
      const snapshot = get().snapshot
      if (!snapshot.processes.has(processId)) return
      set({
        activeProcessId: processId,
        selectedVertexId: null,
        selectedEdgeId: null,
      })
    },

    selectVertex: (vertexId) => {
      set({ selectedVertexId: vertexId, selectedEdgeId: null })
    },

    selectEdge: (edgeId) => {
      set({ selectedEdgeId: edgeId, selectedVertexId: null })
    },

    createBufferedVertex: () => {
      const state = get()
      const simulator = state.simulator
      const process = state.snapshot.processes.get(state.activeProcessId)
      if (!simulator || !process) return

      const sequence = state.nextLocalVertexSequence
      const result = simulator.createVertex(
        state.activeProcessId,
        localVertexContent(
          sequence,
          state.activeProcessId,
          process,
          state.snapshot.currentTick,
        ),
      )
      const notice = noticeForResult(
        result,
        result.ok
          ? `Created ${result.value} in process ${processLabel(state.activeProcessId)}'s buffer.`
          : '',
      )
      set({
        snapshot: simulator.snapshot(),
        selectedVertexId: result.ok ? result.value : state.selectedVertexId,
        selectedEdgeId: null,
        nextLocalVertexSequence: result.ok ? sequence + 1 : sequence,
        notice,
      })
    },

    flushVertex: (vertexId) => {
      const state = get()
      const simulator = state.simulator
      if (!simulator) return
      const result = simulator.flushBuffer(state.activeProcessId, vertexId)
      set({
        snapshot: simulator.snapshot(),
        selectedVertexId: state.selectedVertexId,
        notice: noticeForResult(
          result,
          result.ok
            ? `Inserted ${vertexId} and ${result.value.insertedEdgeIds.length} pending edge(s).`
            : '',
        ),
      })
    },

    flushSelectedVertex: () => {
      const vertexId = get().selectedVertexId
      if (vertexId) get().flushVertex(vertexId)
    },

    flushAllBuffers: () => {
      const state = get()
      const simulator = state.simulator
      if (!simulator) return
      const result = simulator.flushAllBuffers()
      set({
        snapshot: simulator.snapshot(),
        notice: noticeForResult(
          result,
          result.ok
            ? `Inserted ${result.value.length} buffered vertex/vertices across all views.`
            : '',
        ),
      })
    },

    broadcastSelectedVertex: () => {
      const state = get()
      const simulator = state.simulator
      const vertexId = state.selectedVertexId
      if (!simulator || !vertexId) return
      const result = simulator.broadcast(state.activeProcessId, vertexId)
      set({
        snapshot: simulator.snapshot(),
        notice: noticeForResult(
          result,
          result.ok
            ? `Scheduled ${result.value.messageIds.length} message(s) for ${vertexId}.`
            : '',
        ),
      })
    },

    step: () => {
      const state = get()
      const simulator = state.simulator
      if (!simulator) return
      const delivery = simulator.step()
      set({
        snapshot: simulator.snapshot(),
        notice: delivery
          ? {
              tone:
                delivery.outcome === 'rejected'
                  ? 'error'
                  : delivery.outcome === 'duplicate'
                    ? 'info'
                    : 'success',
              message: delivery.outcome === 'delivered'
                ? `Delivered ${delivery.message.payload.vertex.id} to process ${processLabel(delivery.message.receiver)} at tick ${delivery.tick}.`
                : delivery.outcome === 'duplicate'
                  ? `Process ${delivery.message.receiver} already had ${delivery.message.payload.vertex.id}.`
                  : `Process ${delivery.message.receiver} rejected ${delivery.message.payload.vertex.id}.`,
            }
          : { tone: 'info', message: 'The event queue is empty.' },
      })
    },

    runOneTick: () => {
      const state = get()
      const simulator = state.simulator
      if (!simulator) return
      const batch = simulator.runOneTick()
      set({
        snapshot: simulator.snapshot(),
        notice: {
          tone: batch.deliveries.length > 0 ? 'success' : 'info',
          message:
            batch.deliveries.length > 0
              ? `Processed ${batch.deliveries.length} event(s) at tick ${batch.tick}.`
              : 'No events were due at the next tick.',
        },
      })
    },

    runUntilIdle: () => {
      const simulator = get().simulator
      if (!simulator) return
      const result = simulator.runUntilIdle()
      const snapshot = simulator.snapshot()
      set({
        snapshot,
        notice: {
          tone: result.limitReached ? 'error' : 'success',
          message: result.limitReached
            ? `Stopped at the event safety limit with ${snapshot.queue.length} event(s) remaining.`
            : `Processed ${result.deliveries.length} event(s); the network queue is empty. Buffers remain explicit.`,
        },
      })
    },

    clearNotice: () => {
      set({ notice: null })
    },
  }),
)

