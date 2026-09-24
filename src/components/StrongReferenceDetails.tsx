import type { StrongReferenceDetails } from '../domain/strongReferences'

export function StrongReferenceDetails({
  details,
}: {
  details: StrongReferenceDetails
}) {
  const { edge, from, to, roundDelta, history } = details
  const capturedAt = edge.reference?.capturedAt
  const originProcess = edge.reference?.originProcess

  return (
    <div className="reference-details">
      <div className="reference-summary">
        <span className="reference-summary__label">Strong reference</span>
        <strong>{edge.id}</strong>
        <span className="reference-summary__relation">new block → previous round</span>
      </div>

      <div className="reference-route">
        <div>
          <span>Referencing vertex</span>
          <strong>{from.id}</strong>
          <small>source {from.source} · round {from.round}</small>
        </div>
        <b aria-hidden="true">→</b>
        <div>
          <span>Referenced vertex</span>
          <strong>{to.id}</strong>
          <small>source {to.source} · round {to.round}</small>
        </div>
      </div>

      <dl className="reference-facts">
        <div>
          <dt>Referencing vertex</dt>
          <dd>{from.id}</dd>
        </div>
        <div>
          <dt>Referenced vertex</dt>
          <dd>{to.id}</dd>
        </div>
        <div>
          <dt>Round relation</dt>
          <dd>r → r−{roundDelta}</dd>
        </div>
        <div>
          <dt>Captured at</dt>
          <dd>{capturedAt === undefined ? 'editor seed' : `tick ${capturedAt}`}</dd>
        </div>
        <div>
          <dt>Origin process</dt>
          <dd>{originProcess === undefined ? 'imported' : `P${originProcess + 1}`}</dd>
        </div>
        <div>
          <dt>Reference kind</dt>
          <dd>strong</dd>
        </div>
      </dl>

      <section className="causal-history">
        <div className="causal-history__heading">
          <h3>Causal history</h3>
          <span>{history.length} ancestor{history.length === 1 ? '' : 's'}</span>
        </div>
        <p>Following strong references from the referenced block toward older blocks.</p>
        <ol>
          {history.slice(0, 12).map((entry) => (
            <li key={`${entry.vertex.id}-${entry.depth}`}>
              <span className="history-depth">d{entry.depth}</span>
              <strong>{entry.vertex.id}</strong>
              <span>source {entry.vertex.source} · round {entry.vertex.round}</span>
              {entry.viaEdgeId && <code>{entry.viaEdgeId}</code>}
            </li>
          ))}
        </ol>
        {history.length > 12 && <small>Showing the first 12 ancestors.</small>}
      </section>
    </div>
  )
}
