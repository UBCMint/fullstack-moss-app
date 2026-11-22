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

## Temporary Chart Preview history flag

`NEXT_PUBLIC_ENABLE_CHART_PREVIEW_HISTORY=true` in `frontend/.env` enables the
task 24 workaround: Back closes Chart Preview without losing the pipeline. Set
it to `false` or remove it to use the original dialog behavior. Restart the
frontend after changing it; production builds require rebuilding.

Implementation details and retirement TODOs are in
`components/nodes/signal-graph-node/signal-graph-node.tsx`.

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
- `startPipeline(payload)` — stages a freshly validated
  `{session_id, nodes, edges}` snapshot and starts streaming. Both Start buttons
  request `pipeline-start`; the canvas validates its current nodes and edges
  before calling this method. Draft edits do not log validation errors or send
  payloads. Pipeline editing is locked while streaming, and stopping clears the
  staged payload.

It implements the same `"clientClosing"` → `"confirmed closing"` handshake as
the Rust server (with a 5s timeout fallback), turns the server's
`{"type": "error", ...}` frames into a `pipeline-error` window event (the canvas
shows the message and stops streaming), and converts incoming
`{timestamps, signals}` batches into flat `DataPoint` objects
(`normalizeBatch`). The full wire protocol is specified in
[`backend/docs/websocket-protocol.md`](../backend/docs/websocket-protocol.md);
the pipeline node format in
[`backend/docs/pipeline-nodes.md`](../backend/docs/pipeline-nodes.md); and a
frontend-focused walkthrough of the same exchange in [`design.md`](design.md).

## The pipeline editor

`react-flow-view.tsx` is the React Flow canvas. Every node on the board is sent
to the backend with the edges between them, and the backend runs the pipeline in
edge order (`typeMap` in `lib/pipeline-validation.ts`):

| React Flow type         | Sent to backend as | Component                                 | What the backend does (`pipeline-nodes.md`)                      |
| ----------------------- | ------------------ | ----------------------------------------- | ---------------------------------------------------------------- |
| `source-node`           | `"source"`         | `components/nodes/source-node.tsx`        | The EEG stream; the start of the pipeline.                       |
| `window-node`           | `"window"`         | `components/nodes/window-node/`           | Sets the batch size and overlap.                                 |
| `filter-node`           | `"preprocessing"`  | `components/nodes/filter-node/`           | Filters the stream (low-, high- or band-pass).                   |
| `resampling-node`       | `"resample"`       | `components/nodes/resampling-node/`       | Changes the sample rate.                                         |
| `artifact-node`         | `"artifact"`       | `components/nodes/artifact-node/`         | Accepted, but passes data through unchanged for now.             |
| `machine-learning-node` | `"ml"`             | `components/nodes/machine-learning-node/` | Classifies its input with the selected model.                    |
| `signal-graph-node`     | `"signal_graph"`   | `components/nodes/signal-graph-node/`     | Output; renders the live chart via `WebSocketContext.subscribe`. |
| `label-node`            | `"label"`          | `components/nodes/label-node/`            | Output; doesn't change the data.                                 |

Each sendable node writes its config into React Flow's node `data.config` on
every relevant state change (`pushConfigToNodeData`), using the
`node-config-changed` / `reactflow-edges-changed` custom DOM events to re-check
its upstream connection (a node is only "active," per its combo box styling, if
it traces back to the source node through valid edges). On any node/edge/session
change, `buildPipelinePayload`:

1. Topologically sorts nodes (`topoSort`, Kahn's algorithm). The order is for
   readability only; the backend orders the pipeline from the edges.
2. Remaps every known node type to its backend `type` (`typeMap`) and keeps its
   React Flow `id`, plus the edges between sent nodes.
3. Builds each node's config (`nodeConfig`): `DEFAULT_PROCESSING` /
   `DEFAULT_WINDOWING` merged under the node's own config (so a value the node
   set always wins), and the resampling node's `rate`/`customRate` turned into
   `target_hz`.

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
