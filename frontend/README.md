# MOSS Frontend

Next.js (App Router) UI for the MOSS EEG platform: a React Flow pipeline editor,
live signal charts, and session management. Refer to the root
[README.md](../README.md) for running the full stack.

- [Part 1: Setup](#part-1-setup)
- [Part 2: How the frontend works](#part-2-how-the-frontend-works)

---

# Part 1: Setup

```sh
cd frontend
npm install
npm run dev      # next dev --hostname 0.0.0.0, http://localhost:3000
```

This expects the Rust `api-server` and `websocket-server` to already be running
(see the root README). Without them, session/EEG-data requests return a 503 from
the proxy, and the live chart never connects.

## Environment variables

The Next.js API routes (`app/api/**`) pick the backend URL from the first of
these that's set, falling back to Docker/localhost defaults — see
`lib/backend-proxy.ts`:

| Variable               | Notes                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_API_BASE_URL` | Checked first.                                                                                                                    |
| `API_BASE_URL`         | Checked second.                                                                                                                   |
| `VITE_API_URL`         | Checked third. Set by `docker-compose.yml`; the name is a holdover from an earlier Vite-based setup, not a Vite dependency today. |
| _(none set)_           | Falls back to `http://api-server:9000` (Docker network name), then `http://127.0.0.1:9000`, then `http://localhost:9000`.         |

The live websocket URL (`ws://localhost:8080`) is hardcoded in
`context/WebSocketContext.tsx` and does not currently read any environment
variable.

## Commands

```sh
npx eslint .          # lint
npx tsc --noEmit      # typecheck
npx prettier --check . # format check
npm run build         # next build
```

These mirror the `frontend lint + typecheck` job in
`.github/workflows/code-quality.yml`.

---

# Part 2: How the frontend works

## Where things live

| Concern                                         | Location                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| Pages                                           | `app/page.tsx` (landing), `app/home/page.tsx` (the editor + providers) |
| Proxy routes to the Rust API                    | `app/api/sessions/**/route.ts`                                         |
| Backend proxy helper                            | `lib/backend-proxy.ts`                                                 |
| Typed API clients (call the proxy routes above) | `lib/session-api.ts`, `lib/eeg-api.ts`, `lib/frontend-state.ts`        |
| Pipeline wire types                             | `lib/pipeline.ts`                                                      |
| Live websocket connection                       | `context/WebSocketContext.tsx`                                         |
| App-wide state (active session, streaming flag) | `context/GlobalContext.tsx`                                            |
| Pipeline editor canvas                          | `components/ui-react-flow/react-flow-view.tsx`                         |
| Pipeline node components                        | `components/nodes/*`                                                   |

`app/home/page.tsx` wraps the editor in `GlobalProvider` → `WebSocketProvider` →
`NotificationsProvider`, in that order — `WebSocketContext` reads
`dataStreaming` and `activeSessionId` from `GlobalContext`, so `GlobalProvider`
has to be the outer one.

## REST calls: the proxy pattern

The frontend never calls the Rust `api-server` directly from client code. Each
`app/api/sessions/**/route.ts` file is a Next.js Route Handler that forwards the
request to the Rust server and passes the response back, via `forwardToBackend`
/ `passthroughJsonResponse` in `lib/backend-proxy.ts`. Add a new Route Handler
here, not a direct `fetch` to port 9000, for any new backend-backed feature.

```
browser ──fetch──► app/api/sessions/.../route.ts ──forwardToBackend──► Rust api-server:9000
```

Client code then calls the typed wrappers in `lib/session-api.ts` /
`lib/eeg-api.ts` / `lib/frontend-state.ts`, which `fetch` the local
`/api/sessions/...` path (relative, so it always hits the Next.js server, never
the Rust one directly).

**One route doesn't follow this pattern.**
`app/api/sessions/[session_id]/eeg_data/import/route.ts` duplicates
`backend-proxy.ts`'s base-URL fallback list inline instead of importing
`forwardToBackend`, and sends the CSV body with `Content-Type: text/csv` rather
than `application/json` (`forwardToBackend` does support a custom `contentType`,
so this could call it directly). Functionally it still forwards to the same
backend; it's just not using the shared helper, so a change to the fallback
order in `backend-proxy.ts` needs to be made here too.

The CSV export route (`eeg_data/export/route.ts`) also skips
`passthroughJsonResponse`, but for a real reason: the backend response is CSV,
not JSON, so it copies the body and `Content-Type` header manually instead.

## Live streaming: `WebSocketContext`

`WebSocketContext.tsx` owns the one live websocket connection, separately from
the REST proxy above, since it's a persistent stream rather than a
request/response. It opens `ws://localhost:8080` once `dataStreaming` is true
and `activeSessionId` is set, sends the pipeline payload on open, and exposes
two things to the rest of the tree:

- `subscribe(fn)` — register a callback that receives each parsed batch as
  `DataPoint[]` (chart components use this to append points).
- `startPipeline(payload)` — stages a freshly validated `{session_id, nodes}`
  snapshot and starts streaming. Both Start buttons request `pipeline-start`;
  the canvas validates its current nodes and edges before calling this method.
  Draft edits do not log validation errors or send payloads. Pipeline editing
  is locked while streaming, and stopping clears the staged payload.

It implements the same `"clientClosing"` → `"confirmed closing"` handshake as
the Rust server (with a 5s timeout fallback), and converts incoming
`{timestamps, signals}` batches into flat `DataPoint` objects
(`normalizeBatch`). The full wire protocol is specified in
[`backend/docs/websocket-protocol.md`](../backend/docs/websocket-protocol.md);
the pipeline node format in
[`backend/docs/pipeline-nodes.md`](../backend/docs/pipeline-nodes.md); and a
frontend-focused walkthrough of the same exchange in [`design.md`](design.md).

## The pipeline editor

`react-flow-view.tsx` is the React Flow canvas. Of its node types, only three
are actually sent to the backend (`PIPELINE_NODE_TYPES`); the rest are
editor-only:

| React Flow type                                  | Sent to backend as | Component                                                          | Backend node (`pipeline-nodes.md`)                                                                             |
| ------------------------------------------------ | ------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `window-node`                                    | `"window"`         | `components/nodes/window-node/window-node.tsx`                     | `window`                                                                                                       |
| `filter-node`                                    | `"preprocessing"`  | `components/nodes/filter-node/filter-node.tsx`                     | `preprocessing`                                                                                                |
| `machine-learning-node`                          | `"ml"`             | `components/nodes/machine-learning-node/machine-learning-node.tsx` | `ml`                                                                                                           |
| `source-node`                                    | _(not sent)_       | `components/nodes/source-node.tsx`                                 | — marks the EEG source in the canvas; doesn't carry a payload.                                                 |
| `signal-graph-node`                              | _(not sent)_       | `components/nodes/signal-graph-node/`                              | — renders the live chart via `WebSocketContext.subscribe`.                                                     |
| `label-node`, `artifact-node`, `resampling-node` | _(not sent)_       | `components/nodes/{label,artifact,resampling}-node/`               | — editor-only annotation/placeholder nodes; `resampling-node` exists in the UI but has no backend counterpart. |

Each sendable node writes its config into React Flow's node `data.config` on
every relevant state change (`pushConfigToNodeData`), using the
`node-config-changed` / `reactflow-edges-changed` custom DOM events to re-check
its upstream connection (a node is only "active," per its combo box styling, if
it traces back to the source node through valid edges). On any node/edge/session
change, `buildPipelinePayload`:

1. Topologically sorts nodes (`topoSort`, Kahn's algorithm) — this ordering is
   cosmetic only; the backend always runs window → preprocessing → ML regardless
   of array order (see `pipeline-nodes.md`).
2. Filters to the three sendable types and remaps them to backend `type` strings
   (`typeMap`).
3. Merges in `DEFAULT_PROCESSING` / `DEFAULT_WINDOWING` under the node's own
   config (so a config value the node already set always wins over the default).

`validatePipeline` runs first and blocks sending on structural errors (no source
node, no window node, ML not preceded by a filter node, cycles, etc.) — see the
function for the full rule set — and only warns (doesn't block) on ordering
issues like a filter node wired directly to source.

**Known mismatch with the backend contract** (also called out in
`pipeline-nodes.md`): `filter-node.tsx`'s `FilterConfig` interface and every
branch of its `buildConfig()` omit `apply_quality_check` entirely, and
`DEFAULT_PROCESSING` doesn't add it either. Since `PreprocessingConfig` on the
Rust side has no `#[serde(default)]`, the required field is simply absent — not
defaulted — so the init message fails to parse and the session never starts
whenever a filter node is in the graph. Fixing this needs both this file and
`DEFAULT_PROCESSING` updated, and a decision for what `apply_quality_check`
should default to in the UI.

## Saving/restoring the canvas

`react-flow-view.tsx` answers `request-frontend-state` /
`restore-frontend-state` DOM events with its current `{nodes, edges}` (typed as
`FrontendWorkspaceState` in `lib/frontend-state.ts`). `lib/session-api.ts`'s
`saveFrontendState`/`loadFrontendState` post/get that blob to
`/api/sessions/:id/frontend-state`, which the Rust side stores as an opaque JSON
column — the backend doesn't know or care about its shape.
`isFrontendWorkspaceState` guards the import path against malformed data
(missing `id`/`type`/`data` on a node, missing `id`/`source`/`target` on an
edge) before it's applied back onto the canvas.
