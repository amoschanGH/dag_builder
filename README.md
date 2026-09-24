# DAG Research Workbench
*A Visual Interactive Framework for Studying DAG-Based Blockchain Consensus Protocols*

## Current implementation

Phase 2 adds deterministic network simulation to the Phase 1 DAG editor.

**DAG editor**

- Place, drag, select, inspect, and delete vertices.
- Create blocks; strong predecessor edges are generated automatically to the previous round.
- Use the New block composer to choose source/round and select or edit strong references instead of being forced into the latest round.
- Prevent self-loops, duplicate directed edges, cycles, and duplicate `(source, round)` slots.
- Load a sample DAG or clear the editor graph.
- Select a strong edge to inspect its source/target blocks, round relation, capture tick, origin process, and recursively traced causal history.
- Display the default round/source grid: rounds run left-to-right, sources run top-to-bottom, outgoing/source handles are on the left, incoming/target handles are on the right, and strong edges point from a new block toward its previous-round predecessors; switch to Freeform for manual placement.
- Weak edges are intentionally deferred while the strong-edge/local-round model is established.

**Network simulation**

- Load an immutable snapshot of the editor graph into process 1; other process views start empty.
- Create local vertices in a process buffer, then explicitly flush them into that process's local DAG.
- Broadcast accepted DAG vertices to every other process with configurable logical-tick delays.
- Step one message, run all messages at the next tick, or drain the finite queue.
- Inspect per-process DAG/buffer counts, pending out-of-order edges, the priority queue, and the event log.
- Gate round advancement on `2f+1` vertices in the latest local-DAG round; configure `f` in the simulation controls.
- Capture a new block's strong edges from the creating process's local DAG at the preceding round when the block is created; later DAG changes do not rewrite that snapshot.
- Require `block.round === ProcessView.statusRound` before adding a received block to a process's local DAG; the slot `(source, round)` must also be empty.
- Preserve deterministic ordering by delivery tick, enqueue sequence, and message ID.

The simulation is pull-based: it has no wall-clock timer, persistence, backend, network partition, Byzantine behavior, or DAG-Rider ordering yet. Refreshing the page restores the editor sample and discards simulation state.

## Getting started

Use Node.js `^22.12.0`, `^24.0.0`, or `>=26.0.0` (the range required by the current Vite/Vitest toolchain).

```bash
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173/` by default.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Run focused suites with:

```bash
npm test -- src/simulation
npm test -- src/store/useDagStore.test.ts
npm test -- src/store/useSimulationStore.test.ts
```

## Source layout

- `src/domain/dag.ts` contains framework-independent DAG types and invariants.
- `src/simulation/` contains the pull-based simulator, deterministic priority queue, broadcast strategy interface, and configurable `2f+1` round policy; it has no React, Zustand, browser-clock, or timer dependency.
- `src/store/useDagStore.ts` owns the editor graph, while `src/store/useSimulationStore.ts` adapts the simulator to UI state.
- `src/components/` projects editor or process state into React Flow without making either state source-of-truth for the other; `RoundGrid.tsx` provides the reference round/source axes.
- `src/index.css` loads Tailwind before React Flow styles, as required by React Flow.

---

## Project Vision

The goal of this project is not merely to implement DAG-Rider, but to build a reusable **Distributed DAG Research Workbench** that can visualize, simulate, and analyze DAG-based consensus protocols.

The framework should allow researchers to:

- Maintain multiple local DAG views simultaneously
- Simulate asynchronous communication
- Broadcast vertices across nodes
- Inspect buffers and DAG states
- Visualize protocol execution
- Analyze DAG properties such as strong paths
- Reproduce proofs from DAG-Rider
- Compare protocols such as:
  - DAG-Rider
  - Bullshark
  - Narwhal
  - Tusk
  - Mysticeti
  - Mahi
  - Aleph
  - Hashgraph

The architecture should separate:

1. DAG communication layer
2. Protocol ordering layer
3. Visualization layer

This follows the design philosophy of DAG-Rider, where communication and ordering are independent. 【1-79edf0】

---

# Objectives

## Core Features

### Multiple Local DAG Views

Each process maintains an independent local DAG:

```text
DAG₁
DAG₂
DAG₃
...
DAGₙ
```

Users can:

- Switch between views
- Compare DAGs side-by-side
- Observe divergence caused by message delays
- Observe eventual convergence

---

### Vertex Creation

Users can:

- Create vertices manually
- Assign proposer/source
- Specify round
- Attach block data

New vertices initially enter:

```text
Buffer
```

before being inserted into the DAG.

---

### Broadcast Simulation

Users can broadcast vertices to other nodes.

The system should simulate:

- message delays
- asynchronous delivery
- network partitions (future)
- Byzantine behaviour (future)

---

### DAG Visualization

Display:

- vertices
- strong edges
- weak edges
- rounds
- waves

