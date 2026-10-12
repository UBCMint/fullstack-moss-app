# Pipeline node spec

This is the contract between the frontend node editor (`frontend/components/nodes/*`,
`frontend/components/ui-react-flow/react-flow-view.tsx`) and the backend pipeline model
(`backend/shared-logic/src/pipeline.rs`). The nodes travel in the `nodes` array of the
websocket init message ([websocket-protocol.md](websocket-protocol.md)).

**If you change a field here, change it in all three places: `pipeline.rs`, the frontend node
component, and this file.**

## Wire format

Every node is `{"type": <string>, "config": <object>}`. This is serde's adjacently tagged
representation of `enum Node`.

| `type` | Rust variant | Frontend React Flow type |
|---|---|---|
| `"window"` | `Node::Window(WindowConfig)` | `window-node` |
| `"preprocessing"` | `Node::Preprocessing(PreprocessingConfig)` | `filter-node` |
| `"ml"` | `Node::ML(MLConfig)` | `machine-learning-node` |

Other editor nodes (source, signal-graph, label, resampling, artifact) are display-only and
are filtered out before sending (`PIPELINE_NODE_TYPES` in `react-flow-view.tsx`). Sending any
other `type` makes the whole init message fail to parse.

Rules for how the backend reads the array:

- **Order is ignored.** The backend runs a fixed sequence (window → preprocessing → ML),
  whatever order the editor's edges put the nodes in.
- **The first node of each type wins.** Later duplicates are ignored.
- **A missing node means that stage uses its default** (see each node's *Default when
  absent*). It does **not** turn the stage off.
- **Required vs. optional fields.** No config struct uses `#[serde(default)]`. Every
  non-`Option` field is **required** when the node is present: if it's missing, the whole
  message is rejected. `Option` fields can be left out or set to `null`.
- **Numbers.** `usize`/`u32` fields need non-negative integers. `5.0` and `-1` are rejected.
  `f32` fields take any JSON number.

## How the stages fit together

```
LSL samples (4 ch) ──► window ──► batch of N samples ──┬──► websocket client (raw signals + ml_result)
                                                       ├──► TimescaleDB (raw signals)
                                                       └──► Python manager(preprocessing config, batch) ──► ml_result
```

Preprocessing and ML only affect `ml_result`. The `signals` sent to the client and stored
in the DB are **always raw**. The Python pipeline returns `processed_eeg`, but
`pipeline_gateway.rs` doesn't use it.

---

## `window`

Controls how incoming samples are grouped into batches. This is the only node that changes
the shape of what the client receives.

| Field | Type | Required | Default when node absent | Meaning |
|---|---|---|---|---|
| `chunk_size` | integer ≥ 0 (`usize`) | yes | `64` | New samples per batch. At 256 Hz, 64 samples is 250 ms. |
| `overlap_size` | integer ≥ 0 (`usize`) | yes | `0` | How many trailing samples of each batch are repeated at the front of the next one. |

Effect on output:

- Each batch has `chunk_size` samples, plus `overlap_size` repeated samples at the front of
  every batch after the first.
- Batches arrive about `sfreq / chunk_size` times per second.
- ML runs once per batch, so `chunk_size` also sets how often you get a prediction and how
  much data each prediction sees.
- Repeated overlap samples get placeholder timestamps (copies of the first new sample's
  timestamp). See known issue 3 in the protocol doc.

Validation: the backend checks nothing beyond the types. `chunk_size: 0` acts like `1`.
`overlap_size >= chunk_size` is accepted. The frontend enforces `chunk_size > 0` and
`0 ≤ overlap_size < chunk_size`, and other clients should follow the same rules.

Frontend defaults: `chunk_size: 64`, `overlap_size: 0` (`DEFAULT_WINDOWING`, `window-node.tsx`).
These match the backend.

---

## `preprocessing`

Configures the filtering and quality-check steps that the **Python ML pipeline** runs on each
batch before classifying it. It does **not** filter the streamed or stored data.

