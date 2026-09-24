import { useMemo, useState, type FormEvent } from 'react'
import { useDagStore } from '../store/useDagStore'

function sourceForRound(
  vertices: ReturnType<typeof useDagStore.getState>['dag']['vertices'],
  round: number,
) {
  const used = new Set(
    Array.from(vertices.values())
      .filter((vertex) => vertex.round === round)
      .map((vertex) => vertex.source),
  )
  let source = 1
  while (used.has(source)) source += 1
  return source
}

export function VertexComposer({ onClose }: { onClose: () => void }) {
  const vertices = useDagStore((state) => state.dag.vertices)
  const addVertex = useDagStore((state) => state.addVertexWithOptions)
  const initialRound =
    vertices.size === 0
      ? 1
      : Math.max(...Array.from(vertices.values(), (vertex) => vertex.round)) + 1
  const [round, setRound] = useState(initialRound)
  const [source, setSource] = useState(() => sourceForRound(vertices, initialRound))
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<Set<string>>(
    () =>
      new Set(
        Array.from(vertices.values())
          .filter((vertex) => vertex.round === initialRound - 1)
          .map((vertex) => vertex.id),
      ),
  )
  const [error, setError] = useState<string | null>(null)

  const candidates = useMemo(
    () =>
      Array.from(vertices.values())
        .filter((vertex) => vertex.round === round - 1)
        .sort((left, right) => left.source - right.source || left.id.localeCompare(right.id)),
    [round, vertices],
  )

  const updateRound = (value: number) => {
    const nextCandidates = Array.from(vertices.values()).filter(
      (vertex) => vertex.round === value - 1,
    )
    setRound(value)
    setSource(sourceForRound(vertices, value))
    setSelectedReferenceIds(new Set(nextCandidates.map((vertex) => vertex.id)))
    setError(null)
  }

  const toggleReference = (vertexId: string) => {
    setSelectedReferenceIds((current) => {
      const next = new Set(current)
      if (next.has(vertexId)) next.delete(vertexId)
      else next.add(vertexId)
      return next
    })
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = addVertex({
      round,
      source,
      referenceIds: Array.from(selectedReferenceIds),
    })
    if (result.ok) {
      onClose()
      return
    }
    setError(
      result.reason === 'invalid-reference'
        ? 'Strong references must point to vertices in the immediately previous round.'
        : result.reason === 'duplicate-id'
          ? 'A block with this generated ID already exists.'
          : 'Use non-negative whole-number source and round values.',
    )
  }

  return (
    <form className="vertex-composer" onSubmit={submit}>
      <div className="vertex-composer__heading">
        <div>
          <p className="eyebrow">New block</p>
          <h2>Compose a vertex</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close block composer">×</button>
      </div>

      <div className="vertex-composer__fields">
        <label className="field">
          <span>Source</span>
          <input
            type="number"
            min="1"
            step="1"
            value={source}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isInteger(value) && value >= 1) setSource(value)
            }}
          />
        </label>
        <label className="field">
          <span>Round</span>
          <input
            type="number"
            min="1"
            step="1"
            value={round}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isInteger(value) && value >= 1) updateRound(value)
            }}
          />
        </label>
      </div>

      <p className="vertex-composer__equivocation-hint">
        Use an existing source and round to model an equivocation block; conflicting blocks
        share a slot and are highlighted.
      </p>

      <div className="vertex-composer__references">
        <div className="vertex-composer__references-heading">
          <strong>Strong references</strong>
          <span>{selectedReferenceIds.size} selected</span>
        </div>
        <p>Choose which blocks from round {round - 1} this block references.</p>
        {candidates.length === 0 ? (
          <small>No vertices exist in round {round - 1}.</small>
        ) : (
          <div className="reference-options">
            {candidates.map((candidate) => (
              <label key={candidate.id} className="reference-option">
                <input
                  type="checkbox"
                  checked={selectedReferenceIds.has(candidate.id)}
                  onChange={() => toggleReference(candidate.id)}
                />
                <span>{candidate.id}</span>
                <small>source {candidate.source} · round {candidate.round}</small>
              </label>
            ))}
          </div>
        )}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="vertex-composer__actions">
        <button type="button" className="simulation-button" onClick={onClose}>Cancel</button>
        <button type="submit" className="simulation-button simulation-button--primary">Create block</button>
      </div>
    </form>
  )
}
