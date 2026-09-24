import { useState } from 'react'
import { VERTEX_STATUSES, type VertexStatus } from '../domain/dag'
import { useDagStore, type VertexUpdateResult } from '../store/useDagStore'

function statusLabel(status: VertexStatus) {
  return status
    .split('-')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function updateMessage(result: VertexUpdateResult) {
  if (result === 'updated') return null
  if (result === 'duplicate-slot') {
    return 'Each process can have only one vertex per round.'
  }
  if (result === 'not-found') return 'That vertex no longer exists.'
  return 'Use a non-negative whole number.'
}

export function InspectorPanel() {
  const dag = useDagStore((state) => state.dag)
  const edges = useDagStore((state) => state.edges)
  const selectedVertexId = useDagStore((state) => state.selectedVertexId)
  const selectedEdgeId = useDagStore((state) => state.selectedEdgeId)
  const updateVertex = useDagStore((state) => state.updateVertex)
  const removeVertex = useDagStore((state) => state.removeVertex)
  const removeEdge = useDagStore((state) => state.removeEdge)
  const [updateError, setUpdateError] = useState<{
    vertexId: string
    message: string
  } | null>(null)

  const selectedVertex = selectedVertexId
    ? dag.vertices.get(selectedVertexId)
    : undefined
  const selectedEdge = selectedEdgeId ? edges.get(selectedEdgeId) : undefined
  const error =
    selectedVertex && updateError?.vertexId === selectedVertex.id
      ? updateError.message
      : null

  const applyUpdate = (patch: Parameters<typeof updateVertex>[1]) => {
    if (!selectedVertex) return
    const message = updateMessage(updateVertex(selectedVertex.id, patch))
    setUpdateError(message ? { vertexId: selectedVertex.id, message } : null)
  }

  return (
    <aside className="inspector-panel" aria-label="Selection inspector">
      <div className="inspector-panel__heading">
        <div>
          <p className="eyebrow">Inspector</p>
          <h2>{selectedVertex ? `Vertex ${selectedVertex.id}` : selectedEdge ? `Edge ${selectedEdge.id}` : 'Nothing selected'}</h2>
        </div>
        {selectedVertex && <span className={`status-chip status-chip--${selectedVertex.status}`}>{statusLabel(selectedVertex.status)}</span>}
      </div>

      {selectedVertex && (
        <div className="inspector-content">
          <p className="inspector-intro">Edit the vertex metadata used by the local DAG view.</p>

          <div className="field-grid">
            <label className="field">
              <span>Source</span>
              <input
                type="number"
                min="0"
                step="1"
                value={selectedVertex.source}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (Number.isInteger(value) && value >= 0) {
                    applyUpdate({ source: value })
                  }
                }}
              />
            </label>
            <label className="field">
              <span>Round</span>
              <input
                type="number"
                min="0"
                step="1"
                value={selectedVertex.round}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (Number.isInteger(value) && value >= 0) {
                    applyUpdate({ round: value })
                  }
                }}
              />
            </label>
            <label className="field">
              <span>Wave</span>
              <input
                type="number"
                min="0"
                step="1"
                value={selectedVertex.wave}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (Number.isInteger(value) && value >= 0) {
                    applyUpdate({ wave: value })
                  }
                }}
              />
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={selectedVertex.status}
                onChange={(event) => applyUpdate({ status: event.target.value as VertexStatus })}
              >
                {VERTEX_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field field--full">
            <span>Block payload</span>
            <textarea
              rows={4}
              value={selectedVertex.blockData.payload}
              placeholder="Optional block contents"
              onChange={(event) =>
                applyUpdate({ blockData: { payload: event.target.value } })
              }
            />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="metadata-grid">
            <div>
              <span>Position</span>
              <strong>{selectedVertex.position.x}, {selectedVertex.position.y}</strong>
            </div>
            <div>
              <span>Outgoing</span>
              <strong>{Array.from(edges.values()).filter((edge) => edge.source === selectedVertex.id).length}</strong>
            </div>
            <div>
              <span>Incoming</span>
              <strong>{Array.from(edges.values()).filter((edge) => edge.target === selectedVertex.id).length}</strong>
            </div>
          </div>

          <button type="button" className="danger-button" onClick={() => removeVertex(selectedVertex.id)}>
            Delete vertex
          </button>
        </div>
      )}

      {selectedEdge && (
        <div className="inspector-content">
          <p className="inspector-intro">Strong edges are generated when a block is created and point to its previous-round predecessors.</p>
          <div className="edge-route">
            <span>{selectedEdge.source}</span>
            <span>→</span>
            <span>{selectedEdge.target}</span>
          </div>
          <div className="strong-edge-readonly">
            <span className="inspector-edge-kind__line" />
            <strong>Strong predecessor edge</strong>
            <small>new block → round {selectedEdge.target}'s predecessor</small>
          </div>
          <button type="button" className="danger-button" onClick={() => removeEdge(selectedEdge.id)}>
            Delete edge
          </button>
        </div>
      )}

      {!selectedVertex && !selectedEdge && (
        <div className="inspector-empty">
          <div className="inspector-empty__graphic" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h3>Explore the local DAG</h3>
          <p>Select a vertex or edge to inspect and edit it.</p>
          <ol>
            <li><span>1</span>Add a block to the current round.</li>
            <li><span>2</span>Strong edges link it to round r−1.</li>
            <li><span>3</span>Select a block or edge to inspect it.</li>
          </ol>
        </div>
      )}

      <div className="inspector-legend">
        <span>Legend</span>
        <div><i className="legend-line legend-line--strong" />Strong predecessor edge</div>
      </div>
    </aside>
  )
}
