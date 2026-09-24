export type QueueComparator<T> = (left: T, right: T) => number

export class PriorityQueue<T> {
  private heap: T[] = []

  constructor(private readonly comparator: QueueComparator<T>) {}

  get size() {
    return this.heap.length
  }

  push(value: T) {
    this.heap.push(value)
    this.bubbleUp(this.heap.length - 1)
  }

  peek(): T | undefined {
    return this.heap[0]
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined

    const first = this.heap[0]
    const last = this.heap.pop()
    if (this.heap.length > 0 && last !== undefined) {
      this.heap[0] = last
      this.bubbleDown(0)
    }
    return first
  }

  toSortedArray(): T[] {
    const copy = new PriorityQueue<T>(this.comparator)
    for (const value of this.heap) copy.push(value)
    return copy.toArray()
  }

  clear() {
    this.heap = []
  }

  private toArray() {
    const values: T[] = []
    let value = this.pop()
    while (value !== undefined) {
      values.push(value)
      value = this.pop()
    }
    return values
  }

  private parent(index: number) {
    return Math.floor((index - 1) / 2)
  }

  private left(index: number) {
    return index * 2 + 1
  }

  private right(index: number) {
    return index * 2 + 2
  }

  private bubbleUp(index: number) {
    let current = index
    while (current > 0) {
      const parent = this.parent(current)
      if (this.comparator(this.heap[parent], this.heap[current]) <= 0) break
      this.swap(parent, current)
      current = parent
    }
  }

  private bubbleDown(index: number) {
    let current = index
    while (true) {
      const left = this.left(current)
      const right = this.right(current)
      let smallest = current

      if (
        left < this.heap.length &&
        this.comparator(this.heap[left], this.heap[smallest]) < 0
      ) {
        smallest = left
      }
      if (
        right < this.heap.length &&
        this.comparator(this.heap[right], this.heap[smallest]) < 0
      ) {
        smallest = right
      }
      if (smallest === current) break

      this.swap(current, smallest)
      current = smallest
    }
  }

  private swap(left: number, right: number) {
    const value = this.heap[left]
    this.heap[left] = this.heap[right]
    this.heap[right] = value
  }
}
