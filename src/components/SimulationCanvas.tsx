import { useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  type Edge,
  type NodeTypes,
} from '@xyflow/react'
import type { DagEdge } from '../domain/dag'
import { getStrongCausalHistory, getStrongReferenceDetails } from '../domain/strongReferences'
import { useSimulationStore } from '../store/useSimulationStore'
import { DagVertexNode, type DagFlowNode } from './DagVertexNode'

type SimulationFlowEdge = Edge<
  { edge: DagEdge } & Record<string, unknown>,
  'smoothstep'
>

const nodeTypes: NodeTypes = {
  dagVertex: DagVertexNode,
}

export function SimulationCanvas() {
  const snapshot = useSimulationStore((state) => state.snapshot)
  const activeProcessId = useSimulationStore((state) => state.activeProcessId)
  const selectedVertexId = useSimulationStore((state) => state.selectedVertexId)
  const selectedEdgeId = useSimulationStore((state) => state.selectedEdgeId)
  const selectVertex = useSimulationStore((state) => state.selectVertex)
  const selectEdge = useSimulationStore((state) => state.selectEdge)
  const process = snapshot.processes.get(activeProcessId)

  const causalHistory = useMemo(() => {
    if (selectedEdgeId) {
      const selectedEdge = process?.edges.get(selectedEdgeId)
      const details = getStrongReferenceDetails(
        selectedEdge,
        process?.dag.vertices ?? new Map(),
        process?.edges.values() ?? [],
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

    if (selectedVertexId && process) {
      return getStrongCausalHistory(
        selectedVertexId,
        process.dag.vertices,
        process.edges.values(),
      )
    }

    return { vertexIds: new Set<string>(), edgeIds: new Set<string>() }
  }, [process, selectedEdgeId, selectedVertexId])

  const nodes = useMemo<DagFlowNode[]>(
    () =>
      process
        ? Array.from(process.dag.vertices.values(), (vertex) => ({
            id: vertex.id,
            type: 'dagVertex',
            position: vertex.position,
            data: {
              vertex,
              compact: true,
              inCausalHistory: causalHistory.vertexIds.has(vertex.id),
            },
            selected: vertex.id === selectedVertexId,
            className: [
              'dag-flow-node--compact',
              causalHistory.vertexIds.has(vertex.id) ? 'dag-flow-node--history' : undefined,
            ]
              .filter(Boolean)
              .join(' '),
            draggable: false,
            connectable: false,
            deletable: false,
          }))
        : [],
    [causalHistory, process, selectedVertexId],
  )

  const edges = useMemo<SimulationFlowEdge[]>(
    () =>
      process
        ? Array.from(process.edges.values())
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
                strokeWidth: focused ? 3.5 : inHistory ? 2.8 : 2,
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
            }
          })
        : [],
    [causalHistory, process, selectedVertexId],
  )

  return (
    <section className="simulation-canvas-shell" aria-label="Simulation DAG view">
      <ReactFlow<DagFlowNode, SimulationFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => selectVertex(node.id)}
        onEdgeClick={(_, edge) => selectEdge(edge.id)}
        onPaneClick={() => selectVertex(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable
        elementsSelectable
        edgesFocusable
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
        minZoom={0.25}
        maxZoom={1.8}
        onlyRenderVisibleElements
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
        aria-label={`Read-only DAG for process ${activeProcessId + 1}`}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#263244" />
        <MiniMap
          pannable
          zoomable
          nodeColor="#23364a"
          maskColor="rgb(7 11 18 / 72%)"
        />
        <Controls showInteractive={false} />

        <Panel position="top-left" className="simulation-canvas-badge">
          <span>Process {activeProcessId + 1}</span>
          <strong>status r{process?.statusRound ?? 1}</strong>
          <i />
          <strong>{process?.dag.vertices.size ?? 0} DAG vertices</strong>
          <i />
          <strong>{process?.buffer.size ?? 0} buffered</strong>
          {process && process.pendingEdges.size > 0 && (
            <>
              <i />
              <strong className="is-pending">{process.pendingEdges.size} pending edges</strong>
            </>
          )}
        </Panel>

        <Panel position="bottom-left" className="simulation-canvas-legend">
          <span><i className="legend-line legend-line--strong" />Strong predecessor edge</span>
          <small>Read-only process projection</small>
        </Panel>

        {process?.dag.vertices.size === 0 && (
          <Panel position="bottom-center" className="simulation-empty-hint">
            This process has no accepted vertices. Create one in its buffer, then flush it.
          </Panel>
        )}
      </ReactFlow>
    </section>
  )
}