| Field | Type | Required | Default when node absent | Used by backend? | Meaning |
|---|---|---|---|---|---|
| `apply_bandpass` | bool | yes | `true` | yes | Adds a `bandpass filter` node to the Python pipeline. |
| `apply_quality_check` | bool | yes | `true` | yes | Adds a `signal quality check` node to the Python pipeline. |
| `use_iir` | bool | yes | `false` | yes | Filter method: `true` → `"IIR"`, `false` → `"FIR"`. |
| `l_freq` | number \| null | no | `1.0` | yes | Low cutoff in Hz. `null` or missing becomes **1.0**. |
| `h_freq` | number \| null | no | `50.0` | yes | High cutoff in Hz. `null` or missing becomes **50.0**. |
| `downsample_factor` | integer \| null | no | `null` | **no** | Not used. Downsampling was removed with the old `SignalProcessor` path. |
| `sfreq` | number | yes | `256.0` | yes | Sample rate in Hz that the Python filters and quality check assume. It is **not** measured from the stream, so it has to match the source (256 for Muse). |
| `n_channels` | integer | yes | `4` | **no** | Not used. The backend always uses 4 channels. |

What gets sent to the Python manager (`build_python_pipeline_dict` in `pipeline_gateway.rs`):

```python
{"nodes": [
  # only if apply_quality_check
  {"type": "signal quality check", "config": {"sfreq": sfreq}},
  # only if apply_bandpass
  {"type": "bandpass filter", "config": {"method": "IIR" | "FIR",
                                         "low_cut_hz": l_freq or 1.0,
                                         "Filter": h_freq or 50.0,
                                         "src_fs": sfreq}},
]}
```

Also see [Unexpected Effects and Issues](#unexpected-effects-and-issues) section for some current problems.

Frontend defaults (`DEFAULT_PROCESSING`): `apply_bandpass: false`, `use_iir: false`,
`l_freq: null`, `h_freq: null`, `downsample_factor: null`, `sfreq: 256`, `n_channels: 4`.
Note that `apply_bandpass` defaults to **false** on the frontend but **true** on the backend
when there's no node.

---

## `ml`

| Field | Type | Required | Default when node absent | Used by backend? | Meaning |
|---|---|---|---|---|---|
| `model` | string | yes | — (stage still runs, see below) | **no** | The model or task the user picked in the editor (e.g. `"Stress"`). |

Effect on output today: **none.** `Pipeline::ml_config()` is never called. The Python manager
runs on every batch whether or not an `ml` node is present, and the task it runs is chosen on
the Python side. `ml_result` is filled in whenever the manager returns a `classifier_output`
that has `overall_label`, `confidence` and `task`. Otherwise it is `null`.

Intended behaviour, not yet implemented: with no `ml` node, skip classification
(`ml_result: null`); with one, pass `model` through so it picks the classifier task.

Frontend: `machine-learning-node.tsx` always sends `{ "model": <selected option> }`,
with `"Stress"` as the default selection.

---

## Checklist for adding a node type

1. Add the variant and config struct in `pipeline.rs`, with `#[serde(rename = "...")]` and a
   `Default` impl. Use `#[serde(default)]` on fields so older clients don't break.
2. Read it in `lsl.rs` (or wherever it takes effect), and pass it to Python in
   `pipeline_gateway.rs` if needed.
3. Add the React Flow node, its `typeMap` entry and its `PIPELINE_NODE_TYPES` entry in
   `react-flow-view.tsx`.
4. Document it in this file.

---

## Unexpected Effects and Issues

The preprocessing stage has the following problems:

- **There is no true low-pass or high-pass.** The editor's "lowpass" sends `l_freq: null`,
  which becomes 1 Hz, so it's really a 1–`h_freq` bandpass. "highpass" sends `h_freq: null`,
  which becomes 50 Hz, so it's really an `l_freq`–50 bandpass. To actually turn filtering off,
  send `apply_bandpass: false`.
- If the node is left out, filtering and the quality check are **on** (1–50 Hz FIR).
- With the default `mock_manager.py` (`PIPELINE_MANAGER_SCRIPT`), the config is ignored
  completely and every batch gets the same fixed `ml_result`.

> ⚠️ **Contract mismatch today:** the frontend never sends `apply_quality_check`
> (`FilterConfig` in `filter-node.tsx`, `DEFAULT_PROCESSING` in `react-flow-view.tsx`).
> Because the field is required, any pipeline with a filter node is rejected and the
> session never streams. Until that's fixed, the frontend must send
> `"apply_quality_check": true` (or `false`).
