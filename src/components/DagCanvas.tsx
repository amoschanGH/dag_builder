import {
  useCallback,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type IsValidConnection,
  type NodeTypes,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react'
import { validateConnection, type ConnectionRejection, type DagEdge } from '../domain/dag'
import { useDagStore } from '../store/useDagStore'
import { DagVertexNode, type DagFlowNode } from './DagVertexNode'

type DagFlowEdge = Edge<
  { edge: DagEdge } & Record<string, unknown>,
  'smoothstep'
>

const nodeTypes: NodeTypes = {
  dagVertex: DagVertexNode,
}

const rejectionMessages: Record<ConnectionRejection, string> = {
  'missing-vertex': 'Both vertices must exist before connecting them.',
  'self-loop': 'Self-loops are not valid DAG edges.',
  'duplicate-edge': 'That directed edge already exists.',
  cycle: 'That connection would create a cycle.',
}

function DagFlow() {
  const vertices = useDagStore((state) => state.dag.vertices)
  const edges = useDagStore((state) => state.edges)
  const selectedVertexId = useDagStore((state) => state.selectedVertexId)
  const selectedEdgeId = useDagStore((state) => state.selectedEdgeId)
  const activeEdgeKind = useDagStore((state) => state.activeEdgeKind)
  const moveVertex = useDagStore((state) => state.updateVertex)
  const removeVertex = useDagStore((state) => state.removeVertex)
  const removeEdge = useDagStore((state) => state.removeEdge)
  const addEdge = useDagStore((state) => state.addEdge)
  const addVertex = useDagStore((state) => state.addVertex)
  const selectVertex = useDagStore((state) => state.selectVertex)
  const selectEdge = useDagStore((state) => state.selectEdge)
  const clearSelection = useDagStore((state) => state.clearSelection)
  const setActiveEdgeKind = useDagStore((state) => state.setActiveEdgeKind)
  const { fitView, screenToFlowPosition } = useReactFlow<DagFlowNode, DagFlowEdge>()

  const [placementActive, setPlacementActive] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const nodes = useMemo<DagFlowNode[]>(
    () =>
      Array.from(vertices.values(), (vertex) => ({
        id: vertex.id,
        type: 'dagVertex',
        position: vertex.position,
        data: { vertex },
        selected: vertex.id === selectedVertexId,
        deletable: true,
      })),
    [selectedVertexId, vertices],
  )

  const flowEdges = useMemo<DagFlowEdge[]>(
    () =>
      Array.from(edges.values(), (edge) => {
        const isStrong = edge.kind === 'strong'
        const color = isStrong ? '#5eead4' : '#94a3b8'
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'smoothstep',
          data: { edge },
          selected: edge.id === selectedEdgeId,
          label: edge.kind,
          animated: isStrong,
          style: {
            stroke: color,
            strokeWidth: edge.id === selectedEdgeId ? 3 : 2,
            strokeDasharray: isStrong ? undefined : '7 6',
          },
          labelStyle: { fill: '#cbd5e1', fontSize: 10, fontWeight: 600 },
          labelBgStyle: { fill: '#111827', fillOpacity: 0.95 },
          labelBgPadding: [5, 3],
          labelBgBorderRadius: 5,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 18,
            height: 18,
          },
          ariaLabel: `${edge.kind} edge from ${edge.source} to ${edge.target}`,
        }
      }),
    [edges, selectedEdgeId],
  )

  const handleNodesChange: OnNodesChange<DagFlowNode> = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          moveVertex(change.id, { position: change.position })
        } else if (change.type === 'select') {
          selectVertex(change.selected ? change.id : null)
        } else if (change.type === 'remove') {
          removeVertex(change.id)
        }
      }
    },
    [moveVertex, removeVertex, selectVertex],
  )

  const handleEdgesChange: OnEdgesChange<DagFlowEdge> = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === 'select') {
          selectEdge(change.selected ? change.id : null)
        } else if (change.type === 'remove') {
          removeEdge(change.id)
        }
      }
    },
    [removeEdge, selectEdge],
  )

  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const result = addEdge(connection.source, connection.target)
      setNotice(result.ok ? null : rejectionMessages[result.reason])
    },
    [addEdge],
  )

  const isValidConnection: IsValidConnection<DagFlowEdge> = useCallback(
    (connection) =>
      validateConnection(
        vertices,
        edges.values(),
        connection.source,
        connection.target,
      ).ok,
    [edges, vertices],
  )

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent<Element>) => {
      if (!placementActive) {
        clearSelection()
        return
      }

      const position = screenToFlowPosition(
        { x: event.clientX, y: event.clientY },
        { snapToGrid: true, snapGrid: [20, 20] },
      )
      addVertex(position)
      setPlacementActive(false)
      setNotice(null)
    },
    [addVertex, clearSelection, placementActive, screenToFlowPosition],
  )

  return (
    <ReactFlow<DagFlowNode, DagFlowEdge>
      nodes={nodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
      onNodeClick={(_, node) => selectVertex(node.id)}
      onEdgeClick={(_, edge) => selectEdge(edge.id)}
      onConnect={handleConnect}
      onPaneClick={handlePaneClick}
      isValidConnection={isValidConnection}
      connectionLineStyle={{
        stroke: activeEdgeKind === 'strong' ? '#5eead4' : '#94a3b8',
        strokeWidth: 2,
        strokeDasharray: activeEdgeKind === 'weak' ? '7 6' : undefined,
      }}
      connectionLineType={ConnectionLineType.SmoothStep}
      colorMode="dark"
      defaultEdgeOptions={{ type: 'smoothstep' }}
      deleteKeyCode={['Backspace', 'Delete']}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
      minZoom={0.25}
      maxZoom={1.8}
      snapToGrid
      snapGrid={[20, 20]}
      onlyRenderVisibleElements
      proOptions={{ hideAttribution: true }}
      aria-label="Interactive local DAG"
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#263244" />
      <MiniMap
        pannable
        zoomable
        nodeColor="#23364a"
        maskColor="rgb(7 11 18 / 72%)"
      />
      <Controls showInteractive={false} />

      <Panel position="top-left" className="canvas-toolbar">
        <button
          type="button"
          className={placementActive ? 'tool-button tool-button--active' : 'tool-button'}
          onClick={() => setPlacementActive((active) => !active)}
        >
          <span className="tool-button__icon">+</span>
          {placementActive ? 'Click canvas…' : 'Place vertex'}
        </button>
        <div className="tool-divider" />
        <span className="tool-label">New edge</span>
        <button
          type="button"
          className={activeEdgeKind === 'strong' ? 'edge-kind edge-kind--strong is-active' : 'edge-kind edge-kind--strong'}
          aria-pressed={activeEdgeKind === 'strong'}
          onClick={() => setActiveEdgeKind('strong')}
        >
          Strong
        </button>
        <button
          type="button"
          className={activeEdgeKind === 'weak' ? 'edge-kind edge-kind--weak is-active' : 'edge-kind edge-kind--weak'}
          aria-pressed={activeEdgeKind === 'weak'}
          onClick={() => setActiveEdgeKind('weak')}
        >
          Weak
        </button>
        <button type="button" className="tool-button tool-button--quiet" onClick={() => void fitView({ padding: 0.2, duration: 350 })}>
          Fit view
        </button>
      </Panel>

      {notice && (
        <Panel position="bottom-center" className="canvas-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">
            ×
          </button>
        </Panel>
      )}

      {vertices.size === 0 && (
        <Panel position="bottom-center" className="empty-canvas-hint">
          Choose <strong>Place vertex</strong>, then click anywhere on the canvas.
        </Panel>
      )}
    </ReactFlow>
  )
}

export function DagCanvas() {
  return (
    <section className="canvas-shell" aria-label="DAG editor">
      <ReactFlowProvider>
        <DagFlow />
      </ReactFlowProvider>
    </section>
  )
}
