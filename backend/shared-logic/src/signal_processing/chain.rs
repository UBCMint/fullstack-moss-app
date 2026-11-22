//! Runs a compiled [`ProcessingPlan`] over the live stream, one window at a time. Returns the
//! data at every point of the chain so the ML node can read from the middle while the client
//! gets the end.

use chrono::{DateTime, Utc};

use crate::pipeline::{PipelineError, ProcessingPlan, StageKind};
use crate::signal_processing::dsp::{Resampler, StreamFilter};

// signals is channel-major: signals[c][i] lines up with timestamps[i]
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Block {
    pub timestamps: Vec<DateTime<Utc>>,
    pub signals: Vec<Vec<f64>>,
}

impl Block {
    pub fn empty(n_channels: usize) -> Self {
        Self {
            timestamps: Vec::new(),
            signals: vec![Vec::new(); n_channels],
        }
    }

    pub fn len(&self) -> usize {
        self.timestamps.len()
    }

    pub fn is_empty(&self) -> bool {
        self.timestamps.is_empty()
    }

    fn concat(&self, other: &Block) -> Block {
        let mut out = self.clone();
        out.timestamps.extend_from_slice(&other.timestamps);
        for (ch, extra) in out.signals.iter_mut().zip(&other.signals) {
            ch.extend_from_slice(extra);
        }
        out
    }

    fn tail(&self, n: usize) -> Block {
        let start = self.len().saturating_sub(n);
        Block {
            timestamps: self.timestamps[start..].to_vec(),
            signals: self.signals.iter().map(|ch| ch[start..].to_vec()).collect(),
        }
    }
}

enum RuntimeStage {
    Filter(Vec<StreamFilter>),
    Resample {
        resampler: Resampler,
        origin: Option<i64>,
    },
    Passthrough,
}

impl RuntimeStage {
    fn run(&mut self, block: Block) -> Block {
        match self {
            RuntimeStage::Passthrough => block,
            RuntimeStage::Filter(filters) => Block {
                signals: filters
                    .iter_mut()
                    .zip(&block.signals)
                    .map(|(f, ch)| f.process(ch))
                    .collect(),
                timestamps: block.timestamps,
            },
            RuntimeStage::Resample { resampler, origin } => {
                // nanoseconds since the stage's first sample; the origin has to stay fixed
                // because the resampler carries the previous batch's last timestamp
                let Some(first) = block.timestamps.first() else {
                    return block;
                };
                let base = *origin.get_or_insert(first.timestamp_nanos_opt().unwrap_or(0));
                let times: Vec<f64> = block
                    .timestamps
                    .iter()
                    .map(|t| (t.timestamp_nanos_opt().unwrap_or(base) - base) as f64)
                    .collect();
                let (out_times, signals) = resampler.process(&times, &block.signals);
                Block {
                    timestamps: out_times
                        .into_iter()
                        .map(|t| DateTime::from_timestamp_nanos(base + t.round() as i64))
                        .collect(),
                    signals,
                }
            }
        }
    }
}

pub struct ProcessingChain {
    stages: Vec<RuntimeStage>,
    // per point in the chain (index 0 is the raw window)
    overlaps: Vec<usize>,
    tails: Vec<Block>,
    rates: Vec<f64>,
}

impl ProcessingChain {
    pub fn new(
        plan: &ProcessingPlan,
        input_rate: f64,
        n_channels: usize,
    ) -> Result<Self, PipelineError> {
        let mut rates = vec![input_rate];
        let mut stages = Vec::with_capacity(plan.stages.len());
        for stage in &plan.stages {
            let rate = *rates.last().expect("starts non-empty");
            let (runtime, out_rate) = match &stage.kind {
                StageKind::Filter(config) if config.apply_bandpass => {
                    let filters = (0..n_channels)
                        .map(|_| {
                            StreamFilter::new(
                                config.l_freq.map(f64::from),
                                config.h_freq.map(f64::from),
                                config.use_iir,
                                rate,
                            )
                        })
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(|e| PipelineError::at(&stage.node_id, e))?;
                    (RuntimeStage::Filter(filters), rate)
                }
                StageKind::Filter(_) | StageKind::Passthrough(_) => {
                    (RuntimeStage::Passthrough, rate)
                }
                StageKind::Resample(config) => match config.target_hz {
                    Some(target) if (target - rate).abs() > 1e-9 => {
                        let resampler = Resampler::new(rate, target, n_channels)
                            .map_err(|e| PipelineError::at(&stage.node_id, e))?;
                        (
                            RuntimeStage::Resample {
                                resampler,
                                origin: None,
                            },
                            target,
                        )
                    }
                    _ => (RuntimeStage::Passthrough, rate),
                },
            };
            stages.push(runtime);
            rates.push(out_rate);
        }

        let overlap = plan.window.overlap_size as f64;
        let overlaps = rates
            .iter()
            .map(|r| (overlap * r / input_rate).round() as usize)
            .collect::<Vec<_>>();
        Ok(Self {
            tails: vec![Block::empty(n_channels); rates.len()],
            stages,
            overlaps,
            rates,
        })
    }

    pub fn rate_after(&self, stage: usize) -> f64 {
        self.rates[stage]
    }

