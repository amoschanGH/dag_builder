import { getRoundGridBounds, type DagVertex } from '../domain/dag'

export function RoundGrid({ vertices }: { vertices: Iterable<DagVertex> }) {
  const bounds = getRoundGridBounds(vertices)
  const rounds = Array.from(
    { length: bounds.maxRound - bounds.minRound + 1 },
    (_, index) => bounds.minRound + index,
  )
  const sources = Array.from(
    { length: bounds.maxSource - bounds.minSource + 1 },
    (_, index) => bounds.minSource + index,
  )
  const width = (bounds.maxRound - bounds.minRound) * bounds.columnWidth + 180
  const height = (bounds.maxSource - bounds.minSource) * bounds.rowHeight + 100

  return (
    <div
      className="round-grid"
      aria-hidden="true"
      style={{
        left: bounds.originX - 70,
        top: bounds.originY - 45,
        width,
        height,
      }}
    >
      {sources.map((source) => (
        <div
          className="round-grid__row"
          key={`source-${source}`}
          style={{
            top: 45 + (source - bounds.minSource) * bounds.rowHeight,
          }}
        >
          <span className="round-grid__source-label">{source}</span>
        </div>
      ))}
      {rounds.map((round) => (
        <div
          className="round-grid__column"
          key={`round-${round}`}
          style={{
            left: 70 + (round - bounds.minRound) * bounds.columnWidth,
          }}
        >
          <span className="round-grid__round-label">{round}</span>
        </div>
      ))}
      <span className="round-grid__axis-label">round</span>
    </div>
  )
}