The visual layout should resemble the DAG-Rider paper. 【1-79edf0】

Reference DAG structure:



---

### Vertex Inspection

Clicking a vertex should display:

```text
Vertex ID
Source
Round
Wave
Status

Strong Edges
Weak Edges

Block Payload
Metadata
```

---

### Strong Path Explorer

The user selects:

```text
Source Vertex
Target Vertex
```

The application computes:

```text
strong_path(source, target)
```

and highlights:

- vertices on path
- strong edges used

This feature is important for understanding:

- Claim 3
- Lemma 1
- Commit proofs

from DAG-Rider. 【1-79edf0】

---

### Protocol State Coloring

Suggested coloring scheme:

| State | Color |
|---------|---------|
| Buffered | Gray |
| Received | Yellow |
| Inserted Into DAG | Blue |
| Ready To Commit | Green |
| Committed | Purple |
| Delivered | Black |
| Leader Vertex | Red Border |

---

# Technology Stack

## Frontend

```text
React
TypeScript
Vite
Tailwind CSS
```

Reasons:

- Fast iteration
- Type safety
- Easy interactive updates
- Large ecosystem

---

## DAG Rendering

Preferred library:

```text
React Flow
```

Alternative:

```text
Cytoscape.js
```

React Flow is preferred because:

- Custom node rendering
- Dynamic edge styling
- Easy click interactions
- Better React integration

---

## State Management

```text
Zustand
```

Advantages:

- Lightweight
- Fast state updates
- Easier than Redux

---

# High-Level Architecture

```text
┌────────────────────────────┐
│       React Frontend       │
└─────────────┬──────────────┘
              │
              ▼
┌────────────────────────────┐
│ DAG Visualization Layer    │
│ React Flow                 │
└─────────────┬──────────────┘
              │
              ▼
┌────────────────────────────┐
│ Simulation Engine          │
│                            │
│ Local DAGs                 │
│ Buffers                    │
│ Event Queue                │
│ Scheduler                  │
└─────────────┬──────────────┘
              │
              ▼
┌────────────────────────────┐
│ Protocol Plugins           │
│ DAG-Rider                  │
│ Bullshark                  │
│ Mahi                       │
│ Mysticeti                  │
└────────────────────────────┘
```

---

# Core Data Structures

## Vertex

```typescript
type VertexId = string;

interface Vertex {
    id: VertexId;

    source: number;

    round: number;

    wave: number;

    blockData: BlockData;

    strongEdges: Set<VertexId>;

    weakEdges: Set<VertexId>;

    status: VertexStatus;

    timestamp: number;
}
```

---

## Vertex Status

```typescript
enum VertexStatus {
    Buffered,
    Deliverable,
    InDag,
    Committed,
    Delivered
}
```

These states correspond naturally to DAG-Rider execution stages. 【1-79edf0】

---

## Block Data

```typescript
interface BlockData {
    proposer: number;

    payload: string;

    metadata: Record<string, any>;
}
```

Future extensions:

```typescript
transactions
coin shares
certificates
votes
signatures
QCs
```

---

## Local DAG

```typescript
class LocalDag {

    processId: number;

    vertices: Map<VertexId, Vertex>;

    rounds: Map<number, Set<VertexId>>;
}
```

### Design Decision

Avoid:

```typescript
Vertex[][]
```

Use:

```typescript
Map<VertexId, Vertex>
```

Benefits:

- O(1) lookup
- scalable to large DAGs
- easier graph traversal

---

# Process View

Each process stores:

```typescript
class ProcessView {

    id: number;

    dag: LocalDag;

    buffer: Map<VertexId, Vertex>;
}
```

This mirrors DAG-Rider's local DAG and buffer structure. 【1-79edf0】

---

# Event-Driven Simulation Engine

## Message Event

```typescript
class MessageEvent {

    sender: number;

    receiver: number;

    vertex: Vertex;

    deliveryTime: number;
}
```

---

## Event Queue

```typescript
PriorityQueue<MessageEvent>
```

Sorting:

```text
deliveryTime
```

Benefits:

- asynchronous network simulation
- deterministic replay
- future adversarial scheduling

---

## Simulator

```typescript
class Simulator {

    currentTick: number;

    eventQueue: PriorityQueue<MessageEvent>;
}
```

Functions:

```typescript
step();

runOneTick();

runUntilIdle();

pause();

reset();
```

---

# Broadcast Layer

The DAG engine should not assume a specific broadcast mechanism.

---

## Broadcast Interface

```typescript
interface BroadcastStrategy {

    broadcast(
        vertex: Vertex,
        sender: number
    ): MessageEvent[];
}
```

---

## Implementations

```text
Bracha RBC
Simple Broadcast
Gossip Broadcast
Mahi Broadcast
```

This becomes useful for your ongoing research on:

```text
RBC vs non-RBC protocols
```

including Mahi and DAG-Rider comparisons.

