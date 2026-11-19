//! Client-configured processing pipeline, sent as `nodes` + `edges` in the websocket init
//! message.
//!
//! [`Pipeline::compile`] checks the graph and turns it into a [`ProcessingPlan`]: the window
//! config, the processing stages in edge order, and where the ML node reads from. The graph
//! rules and every node's fields are in `backend/docs/pipeline-nodes.md`, which the frontend
//! (`frontend/lib/pipeline-validation.ts`) has to match.

use std::collections::{HashMap, HashSet, VecDeque};
use std::fmt;

use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, Clone, Default)]
pub struct Pipeline {
    #[serde(default)]
    pub nodes: Vec<PipelineNode>,
    #[serde(default)]
    pub edges: Vec<PipelineEdge>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PipelineNode {
    pub id: String,
    #[serde(flatten)]
    pub node: Node,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PipelineEdge {
    pub source: String,
    pub target: String,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(tag = "type", content = "config")]
pub enum Node {
    #[serde(rename = "source")]
    Source(EmptyConfig),

    #[serde(rename = "window")]
    Window(WindowConfig),

    #[serde(rename = "preprocessing")]
    Preprocessing(PreprocessingConfig),

    #[serde(rename = "resample")]
    Resample(ResampleConfig),

    // passes data through unchanged for now
    #[serde(rename = "artifact")]
    Artifact(serde_json::Value),

    #[serde(rename = "label")]
    Label(serde_json::Value),

    #[serde(rename = "ml")]
    ML(MLConfig),

    #[serde(rename = "signal_graph")]
    SignalGraph(serde_json::Value),
}

impl Node {
    pub fn type_name(&self) -> &'static str {
        match self {
            Node::Source(_) => "source",
            Node::Window(_) => "window",
            Node::Preprocessing(_) => "preprocessing",
            Node::Resample(_) => "resample",
            Node::Artifact(_) => "artifact",
            Node::Label(_) => "label",
            Node::ML(_) => "ml",
            Node::SignalGraph(_) => "signal_graph",
        }
    }

    fn is_output(&self) -> bool {
        matches!(self, Node::ML(_) | Node::SignalGraph(_))
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, Default)]
pub struct EmptyConfig {}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(default)]
pub struct WindowConfig {
    pub chunk_size: usize,
    pub overlap_size: usize,
}

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            chunk_size: 64,
            overlap_size: 0,
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(default)]
pub struct PreprocessingConfig {
    pub apply_bandpass: bool,
    // only used by an ML node after this filter
    pub apply_quality_check: bool,
    pub use_iir: bool,
    // None means no high-pass / no low-pass
    pub l_freq: Option<f32>,
    pub h_freq: Option<f32>,
    // unused: resampling is its own node, and the real rate comes from the stream
    pub downsample_factor: Option<u32>,
    pub sfreq: f32,
    pub n_channels: usize,
}

impl Default for PreprocessingConfig {
    fn default() -> Self {
        Self {
            apply_bandpass: true,
            apply_quality_check: true,
            use_iir: false,
            l_freq: Some(1.0),
            h_freq: Some(50.0),
            downsample_factor: None,
            sfreq: 256.0,
            n_channels: 4,
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, Default, PartialEq)]
#[serde(default)]
pub struct ResampleConfig {
    pub target_hz: Option<f64>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(default)]
pub struct MLConfig {
    // lower-cased and sent to the python manager as the task
    pub model: String,
}

impl Default for MLConfig {
    fn default() -> Self {
        Self {
            model: "activity".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct PipelineError {
    pub node_id: Option<String>,
    pub message: String,
}

impl PipelineError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            node_id: None,
            message: message.into(),
        }
    }

    pub fn at(node_id: &str, message: impl Into<String>) -> Self {
        Self {
            node_id: Some(node_id.to_string()),
            message: message.into(),
        }
    }
}

impl fmt::Display for PipelineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.node_id {
            Some(id) => write!(f, "{} (node {})", self.message, id),
            None => f.write_str(&self.message),
        }
    }
}

impl std::error::Error for PipelineError {}

#[derive(Debug, Clone, PartialEq)]
pub struct Stage {
    pub node_id: String,
    pub kind: StageKind,
}

