# Pipeline node spec

This is the contract between the frontend node editor (`frontend/components/nodes/*`,
`frontend/lib/pipeline-validation.ts`) and the backend pipeline model
(`backend/shared-logic/src/pipeline.rs`). The graph travels in the `nodes` and `edges` arrays
of the websocket init message ([websocket-protocol.md](websocket-protocol.md)).

**If you change a field here, change it in all three places: `pipeline.rs`, the frontend node
component (and `buildPipelinePayload`), and this file.**

## Wire format

The frontend sends every node on the canvas and every edge between them:

```json
{
  "session_id": "42",
  "nodes": [
    { "id": "source-1", "type": "source",        "config": {} },
    { "id": "window-1", "type": "window",        "config": { "chunk_size": 64, "overlap_size": 0 } },
    { "id": "filter-1", "type": "preprocessing", "config": { "apply_bandpass": true, "l_freq": 1, "h_freq": 30 } },
    { "id": "chart-1",  "type": "signal_graph",  "config": {} },
    { "id": "ml-1",     "type": "ml",            "config": { "model": "Stress" } }
  ],
  "edges": [
    { "source": "source-1", "target": "window-1" },
    { "source": "window-1", "target": "filter-1" },
    { "source": "filter-1", "target": "chart-1" },
    { "source": "filter-1", "target": "ml-1" }
  ]
}
```

- A node is `{"id": <string>, "type": <string>, "config": <object>}`. `id` is the React Flow
  node id; error messages refer to it. `config` is required (`{}` is fine), and every field
  inside it is optional: a missing field takes the default listed below.
- An edge is `{"source": <node id>, "target": <node id>}`, from an output handle to an input
  handle.
- The **order of `nodes` doesn't matter**. The backend orders the pipeline from the edges.

| `type` | Rust variant | Frontend React Flow type | Role |
|---|---|---|---|
| `"source"` | `Node::Source` | `source-node` | The EEG stream. Exactly one. |
| `"window"` | `Node::Window(WindowConfig)` | `window-node` | Batching. Straight after the source. |
| `"preprocessing"` | `Node::Preprocessing(PreprocessingConfig)` | `filter-node` | Processing: filter. |
| `"resample"` | `Node::Resample(ResampleConfig)` | `resampling-node` | Processing: changes the sample rate. |
| `"artifact"` | `Node::Artifact` | `artifact-node` | Processing: **passes data through unchanged** for now. |
| `"label"` | `Node::Label` | `label-node` | Output. Can feed other outputs. |
| `"signal_graph"` | `Node::SignalGraph` | `signal-graph-node` | Output (chart). Terminal. |
| `"ml"` | `Node::ML(MLConfig)` | `machine-learning-node` | Output (classifier). Terminal. At most one. |

An unknown `type`, or a field with the wrong JSON type (e.g. `"chunk_size": "64"`), fails the
whole message with an `invalid_message` error.

## Graph rules

`Pipeline::compile` turns the graph into an ordered processing chain, or rejects it with an
`invalid_pipeline` error that names the node at fault (`node_id`). The rules:

1. Exactly one `source` node.
2. No loops.
3. Every node other than the source has **exactly one input**, so every node is connected to
   the source. A node with no input ("isn't connected"), or one whose input chain doesn't reach
   the source, is rejected, even if it's just sitting unused on the canvas.
4. **Processing nodes form a single chain** from the source: `window`, `preprocessing`,
   `resample` and `artifact` can each feed at most one other processing node. Two processing
   nodes taking input from the same node is rejected, because the client receives one stream.
5. `window`, if present, comes straight after the source.
6. Output nodes can branch off anywhere along the chain. `signal_graph` and `ml` must be
   terminal; `label` can only feed other outputs.
7. At most one `ml` node.

The frontend checks some of these before it sends (`validatePipeline`): one source, one
window connected to the source, terminal outputs, no loops. The backend checks all of them.

## How the stages fit together

```
                     ┌───────── raw samples (no overlap) ───────────────► TimescaleDB
LSL ──► window ──────┤
 (stream rate)       └──► stage 1 ──► stage 2 ──► … ──► stage n ──────────► websocket client
                               │                                            (signals + ml_result)
                               └──► ml node's input ──► Python manager ──► ml_result
```

- The window node sets how many new samples make one batch. Each batch then runs through the
  processing chain in edge order.
- **The client receives the output of the last processing node**, with the window's overlap
  in front. If there are no processing nodes, that's the raw data.
