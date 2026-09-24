import { describe, expect, it } from 'vitest'
import { SimpleDelayedBroadcast } from './broadcast'
import type { VertexContent } from './types'

const vertex: VertexContent = {
  id: 'v1',
  source: 0,
  round: 1,
  wave: 1,
  position: { x: 0, y: 0 },
  blockData: { proposer: 0, payload: '', metadata: {} },
}

describe('SimpleDelayedBroadcast', () => {
  it('targets every other receiver once in numeric order', () => {
    const strategy = new SimpleDelayedBroadcast(3)
    const messages = strategy.broadcast({
      now: 4,
      broadcastId: 7,
      sender: 0,
      vertex,
      incidentEdges: [],
      receiverIds: [3, 1, 0, 2, 1],
    })

    expect(messages.map((message) => message.receiver)).toEqual([1, 2, 3])
    expect(messages.every((message) => message.delay === 3)).toBe(true)
  })

  it('passes deterministic request data to the delay provider', () => {
    const requests: unknown[] = []
    const strategy = new SimpleDelayedBroadcast((request) => {
      requests.push(request)
      return request.receiver === 0 ? 1 : 4
    })
    const messages = strategy.broadcast({
      now: 10,
      broadcastId: 2,
      sender: 1,
      vertex,
      incidentEdges: [],
      receiverIds: [2, 0],
    })

    expect(requests).toEqual([
      {
        now: 10,
        sender: 1,
        receiver: 0,
        vertexId: 'v1',
        broadcastId: 2,
      },
      {
        now: 10,
        sender: 1,
        receiver: 2,
        vertexId: 'v1',
        broadcastId: 2,
      },
    ])
    expect(messages.map((message) => message.delay)).toEqual([1, 4])
  })

  it('rejects invalid fixed and computed delays', () => {
    expect(() => new SimpleDelayedBroadcast(-1)).toThrow(/delay/i)
    expect(() => new SimpleDelayedBroadcast(1.5)).toThrow(/delay/i)
    expect(() =>
      new SimpleDelayedBroadcast(() => Number.NaN).broadcast({
        now: 0,
        broadcastId: 1,
        sender: 0,
        vertex,
        incidentEdges: [],
        receiverIds: [1],
      }),
    ).toThrow(/delay/i)
  })
})
