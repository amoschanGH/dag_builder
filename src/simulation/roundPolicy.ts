import type { LocalDag, VertexId } from '../domain/dag'
import type { Tick } from './types'

export const DEFAULT_FAULT_TOLERANCE = 1
export const MAX_FAULT_TOLERANCE = 3

export type RoundGateReason =
  | 'invalid-round'
  | 'initial-round'
  | 'round-out-of-order'
  | 'quorum-not-met'

export interface RoundGateResult {
  ok: boolean
  reason?: RoundGateReason
  message?: string
}

export interface RoundSummary {
  currentRound: number
  vertexCount: number
  quorumSize: number
  canAdvance: boolean
  nextRound: number
}

export function normalizeFaultTolerance(value: number | undefined) {
  if (value === undefined) return DEFAULT_FAULT_TOLERANCE
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_FAULT_TOLERANCE) {
    throw new Error(`faultTolerance must be an integer from 0 to ${MAX_FAULT_TOLERANCE}`)
  }
  return value
}

export function quorumSize(faultTolerance: number) {
  return 2 * normalizeFaultTolerance(faultTolerance) + 1
}

export function currentRound(dag: LocalDag) {
  let highest = 0
  for (const round of dag.rounds.keys()) highest = Math.max(highest, round)
  return highest
}

export function countAtRound(dag: LocalDag, round: number) {
  return dag.rounds.get(round)?.size ?? 0
}

export function countDistinctSourcesAtRound(dag: LocalDag, round: number) {
  const vertexIds = dag.rounds.get(round) ?? new Set<VertexId>()
  const sources = new Set<number>()
  for (const vertexId of vertexIds) {
    const vertex = dag.vertices.get(vertexId)
    if (vertex) sources.add(vertex.source)
  }
  return sources.size
}

export function canInsertAtRound(
  dag: LocalDag,
  targetRound: number,
  faultTolerance: number,
  allowInitialRound = false,
): RoundGateResult {
  const threshold = quorumSize(faultTolerance)
  if (!Number.isSafeInteger(targetRound) || targetRound < 1) {
    return { ok: false, reason: 'invalid-round', message: 'Rounds must be positive safe integers.' }
  }

  const latestRound = currentRound(dag)
  if (latestRound === 0) {
    if (allowInitialRound || targetRound === 1) return { ok: true }
    return {
      ok: false,
      reason: 'initial-round',
      message: 'An empty local DAG must start at round 1.',
    }
  }

  if (targetRound < latestRound) {
    return {
      ok: false,
      reason: 'round-out-of-order',
      message: `Round ${targetRound} is behind the local DAG's latest round ${latestRound}.`,
    }
  }

  if (targetRound === latestRound) return { ok: true }

  if (targetRound !== latestRound + 1) {
    return {
      ok: false,
      reason: 'round-out-of-order',
      message: `Cannot skip from round ${latestRound} to round ${targetRound}.`,
    }
  }

  if (countDistinctSourcesAtRound(dag, latestRound) < threshold) {
    return {
      ok: false,
      reason: 'quorum-not-met',
      message: `Round ${latestRound} needs at least ${threshold} vertices (2f+1) before advancing to round ${targetRound}.`,
    }
  }

  return { ok: true }
}

export function summarizeRound(
  dag: LocalDag,
  faultTolerance: number,
): RoundSummary {
  const latestRound = currentRound(dag)
  const threshold = quorumSize(faultTolerance)
  const vertexCount = countDistinctSourcesAtRound(dag, latestRound)
  return {
    currentRound: latestRound,
    vertexCount,
    quorumSize: threshold,
    canAdvance: latestRound === 0 || vertexCount >= threshold,
    nextRound: latestRound + 1,
  }
}

export function isValidTick(value: number): value is Tick {
  return Number.isSafeInteger(value) && value >= 0
}