---

# DAG-Rider Plugin

Create a separate implementation:

```typescript
class DagRiderProtocol
```

that handles:

- wave construction
- leader election
- commit rules
- ordering

without modifying the DAG engine.

---

## Ordering Interface

```typescript
interface OrderingProtocol {

    onWaveReady();

    commitLeader();

    orderVertices();
}
```

This allows future protocol plugins.

---

# Graph Algorithms

## Strong Path Query

Implementation:

```typescript
hasStrongPath(
    source,
    target
)
```

Use:

```text
DFS
```

or

```text
BFS
```

using only:

```text
strongEdges
```

---

## Path Highlighting

When path exists:

```text
Vertex A
    ↓
Vertex B
    ↓
Vertex C
```

all strong edges become highlighted.

---

# DAG Validation Engine

Create a dedicated validator component.

```typescript
class DagValidator
```

---

## Check 1

Strong edges requirement:

```text
|strongEdges| ≥ 2f + 1
```

Algorithm 2 Line 25. 【1-79edf0】

---

## Check 2

All predecessors exist.

Algorithm 2 Line 7. 【1-79edf0】

---

## Check 3

Single vertex per:

```text
(source, round)
```

to model reliable broadcast assumptions. 【1-79edf0】

---

# User Interface Layout

```text
┌────────────────────────────┐
│ Toolbar                    │
├────────────────────────────┤
│ DAG Visualization Canvas   │
│                            │
├────────────┬───────────────┤
│ Node Info  │ Event Queue   │
├────────────┴───────────────┤
│ Logs                        │
└────────────────────────────┘
```

---

# Research Features

## Feature 1: Multi-DAG Comparison

Display:

```text
DAG₁
DAG₂
DAG₃
DAG₄
```

simultaneously.

Allows visualization of:

- delayed messages
- disagreement
- convergence

---

## Feature 2: Strong Path Explorer

Interactive proof visualization.

Useful for:

- Claim 3
- Lemma 1
- Commit analysis

---

## Feature 3: Wave View

Show:

```text
Wave 1:
Rounds 1-4

Wave 2:
Rounds 5-8

Wave 3:
Rounds 9-12
```

as defined in DAG-Rider. 【1-79edf0】

---

## Feature 4: Leader Election Viewer

Display:

```text
Current Wave

Selected Leader

Leader Vertex

Leader Source
```

---

## Feature 5: Commit Rule Inspector

For a selected leader:

```text
Round(w,4) Vertices:
12

Strong Paths:
9

Required:
2f+1 = 7

Result:
COMMIT
```

This directly visualizes Algorithm 3's commit condition. 【1-79edf0】

Reference commit example:



---

## Feature 6: Claim 3 Analyzer

Given:

```text
Vertex u
Round r
```

Find:

```text
Set V
```

such that:

```text
|V| ≥ 2f+1
```

and

```text
strong_path(v, u)
```

for every:

```text
v ∈ V
```

Display:

- highlighted vertices
- highlighted strong paths
- quorum intersection details

This is particularly useful for understanding DAG-Rider safety proofs. 【1-79edf0】

---

# Scalability Strategy

The visualization layer should never contain protocol-specific logic.

Use:

```typescript
interface ProtocolPlugin {

    name: string;

    createVertex();

    validateVertex();

    orderingLogic();

    analysisFunctions();
}
```

Implementations:

```text
DAG-Rider Plugin
Bullshark Plugin
Mysticeti Plugin
Mahi Plugin
```

Future protocols can be added without changing the DAG engine.

---

# Development Roadmap

## Phase 1 — Complete

Basic DAG Visualization

- Render DAG
- Create vertices
- Create edges

---

## Phase 2 — Complete

Network Simulation

- Buffers
- Event queue
- Delayed delivery

---

## Phase 3

Graph Analysis

- Strong path
- Weak path
- Highlighting

---

## Phase 4

DAG-Rider DAG Layer

Implement Algorithm 2. 【1-79edf0】

---

## Phase 5

DAG-Rider Ordering Layer

Implement Algorithm 3. 【1-79edf0】

---

## Phase 6

Research Toolkit

- Claim 3 Visualizer
- Lemma 1 Visualizer
- Commit Inspector
- Wave Inspector
- RBC vs Simple Broadcast Comparison
- Mahi Simulation
- Protocol Comparison Dashboard

---

# Final Design Philosophy

The application should be designed as a **general DAG consensus research platform**, not a DAG-Rider-specific simulator.

The reusable core should consist of:

```text
Local DAG Engine
+
Network Simulator
+
Visualization Layer
+
Protocol Plugin System
```

DAG-Rider then becomes the first protocol plugin built on top of the framework.

This architecture maximizes reusability for future research involving:

- DAG-Rider
- Bullshark
- Tusk
- Mysticeti
- Mahi
- New protocol ideas and proof experiments