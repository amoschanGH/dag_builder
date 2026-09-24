import { useState } from 'react'
import { DagCanvas } from './components/DagCanvas'
import { InspectorPanel } from './components/InspectorPanel'
import { SimulationWorkbench } from './components/SimulationWorkbench'
import { useDagStore } from './store/useDagStore'
import { useSimulationStore } from './store/useSimulationStore'

type WorkspaceMode = 'editor' | 'simulation'

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string
  value: number
  detail: string
}) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function App() {
  const [mode, setMode] = useState<WorkspaceMode>('editor')
  const vertexCount = useDagStore((state) => state.dag.vertices.size)
  const edgeCount = useDagStore((state) => state.edges.size)
  const strongEdgeCount = useDagStore(
    (state) =>
      Array.from(state.edges.values()).filter((edge) => edge.kind === 'strong')
        .length,
  )
  const loadExample = useDagStore((state) => state.loadExample)
  const clearDag = useDagStore((state) => state.clearDag)

  const simulator = useSimulationStore((state) => state.simulator)
  const simulationSnapshot = useSimulationStore((state) => state.snapshot)
  const activeProcessId = useSimulationStore((state) => state.activeProcessId)
  const processCount = useSimulationStore((state) => state.processCount)
  const delay = useSimulationStore((state) => state.delay)
  const faultTolerance = useSimulationStore((state) => state.faultTolerance)
  const initializeSimulation = useSimulationStore((state) => state.initialize)
  const configureSimulation = useSimulationStore((state) => state.configure)
  const activeProcess = simulationSnapshot.processes.get(activeProcessId)
  const pendingEdgeCount = activeProcess?.pendingEdges.size ?? 0

  const showEditor = mode === 'editor'
  const enterSimulation = () => {
    if (!simulator) initializeSimulation()
    setMode('simulation')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <p>DAG Research Workbench</p>
            <span>Interactive protocol laboratory</span>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="view-badge">
            <span className="view-badge__dot" />
            {showEditor ? 'Editor graph' : `Process ${activeProcessId + 1} view`}
          </div>
          <span className="phase-badge">Phase {showEditor ? '1' : '2'}</span>
          {showEditor ? (
            <>
              <button type="button" className="secondary-button" onClick={loadExample}>
                Load example
              </button>
              <button
                type="button"
                className="secondary-button secondary-button--danger"
                onClick={() => {
                  if (
                    window.confirm(
                      'Clear every vertex and edge from the editor graph?',
                    )
                  ) {
                    clearDag()
                  }
                }}
              >
                Clear
              </button>
            </>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={() => configureSimulation(processCount, delay, faultTolerance)}
            >
              Reset simulation
            </button>
          )}
        </div>
      </header>

      <main className="workspace">
        <section className="workspace-heading">
          <div>
            <p className="eyebrow">
              {showEditor ? 'Local DAG · Process view' : 'Deterministic network · Event queue'}
            </p>
            <h1>{showEditor ? 'Protocol canvas' : 'Network simulator'}</h1>
            <p>
              {showEditor
                ? 'Compose blocks and inspect the strong predecessor edges that connect each round.'
                : 'Create per-process buffers, schedule delayed broadcasts, and inspect deterministic message delivery.'}
            </p>
          </div>
          <div className="metrics" aria-label="Current graph metrics">
            {showEditor ? (
              <>
                <MetricCard label="Vertices" value={vertexCount} detail="indexed by ID" />
                <MetricCard label="Edges" value={edgeCount} detail="directed links" />
                <MetricCard label="Strong" value={strongEdgeCount} detail="causal references" />
              </>
            ) : (
              <>
                <MetricCard
                  label="DAG vertices"
                  value={activeProcess?.dag.vertices.size ?? 0}
                  detail={`process ${activeProcessId}`}
                />
                <MetricCard
                  label="Buffered"
                  value={activeProcess?.buffer.size ?? 0}
                  detail="awaiting insertion"
                />
                <MetricCard
                  label="Queue"
                  value={simulationSnapshot.queue.length}
                  detail={`${pendingEdgeCount} pending edges`}
                />
              </>
            )}
          </div>
        </section>

        <div className="workspace-tabs" role="tablist" aria-label="Workbench mode">
          <button
            type="button"
            role="tab"
            aria-selected={showEditor}
            className={showEditor ? 'workspace-tab is-active' : 'workspace-tab'}
            onClick={() => setMode('editor')}
          >
            <span>01</span> DAG editor
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!showEditor}
            className={!showEditor ? 'workspace-tab is-active' : 'workspace-tab'}
            onClick={enterSimulation}
          >
            <span>02</span> Network simulation
          </button>
          <p>
            {showEditor
              ? 'Author the seed graph used by the simulator.'
              : 'Pull-based simulation; no wall-clock timers or protocol ordering yet.'}
          </p>
        </div>

        {showEditor ? (
          <>
            <div className="workbench-grid">
              <DagCanvas />
              <InspectorPanel />
            </div>
            <footer className="workspace-footer">
              <span>React Flow canvas</span>
              <span>Zustand graph store</span>
              <span>Protocol engine decoupled from visualization</span>
            </footer>
          </>
        ) : (
          <SimulationWorkbench />
        )}
      </main>
    </div>
  )
}

export default App
