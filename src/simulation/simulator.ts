import {
  insertVertex,
  layoutVerticesByRounds,
  validateConnection,
  type DagEdge,
  type DagVertex,
  type EdgeId,
  type VertexId,
} from '../domain/dag'
import type { OutboundMessage } from './broadcast'
import { PriorityQueue } from './priorityQueue'
import {
  canInsertAtRound,
  countDistinctSourcesAtRound,
  currentRound,
  DEFAULT_FAULT_TOLERANCE,
  normalizeFaultTolerance,
  quorumSize,
} from './roundPolicy'
import type {
  BroadcastResult,
  BufferedVertex,
  DeliveryBatch,
  DeliveryResult,
  FlushResult,
  MessageEvent,
  ProcessId,
  ProcessView,
  RunResult,
  SimulationConfig,
  SimulationEventRecord,
  SimulationFailure,
  SimulationResult,
  SimulationSnapshot,
  Tick,
  VertexContent,
  VertexPacket,
} from './types'

const DEFAULT_MAX_EVENTS_PER_TICK = 1_000
const DEFAULT_LOG_LIMIT = 250

function isProcessId(value: number) {
  return Number.isSafeInteger(value) && value >= 0
}

function isTick(value: number) {
  return Number.isSafeInteger(value) && value >= 0
}

function failure(
  reason: SimulationFailure['reason'],
  message: string,
): SimulationFailure {
  return { ok: false, reason, message }
}

function cloneMetadata(value: Record<string, unknown>) {
  return structuredClone(value)
}

export function cloneVertex(vertex: DagVertex): DagVertex {
  return {
    ...vertex,
    position: { ...vertex.position },
    blockData: {
      ...vertex.blockData,
      metadata: cloneMetadata(vertex.blockData.metadata),
    },
  }
}

function cloneContent(content: VertexContent): VertexContent {
  return {
    ...content,
    position: { ...content.position },
    blockData: {
      ...content.blockData,
      metadata: cloneMetadata(content.blockData.metadata),
    },
  }
}

function cloneEdge(edge: DagEdge): DagEdge {
  return { ...edge }
}

function clonePacket(packet: VertexPacket): VertexPacket {
  return {
    vertex: cloneContent(packet.vertex),
    incidentEdges: packet.incidentEdges.map(cloneEdge),
  }
}

function cloneMessage(message: MessageEvent): MessageEvent {
  return { ...message, payload: clonePacket(message.payload) }
}

function cloneBufferedVertex(buffered: BufferedVertex): BufferedVertex {
  return { ...buffered, vertex: cloneVertex(buffered.vertex) }
}

function isValidContent(content: VertexContent) {
  return (
    content.id.length > 0 &&
    Number.isSafeInteger(content.source) &&
    content.source >= 0 &&
    Number.isSafeInteger(content.round) &&
    content.round >= 0 &&
    Number.isSafeInteger(content.wave) &&
    content.wave >= 0 &&
    Number.isFinite(content.position.x) &&
    Number.isFinite(content.position.y) &&
    Number.isSafeInteger(content.blockData.proposer) &&
    content.blockData.proposer >= 0 &&
    typeof content.blockData.payload === 'string'
  )
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null) return false

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    return (
      left.length === right.length &&
      left.every((value, index) => deepEqual(value, right[index]))
    )
  }

  if (typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as Record<string, unknown>
    const rightRecord = right as Record<string, unknown>
    const leftKeys = Object.keys(leftRecord).sort()
    const rightKeys = Object.keys(rightRecord).sort()
    return (
      deepEqual(leftKeys, rightKeys) &&
      leftKeys.every((key) => deepEqual(leftRecord[key], rightRecord[key]))
    )
  }

  return false
}

function sameContent(left: DagVertex | VertexContent, right: DagVertex | VertexContent) {
  return deepEqual(
    {
      id: left.id,
      source: left.source,
      round: left.round,
      wave: left.wave,
      position: left.position,
      blockData: left.blockData,
    },
    {
      id: right.id,
      source: right.source,
      round: right.round,
      wave: right.wave,
      position: right.position,
      blockData: right.blockData,
    },
  )
}

