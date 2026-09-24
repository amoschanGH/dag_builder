# AGENTS.md

## Toolchain and commands

- Use npm and commit `package-lock.json`; do not introduce another package manager without a documented reason.
- Current Vite/Vitest versions require Node `^22.12.0`, `^24.0.0`, or `>=26.0.0`.
- Run `npm run dev` for Vite on port 5173. There are no environment variables, services, or backend prerequisites.
- Verify changes with `npm run lint`, `npm run typecheck`, `npm test`, then `npm run build`.
- Focused suites: `npm test -- src/simulation`, `npm test -- src/store/useDagStore.test.ts`, and `npm test -- src/store/useSimulationStore.test.ts`.

## State boundaries

- `src/store/useDagStore.ts` is the editable Phase 1 graph. `src/store/useSimulationStore.ts` is the Phase 2 adapter around `Simulator`; simulation changes must never flow back into the editor store.
- Loading/resetting simulation takes a detached snapshot of the current editor graph into process 0. Editor edits after initialization do not mutate a running simulation.
- React Flow is only a projection. `src/domain/dag.ts` and `src/simulation/` must not import React, Zustand, React Flow, browser clocks, `setTimeout`, or `Math.random()`.
- Local vertices, edges, buffers, pending edges, processes, and UI snapshots stay `Map`-indexed; `Vertex[][]` is explicitly ruled out.
- `src/domain/strongReferences.ts` derives strong-reference metadata and deterministic ancestor history for the inspector; keep it framework-independent.

## Simulation invariants

- `Simulator` is pull-based: `step()` handles one delivery, `runOneTick()` handles one timestamp up to a budget, and `runUntilIdle()` only drains network messages—it does not flush buffers.
- Keep lifecycle state process-local. Received vertices enter a receiver's buffer as `deliverable`; network receipt is represented by events, not by mutating a shared vertex to `delivered`.
- Queue order is `deliveryTime -> enqueueSequence -> id`; logical ticks are non-negative safe integers. Broadcast recipients and snapshot iterations are sorted for deterministic replay.
- Broadcast strategies return drafts only. `Simulator` assigns IDs, validates, snapshots payloads, and owns the clock/queue.
- Incident edges may wait in `pendingEdges` when endpoints arrive out of order. Structural cycle/duplicate checks may use `validateConnection`; keep the explicit user-required `2f+1` round gate in `src/simulation/roundPolicy.ts`, not in graph/UI components, and do not add other DAG-Rider thresholds, leader rules, commit logic, or ordering here.
- Buffer insertion is explicit and structural only. Preserve first-delivery-wins behavior and reject conflicting IDs or `(source, round)` slots without overwriting state.
- Process IDs are stored zero-based internally but displayed one-based (`P1`, `P2`, …); a local block created by process `p` uses source `p+1`. Do not mix the two representations in UI or protocol logic.
- Round advancement is gated by `2f+1` distinct source vertices in the latest local-DAG round (`faultTolerance`/`f` is configurable); creating or flushing round `r+1` must be rejected until round `r` meets quorum. `ProcessView.statusRound` is authoritative, and a block may enter the local DAG only when `block.round === statusRound`; seed snapshots are admitted round-by-round and truncate at the first gate.
- When a local block is created, snapshot every block currently in that process's local DAG at round `r-1` as its strong predecessor set. Keep those edges pending until insertion; do not recompute them when the local DAG changes later. Imported strong edges are normalized from the same rule.

## Frontend quirks

- Tailwind v4 uses `@tailwindcss/vite`. Keep `@xyflow/react/dist/style.css` after the Tailwind import in `src/index.css` or React Flow styling can be overridden.
- State is in memory only; refresh discards the editor/simulation. There is no real-time scheduler, persistence, partition model, or E2E harness yet.
- The editor defaults to the round/source grid from `src/domain/dag.ts`; dragging a node switches it to `freeform`. Use **Round grid** or **Re-grid** to restore deterministic columns/rows. `VertexComposer` is the creation path for choosing source/round and a selected previous-round strong-reference set; `updateVertexReferences` edits that set afterward.
- In the grid, older rounds are left and newer rounds are right; the outgoing/source handle is on the node's left and the incoming/target handle is on its right. Strong edges are generated from a new block to the previous-round blocks. Source labels are 1-based in the editor.
- The roadmap order remains intentional: visualization, network simulation, graph analysis, then DAG-Rider layers.
