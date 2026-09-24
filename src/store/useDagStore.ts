import { create } from 'zustand'
import {
  insertVertex,
  layoutVerticesByRounds,
  patchVertex,
  removeVertex,
  createLocalDag,
  validateConnection,
  type ConnectionRejection,
  type DagEdge,
  type DagVertex,
  type EdgeId,
  type EdgeKind,
  type LocalDag,
  type Point,
  type VertexId,
  type VertexPatch,
  type VertexStatus,
} from '../domain/dag'

export type VertexUpdateResult =
  | 'updated'
  | 'not-found'
  | 'duplicate-slot'
  | 'invalid-value'

export type EdgeAddResult =
  | { ok: true; edge: DagEdge }
  | { ok: false; reason: ConnectionRejection }

export type LayoutMode = 'round-grid' | 'freeform'

interface GraphState {
  dag: LocalDag
  edges: Map<EdgeId, DagEdge>
  selectedVertexId: VertexId | null
  selectedEdgeId: EdgeId | null
  layoutMode: LayoutMode
  nextVertexSequence: number
  nextEdgeSequence: number
}

interface DagActions {
  addVertex: (position?: Point) => VertexId
  updateVertex: (
    vertexId: VertexId,
    patch: VertexPatch,
  ) => VertexUpdateResult
  removeVertex: (vertexId: VertexId) => void
  addEdge: (
    source: VertexId,
    target: VertexId,
    kind?: EdgeKind,
  ) => EdgeAddResult
  updateEdgeKind: (edgeId: EdgeId) => void
  removeEdge: (edgeId: EdgeId) => void
  selectVertex: (vertexId: VertexId | null) => void
  selectEdge: (edgeId: EdgeId | null) => void
  clearSelection: () => void
  setLayoutMode: (mode: LayoutMode) => void
  autoLayout: () => void
  clearDag: () => void
  loadExample: () => void
}

export type DagStore = GraphState & DagActions

function createVertex(
  id: VertexId,
  source: number,
  round: number,
  position: Point,
  status: VertexStatus = 'buffered',
): DagVertex {
  return {
    id,
    source,
    round,
    wave: Math.ceil(round / 4),
    position,
    blockData: {
      proposer: source,
      payload: '',
      metadata: {},
    },
    status,
    timestamp: Date.now(),
  }
}

function sameDirectedPair(left: DagEdge, right: DagEdge) {
  return left.source === right.source && left.target === right.target
}

function addStrongPredecessorEdges(
  vertex: DagVertex,
  dag: LocalDag,
  edges: Map<EdgeId, DagEdge>,
  nextEdgeSequence: number,
) {
  const nextEdges = new Map(edges)
  const predecessors = Array.from(dag.vertices.values())
    .filter((candidate) => candidate.round === vertex.round - 1)
    .sort((left, right) => left.source - right.source || left.id.localeCompare(right.id))
  let sequence = nextEdgeSequence

  for (const predecessor of predecessors) {
    const existing = Array.from(nextEdges.values()).find((edge) =>
      sameDirectedPair(edge, {
        id: '',
        source: vertex.id,
        target: predecessor.id,
        kind: 'strong',
      }),
    )
    if (existing) {
      if (existing.kind !== 'strong') nextEdges.set(existing.id, { ...existing, kind: 'strong' })
      continue
    }

    const id = `auto-${vertex.id}-${predecessor.id}`
    nextEdges.set(id, {
      id,
      source: vertex.id,
      target: predecessor.id,
      kind: 'strong',
    })
    sequence += 1
  }

  return { edges: nextEdges, nextEdgeSequence: sequence }
}

function rebuildStrongEdges(dag: LocalDag) {
  const vertices = Array.from(dag.vertices.values()).sort(
    (left, right) =>
      left.round - right.round ||
      left.source - right.source ||
      left.id.localeCompare(right.id),
  )
  let edges = new Map<EdgeId, DagEdge>()
  let sequence = 1
  for (const vertex of vertices) {
    const result = addStrongPredecessorEdges(vertex, dag, edges, sequence)
    edges = result.edges
    sequence = result.nextEdgeSequence
  }
  return { edges, nextEdgeSequence: sequence }
}