function compareVertices(left: DagVertex, right: DagVertex) {
  return left.id.localeCompare(right.id)
}

function compareSeedVertices(left: DagVertex, right: DagVertex) {
  return left.round - right.round || left.source - right.source || left.id.localeCompare(right.id)
}

function automaticStrongEdgeId(source: VertexId, target: VertexId) {
  return `auto-${source}-${target}`
}

function sameDirectedPair(left: DagEdge, right: DagEdge) {
  return left.source === right.source && left.target === right.target
}

function compareEdges(left: DagEdge, right: DagEdge) {
  return (
    left.id.localeCompare(right.id) ||
    left.source.localeCompare(right.source) ||
    left.target.localeCompare(right.target)
  )
}

function compareMessages(left: MessageEvent, right: MessageEvent) {
  return (
    left.deliveryTime - right.deliveryTime ||
    left.enqueueSequence - right.enqueueSequence ||
    left.id - right.id
  )
}

function createProcess(id: ProcessId): ProcessView {
  return {
    id,
    statusRound: 1,
    dag: {
      processId: id,
      vertices: new Map(),
      rounds: new Map(),
    },
    edges: new Map(),
    buffer: new Map(),
    pendingEdges: new Map(),
  }
}

function cloneProcessView(process: ProcessView): ProcessView {
  const vertices = new Map(
    Array.from(process.dag.vertices.values())
      .sort(compareVertices)
      .map((vertex) => [vertex.id, cloneVertex(vertex)]),
  )
  const rounds = new Map(
    Array.from(process.dag.rounds.entries())
      .sort(([left], [right]) => left - right)
      .map(([round, ids]) => [round, new Set(Array.from(ids).sort())]),
  )

  return {
    id: process.id,
    statusRound: process.statusRound,
    dag: {
      processId: process.dag.processId,
      vertices,
      rounds,
    },
    edges: new Map(
      Array.from(process.edges.values())
        .sort(compareEdges)
        .map((edge) => [edge.id, cloneEdge(edge)]),
    ),
    buffer: new Map(
      Array.from(process.buffer.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, buffered]) => [id, cloneBufferedVertex(buffered)]),
    ),
    pendingEdges: new Map(
      Array.from(process.pendingEdges.values())
        .sort(compareEdges)
        .map((edge) => [edge.id, cloneEdge(edge)]),
    ),
  }
}

export function createEmptySimulationSnapshot(): SimulationSnapshot {
  return {
    processes: new Map(),
    queue: [],
    currentTick: 0,
    nextEventSequence: 1,
    nextBroadcastSequence: 1,
    faultTolerance: DEFAULT_FAULT_TOLERANCE,
    quorumSize: quorumSize(DEFAULT_FAULT_TOLERANCE),
    log: [],
  }
}

export class Simulator {
  private config!: SimulationConfig
  private processes = new Map<ProcessId, ProcessView>()
  private queue = new PriorityQueue<MessageEvent>(compareMessages)
  private currentTick: Tick = 0
  private nextEventSequence = 1
  private nextEnqueueSequence = 1
  private nextBroadcastSequence = 1
  private nextLogSequence = 1
  private log: SimulationEventRecord[] = []
  private maxEventsPerTick = DEFAULT_MAX_EVENTS_PER_TICK
  private logLimit = DEFAULT_LOG_LIMIT
  private faultTolerance = DEFAULT_FAULT_TOLERANCE

  constructor(config: SimulationConfig) {
    this.reset(config)
  }

