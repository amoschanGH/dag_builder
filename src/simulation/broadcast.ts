import type { DagEdge } from '../domain/dag'
import type { ProcessId, Tick, VertexPacket } from './types'

export interface BroadcastInput {
  now: Tick
  broadcastId: number
  sender: ProcessId
  vertex: VertexPacket['vertex']
  incidentEdges: readonly DagEdge[]
  receiverIds: readonly ProcessId[]
}

export interface OutboundMessage {
  sender: ProcessId
  receiver: ProcessId
  payload: VertexPacket
  delay: number
}

export interface BroadcastStrategy {
  broadcast(input: BroadcastInput): readonly OutboundMessage[]
}

export interface DelayRequest {
  sender: ProcessId
  receiver: ProcessId
  vertexId: string
  broadcastId: number
  now: Tick
}

export type DelayProvider = (request: DelayRequest) => number

function validateDelay(delay: number) {
  if (!Number.isSafeInteger(delay) || delay < 0) {
    throw new Error(`Broadcast delay must be a non-negative safe integer: ${delay}`)
  }
}

export class SimpleDelayedBroadcast implements BroadcastStrategy {
  private readonly delayProvider: DelayProvider

  constructor(delayOrProvider: number | DelayProvider = 3) {
    if (typeof delayOrProvider === 'number') {
      validateDelay(delayOrProvider)
      this.delayProvider = () => delayOrProvider
    } else {
      this.delayProvider = delayOrProvider
    }
  }

  broadcast({
    now,
    broadcastId,
    sender,
    vertex,
    incidentEdges,
    receiverIds,
  }: BroadcastInput): readonly OutboundMessage[] {
    const receivers = Array.from(new Set(receiverIds))
      .filter((receiver) => receiver !== sender)
      .sort((left, right) => left - right)

    return receivers.map((receiver) => {
      const delay = this.delayProvider({
        sender,
        receiver,
        vertexId: vertex.id,
        broadcastId,
        now,
      })
      validateDelay(delay)

      return {
        sender,
        receiver,
        payload: {
          vertex,
          incidentEdges,
        },
        delay,
      }
    })
  }
}
