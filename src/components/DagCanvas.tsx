import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ViewportPortal,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react'
import {
  getLocalDagRoundGridBounds,
  getVertexSlotInfo,
  type DagEdge,
} from '../domain/dag'
import { getStrongCausalHistory, getStrongReferenceDetails } from '../domain/strongReferences'
import { useDagStore } from '../store/useDagStore'
import { DagVertexNode, type DagFlowNode } from './DagVertexNode'
import { RoundGrid } from './RoundGrid'
import { VertexComposer } from './VertexComposer'

type DagFlowEdge = Edge<
  { edge: DagEdge } & Record<string, unknown>,
  'smoothstep'
>

const nodeTypes: NodeTypes = {
  dagVertex: DagVertexNode,
}

function DagFlow() {
  const dag = useDagStore((state) => state.dag)
  const vertices = dag.vertices
  const edges = useDagStore((state) => state.edges)
  const selectedVertexId = useDagStore((state) => state.selectedVertexId)
  const selectedEdgeId = useDagStore((state) => state.selectedEdgeId)
  const layoutMode = useDagStore((state) => state.layoutMode)
  const moveVertex = useDagStore((state) => state.updateVertex)
  const removeVertex = useDagStore((state) => state.removeVertex)
  const removeEdge = useDagStore((state) => state.removeEdge)
  const selectVertex = useDagStore((state) => state.selectVertex)
  const selectEdge = useDagStore((state) => state.selectEdge)
  const clearSelection = useDagStore((state) => state.clearSelection)
  const setLayoutMode = useDagStore((state) => state.setLayoutMode)
  const autoLayout = useDagStore((state) => state.autoLayout)
  const { fitView } = useReactFlow<DagFlowNode, DagFlowEdge>()

  const [composerOpen, setComposerOpen] = useState(false)
  const slotInfo = useMemo(() => getVertexSlotInfo(vertices.values()), [vertices])
  const gridBounds = useMemo(
    () =>
      layoutMode === 'round-grid' ? getLocalDagRoundGridBounds(dag) : null,
    [dag, layoutMode],
  )
  const gridLayoutKey = useMemo(() => {
    if (!gridBounds) return layoutMode
    return [
      layoutMode,
      gridBounds.minRound,
      gridBounds.maxRound,
      gridBounds.nextRound,
      gridBounds.minSource,
      gridBounds.maxSource,
      gridBounds.rounds.join(','),
      gridBounds.sources.join(','),
      vertices.size,
    ].join(':')
  }, [gridBounds, layoutMode, vertices.size])

  useEffect(() => {
    if (vertices.size > 0) {
      void fitView({ padding: 0.2, duration: 0 })
    }
  }, [fitView, gridLayoutKey, vertices.size])

  const causalHistory = useMemo(() => {
    if (selectedEdgeId) {
      const selectedEdge = edges.get(selectedEdgeId)
      const details = getStrongReferenceDetails(
        selectedEdge,
        vertices,
        edges.values(),
      )
      return {
        vertexIds: new Set(
          details
            ? [details.from.id, ...details.history.map((entry) => entry.vertex.id)]
            : [],
        ),
        edgeIds: new Set(
          details
            ? details.history
                .map((entry) => entry.viaEdgeId)
                .filter((edgeId): edgeId is string => edgeId !== null)
            : [],
        ),
      }
    }

    if (selectedVertexId) {
      return getStrongCausalHistory(selectedVertexId, vertices, edges.values())
    }

    return { vertexIds: new Set<string>(), edgeIds: new Set<string>() }
  }, [edges, selectedEdgeId, selectedVertexId, vertices])

  const nodes = useMemo<DagFlowNode[]>(
    () =>
      Array.from(vertices.values(), (vertex) => {
        const slot = slotInfo.get(vertex.id)
        return {
          id: vertex.id,
          type: 'dagVertex',
          position: vertex.position,
          data: {
            vertex,
            compact: layoutMode === 'round-grid',
            inCausalHistory: causalHistory.vertexIds.has(vertex.id),
            slotCount: slot?.count ?? 1,
            slotIndex: slot?.index ?? 0,
          },
          selected: vertex.id === selectedVertexId,
          className: [
            layoutMode === 'round-grid' ? 'dag-flow-node--compact' : undefined,
            causalHistory.vertexIds.has(vertex.id) ? 'dag-flow-node--history' : undefined,
            (slot?.count ?? 1) > 1 ? 'dag-flow-node--equivocation' : undefined,
          ]
            .filter(Boolean)
            .join(' ') || undefined,
          deletable: true,
        }
      }),
    [causalHistory, layoutMode, selectedVertexId, slotInfo, vertices],
  )

  const flowEdges = useMemo<DagFlowEdge[]>(
    () =>
      Array.from(edges.values())
        .filter((edge) => edge.kind === 'strong')
        .map((edge) => {
        const focused = selectedVertexId !== null && edge.source === selectedVertexId
        const inHistory = causalHistory.edgeIds.has(edge.id)
        const color = focused ? '#fbbf24' : inHistory ? '#c084fc' : '#8ab4ff'
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'smoothstep',
          data: { edge },
          selected: false,
          animated: false,
          style: {
            stroke: color,
            strokeWidth: focused ? 3.5 : inHistory ? 2.8 : 1.7,
            filter: focused
              ? 'drop-shadow(0 0 4px rgb(251 191 36 / 85%))'
              : inHistory
                ? 'drop-shadow(0 0 3px rgb(192 132 252 / 70%))'
                : undefined,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 18,
            height: 18,
          },
          ariaLabel: `${edge.kind} edge from ${edge.source} to ${edge.target}`,
        }
      }),
    [causalHistory, edges, selectedVertexId],
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

  return (
    <ReactFlow<DagFlowNode, DagFlowEdge>
      nodes={nodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
      onNodeClick={(_, node) => selectVertex(node.id)}
      onEdgeClick={(_, edge) => selectEdge(edge.id)}
      onPaneClick={clearSelection}
      nodesConnectable={false}
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
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1b2a3b" />
      {gridBounds && (
        <ViewportPortal>
          <RoundGrid bounds={gridBounds} />
        </ViewportPortal>
      )}
      <MiniMap
        pannable
        zoomable
        nodeColor="#23364a"
        maskColor="rgb(7 11 18 / 72%)"
      />
      <Controls showInteractive={false} />

      {composerOpen && (
        <Panel position="top-right" className="vertex-composer-panel">
          <VertexComposer onClose={() => setComposerOpen(false)} />
        </Panel>
      )}

      <Panel position="top-left" className="canvas-toolbar">
        <button
          type="button"
          className={composerOpen ? 'tool-button tool-button--active' : 'tool-button'}
          onClick={() => setComposerOpen(true)}
        >
          <span className="tool-button__icon">+</span>
          {composerOpen ? 'Composing block…' : 'New block'}
        </button>
        <div className="tool-divider" />
        <span className="tool-hint">Strong edges: r → r−1 (automatic)</span>
        <div className="tool-divider" />
        <button
          type="button"
          className={layoutMode === 'round-grid' ? 'tool-button tool-button--active' : 'tool-button'}
          onClick={() => setLayoutMode('round-grid')}
        >
          Round grid
        </button>
        <button
          type="button"
          className={layoutMode === 'freeform' ? 'tool-button tool-button--active' : 'tool-button'}
          onClick={() => setLayoutMode('freeform')}
        >
          Freeform
        </button>
        <button type="button" className="tool-button tool-button--quiet" onClick={autoLayout}>
          Re-grid
        </button>
        <button type="button" className="tool-button tool-button--quiet" onClick={() => void fitView({ padding: 0.2, duration: 350 })}>
          Fit view
        </button>
      </Panel>

      {vertices.size === 0 && (
        <Panel position="bottom-center" className="empty-canvas-hint">
          Choose <strong>New block</strong> to compose the first vertex and its strong references.
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