  reset(config: SimulationConfig = this.config) {
    this.validateConfig(config)
    this.config = config
    this.processes = new Map(
      Array.from(new Set(config.processIds))
        .sort((left, right) => left - right)
        .map((id) => [id, createProcess(id)]),
    )
    this.queue = new PriorityQueue<MessageEvent>(compareMessages)
    this.currentTick = 0
    this.nextEventSequence = 1
    this.nextEnqueueSequence = 1
    this.nextBroadcastSequence = 1
    this.nextLogSequence = 1
    this.log = []
    this.maxEventsPerTick = config.maxEventsPerTick ?? DEFAULT_MAX_EVENTS_PER_TICK
    this.logLimit = config.logLimit ?? DEFAULT_LOG_LIMIT
    this.faultTolerance = normalizeFaultTolerance(config.faultTolerance)

    if (config.seed) this.seedProcess(config.seed)
  }

  createVertex(
    processId: ProcessId,
    content: VertexContent,
  ): SimulationResult<VertexId> {
    const process = this.processes.get(processId)
    if (!process) {
      return failure('unknown-process', `Process ${processId} does not exist.`)
    }
    if (!isValidContent(content)) {
      return failure('invalid-content', 'Vertex content contains invalid values.')
    }
    if (content.source !== processId + 1) {
      return failure(
        'invalid-content',
        `Process ${processId} can only create blocks authored by source ${processId + 1}.`,
      )
    }
    if (content.round !== process.statusRound) {
      return failure(
        'round-gated',
        `Block ${content.id} targets round ${content.round}, but process ${processId} is accepting round ${process.statusRound}.`,
      )
    }

    const roundGate = canInsertAtRound(
      process.dag,
      content.round,
      this.faultTolerance,
    )
    if (!roundGate.ok) {
      return failure('round-gated', roundGate.message ?? 'The local DAG cannot advance to that round.')
    }

    const existing = process.dag.vertices.get(content.id) ?? process.buffer.get(content.id)?.vertex
    if (existing) {
      return sameContent(existing, content)
        ? failure('duplicate-vertex', `Vertex ${content.id} already exists.`)
        : failure('conflicting-vertex', `Vertex ${content.id} has conflicting content.`)
    }

    const vertex: DagVertex = {
      ...cloneContent(content),
      status: 'buffered',
      timestamp: this.currentTick,
    }
    const buffer = new Map(process.buffer)
    buffer.set(vertex.id, {
      vertex,
      origin: null,
      receivedAt: null,
      broadcastId: null,
    })
    const edges = new Map(process.edges)
    const pendingEdges = new Map(process.pendingEdges)
    this.addAutomaticStrongEdges(vertex, process.dag, edges, pendingEdges)
    this.replaceProcess(processId, {
      ...process,
      buffer,
      edges,
      pendingEdges,
    })
    this.record({
      tick: this.currentTick,
      kind: 'vertex-created',
      detail: `Created ${vertex.id} in process ${processId}'s buffer.`,
      processId,
      vertexId: vertex.id,
    })
    return { ok: true, value: vertex.id }
  }

  flushBuffer(
    processId: ProcessId,
    vertexId: VertexId,
  ): SimulationResult<FlushResult> {
    const process = this.processes.get(processId)
    if (!process) {
      return failure('unknown-process', `Process ${processId} does not exist.`)
    }

    const buffered = process.buffer.get(vertexId)
    if (!buffered) {
      return failure('vertex-not-found', `${vertexId} is not buffered in process ${processId}.`)
    }
    if (buffered.vertex.round !== process.statusRound) {
      return failure(
        'round-gated',
        `Block ${vertexId} targets round ${buffered.vertex.round}, but process ${processId} is accepting round ${process.statusRound}.`,
      )
    }

    const roundGate = canInsertAtRound(
      process.dag,
      buffered.vertex.round,
      this.faultTolerance,
    )
    if (!roundGate.ok) {
      return failure('round-gated', roundGate.message ?? 'The local DAG cannot advance to that round.')
    }

    const vertex: DagVertex = {
      ...cloneVertex(buffered.vertex),
      status: 'in-dag',
      timestamp: this.currentTick,
    }
    const insertedDag = insertVertex(process.dag, vertex)
    if (!insertedDag) {
      return failure(
        'conflicting-vertex',
        `${vertexId} could not be inserted into the local DAG.`,
      )
    }
    const dag = layoutVerticesByRounds(insertedDag)

    const buffer = new Map(process.buffer)
    buffer.delete(vertexId)
    const nextStatusRound =
      countDistinctSourcesAtRound(dag, process.statusRound) >= quorumSize(this.faultTolerance)
        ? process.statusRound + 1
        : process.statusRound
    this.replaceProcess(processId, {
      ...process,
      statusRound: nextStatusRound,
      dag,
      buffer,
    })
    this.record({
      tick: this.currentTick,
      kind: 'vertex-inserted',
      detail: `Inserted ${vertexId} into process ${processId}'s DAG at round ${buffered.vertex.round}.`,
      processId,
      vertexId,
    })
    if (nextStatusRound !== process.statusRound) {
      this.record({
        tick: this.currentTick,
        kind: 'round-advanced',
        detail: `Process ${processId} advanced to round ${nextStatusRound} after reaching 2f+1.`,
        processId,
      })
    }
    const insertedEdgeIds = this.applyPendingEdges(processId)
    return { ok: true, value: { vertexId, insertedEdgeIds } }
  }

