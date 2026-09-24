import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { DagVertex } from '../domain/dag'

export type DagVertexNodeData = {
  vertex: DagVertex
  compact?: boolean
} & Record<string, unknown>

export type DagFlowNode = Node<DagVertexNodeData, 'dagVertex'>

const statusLabels = {
  buffered: 'Buffered',
  deliverable: 'Deliverable',
  'in-dag': 'In DAG',
  committed: 'Committed',
  delivered: 'Delivered',
} as const

export function DagVertexNode({ data, selected }: NodeProps<DagFlowNode>) {
  const { vertex, compact = false } = data

  if (compact) {
    return (
      <div
        className={`dag-node dag-node--compact ${selected ? 'dag-node--selected' : ''}`}
        aria-label={`Vertex ${vertex.id}, source ${vertex.source}, round ${vertex.round}`}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="dag-handle dag-handle--hidden"
        />
        <div className="dag-node__header">
          <span className="dag-node__id">{vertex.id}</span>
          <span className={`status-dot status-dot--${vertex.status}`} />
        </div>
        <Handle
          type="source"
          position={Position.Right}
          className="dag-handle dag-handle--hidden"
        />
      </div>
    )
  }

  return (
    <div
      className={`dag-node ${selected ? 'dag-node--selected' : ''}`}
      aria-label={`Vertex ${vertex.id}`}
    >
      <div className="dag-node__header">
        <span className="dag-node__id">{vertex.id}</span>
        <span className={`status-dot status-dot--${vertex.status}`} />
      </div>
      <div className="dag-node__title">Source {vertex.source}</div>
      <div className="dag-node__metrics">
        <span>Round {vertex.round}</span>
        <span>Wave {vertex.wave}</span>
      </div>
      <div className="dag-node__status">{statusLabels[vertex.status]}</div>
      <Handle
        type="source"
        position={Position.Right}
        className="dag-handle dag-handle--hidden"
      />
    </div>
  )
}
