import { create } from 'zustand'
import {
  insertVertex,
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

interface GraphState {
  dag: LocalDag
  edges: Map<EdgeId, DagEdge>
  selectedVertexId: VertexId | null
  selectedEdgeId: EdgeId | null
  activeEdgeKind: EdgeKind
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
  updateEdgeKind: (edgeId: EdgeId, kind: EdgeKind) => void
  removeEdge: (edgeId: EdgeId) => void
  selectVertex: (vertexId: VertexId | null) => void
  selectEdge: (edgeId: EdgeId | null) => void
  clearSelection: () => void
  setActiveEdgeKind: (kind: EdgeKind) => void
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

function createExampleGraph(): GraphState {
  let dag = createLocalDag()
  const vertices = [
    createVertex('v1', 0, 1, { x: 80, y: 150 }, 'committed'),
    createVertex('v2', 1, 1, { x: 330, y: 60 }, 'in-dag'),
    createVertex('v3', 2, 1, { x: 330, y: 240 }, 'in-dag'),
    createVertex('v4', 0, 2, { x: 590, y: 150 }, 'committed'),
    createVertex('v5', 1, 2, { x: 850, y: 150 }, 'deliverable'),
  ]

  for (const vertex of vertices) {
    dag = insertVertex(dag, vertex) ?? dag
  }

  const edges = new Map<EdgeId, DagEdge>([
    ['e1', { id: 'e1', source: 'v1', target: 'v2', kind: 'strong' }],
    ['e2', { id: 'e2', source: 'v1', target: 'v3', kind: 'strong' }],
    ['e3', { id: 'e3', source: 'v2', target: 'v3', kind: 'weak' }],
    ['e4', { id: 'e4', source: 'v2', target: 'v4', kind: 'strong' }],
    ['e5', { id: 'e5', source: 'v3', target: 'v4', kind: 'strong' }],
    ['e6', { id: 'e6', source: 'v4', target: 'v5', kind: 'weak' }],
  ])

  return {
    dag,
    edges,
    selectedVertexId: null,
    selectedEdgeId: null,
    activeEdgeKind: 'strong',
    nextVertexSequence: 6,
    nextEdgeSequence: 7,
  }
}

function createEmptyGraph(): GraphState {
  return {
    dag: createLocalDag(),
    edges: new Map(),
    selectedVertexId: null,
    selectedEdgeId: null,
    activeEdgeKind: 'strong',
    nextVertexSequence: 1,
    nextEdgeSequence: 1,
  }
}

function nextUnusedSource(dag: LocalDag) {
  const usedSources = new Set(
    Array.from(dag.vertices.values(), (vertex) => vertex.source),
  )
  let source = 0
  while (usedSources.has(source)) source += 1
  return source
}

function defaultPosition(vertexCount: number): Point {
  const column = vertexCount % 4
  const row = Math.floor(vertexCount / 4)
  return { x: 80 + column * 230, y: 80 + row * 150 }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export const useDagStore = create<DagStore>()((set, get) => ({
  ...createExampleGraph(),

  addVertex: (position) => {
    const state = get()
    const sequence = state.nextVertexSequence
    const id = `v${sequence}`
    const source = nextUnusedSource(state.dag)
    const vertex = createVertex(
      id,
      source,
      1,
      position ?? defaultPosition(state.dag.vertices.size),
    )
    const dag = insertVertex(state.dag, vertex)

    if (!dag) return id

    set((current) => ({
      dag,
      selectedVertexId: id,
      selectedEdgeId: null,
      nextVertexSequence: current.nextVertexSequence + 1,
    }))
    return id
  },

  updateVertex: (vertexId, patch) => {
    const values = [patch.source, patch.round, patch.wave]
    if (values.some((value) => value !== undefined && !isNonNegativeInteger(value))) {
      return 'invalid-value'
    }

    const dag = patchVertex(get().dag, vertexId, patch)
    if (!dag) {
      return get().dag.vertices.has(vertexId)
        ? 'duplicate-slot'
        : 'not-found'
    }

    set({ dag })
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

  addEdge: (source, target, kind) => {
    const state = get()
    const edgeKind = kind ?? state.activeEdgeKind
    const validation = validateConnection(state.dag.vertices, state.edges.values(), source, target)

    if (!validation.ok) return validation

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

  updateEdgeKind: (edgeId, kind) => {
    set((state) => {
      const edge = state.edges.get(edgeId)
      if (!edge) return state
      const edges = new Map(state.edges)
      edges.set(edgeId, { ...edge, kind })
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

  setActiveEdgeKind: (kind) => {
    set({ activeEdgeKind: kind })
  },

  clearDag: () => {
    const state = createEmptyGraph()
    set(state)
  },

  loadExample: () => {
    set(createExampleGraph())
  },
}))
