import type {
  DagEdge,
  DagVertex,
  EdgeId,
  LocalDag,
  VertexId,
} from '../domain/dag'
import type { BroadcastStrategy } from './broadcast'

export type ProcessId = number
export type Tick = number

export type VertexContent = Omit<DagVertex, 'status' | 'timestamp'>

export interface VertexPacket {
  vertex: VertexContent
  incidentEdges: readonly DagEdge[]
}

export interface BufferedVertex {
  vertex: DagVertex
  origin: ProcessId | null
  receivedAt: Tick | null
  broadcastId: number | null
}

export interface ProcessView {
  id: ProcessId
  statusRound: number
  dag: LocalDag
  edges: Map<EdgeId, DagEdge>
  buffer: Map<VertexId, BufferedVertex>
  pendingEdges: Map<EdgeId, DagEdge>
}

export interface MessageEvent {
  type: 'vertex-delivery'
  id: number
  broadcastId: number
  sender: ProcessId
  receiver: ProcessId
  payload: VertexPacket
  deliveryTime: Tick
  enqueueSequence: number
}

export type SimulationEventKind =
  | 'vertex-created'
  | 'vertex-inserted'
  | 'broadcast-scheduled'
  | 'message-delivered'
  | 'message-duplicate'
  | 'message-rejected'
  | 'edge-inserted'
  | 'edge-rejected'
  | 'round-advanced'

export interface SimulationEventRecord {
  id: number
  tick: Tick
  kind: SimulationEventKind
  detail: string
  processId?: ProcessId
  vertexId?: VertexId
  edgeId?: EdgeId
  messageId?: number
  broadcastId?: number
  sender?: ProcessId
  receiver?: ProcessId
}

export interface SimulationSeed {
  processId?: ProcessId
  vertices: readonly DagVertex[]
  edges: readonly DagEdge[]
}

export interface SimulationConfig {
  processIds: readonly ProcessId[]
  strategy: BroadcastStrategy
  seed?: SimulationSeed
  maxEventsPerTick?: number
  logLimit?: number
  faultTolerance?: number
}

export type SimulationRejection =
  | 'invalid-config'
  | 'unknown-process'
  | 'invalid-content'
  | 'duplicate-vertex'
  | 'conflicting-vertex'
  | 'vertex-buffered'
  | 'vertex-not-found'
  | 'invalid-broadcast'
  | 'queue-empty'
  | 'round-gated'

export interface SimulationFailure {
  ok: false
  reason: SimulationRejection
  message: string
}

export interface SimulationSuccess<T> {
  ok: true
  value: T
}

export type SimulationResult<T> = SimulationSuccess<T> | SimulationFailure

export interface FlushResult {
  vertexId: VertexId
  insertedEdgeIds: EdgeId[]
}

export interface BroadcastResult {
  broadcastId: number
  messageIds: number[]
}

export type DeliveryOutcome = 'delivered' | 'duplicate' | 'rejected'

export interface DeliveryResult {
  message: MessageEvent
  tick: Tick
  outcome: DeliveryOutcome
  insertedEdgeIds: EdgeId[]
}

export interface DeliveryBatch {
  tick: Tick
  deliveries: DeliveryResult[]
  budgetExhausted: boolean
}

export interface RunResult {
  deliveries: DeliveryResult[]
  queueEmpty: boolean
  limitReached: boolean
}

export interface SimulationSnapshot {
  processes: Map<ProcessId, ProcessView>
  queue: readonly MessageEvent[]
  currentTick: Tick
  nextEventSequence: number
  nextBroadcastSequence: number
  faultTolerance: number
  quorumSize: number
  log: readonly SimulationEventRecord[]
}