- **The database stores the raw samples**, without overlap, whatever the chain does.
- The ML node receives the data at the point where it branches off the chain (so an ML node
  connected to a filter that's followed by a resample sees filtered data at the original rate).
- All filters and resamplers keep state between batches, so batch boundaries don't add
  artifacts.
- Sample rates are tracked along the chain. The input rate is the LSL stream's declared rate
  (256 Hz for the Muse and the mock); each `resample` node changes it for the nodes after it.
- Settings that only make sense at a known rate (cutoffs vs. Nyquist) are checked once the
  stream is found, and reported as `invalid_pipeline` errors at that point.

Chart nodes all show the same stream (the end of the chain), even when they branch off
earlier. Per-branch streams would need a protocol change.

---

## `source`

No config. Send `{}`.

## `window`

Controls how incoming samples are grouped into batches.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `chunk_size` | integer ≥ 1 | `64` | New samples per batch, at the stream's rate. At 256 Hz, 64 samples is 250 ms. |
| `overlap_size` | integer ≥ 0 | `0` | How many samples from the end of each batch are repeated at the front of the next one. |

Effect on output:

- Batches arrive about `stream_rate / chunk_size` times per second.
- Every batch after the first starts with the previous batch's last samples. The overlap is
  counted at the stream rate; after a `resample` node it's scaled to the new rate
  (`round(overlap_size × new_rate / stream_rate)`). Overlap samples keep their real
  timestamps.
- ML runs once per batch, so `chunk_size` also sets how often you get a prediction.

Without a window node the defaults apply. `chunk_size: 0` is rejected. The frontend also
enforces `0 ≤ overlap_size < chunk_size`; the backend doesn't.

Frontend defaults: `chunk_size: 64`, `overlap_size: 0` (`DEFAULT_WINDOWING`).

---

## `preprocessing` (filter)

Filters the stream. Every node after it, the client, and an ML node connected to it see the
filtered data.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `apply_bandpass` | bool | `true` | Turns the filter on. `false` passes data through unchanged. |
| `apply_quality_check` | bool | `true` | Only used when an ML node comes after this filter: adds the Python signal quality check to the model's preprocessing. |
| `use_iir` | bool | `false` | `true`: 4th-order Butterworth IIR (per cutoff). `false`: linear-phase windowed-sinc FIR (Hamming), sized like MNE's defaults. |
| `l_freq` | number \| null | `1.0` | High-pass cutoff in Hz. `null` means **no high-pass**. |
| `h_freq` | number \| null | `50.0` | Low-pass cutoff in Hz. `null` means **no low-pass**. |
| `downsample_factor` | integer \| null | `null` | Not used. Use a `resample` node. |
| `sfreq` | number | `256.0` | Not used. The backend uses the real rate at this point in the chain. |
| `n_channels` | integer | `4` | Not used. The backend always uses 4 channels. |

So `l_freq` + `h_freq` is a band-pass, `h_freq` alone a low-pass, `l_freq` alone a high-pass,
and neither passes data through.

Checked when the stream starts: cutoffs above 0, below half the sample rate at this point
(after any resampling), and `l_freq < h_freq`.

The FIR filter delays the signal by half its length: about `1.65 / transition_width` seconds,
using the narrower of the transition widths `min(max(0.25 × l_freq, 2), l_freq)` (high-pass)
and `min(max(0.25 × h_freq, 2), nyquist - h_freq)` (low-pass). For `l_freq: 1` that's about
1.6 s. Use IIR for lower latency.

Frontend: the filter node sends `lowpass` as `{l_freq: null, h_freq}`, `highpass` as
`{l_freq, h_freq: null}` and `bandpass` as both. `DEFAULT_PROCESSING` fills in the rest
(`apply_bandpass: false`, `apply_quality_check: true`, `use_iir: false`, …).

---

## `resample`

Changes the sample rate for every node after it.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `target_hz` | number \| null | `null` | Output rate in Hz. `null`, or the current rate, passes data through. |

Linear interpolation across batch boundaries, with a 4th-order Butterworth low-pass at
`0.45 × target_hz` first when downsampling. Output timestamps are interpolated too, so they're
evenly spaced at the new rate. A batch can come out with one sample more or fewer than
`chunk_size × target_hz / stream_rate`.

Frontend: the resampling node's `Original rate` sends `null`, the presets send `200` or
`256`, and `Custom` sends its whole-Hz value (1–256).

---

## `artifact`

Accepted so graphs that use it are valid, but **it passes data through unchanged**. Its
`config` is ignored. Whether artifact removal stays in the product is still open.

## `label`, `signal_graph`

Outputs that don't change the data. Their `config` is ignored.

---

## `ml`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `model` | string | `"activity"` | The classifier the user picked, e.g. `"Stress"`. Lower-cased and sent to the Python manager as the task: `activity`, `focus`, `emotion` or `stress`. Other names fall back to `activity` in `manager.py`. |

With an ML node, the backend loads the Python manager (`PIPELINE_MANAGER_SCRIPT`) and calls it
on every batch with the ML node's input and this pipeline:

```python
{"nodes": [
  # only if the closest filter before the ML node has apply_quality_check (or there's no filter)
  {"type": "signal quality check", "config": {"sfreq": <rate at the ML node>}},
  # the model's own preprocessing: bandpass, resample to 200 Hz, 4 s segments
  {"type": "bandpass filter", "config": {"method": "IIR" | "FIR",
                                         "low_cut_hz": <filter l_freq, or 1.0>,
                                         "Filter": <filter h_freq, or 50.0, capped at 0.45 × rate>,
                                         "src_fs": <rate at the ML node>}},
  {"type": "ml", "config": {"task": "<model, lower-cased>"}},
]}
```

`ml_result` is filled in when the manager returns `overall_label`, `confidence` and `task`;
otherwise it's `null`. **Without an ML node, Python isn't loaded and `ml_result` is always
`null`.**

Limits:

- With the default `mock_manager.py`, every batch gets the same fixed `ml_result`.
- The real `manager.py` needs at least 4 s of data per call to segment it, so it only
  produces a result when the window (`chunk_size + overlap_size`) is at least 4 s of samples
  (1024 at 256 Hz). Smaller windows log an error and return `ml_result: null`.
- The model's bandpass runs on data the chain may already have filtered with the same
  cutoffs.

Frontend: `machine-learning-node.tsx` sends `{ "model": <selected option> }`, with `"Stress"`
as the default.

---

## Checklist for adding a node type

1. Add the variant (and config struct, with `#[serde(default)]` and a `Default` impl) to
   `Node` in `pipeline.rs`, and decide whether it's a processing node or an output in
   `Pipeline::compile`.
2. For a processing node: add a `StageKind`, and build its runtime stage in
   `signal_processing/chain.rs` (stateful, so batching doesn't change the result).
3. Map the React Flow type in `typeMap` (and its config in `nodeConfig` if it needs
   translating) in `frontend/lib/pipeline-validation.ts`.
4. Document it in this file.
