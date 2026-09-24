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

export interface StrongReferenceMetadata {
  capturedAt: number
  originProcess: number
}

export interface DagEdge {
  id: EdgeId
  source: VertexId
  target: VertexId
  kind: EdgeKind
  reference?: StrongReferenceMetadata
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
  | 'invalid-edge'

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

export const DAG_LAYOUT = {
  originX: 100,
  originY: 80,
  columnWidth: 220,
  rowHeight: 125,
  nodeWidth: 72,
  nodeHeight: 72,
  headerWidth: 70,
  headerHeight: 45,
  minRound: 1,
  minSource: 1,
} as const

export interface RoundGridBounds {
  minRound: number
  maxRound: number
  nextRound: number
  minSource: number
  maxSource: number
  rounds: number[]
  sources: number[]
  originX: number
  originY: number
  columnWidth: number
  rowHeight: number
  nodeWidth: number
  nodeHeight: number
  headerWidth: number
  headerHeight: number
}

function createRoundGridBounds(
  roundValues: Iterable<number>,
  sourceValues: Iterable<number>,
): RoundGridBounds {
  const roundsPresent = Array.from(new Set(roundValues)).sort(
    (left, right) => left - right,
  )
  const sourcesPresent = Array.from(new Set(sourceValues)).sort(
    (left, right) => left - right,
  )
  const minRound = Math.min(
    DAG_LAYOUT.minRound,
    roundsPresent[0] ?? DAG_LAYOUT.minRound,
  )
  const maxRound = roundsPresent[roundsPresent.length - 1] ?? minRound
  const minSource = Math.min(
    DAG_LAYOUT.minSource,
    sourcesPresent[0] ?? DAG_LAYOUT.minSource,
  )
  const maxSource = sourcesPresent[sourcesPresent.length - 1] ?? minSource
  const nextRound = maxRound + 1
  const rounds = Array.from(
    { length: nextRound - minRound + 1 },
    (_, index) => minRound + index,
  )
  const sources = Array.from(
    { length: maxSource - minSource + 1 },
    (_, index) => minSource + index,
  )

  return {
    minRound,
    maxRound,
    nextRound,
    minSource,
    maxSource,
    rounds,
    sources,
    originX: DAG_LAYOUT.originX,
    originY: DAG_LAYOUT.originY,
    columnWidth: DAG_LAYOUT.columnWidth,
    rowHeight: DAG_LAYOUT.rowHeight,
    nodeWidth: DAG_LAYOUT.nodeWidth,
    nodeHeight: DAG_LAYOUT.nodeHeight,
    headerWidth: DAG_LAYOUT.headerWidth,
    headerHeight: DAG_LAYOUT.headerHeight,
  }
}

export function getRoundGridBounds(
  vertices: Iterable<DagVertex>,
): RoundGridBounds {
  const values = Array.from(vertices)
  return createRoundGridBounds(
    values.map((vertex) => vertex.round),
    values.map((vertex) => vertex.source),
  )
}

export function getLocalDagRoundGridBounds(dag: LocalDag): RoundGridBounds {
  const roundValues = new Set(dag.rounds.keys())
  for (const vertex of dag.vertices.values()) roundValues.add(vertex.round)
  return createRoundGridBounds(
    roundValues,
    Array.from(dag.vertices.values(), (vertex) => vertex.source),
  )
}

export function roundGridPosition(
  round: number,
  source: number,
  bounds: RoundGridBounds,
): Point {
  return {
    x: bounds.originX + (round - bounds.minRound) * bounds.columnWidth,
    y: bounds.originY + (source - bounds.minSource) * bounds.rowHeight,
  }
}

export function roundGridColumnCenter(
  round: number,
  bounds: RoundGridBounds,
): number {
  return roundGridPosition(round, bounds.minSource, bounds).x + bounds.nodeWidth / 2
}

export function roundGridRowCenter(
  source: number,
  bounds: RoundGridBounds,
): number {
  return roundGridPosition(bounds.minRound, source, bounds).y + bounds.nodeHeight / 2
}

export function layoutVerticesByRounds(dag: LocalDag): LocalDag {
  const bounds = getLocalDagRoundGridBounds(dag)
  const vertices = new Map(
    Array.from(dag.vertices.values(), (vertex) => [
      vertex.id,
      {
        ...vertex,
        position: roundGridPosition(vertex.round, vertex.source, bounds),
      },
    ]),
  )

  return { ...dag, vertices }
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
