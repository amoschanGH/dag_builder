import { useMemo } from 'react'
import type { EdgeKind, VertexStatus } from '../domain/dag'
import { getStrongReferenceDetails } from '../domain/strongReferences'
import { summarizeRound } from '../simulation/roundPolicy'
import type { ProcessView } from '../simulation/types'
import { useSimulationStore } from '../store/useSimulationStore'
import { SimulationCanvas } from './SimulationCanvas'
import { StrongReferenceDetails } from './StrongReferenceDetails'

function processLabel(processId: number) {
  return processId + 1
}

function statusLabel(status: VertexStatus | EdgeKind) {
  return status
    .split('-')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="simulation-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function roundSummaryForProcess(
  process: ProcessView | undefined,
  faultTolerance: number,
) {
  const derived = process
    ? summarizeRound(process.dag, faultTolerance)
    : {
        currentRound: 0,
        vertexCount: 0,
        quorumSize: 2 * faultTolerance + 1,
        canAdvance: true,
        nextRound: 1,
      }
  if (process && process.statusRound > derived.currentRound) {
    return {
      ...derived,
      currentRound: process.statusRound,
      vertexCount: 0,
      canAdvance: true,
      nextRound: process.statusRound + 1,
    }
  }
  return derived
}

export function SimulationWorkbench() {
  const snapshot = useSimulationStore((state) => state.snapshot)
  const activeProcessId = useSimulationStore((state) => state.activeProcessId)
  const selectedVertexId = useSimulationStore((state) => state.selectedVertexId)
  const selectedEdgeId = useSimulationStore((state) => state.selectedEdgeId)
  const processCount = useSimulationStore((state) => state.processCount)
  const delay = useSimulationStore((state) => state.delay)
  const faultTolerance = useSimulationStore((state) => state.faultTolerance)
  const notice = useSimulationStore((state) => state.notice)
  const configure = useSimulationStore((state) => state.configure)
  const setActiveProcess = useSimulationStore((state) => state.setActiveProcess)
  const selectVertex = useSimulationStore((state) => state.selectVertex)
  const createBufferedVertex = useSimulationStore((state) => state.createBufferedVertex)
  const flushVertex = useSimulationStore((state) => state.flushVertex)
  const flushSelectedVertex = useSimulationStore((state) => state.flushSelectedVertex)
  const flushAllBuffers = useSimulationStore((state) => state.flushAllBuffers)
  const broadcastSelectedVertex = useSimulationStore(
    (state) => state.broadcastSelectedVertex,
  )
  const step = useSimulationStore((state) => state.step)
  const runOneTick = useSimulationStore((state) => state.runOneTick)
  const runUntilIdle = useSimulationStore((state) => state.runUntilIdle)
  const clearNotice = useSimulationStore((state) => state.clearNotice)

  const process = snapshot.processes.get(activeProcessId)
  const selectedDagVertex = selectedVertexId
    ? process?.dag.vertices.get(selectedVertexId)
    : undefined
  const selectedBuffered = selectedVertexId
    ? process?.buffer.get(selectedVertexId)
    : undefined
  const selectedVertex = selectedDagVertex ?? selectedBuffered?.vertex
  const selectedEdge = selectedEdgeId ? process?.edges.get(selectedEdgeId) : undefined
  const referenceDetails = getStrongReferenceDetails(
    selectedEdge,
    process?.dag.vertices ?? new Map(),
    process?.edges.values() ?? [],
  )
  const canBroadcast = selectedDagVertex !== undefined
  const canFlushSelected = selectedBuffered !== undefined
  const roundSummary = roundSummaryForProcess(process, faultTolerance)

  const processIds = useMemo(
    () => Array.from(snapshot.processes.keys()).sort((left, right) => left - right),
    [snapshot.processes],
  )
  const bufferEntries = process
    ? Array.from(process.buffer.values()).sort((left, right) =>
        left.vertex.id.localeCompare(right.vertex.id),
      )
    : []
  const recentEvents = useMemo(
    () => Array.from(snapshot.log).reverse().slice(0, 14),
    [snapshot.log],
  )
  const totalBuffered = useMemo(
    () =>
      Array.from(snapshot.processes.values()).reduce(
        (total, view) => total + view.buffer.size,
        0,
      ),
    [snapshot.processes],
  )
  const totalPendingEdges = useMemo(
    () =>
      Array.from(snapshot.processes.values()).reduce(
        (total, view) => total + view.pendingEdges.size,
        0,
      ),
    [snapshot.processes],
  )

  return (
    <div className="simulation-workbench">
      <div className="simulation-toolbar" role="toolbar" aria-label="Simulation controls">
        <div className="simulation-toolbar__group">
          <label>
            Processes
            <select
              value={processCount}
              onChange={(event) => configure(Number(event.target.value), delay, faultTolerance)}
            >
              {[2, 3, 4, 5].map((count) => (
                <option key={count} value={count}>{count}</option>
              ))}
            </select>
          </label>
          <label>
            Delivery delay
            <select
              value={delay}
              onChange={(event) => configure(processCount, Number(event.target.value), faultTolerance)}
            >
              {[1, 2, 3, 5, 8, 12].map((ticks) => (
                <option key={ticks} value={ticks}>{ticks} tick{ticks === 1 ? '' : 's'}</option>
              ))}
            </select>
          </label>
          <label>
            Fault tolerance f
            <select
              value={faultTolerance}
              onChange={(event) => configure(processCount, delay, Number(event.target.value))}
            >
              {[0, 1, 2, 3].map((value) => (
                <option key={value} value={value}>f = {value} · quorum {2 * value + 1}</option>
              ))}
            </select>
          </label>
          <button type="button" className="simulation-button simulation-button--quiet" onClick={() => configure(processCount, delay, faultTolerance)}>
            Reset from editor
          </button>
        </div>

        <div className="simulation-toolbar__group simulation-toolbar__group--actions">
          <button type="button" className="simulation-button" onClick={createBufferedVertex}>
            <span>+</span> Create in buffer
          </button>
          <button type="button" className="simulation-button" onClick={step} disabled={snapshot.queue.length === 0}>
            Step event
          </button>
          <button type="button" className="simulation-button" onClick={runOneTick} disabled={snapshot.queue.length === 0}>
            Run tick
          </button>
          <button type="button" className="simulation-button simulation-button--primary" onClick={runUntilIdle} disabled={snapshot.queue.length === 0}>
            Run queue
          </button>
          <button type="button" className="simulation-button simulation-button--flush" onClick={flushAllBuffers} disabled={totalBuffered === 0}>
            Flush all ({totalBuffered})
          </button>
        </div>
      </div>

      {notice && (
        <div className={`simulation-notice simulation-notice--${notice.tone}`} role="status">
          <span>{notice.message}</span>
          <button type="button" onClick={clearNotice} aria-label="Dismiss simulation message">×</button>
        </div>
      )}

      <div className="process-strip" aria-label="Process views">
        {processIds.map((processId) => {
          const view = snapshot.processes.get(processId)
          if (!view) return null
          const round = roundSummaryForProcess(view, faultTolerance)
          const active = processId === activeProcessId
          return (
            <button
              type="button"
              key={processId}
              className={active ? 'process-card is-active' : 'process-card'}
              aria-pressed={active}
              onClick={() => setActiveProcess(processId)}
            >
              <span className="process-card__id">P{processLabel(processId)}</span>
              <span className="process-card__name">Process {processLabel(processId)}</span>
              <span className="process-card__stats">
                <b>{view.dag.vertices.size}</b> DAG
                <i />
                <b>{view.buffer.size}</b> buffer
              </span>
              <small className={round.canAdvance ? 'process-card__gate is-open' : 'process-card__gate'}>
                r{round.currentRound || '—'}: {round.vertexCount}/{round.quorumSize}
              </small>
              {view.pendingEdges.size > 0 && (
                <small className="process-card__pending">{view.pendingEdges.size} pending edge{view.pendingEdges.size === 1 ? '' : 's'}</small>
              )}
            </button>
          )
        })}
      </div>

      <div className="simulation-metrics" aria-label="Simulation metrics">
        <Metric label="Logical tick" value={snapshot.currentTick} />
        <Metric label="Queued events" value={snapshot.queue.length} />
        <Metric label="Buffered vertices" value={totalBuffered} />
        <Metric label="Pending edges" value={totalPendingEdges} />
      </div>

      <div className={`round-gate-banner ${roundSummary.canAdvance ? 'is-open' : 'is-locked'}`}>
        <div>
          <span className="round-gate-banner__label">Round gate · f = {faultTolerance}</span>
          <strong>
            Round {roundSummary.currentRound || '—'} / next {roundSummary.nextRound}
          </strong>
        </div>
        <p>
          {roundSummary.canAdvance
            ? `Ready: round ${roundSummary.currentRound || 0} has met 2f+1 = ${roundSummary.quorumSize}.`
            : `Need ${Math.max(0, roundSummary.quorumSize - roundSummary.vertexCount)} more vertex/vertices at round ${roundSummary.currentRound} before advancing.`}
        </p>
        <small>Current round: {roundSummary.vertexCount} / {roundSummary.quorumSize}</small>
      </div>

      <div className="simulation-grid">
        <SimulationCanvas />

        <aside className="simulation-sidebar" aria-label="Process buffer and selection">
          <section className="simulation-sidebar__section">
            <div className="simulation-section-heading">
              <div>
                <p className="eyebrow">Local buffer</p>
                <h2>Process {processLabel(activeProcessId)}</h2>
              </div>
              <span>{bufferEntries.length}</span>
            </div>
            <div className="buffer-list">
              {bufferEntries.length === 0 && (
                <p className="simulation-empty-copy">No vertices are waiting for insertion.</p>
              )}
              {bufferEntries.map((buffered) => (
                <div
                  key={buffered.vertex.id}
                  className={buffered.vertex.id === selectedVertexId ? 'buffer-row is-selected' : 'buffer-row'}
                >
                  <button type="button" onClick={() => selectVertex(buffered.vertex.id)}>
                    <span className={`buffer-status buffer-status--${buffered.vertex.status}`} />
                    <span>
                      <strong>{buffered.vertex.id}</strong>
                      <small>
                        Source {buffered.vertex.source} · Round {buffered.vertex.round}
                      </small>
                    </span>
                    <em>
                      {buffered.origin === null
                        ? 'local'
                        : `P${processLabel(buffered.origin)} · t${buffered.receivedAt}`}
                    </em>
                  </button>
                  <button
                    type="button"
                    className="buffer-flush"
                    onClick={() => flushVertex(buffered.vertex.id)}
                  >
                    Flush
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="simulation-sidebar__section simulation-selection">
            <div className="simulation-section-heading">
              <div>
                <p className="eyebrow">Selection</p>
                <h2>{selectedVertex ? selectedVertex.id : selectedEdge ? `Edge ${selectedEdge.id}` : 'No selection'}</h2>
              </div>
              {selectedVertex && (
                <span className={`status-chip status-chip--${selectedVertex.status}`}>
                  {statusLabel(selectedVertex.status)}
                </span>
              )}
            </div>

            {selectedVertex ? (
              <>
                <div className="simulation-detail-grid">
                  <div><span>Process</span><strong>P{processLabel(activeProcessId)}</strong></div>
                  <div><span>Source</span><strong>{selectedVertex.source}</strong></div>
                  <div><span>Round</span><strong>{selectedVertex.round}</strong></div>
                  <div><span>Wave</span><strong>{selectedVertex.wave}</strong></div>
                </div>
                <p className="simulation-payload">{selectedVertex.blockData.payload || 'No block payload.'}</p>
                {selectedBuffered && (
                  <p className="simulation-hint">
                    This vertex is buffered. Insert it before broadcasting; receiving vertices also remain buffered until explicitly flushed.
                  </p>
                )}
                <div className="simulation-selection__actions">
                  <button
                    type="button"
                    className="simulation-button"
                    disabled={!canFlushSelected}
                    onClick={flushSelectedVertex}
                  >
                    Flush selected
                  </button>
                  <button
                    type="button"
                    className="simulation-button simulation-button--primary"
                    disabled={!canBroadcast}
                    onClick={broadcastSelectedVertex}
                  >
                    Broadcast selected
                  </button>
                </div>
              </>
            ) : selectedEdge && referenceDetails ? (
              <StrongReferenceDetails details={referenceDetails} />
            ) : selectedEdge ? (
              <p className="simulation-empty-copy">This edge is not a valid strong reference.</p>
            ) : (
              <p className="simulation-empty-copy">
                Select a DAG vertex, buffer row, or strong edge to inspect it.
              </p>
            )}
          </section>
        </aside>
      </div>

      <div className="event-console">
        <section className="event-panel">
          <div className="event-panel__heading">
            <div>
              <p className="eyebrow">Priority queue</p>
              <h2>Scheduled messages</h2>
            </div>
            <span>{snapshot.queue.length}</span>
          </div>
          <div className="event-table-wrap">
            <table className="event-table">
              <thead>
                <tr>
                  <th>Delivery</th>
                  <th>Message</th>
                  <th>Route</th>
                  <th>Vertex</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.queue.length === 0 && (
                  <tr><td colSpan={4} className="event-table__empty">No messages are scheduled.</td></tr>
                )}
                {snapshot.queue.slice(0, 8).map((message) => (
                  <tr key={message.id}>
                    <td><span className="tick-badge">t{message.deliveryTime}</span></td>
                    <td>#{message.id} <small>seq {message.enqueueSequence}</small></td>
                    <td>P{processLabel(message.sender)} <span aria-hidden="true">→</span> P{processLabel(message.receiver)}</td>
                    <td>{message.payload.vertex.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="event-panel event-panel--log">
          <div className="event-panel__heading">
            <div>
              <p className="eyebrow">Event log</p>
              <h2>Recent simulation activity</h2>
            </div>
            <span>{snapshot.log.length}</span>
          </div>
          <div className="simulation-log">
            {recentEvents.length === 0 && (
              <p className="simulation-empty-copy">Create, flush, or broadcast a vertex to begin.</p>
            )}
            {recentEvents.map((event) => (
              <div key={event.id} className="simulation-log__row">
                <span className={`event-kind event-kind--${event.kind}`}>{event.kind.replaceAll('-', ' ')}</span>
                <span className="event-tick">t{event.tick}</span>
                <p>{event.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
