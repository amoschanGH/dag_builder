# AGENTS.md

## Current state

- This repository is documentation-only: there is no source, manifest, lockfile, CI, or build/lint/test configuration, and therefore no runnable project command yet.
- `README.md` proposes React, TypeScript, Vite, Tailwind, React Flow, and Zustand; they are architectural choices, not currently installed or configured.

## Architecture constraints

- Build a reusable DAG-consensus research workbench. DAG-Rider is the first protocol plugin, not logic that should be hard-coded into the engine or UI.
- Keep communication/simulation, protocol ordering, and visualization independent. Visualization must not contain protocol logic, and the DAG engine must not assume a specific broadcast strategy.
- Keep broadcast and ordering behind strategy/plugin interfaces. The event queue is ordered by delivery time to support deterministic simulation.
- Store local vertices as `Map<VertexId, Vertex>` for lookup and graph traversal; `README.md` explicitly rules out `Vertex[][]`.
- Treat the phased roadmap in `README.md` as the intended implementation order: visualization, network simulation, graph analysis, then DAG-Rider layers.

## Verification

- No test runner or focused-test command exists yet. Do not invent one; when tooling is added, record the verified commands here and in the project docs.
