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

function compareEdges(left: DagEdge, right: DagEdge) {
  return left.id.localeCompare(right.id)
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

  const outgoing = new Map<VertexId, DagEdge[]>()
  for (const candidate of edges) {
    if (candidate.kind !== 'strong' || candidate.id === edge.id) continue
    const list = outgoing.get(candidate.source) ?? []
    list.push(candidate)
    outgoing.set(candidate.source, list)
  }
  for (const list of outgoing.values()) list.sort(compareEdges)

  const history: StrongHistoryEntry[] = []
  const visited = new Set<VertexId>()
  const queue: Array<{ vertexId: VertexId; depth: number; viaEdgeId: EdgeId | null }> = [
    { vertexId: to.id, depth: 0, viaEdgeId: edge.id },
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

    for (const parent of outgoing.get(vertex.id) ?? []) {
      queue.push({
        vertexId: parent.target,
        depth: current.depth + 1,
        viaEdgeId: parent.id,
      })
    }
  }

  return {
    edge,
    from,
    to,
    roundDelta: from.round - to.round,
    history,
  }
}
