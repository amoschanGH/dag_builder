export const VERTEX_STATUSES = [
  'buffered',
  'deliverable',
  'in-dag',
  'committed',
  'delivered',
] as const

export type VertexStatus = (typeof VERTEX_STATUSES)[number]
export type VertexId = string
export type EdgeId = string
export type EdgeKind = 'strong' | 'weak'

export interface Point {
  x: number
  y: number
}

export interface BlockData {
  proposer: number
  payload: string
  metadata: Record<string, unknown>
}

export interface DagVertex {
  id: VertexId
  source: number
  round: number
  wave: number
  position: Point
  blockData: BlockData
  status: VertexStatus
  timestamp: number
}

export interface DagEdge {
  id: EdgeId
  source: VertexId
  target: VertexId
  kind: EdgeKind
}

export interface LocalDag {
  processId: number
  vertices: Map<VertexId, DagVertex>
  rounds: Map<number, Set<VertexId>>
}

export type VertexPatch = Partial<
  Pick<DagVertex, 'source' | 'round' | 'wave' | 'position' | 'status'>
> & {
  blockData?: Partial<BlockData>
}

export type ConnectionRejection =
  | 'missing-vertex'
  | 'self-loop'
  | 'duplicate-edge'
  | 'cycle'

export type ConnectionValidation =
  | { ok: true }
  | { ok: false; reason: ConnectionRejection }

function addToRoundIndex(
  rounds: Map<number, Set<VertexId>>,
  round: number,
  vertexId: VertexId,
) {
  const roundVertices = new Set(rounds.get(round) ?? [])
  roundVertices.add(vertexId)
  rounds.set(round, roundVertices)
}

function removeFromRoundIndex(
  rounds: Map<number, Set<VertexId>>,
  round: number,
  vertexId: VertexId,
) {
  const roundVertices = rounds.get(round)
  if (!roundVertices) return

  const nextRoundVertices = new Set(roundVertices)
  nextRoundVertices.delete(vertexId)

  if (nextRoundVertices.size === 0) {
    rounds.delete(round)
  } else {
    rounds.set(round, nextRoundVertices)
  }
}

function hasConflictingSlot(
  vertices: Map<VertexId, DagVertex>,
  vertex: DagVertex,
) {
  for (const candidate of vertices.values()) {
    if (
      candidate.id !== vertex.id &&
      candidate.source === vertex.source &&
      candidate.round === vertex.round
    ) {
      return true
    }
  }

  return false
}

export function createLocalDag(processId = 0): LocalDag {
  return {
    processId,
    vertices: new Map(),
    rounds: new Map(),
  }
}

export function insertVertex(
  dag: LocalDag,
  vertex: DagVertex,
): LocalDag | null {
  if (dag.vertices.has(vertex.id) || hasConflictingSlot(dag.vertices, vertex)) {
    return null
  }

  const vertices = new Map(dag.vertices)
  const rounds = new Map(dag.rounds)
  vertices.set(vertex.id, vertex)
  addToRoundIndex(rounds, vertex.round, vertex.id)

  return { ...dag, vertices, rounds }
}

export function patchVertex(
  dag: LocalDag,
  vertexId: VertexId,
  patch: VertexPatch,
): LocalDag | null {
  const current = dag.vertices.get(vertexId)
  if (!current) return null

  const blockData = patch.blockData
    ? { ...current.blockData, ...patch.blockData }
    : current.blockData
  const nextVertex: DagVertex = { ...current, ...patch, blockData }

  if (nextVertex.source !== current.source) {
    nextVertex.blockData.proposer = nextVertex.source
  }

  if (hasConflictingSlot(dag.vertices, nextVertex)) return null

  const vertices = new Map(dag.vertices)
  const rounds = new Map(dag.rounds)
  vertices.set(vertexId, nextVertex)

  if (current.round !== nextVertex.round) {
    removeFromRoundIndex(rounds, current.round, vertexId)
    addToRoundIndex(rounds, nextVertex.round, vertexId)
  }

  return { ...dag, vertices, rounds }
}

export function removeVertex(
  dag: LocalDag,
  vertexId: VertexId,
): LocalDag | null {
  const vertex = dag.vertices.get(vertexId)
  if (!vertex) return null

  const vertices = new Map(dag.vertices)
  const rounds = new Map(dag.rounds)
  vertices.delete(vertexId)
  removeFromRoundIndex(rounds, vertex.round, vertexId)

  return { ...dag, vertices, rounds }
}

function hasPath(
  edges: Iterable<DagEdge>,
  start: VertexId,
  destination: VertexId,
) {
  const adjacency = new Map<VertexId, VertexId[]>()
  for (const edge of edges) {
    const targets = adjacency.get(edge.source) ?? []
    targets.push(edge.target)
    adjacency.set(edge.source, targets)
  }

  const pending = [start]
  const visited = new Set<VertexId>()

  while (pending.length > 0) {
    const current = pending.pop()
    if (!current || visited.has(current)) continue

    if (current === destination) return true
    visited.add(current)
    pending.push(...(adjacency.get(current) ?? []))
  }

  return false
}

export function validateConnection(
  vertices: Map<VertexId, DagVertex>,
  edges: Iterable<DagEdge>,
  source: VertexId,
  target: VertexId,
): ConnectionValidation {
  if (!vertices.has(source) || !vertices.has(target)) {
    return { ok: false, reason: 'missing-vertex' }
  }

  if (source === target) {
    return { ok: false, reason: 'self-loop' }
  }

  const edgeList = Array.from(edges)
  for (const edge of edgeList) {
    if (edge.source === source && edge.target === target) {
      return { ok: false, reason: 'duplicate-edge' }
    }
  }

  if (hasPath(edgeList, target, source)) {
    return { ok: false, reason: 'cycle' }
  }

  return { ok: true }
}
