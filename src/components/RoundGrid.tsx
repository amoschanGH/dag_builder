import {
  roundGridColumnCenter,
  roundGridRowCenter,
  type RoundGridBounds,
} from '../domain/dag'

export function RoundGrid({ bounds }: { bounds: RoundGridBounds }) {
  const gridLeft = bounds.originX - bounds.headerWidth
  const gridTop = bounds.originY - bounds.headerHeight
  const width =
    bounds.headerWidth +
    (bounds.rounds.length - 1) * bounds.columnWidth +
    bounds.nodeWidth
  const height =
    bounds.headerHeight +
    (bounds.sources.length - 1) * bounds.rowHeight +
    bounds.nodeHeight

  return (
    <div
      className="round-grid"
      aria-hidden="true"
      style={{
        left: gridLeft,
        top: gridTop,
        width,
        height,
      }}
    >
      <span className="round-grid__axis-label round-grid__axis-label--round">
        round
      </span>
      <span className="round-grid__axis-label round-grid__axis-label--source">
        source
      </span>

      {bounds.sources.map((source) => {
        const rowY = roundGridRowCenter(source, bounds) - gridTop
        return (
          <div
            className="round-grid__row"
            key={`source-${source}`}
            style={{
              top: rowY,
              left: bounds.headerWidth,
            }}
          >
            <span className="round-grid__source-label">S{source}</span>
          </div>
        )
      })}

      {bounds.rounds.map((round) => {
        const columnX = roundGridColumnCenter(round, bounds) - gridLeft
        const isNextRound = round === bounds.nextRound
        return (
          <div
            className={`round-grid__column ${isNextRound ? 'round-grid__column--next' : ''}`}
            key={`round-${round}`}
            style={{ left: columnX }}
          >
            <span className="round-grid__round-label">R{round}</span>
          </div>
        )
      })}
    </div>
  )
}
