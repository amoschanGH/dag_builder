# AGENTS.md

## Toolchain and commands

- Use npm and commit `package-lock.json`; do not introduce another package manager without a documented reason.
- The current Vite/Vitest versions require Node `^22.12.0`, `^24.0.0`, or `>=26.0.0`.
- Run `npm run dev` for Vite on port 5173. There are no environment variables, services, or backend prerequisites.
- Verify changes with `npm run lint`, `npm run typecheck`, `npm test`, then `npm run build`. `npm test -- src/store/useDagStore.test.ts` runs the focused store suite.

## Architecture boundaries

- `src/domain/dag.ts` is framework-independent: keep graph types, round indexing, `(source, round)` uniqueness, and cycle validation out of React components.
- `src/store/useDagStore.ts` is the in-memory graph boundary. React Flow nodes/edges are projections, not the source of truth; do not persist raw React Flow state as the DAG model.
- `src/components/DagCanvas.tsx` is the React Flow adapter. Keep protocol ordering and communication logic out of visualization code.
- Local vertices and edges must remain `Map`-indexed; `README.md` explicitly rules out `Vertex[][]`.
- Keep DAG-Rider out of the reusable engine. It is the first future protocol plugin, not hard-coded behavior.

## Frontend quirks

- Tailwind v4 is configured through `@tailwindcss/vite`. In `src/index.css`, keep `@xyflow/react/dist/style.css` after the Tailwind import or React Flow styling can be overridden.
- The app is client-only and non-persistent; refresh restores the example graph. Do not imply saved state or multi-process simulation exists yet.
- The roadmap order in `README.md` is intentional: finish visualization, then network simulation, graph analysis, and only then DAG-Rider layers.

## Testing

- Vitest currently covers the Zustand graph store and domain invariants in `src/**/*.test.ts`; there is no browser/E2E harness yet.
