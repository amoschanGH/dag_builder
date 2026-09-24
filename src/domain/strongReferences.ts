import type { DagEdge, DagVertex, EdgeId, VertexId } from './dag'

export interface StrongHistoryEntry {
  vertex: DagVertex
  depth: number
  viaEdgeId: EdgeId | null
}

export interface StrongReferenceDetails {
  edge: DagEdge
  from: DagVertex
  to: DagVertex
  roundDelta: number
  history: StrongHistoryEntry[]
}

export interface StrongCausalHistory {
  vertexIds: Set<VertexId>
  edgeIds: Set<EdgeId>
}

function compareEdges(left: DagEdge, right: DagEdge) {
  return left.id.localeCompare(right.id)
}

function buildOutgoingEdges(edges: Iterable<DagEdge>, excludedEdgeId?: EdgeId) {
  const outgoing = new Map<VertexId, DagEdge[]>()
  for (const candidate of edges) {
    if (candidate.kind !== 'strong' || candidate.id === excludedEdgeId) continue
    const list = outgoing.get(candidate.source) ?? []
    list.push(candidate)
    outgoing.set(candidate.source, list)
  }
  for (const list of outgoing.values()) list.sort(compareEdges)
  return outgoing
}

function traceHistory(
  startVertexId: VertexId,
  vertices: Map<VertexId, DagVertex>,
  outgoing: Map<VertexId, DagEdge[]>,
  maxDepth: number,
  initialViaEdgeId: EdgeId | null = null,
) {
  const history: StrongHistoryEntry[] = []
  const visited = new Set<VertexId>()
  const queue: Array<{ vertexId: VertexId; depth: number; viaEdgeId: EdgeId | null }> = [
    { vertexId: startVertexId, depth: 0, viaEdgeId: initialViaEdgeId },
  ]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || visited.has(current.vertexId) || current.depth > maxDepth) continue
    const vertex = vertices.get(current.vertexId)
    if (!vertex) continue
    visited.add(vertex.id)
    history.push({
      vertex,
      depth: current.depth,
      viaEdgeId: current.viaEdgeId,
    })

    for (const edge of outgoing.get(vertex.id) ?? []) {
      queue.push({
        vertexId: edge.target,
        depth: current.depth + 1,
        viaEdgeId: edge.id,
      })
    }
  }

  return history
}

export function getStrongCausalHistory(
  startVertexId: VertexId,
  vertices: Map<VertexId, DagVertex>,
  edges: Iterable<DagEdge>,
  maxDepth = 32,
): StrongCausalHistory {
  if (!vertices.has(startVertexId)) {
    return { vertexIds: new Set(), edgeIds: new Set() }
  }
  const history = traceHistory(
    startVertexId,
    vertices,
    buildOutgoingEdges(edges),
    maxDepth,
  )
  return {
    vertexIds: new Set(history.map((entry) => entry.vertex.id)),
    edgeIds: new Set(
      history
        .map((entry) => entry.viaEdgeId)
        .filter((edgeId): edgeId is string => edgeId !== null),
    ),
  }
}

export function getStrongReferenceDetails(
  edge: DagEdge | undefined,
  vertices: Map<VertexId, DagVertex>,
  edges: Iterable<DagEdge>,
  maxDepth = 32,
): StrongReferenceDetails | null {
  if (!edge || edge.kind !== 'strong') return null
  const from = vertices.get(edge.source)
  const to = vertices.get(edge.target)
  if (!from || !to) return null

  const history = traceHistory(
    to.id,
    vertices,
    buildOutgoingEdges(edges, edge.id),
    maxDepth,
    edge.id,
  )

  return {
    edge,
    from,
    to,
    roundDelta: from.round - to.round,
    history,
  }
}