#[derive(Debug, Clone, PartialEq)]
pub enum StageKind {
    Filter(PreprocessingConfig),
    Resample(ResampleConfig),
    Passthrough(&'static str),
}

#[derive(Debug, Clone, PartialEq)]
pub struct MlTap {
    pub node_id: String,
    pub config: MLConfig,
    // 0 = raw window, n = output of stages[n - 1]
    pub after_stage: usize,
    pub upstream_filter: Option<PreprocessingConfig>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ProcessingPlan {
    pub window: WindowConfig,
    pub stages: Vec<Stage>,
    pub ml: Option<MlTap>,
}

impl Pipeline {
    pub fn compile(&self) -> Result<ProcessingPlan, PipelineError> {
        let mut by_id: HashMap<&str, &Node> = HashMap::new();
        for n in &self.nodes {
            if by_id.insert(n.id.as_str(), &n.node).is_some() {
                return Err(PipelineError::at(&n.id, "Two nodes share this id."));
            }
        }

        let mut inputs: HashMap<&str, Vec<&str>> = HashMap::new();
        let mut outputs: HashMap<&str, Vec<&str>> = HashMap::new();
        for e in &self.edges {
            for end in [&e.source, &e.target] {
                if !by_id.contains_key(end.as_str()) {
                    return Err(PipelineError::new(format!(
                        "A connection refers to node '{}', which isn't in the pipeline.",
                        end
                    )));
                }
            }
            if e.source == e.target {
                return Err(PipelineError::at(
                    &e.source,
                    "A node can't connect to itself.",
                ));
            }
            inputs
                .entry(e.target.as_str())
                .or_default()
                .push(e.source.as_str());
            outputs
                .entry(e.source.as_str())
                .or_default()
                .push(e.target.as_str());
        }
        let inputs_of = |id: &str| inputs.get(id).map(Vec::as_slice).unwrap_or(&[]);
        let outputs_of = |id: &str| outputs.get(id).map(Vec::as_slice).unwrap_or(&[]);

        let sources: Vec<&PipelineNode> = self
            .nodes
            .iter()
            .filter(|n| matches!(n.node, Node::Source(_)))
            .collect();
        let source = match sources.as_slice() {
            [] => return Err(PipelineError::new("Add a Source node.")),
            [s] => s.id.as_str(),
            [_, extra, ..] => {
                return Err(PipelineError::at(
                    &extra.id,
                    "Only one Source node is allowed.",
                ))
            }
        };

        // cycle check (kahn's algorithm)
        let mut in_degree: HashMap<&str, usize> = self
            .nodes
            .iter()
            .map(|n| (n.id.as_str(), inputs_of(&n.id).len()))
            .collect();
        let mut queue: VecDeque<&str> = self
            .nodes
            .iter()
            .map(|n| n.id.as_str())
            .filter(|id| in_degree[id] == 0)
            .collect();
        let mut sorted = 0;
        while let Some(id) = queue.pop_front() {
            sorted += 1;
            for &t in outputs_of(id) {
                let d = in_degree.get_mut(t).expect("edge targets are known nodes");
                *d -= 1;
                if *d == 0 {
                    queue.push_back(t);
                }
            }
        }
        if sorted != self.nodes.len() {
            let in_cycle = self
                .nodes
                .iter()
                .find(|n| in_degree[n.id.as_str()] > 0)
                .expect("an unsorted node exists");
            return Err(PipelineError::at(
                &in_cycle.id,
                "The pipeline contains a loop. Connections must flow one way from the Source.",
            ));
        }

        // the source has no inputs, every other node has exactly one
        for n in &self.nodes {
            let ins = inputs_of(&n.id).len();
            match (&n.node, ins) {
                (Node::Source(_), 0) => {}
                (Node::Source(_), _) => {
                    return Err(PipelineError::at(
                        &n.id,
                        "The Source node can't have inputs.",
                    ))
                }
                (node, 0) => {
                    return Err(PipelineError::at(
                        &n.id,
                        format!(
                            "The {} node isn't connected. Connect it to the pipeline or remove it.",
                            display_name(node)
                        ),
                    ))
                }
                (_, 1) => {}
                (node, _) => {
                    return Err(PipelineError::at(
                        &n.id,
                        format!("The {} node can only have one input.", display_name(node)),
                    ))
                }
            }
            if n.node.is_output() && !outputs_of(&n.id).is_empty() {
                return Err(PipelineError::at(
                    &n.id,
                    format!(
                        "The {} node is an output and can't connect to other nodes.",
                        display_name(&n.node)
                    ),
                ));
            }
        }

        // walk the chain from the source; anything not visited isn't connected to it
        let mut plan = ProcessingPlan::default();
        let mut visited: HashSet<&str> = HashSet::from([source]);
        let mut last_filter: Option<PreprocessingConfig> = None;
        let mut current = source;
        loop {
            let mut next: Option<&str> = None;
            // outputs branch off the chain; a label node can feed more outputs
            let mut parents = vec![current];
            while let Some(parent) = parents.pop() {
                for &child in outputs_of(parent) {
                    visited.insert(child);
                    let node = by_id[child];
                    match node {
                        Node::ML(config) => {
                            if plan.ml.is_some() {
                                return Err(PipelineError::at(
                                    child,
                                    "Only one ML node is supported.",
                                ));
                            }
                            plan.ml = Some(MlTap {
                                node_id: child.to_string(),
                                config: config.clone(),
                                after_stage: plan.stages.len(),
                                upstream_filter: last_filter.clone(),
                            });
                        }
                        Node::SignalGraph(_) => {}
                        Node::Label(_) => parents.push(child),
                        _ if parent != current => {
                            return Err(PipelineError::at(
                                child,
                                format!(
                                    "Only output nodes can follow a Label node, not a {} node.",
                                    display_name(node)
                                ),
                            ))
                        }
                        _ => {
                            if let Some(other) = next {
                                return Err(PipelineError::at(
                                    child,
                                    format!(
                                        "Processing nodes must form a single chain, but this {} \
                                         node and node {} both take their input from the same \
                                         node.",
                                        display_name(node),
                                        other
                                    ),
                                ));
                            }
                            next = Some(child);
                        }
                    }
                }
            }

            let Some(child) = next else { break };
            match by_id[child] {
                Node::Window(config) => {
                    if current != source {
                        return Err(PipelineError::at(
                            child,
                            "The Window node has to come straight after the Source.",
                        ));
                    }
                    plan.window = config.clone();
                }
                Node::Preprocessing(config) => {
                    last_filter = Some(config.clone());
                    plan.stages.push(Stage {
                        node_id: child.to_string(),
                        kind: StageKind::Filter(config.clone()),
                    });
                }
                Node::Resample(config) => plan.stages.push(Stage {
                    node_id: child.to_string(),
                    kind: StageKind::Resample(config.clone()),
                }),
                node @ Node::Artifact(_) => plan.stages.push(Stage {
                    node_id: child.to_string(),
                    kind: StageKind::Passthrough(node.type_name()),
                }),
                Node::Source(_) | Node::ML(_) | Node::SignalGraph(_) | Node::Label(_) => {
                    unreachable!("handled above")
                }
            }
            current = child;
        }

        if let Some(n) = self.nodes.iter().find(|n| !visited.contains(n.id.as_str())) {
            return Err(PipelineError::at(
                &n.id,
                format!(
                    "The {} node isn't connected to the Source.",
                    display_name(&n.node)
                ),
            ));
        }

        if plan.window.chunk_size == 0 {
            let id = self
                .nodes
                .iter()
                .find(|n| matches!(n.node, Node::Window(_)))
                .map(|n| n.id.as_str())
                .unwrap_or(source);
            return Err(PipelineError::at(
                id,
                "Window size must be at least 1 sample.",
            ));
        }

        Ok(plan)
    }
}

fn display_name(node: &Node) -> &'static str {
    match node {
        Node::Source(_) => "Source",
        Node::Window(_) => "Window",
        Node::Preprocessing(_) => "Filter",
        Node::Resample(_) => "Resampling",
        Node::Artifact(_) => "Artifact",
        Node::Label(_) => "Label",
        Node::ML(_) => "ML",
        Node::SignalGraph(_) => "Chart",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn pipeline(value: serde_json::Value) -> Pipeline {
        serde_json::from_value(value).expect("valid pipeline JSON")
    }

    fn edges(pairs: &[(&str, &str)]) -> Vec<serde_json::Value> {
        pairs
            .iter()
            .map(|(s, t)| json!({"source": s, "target": t}))
            .collect()
    }

    #[test]
    fn parses_frontend_payload_with_defaults() {
        let p = pipeline(json!({
            "nodes": [
                {"id": "s", "type": "source", "config": {}},
                {"id": "w", "type": "window", "config": {"chunk_size": 128}},
                {"id": "f", "type": "preprocessing", "config": {"apply_bandpass": true, "l_freq": 2.0, "h_freq": null}},
                {"id": "r", "type": "resample", "config": {"target_hz": 128}},
                {"id": "g", "type": "signal_graph", "config": {}},
                {"id": "m", "type": "ml", "config": {"model": "Stress"}}
            ],
            "edges": edges(&[("s", "w"), ("w", "f"), ("f", "r"), ("r", "g"), ("f", "m")])
        }));
        let plan = p.compile().unwrap();
        assert_eq!(plan.window.chunk_size, 128);
        assert_eq!(plan.window.overlap_size, 0);
        assert_eq!(plan.stages.len(), 2);
        assert_eq!(plan.stages[0].node_id, "f");
        let StageKind::Filter(f) = &plan.stages[0].kind else {
            panic!("expected filter")
        };
        assert!(f.apply_quality_check);
        assert_eq!(f.l_freq, Some(2.0));
        assert_eq!(f.h_freq, None);
        assert_eq!(
            plan.stages[1].kind,
            StageKind::Resample(ResampleConfig {
                target_hz: Some(128.0)
            })
        );
        let ml = plan.ml.unwrap();
        assert_eq!(
            ml.after_stage, 1,
            "ML reads the filter output, before resampling"
        );
        assert_eq!(ml.config.model, "Stress");
        assert!(ml.upstream_filter.is_some());
    }

    #[test]
    fn order_comes_from_edges_not_array_order() {
        let p = pipeline(json!({
            "nodes": [
                {"id": "f", "type": "preprocessing", "config": {}},
                {"id": "r", "type": "resample", "config": {"target_hz": 128}},
                {"id": "w", "type": "window", "config": {}},
                {"id": "s", "type": "source", "config": {}}
            ],
            "edges": edges(&[("r", "f"), ("w", "r"), ("s", "w")])
        }));
        let plan = p.compile().unwrap();
        let ids: Vec<_> = plan.stages.iter().map(|s| s.node_id.as_str()).collect();
        assert_eq!(ids, ["r", "f"]);
    }

    #[test]
    fn source_only_uses_defaults() {
        let p =
            pipeline(json!({"nodes": [{"id": "s", "type": "source", "config": {}}], "edges": []}));
        assert_eq!(p.compile().unwrap(), ProcessingPlan::default());
    }

    #[test]
    fn rejects_unknown_node_type() {
        let r: Result<Pipeline, _> = serde_json::from_value(json!({
            "nodes": [{"id": "x", "type": "mystery", "config": {}}], "edges": []
        }));
        assert!(r.is_err());
    }

    fn compile_err(value: serde_json::Value) -> PipelineError {
        pipeline(value).compile().unwrap_err()
    }

    #[test]
    fn rejects_missing_or_duplicate_source() {
        let e = compile_err(
            json!({"nodes": [{"id": "w", "type": "window", "config": {}}], "edges": []}),
        );
        assert_eq!(e.message, "Add a Source node.");
        let e = compile_err(json!({
            "nodes": [{"id": "a", "type": "source", "config": {}}, {"id": "b", "type": "source", "config": {}}], "edges": []
        }));
        assert_eq!(e.node_id.as_deref(), Some("b"));
    }

    #[test]
    fn rejects_cycles() {
        let e = compile_err(json!({
            "nodes": [
                {"id": "s", "type": "source", "config": {}},
                {"id": "f", "type": "preprocessing", "config": {}},
                {"id": "r", "type": "resample", "config": {}}
            ],
            "edges": edges(&[("s", "f"), ("f", "r"), ("r", "f")])
        }));
        assert!(e.message.contains("loop"), "{e}");
    }

    #[test]
    fn rejects_disconnected_nodes() {
        let e = compile_err(json!({
            "nodes": [{"id": "s", "type": "source", "config": {}}, {"id": "f", "type": "preprocessing", "config": {}}],
            "edges": []
        }));
        assert_eq!(e.node_id.as_deref(), Some("f"));
        assert!(e.message.contains("isn't connected"), "{e}");
    }

    #[test]
    fn rejects_branching_processing_chain() {
        let e = compile_err(json!({
            "nodes": [
                {"id": "s", "type": "source", "config": {}},
                {"id": "w", "type": "window", "config": {}},
                {"id": "f1", "type": "preprocessing", "config": {}},
                {"id": "f2", "type": "preprocessing", "config": {}}
            ],
            "edges": edges(&[("s", "w"), ("w", "f1"), ("w", "f2")])
        }));
        assert_eq!(e.node_id.as_deref(), Some("f2"));
        assert!(e.message.contains("single chain"), "{e}");
    }

    #[test]
    fn outputs_may_branch_off_the_chain() {
        let p = pipeline(json!({
            "nodes": [
                {"id": "s", "type": "source", "config": {}},
                {"id": "w", "type": "window", "config": {}},
                {"id": "g1", "type": "signal_graph", "config": {}},
                {"id": "f", "type": "preprocessing", "config": {}},
                {"id": "g2", "type": "signal_graph", "config": {}}
            ],
            "edges": edges(&[("s", "w"), ("w", "g1"), ("w", "f"), ("f", "g2")])
        }));
        assert_eq!(p.compile().unwrap().stages.len(), 1);
    }

    #[test]
    fn label_is_an_output_that_can_feed_outputs() {
        let p = pipeline(json!({
            "nodes": [
                {"id": "s", "type": "source", "config": {}},
                {"id": "w", "type": "window", "config": {}},
                {"id": "l", "type": "label", "config": {}},
                {"id": "g", "type": "signal_graph", "config": {}},
                {"id": "f", "type": "preprocessing", "config": {}}
            ],
            "edges": edges(&[("s", "w"), ("w", "l"), ("l", "g"), ("w", "f")])
        }));
        let plan = p.compile().unwrap();
        assert_eq!(plan.stages.len(), 1, "label isn't a stage; the filter is");

        let e = compile_err(json!({
            "nodes": [
                {"id": "s", "type": "source", "config": {}},
                {"id": "l", "type": "label", "config": {}},
                {"id": "f", "type": "preprocessing", "config": {}}
            ],
            "edges": edges(&[("s", "l"), ("l", "f")])
        }));
        assert_eq!(e.node_id.as_deref(), Some("f"));
    }

    #[test]
    fn rejects_window_after_other_processing() {
        let e = compile_err(json!({
            "nodes": [
                {"id": "s", "type": "source", "config": {}},
                {"id": "f", "type": "preprocessing", "config": {}},
                {"id": "w", "type": "window", "config": {}}
            ],
            "edges": edges(&[("s", "f"), ("f", "w")])
        }));
        assert_eq!(e.node_id.as_deref(), Some("w"));
    }

    #[test]
    fn rejects_outputs_with_outgoing_edges_and_double_inputs() {
        let e = compile_err(json!({
            "nodes": [
                {"id": "s", "type": "source", "config": {}},
                {"id": "m", "type": "ml", "config": {}},
                {"id": "g", "type": "signal_graph", "config": {}}
            ],
            "edges": edges(&[("s", "m"), ("m", "g")])
        }));
        assert_eq!(e.node_id.as_deref(), Some("m"));

        let e = compile_err(json!({
            "nodes": [
                {"id": "s", "type": "source", "config": {}},
                {"id": "w", "type": "window", "config": {}},
                {"id": "g", "type": "signal_graph", "config": {}}
            ],
            "edges": edges(&[("s", "w"), ("s", "g"), ("w", "g")])
        }));
        assert_eq!(e.node_id.as_deref(), Some("g"));
        assert!(e.message.contains("one input"), "{e}");
    }

    #[test]
    fn rejects_edges_to_unknown_nodes_and_zero_window() {
        let e = compile_err(json!({
            "nodes": [{"id": "s", "type": "source", "config": {}}],
            "edges": edges(&[("s", "ghost")])
        }));
        assert!(e.message.contains("ghost"), "{e}");

        let e = compile_err(json!({
            "nodes": [{"id": "s", "type": "source", "config": {}}, {"id": "w", "type": "window", "config": {"chunk_size": 0}}],
            "edges": edges(&[("s", "w")])
        }));
        assert_eq!(e.node_id.as_deref(), Some("w"));
    }
}
