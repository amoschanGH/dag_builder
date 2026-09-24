import { describe, expect, it } from 'vitest'
import { PriorityQueue } from './priorityQueue'

interface Event {
  deliveryTime: number
  sequence: number
  id: number
}

const compare = (left: Event, right: Event) =>
  left.deliveryTime - right.deliveryTime ||
  left.sequence - right.sequence ||
  left.id - right.id

describe('PriorityQueue', () => {
  it('pops events in deterministic priority order', () => {
    const queue = new PriorityQueue<Event>(compare)
    queue.push({ deliveryTime: 5, sequence: 1, id: 1 })
    queue.push({ deliveryTime: 1, sequence: 2, id: 2 })
    queue.push({ deliveryTime: 3, sequence: 1, id: 3 })
    queue.push({ deliveryTime: 1, sequence: 1, id: 4 })

    expect(queue.toSortedArray()).toEqual([
      { deliveryTime: 1, sequence: 1, id: 4 },
      { deliveryTime: 1, sequence: 2, id: 2 },
      { deliveryTime: 3, sequence: 1, id: 3 },
      { deliveryTime: 5, sequence: 1, id: 1 },
    ])
    expect(queue.size).toBe(4)
  })

  it('uses enqueue sequence and then ID for exact ties', () => {
    const queue = new PriorityQueue<Event>(compare)
    queue.push({ deliveryTime: 2, sequence: 2, id: 8 })
    queue.push({ deliveryTime: 2, sequence: 2, id: 3 })
    queue.push({ deliveryTime: 2, sequence: 1, id: 9 })

    expect(queue.pop()).toEqual({ deliveryTime: 2, sequence: 1, id: 9 })
    expect(queue.pop()).toEqual({ deliveryTime: 2, sequence: 2, id: 3 })
    expect(queue.pop()).toEqual({ deliveryTime: 2, sequence: 2, id: 8 })
  })

  it('returns undefined when empty and supports clearing', () => {
    const queue = new PriorityQueue<Event>(compare)
    expect(queue.peek()).toBeUndefined()
    expect(queue.pop()).toBeUndefined()

    queue.push({ deliveryTime: 1, sequence: 1, id: 1 })
    queue.clear()
    expect(queue.size).toBe(0)
  })
})
