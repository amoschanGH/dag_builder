import { DagCanvas } from './components/DagCanvas'
import { InspectorPanel } from './components/InspectorPanel'
import { useDagStore } from './store/useDagStore'

function MetricCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function App() {
  const vertexCount = useDagStore((state) => state.dag.vertices.size)
  const edgeCount = useDagStore((state) => state.edges.size)
  const strongEdgeCount = useDagStore(
    (state) => Array.from(state.edges.values()).filter((edge) => edge.kind === 'strong').length,
  )
  const loadExample = useDagStore((state) => state.loadExample)
  const clearDag = useDagStore((state) => state.clearDag)

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
            Local view 0
          </div>
          <span className="phase-badge">Phase 1</span>
          <button type="button" className="secondary-button" onClick={loadExample}>
            Load example
          </button>
          <button
            type="button"
            className="secondary-button secondary-button--danger"
            onClick={() => {
              if (window.confirm('Clear every vertex and edge from this local view?')) {
                clearDag()
              }
            }}
          >
            Clear
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="workspace-heading">
          <div>
            <p className="eyebrow">Local DAG · Process view</p>
            <h1>Protocol canvas</h1>
            <p>Compose vertices, inspect references, and distinguish strong from weak causal links.</p>
          </div>
          <div className="metrics" aria-label="Current graph metrics">
            <MetricCard label="Vertices" value={vertexCount} detail="indexed by ID" />
            <MetricCard label="Edges" value={edgeCount} detail="directed links" />
            <MetricCard label="Strong" value={strongEdgeCount} detail="causal references" />
          </div>
        </section>

        <div className="workbench-grid">
          <DagCanvas />
          <InspectorPanel />
        </div>

        <footer className="workspace-footer">
          <span>React Flow canvas</span>
          <span>Zustand graph store</span>
          <span>Protocol engine decoupled from visualization</span>
        </footer>
      </main>
    </div>
  )
}

export default App