  flushAllBuffers(): SimulationResult<FlushResult[]> {
    const results: FlushResult[] = []
    const processIds = Array.from(this.processes.keys()).sort((left, right) => left - right)

    for (const processId of processIds) {
      let madeProgress = true
      while (madeProgress) {
        madeProgress = false
        const process = this.processes.get(processId)
        if (!process) break
        const vertexIds = Array.from(process.buffer.keys()).sort()
        for (const vertexId of vertexIds) {
          const result = this.flushBuffer(processId, vertexId)
          if (result.ok) {
            results.push(result.value)
            madeProgress = true
          }
        }
      }
    }

    return { ok: true, value: results }
  }

  broadcast(
    processId: ProcessId,
    vertexId: VertexId,
  ): SimulationResult<BroadcastResult> {
    const process = this.processes.get(processId)
    if (!process) {
      return failure('unknown-process', `Process ${processId} does not exist.`)
    }
    if (process.buffer.has(vertexId)) {
      return failure(
        'vertex-buffered',
        `Flush ${vertexId} into the local DAG before broadcasting.`,
      )
    }

    const vertex = process.dag.vertices.get(vertexId)
    if (!vertex) {
      return failure('vertex-not-found', `${vertexId} is not in process ${processId}'s DAG.`)
    }

    const incidentEdges = Array.from(process.edges.values())
      .filter((edge) => edge.source === vertexId || edge.target === vertexId)
      .sort(compareEdges)
      .map(cloneEdge)
    const payload: VertexPacket = {
      vertex: cloneContent(vertex),
      incidentEdges,
    }
    const receiverIds = Array.from(this.processes.keys())
    const drafts = this.config.strategy.broadcast({
      now: this.currentTick,
      broadcastId: this.nextBroadcastSequence,
      sender: processId,
      vertex: payload.vertex,
      incidentEdges,
      receiverIds,
    })

    const prepared = this.prepareBroadcastMessages(drafts, processId, payload)
    if (!prepared.ok) return prepared

    const broadcastId = this.nextBroadcastSequence
    this.nextBroadcastSequence += 1
    const messageIds: number[] = []

    for (const draft of prepared.value) {
      const message: MessageEvent = {
        type: 'vertex-delivery',
        id: this.nextEventSequence,
        broadcastId,
        sender: draft.message.sender,
        receiver: draft.message.receiver,
        payload: clonePacket(draft.message.payload),
        deliveryTime: draft.message.deliveryTime,
        enqueueSequence: this.nextEnqueueSequence,
      }
      this.nextEventSequence += 1
      this.nextEnqueueSequence += 1
      this.queue.push(message)
      messageIds.push(message.id)
      this.record({
        tick: this.currentTick,
        kind: 'broadcast-scheduled',
        detail: `Scheduled ${vertexId} to process ${message.receiver} at tick ${message.deliveryTime}.`,
        processId,
        vertexId,
        messageId: message.id,
        broadcastId,
        sender: message.sender,
        receiver: message.receiver,
      })
    }

    if (messageIds.length === 0) {
      this.record({
        tick: this.currentTick,
        kind: 'broadcast-scheduled',
        detail: `Broadcast ${vertexId} produced no messages.`,
        processId,
        vertexId,
        broadcastId,
      })
    }

    return { ok: true, value: { broadcastId, messageIds } }
  }