    /// Returns `stages + 1` blocks: index `i` is the data after `i` stages, with the previous
    /// window's overlap (real samples and timestamps) in front.
    pub fn process(&mut self, new_samples: Block) -> Vec<Block> {
        let mut fresh = Vec::with_capacity(self.stages.len() + 1);
        fresh.push(new_samples);
        for stage in &mut self.stages {
            let input = fresh.last().expect("starts non-empty").clone();
            fresh.push(stage.run(input));
        }

        fresh
            .into_iter()
            .enumerate()
            .map(|(i, new)| {
                let out = self.tails[i].concat(&new);
                self.tails[i] = out.tail(self.overlaps[i]);
                out
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::{PreprocessingConfig, ResampleConfig, Stage, WindowConfig};

    fn block(start: usize, n: usize, fs: f64) -> Block {
        let timestamps = (start..start + n)
            .map(|i| DateTime::from_timestamp_nanos((i as f64 / fs * 1e9) as i64))
            .collect();
        let signals = (0..2)
            .map(|c| {
                (start..start + n)
                    .map(|i| (i as f64 * 0.3 + c as f64).sin())
                    .collect()
            })
            .collect();
        Block {
            timestamps,
            signals,
        }
    }

    fn plan(stages: Vec<StageKind>, overlap: usize) -> ProcessingPlan {
        ProcessingPlan {
            window: WindowConfig {
                chunk_size: 64,
                overlap_size: overlap,
            },
            stages: stages
                .into_iter()
                .enumerate()
                .map(|(i, kind)| Stage {
                    node_id: format!("n{i}"),
                    kind,
                })
                .collect(),
            ml: None,
        }
    }

    #[test]
    fn empty_chain_returns_raw_window_with_real_overlap() {
        let mut chain = ProcessingChain::new(&plan(vec![], 16), 256.0, 2).unwrap();
        let first = chain.process(block(0, 64, 256.0));
        assert_eq!(first.len(), 1);
        assert_eq!(first[0], block(0, 64, 256.0));
        let second = chain.process(block(64, 64, 256.0));
        assert_eq!(
            second[0],
            block(48, 80, 256.0),
            "overlap keeps real samples and times"
        );
    }

    #[test]
    fn filter_and_resample_change_the_output() {
        let stages = vec![
            StageKind::Filter(PreprocessingConfig {
                l_freq: None,
                h_freq: Some(10.0),
                use_iir: true,
                ..Default::default()
            }),
            StageKind::Resample(ResampleConfig {
                target_hz: Some(128.0),
            }),
        ];
        let mut chain = ProcessingChain::new(&plan(stages, 16), 256.0, 2).unwrap();
        assert_eq!(chain.rate_after(2), 128.0);
        chain.process(block(0, 64, 256.0));
        let out = chain.process(block(64, 64, 256.0));
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].len(), 80);
        assert_eq!(out[1].len(), 80);
        assert_ne!(out[1].signals, out[0].signals, "filter changed the data");
        assert_eq!(out[2].len(), 32 + 8, "half the samples, half the overlap");
        assert!(out[2]
            .timestamps
            .windows(2)
            .all(|w| w[1] > w[0] && (w[1] - w[0]).num_microseconds() == Some(7812)));
    }

    #[test]
    fn disabled_filter_and_same_rate_resample_pass_through() {
        let stages = vec![
            StageKind::Filter(PreprocessingConfig {
                apply_bandpass: false,
                ..Default::default()
            }),
            StageKind::Resample(ResampleConfig {
                target_hz: Some(256.0),
            }),
            StageKind::Resample(ResampleConfig { target_hz: None }),
        ];
        let mut chain = ProcessingChain::new(&plan(stages, 0), 256.0, 2).unwrap();
        let out = chain.process(block(0, 64, 256.0));
        assert!(out.iter().all(|b| *b == block(0, 64, 256.0)));
    }

    #[test]
    fn cutoff_above_resampled_nyquist_names_the_filter() {
        let stages = vec![
            StageKind::Resample(ResampleConfig {
                target_hz: Some(64.0),
            }),
            StageKind::Filter(PreprocessingConfig::default()), // 1-50 Hz, but Nyquist is now 32
        ];
        let err = ProcessingChain::new(&plan(stages, 0), 256.0, 2)
            .err()
            .expect("50 Hz doesn't fit a 64 Hz stream");
        assert_eq!(err.node_id.as_deref(), Some("n1"));
    }

    #[test]
    fn canvas_settings_change_streamed_output() {
        use crate::pipeline::Pipeline;
        use serde_json::json;

        let stream = |chunk: usize, h_freq: f64, target_hz: Option<f64>, n: usize| {
            let p: Pipeline = serde_json::from_value(json!({
                "nodes": [
                    {"id": "s", "type": "source", "config": {}},
                    {"id": "w", "type": "window", "config": {"chunk_size": chunk}},
                    {"id": "f", "type": "preprocessing", "config": {"l_freq": null, "h_freq": h_freq, "use_iir": true}},
                    {"id": "r", "type": "resample", "config": {"target_hz": target_hz}},
                    {"id": "g", "type": "signal_graph", "config": {}}
                ],
                "edges": [
                    {"source": "s", "target": "w"}, {"source": "w", "target": "f"},
                    {"source": "f", "target": "r"}, {"source": "r", "target": "g"}
                ]
            }))
            .unwrap();
            let plan = p.compile().unwrap();
            let mut chain = ProcessingChain::new(&plan, 256.0, 2).unwrap();
            (0..n)
                .map(|i| chain.process(block(i * chunk, chunk, 256.0)).pop().unwrap())
                .collect::<Vec<_>>()
        };

        let base = stream(64, 40.0, None, 4);
        assert!(base.iter().all(|b| b.len() == 64));
        assert_ne!(stream(64, 10.0, None, 4), base, "cutoff changes the data");
        assert!(
            stream(128, 40.0, None, 2).iter().all(|b| b.len() == 128),
            "window size"
        );
        let resampled = stream(64, 40.0, Some(128.0), 4);
        assert_eq!(
            resampled.iter().map(Block::len).sum::<usize>(),
            128,
            "half the samples at 128 Hz"
        );
    }
}