function createExampleGraph(): GraphState {
  let dag = createLocalDag()
  const vertices = [
    createVertex('v1', 1, 8, { x: 0, y: 0 }, 'committed'),
    createVertex('v2', 2, 5, { x: 0, y: 0 }, 'in-dag'),
    createVertex('v3', 3, 6, { x: 0, y: 0 }, 'in-dag'),
    createVertex('v4', 4, 5, { x: 0, y: 0 }, 'committed'),
    createVertex('v5', 1, 6, { x: 0, y: 0 }, 'deliverable'),
    createVertex('v6', 3, 4, { x: 0, y: 0 }, 'committed'),
    createVertex('v7', 1, 7, { x: 0, y: 0 }, 'in-dag'),
    createVertex('v8', 2, 7, { x: 0, y: 0 }, 'in-dag'),
    createVertex('v9', 4, 7, { x: 0, y: 0 }, 'in-dag'),
    createVertex('v10', 2, 4, { x: 0, y: 0 }, 'in-dag'),
    createVertex('v11', 4, 4, { x: 0, y: 0 }, 'in-dag'),
    createVertex('v12', 1, 5, { x: 0, y: 0 }, 'in-dag'),
    createVertex('v13', 4, 6, { x: 0, y: 0 }, 'in-dag'),
  ]

  const edges = new Map<EdgeId, DagEdge>()
  let edgeSequence = 1
  const orderedVertices = [...vertices].sort(
    (left, right) =>
      left.round - right.round ||
      left.source - right.source ||
      left.id.localeCompare(right.id),
  )
  for (const vertex of orderedVertices) {
    const nextDag = insertVertex(dag, vertex)
    if (!nextDag) continue
    dag = nextDag
    const result = addStrongPredecessorEdges(
      vertex,
      dag,
      edges,
      edgeSequence,
    )
    edges.clear()
    for (const [id, edge] of result.edges) edges.set(id, edge)
    edgeSequence = result.nextEdgeSequence
  }
  dag = layoutVerticesByRounds(dag)

  return {
    dag,
    edges,
    selectedVertexId: null,
    selectedEdgeId: null,
    layoutMode: 'round-grid',
    nextVertexSequence: vertices.length + 1,
    nextEdgeSequence: edgeSequence,
  }
}

function createEmptyGraph(): GraphState {
  return {
    dag: createLocalDag(),
    edges: new Map(),
    selectedVertexId: null,
    selectedEdgeId: null,
    layoutMode: 'round-grid',
    nextVertexSequence: 1,
    nextEdgeSequence: 1,
  }
}

function nextUnusedSource(dag: LocalDag, round: number) {
  const usedSources = new Set(
    Array.from(dag.vertices.values())
      .filter((vertex) => vertex.round === round)
      .map((vertex) => vertex.source),
  )
  let source = 1
  while (usedSources.has(source)) source += 1
  return source
}

function nextRound(dag: LocalDag) {
  const rounds = Array.from(dag.vertices.values(), (vertex) => vertex.round)
  return rounds.length === 0 ? 1 : Math.max(...rounds) + 1
}