  step(): DeliveryResult | null {
    const message = this.queue.pop()
    if (!message) return null

    this.currentTick = Math.max(this.currentTick, message.deliveryTime)
    return this.deliver(message)
  }

  runOneTick(): DeliveryBatch {
    const nextDeliveryTime = this.queue.peek()?.deliveryTime
    if (nextDeliveryTime === undefined) {
      return { tick: this.currentTick, deliveries: [], budgetExhausted: false }
    }

    const deliveries: DeliveryResult[] = []
    while (deliveries.length < this.maxEventsPerTick) {
      const next = this.queue.peek()
      if (!next || next.deliveryTime !== nextDeliveryTime) break
      const delivery = this.step()
      if (!delivery) break
      deliveries.push(delivery)
    }

    return {
      tick: nextDeliveryTime,
      deliveries,
      budgetExhausted: this.queue.peek()?.deliveryTime === nextDeliveryTime,
    }
  }

  runUntilIdle(limit = 10_000): RunResult {
    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw new Error(`Run limit must be a non-negative safe integer: ${limit}`)
    }

    const deliveries: DeliveryResult[] = []
    while (deliveries.length < limit) {
      const delivery = this.step()
      if (!delivery) break
      deliveries.push(delivery)
    }

    return {
      deliveries,
      queueEmpty: this.queue.size === 0,
      limitReached: this.queue.size > 0 && deliveries.length >= limit,
    }
  }

  snapshot(): SimulationSnapshot {
    const processes = new Map(
      Array.from(this.processes.keys())
        .sort((left, right) => left - right)
        .map((id) => {
          const process = this.processes.get(id)
          return [id, process ? cloneProcessView(process) : createProcess(id)]
        }),
    )

    return {
      processes,
      queue: this.queue.toSortedArray().map(cloneMessage),
      currentTick: this.currentTick,
      nextEventSequence: this.nextEventSequence,
      nextBroadcastSequence: this.nextBroadcastSequence,
      faultTolerance: this.faultTolerance,
      quorumSize: quorumSize(this.faultTolerance),
      log: this.log.map((event) => ({ ...event })),
    }
  }

  private validateConfig(config: SimulationConfig) {
    if (
      config.processIds.length === 0 ||
      config.processIds.some((id) => !isProcessId(id)) ||
      new Set(config.processIds).size !== config.processIds.length
    ) {
      throw new Error('processIds must contain unique non-negative safe integers')
    }
    if (
      config.maxEventsPerTick !== undefined &&
      (!Number.isSafeInteger(config.maxEventsPerTick) || config.maxEventsPerTick <= 0)
    ) {
      throw new Error('maxEventsPerTick must be a positive safe integer')
    }
    if (
      config.logLimit !== undefined &&
      (!Number.isSafeInteger(config.logLimit) || config.logLimit <= 0)
    ) {
      throw new Error('logLimit must be a positive safe integer')
    }
    if (config.seed && !isProcessId(config.seed.processId ?? 0)) {
      throw new Error('seed.processId must be a non-negative safe integer')
    }
    if (config.seed && !config.processIds.includes(config.seed.processId ?? 0)) {
      throw new Error('seed.processId must be present in processIds')
    }
  }

  private seedProcess(seed: NonNullable<SimulationConfig['seed']>) {
    const processId = seed.processId ?? 0
    const process = this.processes.get(processId)
    if (!process) return

    let dag = process.dag
    const edges = new Map<EdgeId, DagEdge>()
    const pendingEdges = new Map<EdgeId, DagEdge>()
    const vertices = Array.from(seed.vertices).sort(compareSeedVertices)
    for (const sourceVertex of vertices) {
      const vertex: DagVertex = {
        ...cloneVertex(sourceVertex),
        status: 'in-dag',
        timestamp: 0,
      }
      const roundGate = canInsertAtRound(
        dag,
        vertex.round,
        this.faultTolerance,
        true,
      )
      if (!roundGate.ok) continue
      const nextDag = insertVertex(dag, vertex)
      if (!nextDag) continue
      dag = nextDag
      this.addAutomaticStrongEdges(vertex, dag, edges, pendingEdges)
    }
    dag = layoutVerticesByRounds(dag)

    const seedEdges = Array.from(seed.edges).sort(compareEdges)
    for (const edge of seedEdges) {
      if (edge.kind !== 'strong') continue
      if (
        Array.from(edges.values()).some((existing) =>
          sameDirectedPair(existing, edge),
        )
      ) {
        continue
      }
      if (edges.has(edge.id) || pendingEdges.has(edge.id)) continue
      const validation = validateConnection(
        dag.vertices,
        edges.values(),
        edge.source,
        edge.target,
      )
      if (validation.ok) edges.set(edge.id, cloneEdge(edge))
    }

    const latestRound = currentRound(dag)
    const statusRound =
      latestRound === 0
        ? 1
        : countDistinctSourcesAtRound(dag, latestRound) >= quorumSize(this.faultTolerance)
          ? latestRound + 1
          : latestRound
    this.replaceProcess(processId, {
      ...process,
      statusRound,
      dag,
      edges,
      pendingEdges,
    })
  }

  private addAutomaticStrongEdges(
    vertex: DagVertex,
    dag: ProcessView['dag'],
    edges: Map<EdgeId, DagEdge>,
    pendingEdges: Map<EdgeId, DagEdge>,
  ) {
    const predecessors = Array.from(dag.vertices.values())
      .filter((candidate) => candidate.round === vertex.round - 1)
      .sort(compareVertices)

    for (const predecessor of predecessors) {
      const existing = [
        ...Array.from(edges.values()),
        ...Array.from(pendingEdges.values()),
      ].find((edge) => sameDirectedPair(edge, {
        id: '',
        source: vertex.id,
        target: predecessor.id,
        kind: 'strong',
      }))

      if (existing) {
        if (existing.kind === 'strong') continue
        const upgraded = {
          ...existing,
          kind: 'strong' as const,
          reference: existing.reference ?? {
            capturedAt: this.currentTick,
            originProcess: Math.max(0, vertex.source - 1),
          },
        }
        if (edges.has(existing.id)) edges.set(existing.id, upgraded)
        else pendingEdges.set(existing.id, upgraded)
        continue
      }

      const edge: DagEdge = {
        id: automaticStrongEdgeId(vertex.id, predecessor.id),
        source: vertex.id,
        target: predecessor.id,
        kind: 'strong',
        reference: {
          capturedAt: this.currentTick,
          originProcess: Math.max(0, vertex.source - 1),
        },
      }
      if (dag.vertices.has(vertex.id)) edges.set(edge.id, edge)
      else pendingEdges.set(edge.id, edge)
    }
  }

  private replaceProcess(processId: ProcessId, process: ProcessView) {
    this.processes.set(processId, process)
  }

  private prepareBroadcastMessages(
    drafts: readonly OutboundMessage[],
    sender: ProcessId,
    sourcePayload: VertexPacket,
  ): SimulationResult<
    Array<{
      message: MessageEvent
      deliveryTime: Tick
    }>
  > {
    const prepared: Array<{
      message: MessageEvent
      deliveryTime: Tick
    }> = []

    for (const draft of drafts) {
      const deliveryTime = this.currentTick + draft.delay
      if (
        draft.sender !== sender ||
        !this.processes.has(draft.receiver) ||
        draft.receiver === sender ||
        !isTick(deliveryTime) ||
        !sameContent(draft.payload.vertex, sourcePayload.vertex)
      ) {
        return failure(
          'invalid-broadcast',
          'The broadcast strategy produced an invalid message.',
        )
      }

      prepared.push({
        message: {
          type: 'vertex-delivery',
          id: 0,
          broadcastId: 0,
          sender: draft.sender,
          receiver: draft.receiver,
          payload: clonePacket(draft.payload),
          deliveryTime,
          enqueueSequence: 0,
        },
        deliveryTime,
      })
    }

    prepared.sort(
      (left, right) =>
        left.deliveryTime - right.deliveryTime ||
        left.message.receiver - right.message.receiver ||
        left.message.payload.vertex.id.localeCompare(right.message.payload.vertex.id) ||
        left.message.sender - right.message.sender,
    )

    if (
      prepared.some(
        (item, index) =>
          index > 0 &&
          item.deliveryTime === prepared[index - 1].deliveryTime &&
          item.message.receiver === prepared[index - 1].message.receiver &&
          item.message.payload.vertex.id === prepared[index - 1].message.payload.vertex.id,
      )
    ) {
      return failure(
        'invalid-broadcast',
        'The broadcast strategy scheduled duplicate messages for the same receiver and vertex.',
      )
    }

    return { ok: true, value: prepared }
  }

  private deliver(message: MessageEvent): DeliveryResult {
    const process = this.processes.get(message.receiver)
    if (!process) {
      this.record({
        tick: this.currentTick,
        kind: 'message-rejected',
        detail: `Dropped message ${message.id}: receiver ${message.receiver} no longer exists.`,
        messageId: message.id,
        broadcastId: message.broadcastId,
        vertexId: message.payload.vertex.id,
        receiver: message.receiver,
        sender: message.sender,
      })
      return { message, tick: this.currentTick, outcome: 'rejected', insertedEdgeIds: [] }
    }

    const existing =
      process.dag.vertices.get(message.payload.vertex.id) ??
      process.buffer.get(message.payload.vertex.id)?.vertex
    if (existing) {
      const duplicate = sameContent(existing, message.payload.vertex)
      this.record({
        tick: this.currentTick,
        kind: duplicate ? 'message-duplicate' : 'message-rejected',
        detail: duplicate
          ? `Ignored duplicate ${message.payload.vertex.id} at process ${message.receiver}.`
          : `Rejected conflicting ${message.payload.vertex.id} at process ${message.receiver}.`,
        processId: message.receiver,
        messageId: message.id,
        broadcastId: message.broadcastId,
        vertexId: message.payload.vertex.id,
        receiver: message.receiver,
        sender: message.sender,
      })
      return {
        message,
        tick: this.currentTick,
        outcome: duplicate ? 'duplicate' : 'rejected',
        insertedEdgeIds: [],
      }
    }

    const vertex: DagVertex = {
      ...cloneContent(message.payload.vertex),
      status: 'deliverable',
      timestamp: this.currentTick,
    }
    const buffer = new Map(process.buffer)
    buffer.set(vertex.id, {
      vertex,
      origin: message.sender,
      receivedAt: this.currentTick,
      broadcastId: message.broadcastId,
    })
    const edges = new Map(process.edges)
    const pendingEdges = new Map(process.pendingEdges)
    for (const edge of message.payload.incidentEdges.filter(
      (candidate) => candidate.kind === 'strong',
    )) {
      const pending = this.mergePendingEdge(process, edges, pendingEdges, edge)
      if (!pending.ok) {
        this.record({
          tick: this.currentTick,
          kind: 'edge-rejected',
          detail: pending.message,
          processId: message.receiver,
          edgeId: edge.id,
          messageId: message.id,
          broadcastId: message.broadcastId,
          receiver: message.receiver,
          sender: message.sender,
        })
      }
    }

    this.replaceProcess(message.receiver, {
      ...process,
      buffer,
      edges,
      pendingEdges,
    })
    const insertedEdgeIds = this.applyPendingEdges(message.receiver)
    this.record({
      tick: this.currentTick,
      kind: 'message-delivered',
      detail: `Delivered ${vertex.id} from process ${message.sender} to process ${message.receiver}.`,
      processId: message.receiver,
      messageId: message.id,
      broadcastId: message.broadcastId,
      vertexId: vertex.id,
      receiver: message.receiver,
      sender: message.sender,
    })

    return { message, tick: this.currentTick, outcome: 'delivered', insertedEdgeIds }
  }

  private mergePendingEdge(
    process: ProcessView,
    edges: Map<EdgeId, DagEdge>,
    pendingEdges: Map<EdgeId, DagEdge>,
    incoming: DagEdge,
  ): SimulationResult<void> {
    const sameId =
      edges.get(incoming.id) ??
      process.pendingEdges.get(incoming.id) ??
      pendingEdges.get(incoming.id)
    if (sameId) {
      if (!sameDirectedPair(sameId, incoming)) {
        return failure('invalid-broadcast', `Edge ${incoming.id} conflicts with an existing edge.`)
      }
      return this.mergeEdgeKind(sameId, incoming, edges, pendingEdges)
    }

    const directedEdges = [...edges.values(), ...pendingEdges.values()].filter(
      (edge) => sameDirectedPair(edge, incoming),
    )
    const sameDirection = directedEdges[0]
    if (sameDirection) {
      return this.mergeEdgeKind(sameDirection, incoming, edges, pendingEdges)
    }

    pendingEdges.set(incoming.id, cloneEdge(incoming))
    return { ok: true, value: undefined }
  }

  private mergeEdgeKind(
    existing: DagEdge,
    incoming: DagEdge,
    edges: Map<EdgeId, DagEdge>,
    pendingEdges: Map<EdgeId, DagEdge>,
  ): SimulationResult<void> {
    if (existing.kind === 'strong' || incoming.kind === 'weak') {
      return { ok: true, value: undefined }
    }

    const upgraded = {
      ...existing,
      kind: 'strong' as const,
      reference: incoming.reference ?? existing.reference,
    }
    if (edges.has(existing.id)) edges.set(existing.id, upgraded)
    else pendingEdges.set(existing.id, upgraded)
    return { ok: true, value: undefined }
  }

  private applyPendingEdges(processId: ProcessId) {
    const process = this.processes.get(processId)
    if (!process) return []

    const edges = new Map(process.edges)
    const pendingEdges = new Map(process.pendingEdges)
    const insertedEdgeIds: EdgeId[] = []
    const candidates = Array.from(pendingEdges.values()).sort(compareEdges)

    for (const edge of candidates) {
      if (!process.dag.vertices.has(edge.source) || !process.dag.vertices.has(edge.target)) {
        continue
      }

      const validation = validateConnection(
        process.dag.vertices,
        edges.values(),
        edge.source,
        edge.target,
      )
      pendingEdges.delete(edge.id)
      if (!validation.ok) {
        this.record({
          tick: this.currentTick,
          kind: 'edge-rejected',
          detail: `Rejected ${edge.id}: ${validation.reason}.`,
          processId,
          edgeId: edge.id,
        })
        continue
      }

      edges.set(edge.id, cloneEdge(edge))
      insertedEdgeIds.push(edge.id)
      this.record({
        tick: this.currentTick,
        kind: 'edge-inserted',
        detail: `Inserted ${edge.kind} edge ${edge.id} into process ${processId}.`,
        processId,
        edgeId: edge.id,
      })
    }

    this.replaceProcess(processId, { ...process, edges, pendingEdges })
    return insertedEdgeIds
  }

  private record(
    event: Omit<SimulationEventRecord, 'id'>,
  ) {
    this.log.push({ id: this.nextLogSequence, ...event })
    this.nextLogSequence += 1
    if (this.log.length > this.logLimit) {
      this.log.splice(0, this.log.length - this.logLimit)
    }
  }
}