function defaultPosition(vertexCount: number): Point {
  const column = vertexCount % 4
  const row = Math.floor(vertexCount / 4)
  return { x: 100 + column * 220, y: 80 + row * 125 }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositionOnlyPatch(patch: VertexPatch) {
  return (
    patch.position !== undefined &&
    patch.source === undefined &&
    patch.round === undefined &&
    patch.wave === undefined &&
    patch.status === undefined &&
    patch.blockData === undefined
  )
}

export const useDagStore = create<DagStore>()((set, get) => ({
  ...createExampleGraph(),

  addVertex: (position) => {
    const state = get()
    const sequence = state.nextVertexSequence
    const id = `v${sequence}`
    const round = nextRound(state.dag)
    const source = nextUnusedSource(state.dag, round)
    const vertex = createVertex(
      id,
      source,
      round,
      position ?? defaultPosition(state.dag.vertices.size),
    )
    let dag = insertVertex(state.dag, vertex)

    if (!dag) return id
    if (state.layoutMode === 'round-grid') {
      dag = layoutVerticesByRounds(dag)
    }
    const edgeResult = addStrongPredecessorEdges(
      vertex,
      dag,
      state.edges,
      state.nextEdgeSequence,
    )

    set((current) => ({
      dag,
      edges: edgeResult.edges,
      selectedVertexId: id,
      selectedEdgeId: null,
      nextVertexSequence: current.nextVertexSequence + 1,
      nextEdgeSequence: edgeResult.nextEdgeSequence,
    }))
    return id
  },

  updateVertex: (vertexId, patch) => {
    const values = [patch.source, patch.round, patch.wave]
    if (values.some((value) => value !== undefined && !isNonNegativeInteger(value))) {
      return 'invalid-value'
    }

    const state = get()
    const dag = patchVertex(state.dag, vertexId, patch)
    if (!dag) {
      return state.dag.vertices.has(vertexId)
        ? 'duplicate-slot'
        : 'not-found'
    }

    const edgeState =
      patch.source !== undefined || patch.round !== undefined
        ? rebuildStrongEdges(dag)
        : null
    if (state.layoutMode === 'round-grid' && !isPositionOnlyPatch(patch)) {
      set({
        dag: layoutVerticesByRounds(dag),
        ...(edgeState
          ? { edges: edgeState.edges, nextEdgeSequence: edgeState.nextEdgeSequence }
          : {}),
      })
    } else if (state.layoutMode === 'round-grid' && isPositionOnlyPatch(patch)) {
      set({ dag, layoutMode: 'freeform' })
    } else {
      set({
        dag,
        ...(edgeState
          ? { edges: edgeState.edges, nextEdgeSequence: edgeState.nextEdgeSequence }
          : {}),
      })
    }
    return 'updated'
  },

  removeVertex: (vertexId) => {
    set((state) => {
      const dag = removeVertex(state.dag, vertexId)
      if (!dag) return state

      const edges = new Map(state.edges)
      for (const [edgeId, edge] of edges) {
        if (edge.source === vertexId || edge.target === vertexId) {
          edges.delete(edgeId)
        }
      }

      return {
        dag,
        edges,
        selectedVertexId:
          state.selectedVertexId === vertexId ? null : state.selectedVertexId,
      }
    })
  },

  addEdge: (source, target) => {
    const state = get()
    const sourceVertex = state.dag.vertices.get(source)
    const targetVertex = state.dag.vertices.get(target)
    if (
      !sourceVertex ||
      !targetVertex ||
      targetVertex.round !== sourceVertex.round - 1
    ) {
      return { ok: false, reason: 'invalid-edge' as const }
    }
    const validation = validateConnection(
      state.dag.vertices,
      state.edges.values(),
      source,
      target,
    )

    if (!validation.ok) return validation
    const edgeKind = 'strong' as const

    const id = `e${state.nextEdgeSequence}`
    const edge: DagEdge = { id, source, target, kind: edgeKind }
    const edges = new Map(state.edges)
    edges.set(id, edge)

    set((current) => ({
      edges,
      selectedVertexId: null,
      selectedEdgeId: id,
      nextEdgeSequence: current.nextEdgeSequence + 1,
    }))
    return { ok: true, edge }
  },

  updateEdgeKind: (edgeId) => {
    set((state) => {
      const edge = state.edges.get(edgeId)
      if (!edge) return state
      const edges = new Map(state.edges)
      edges.set(edgeId, { ...edge, kind: 'strong' })
      return { edges }
    })
  },

  removeEdge: (edgeId) => {
    set((state) => {
      if (!state.edges.has(edgeId)) return state
      const edges = new Map(state.edges)
      edges.delete(edgeId)
      return {
        edges,
        selectedEdgeId: state.selectedEdgeId === edgeId ? null : state.selectedEdgeId,
      }
    })
  },

  selectVertex: (vertexId) => {
    set({ selectedVertexId: vertexId, selectedEdgeId: null })
  },

  selectEdge: (edgeId) => {
    set({ selectedEdgeId: edgeId, selectedVertexId: null })
  },

  clearSelection: () => {
    set({ selectedVertexId: null, selectedEdgeId: null })
  },

  setLayoutMode: (mode) => {
    const state = get()
    set({
      layoutMode: mode,
      dag: mode === 'round-grid' ? layoutVerticesByRounds(state.dag) : state.dag,
    })
  },

  autoLayout: () => {
    set((state) => ({
      layoutMode: 'round-grid',
      dag: layoutVerticesByRounds(state.dag),
    }))
  },

  clearDag: () => {
    const state = createEmptyGraph()
    set(state)
  },

  loadExample: () => {
    set(createExampleGraph())
  },
}))
