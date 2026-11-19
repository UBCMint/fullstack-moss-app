//! Streaming filters and resampler for the live pipeline. They keep state between calls, so
//! feeding a signal in batches gives the same output as feeding it in one go (no artifacts at
//! window boundaries).

use std::f64::consts::PI;

/// Q factors of the two second-order sections of a 4th-order Butterworth filter.
const BUTTERWORTH4_Q: [f64; 2] = [0.541_196_100_146_197, 1.306_562_964_876_376_7];

// one second-order section, transposed direct form II
#[derive(Debug, Clone)]
struct Biquad {
    b: [f64; 3],
    a: [f64; 2],
    z: [f64; 2],
}

impl Biquad {
    // RBJ cookbook coefficients
    fn new(highpass: bool, cutoff_hz: f64, q: f64, fs: f64) -> Self {
        let w0 = 2.0 * PI * cutoff_hz / fs;
        let (sin, cos) = w0.sin_cos();
        let alpha = sin / (2.0 * q);
        let a0 = 1.0 + alpha;
        let (b0, b1) = if highpass {
            ((1.0 + cos) / 2.0, -(1.0 + cos))
        } else {
            ((1.0 - cos) / 2.0, 1.0 - cos)
        };
        Self {
            b: [b0 / a0, b1 / a0, b0 / a0],
            a: [-2.0 * cos / a0, (1.0 - alpha) / a0],
            z: [0.0; 2],
        }
    }

    fn step(&mut self, x: f64) -> f64 {
        let y = self.b[0] * x + self.z[0];
        self.z[0] = self.b[1] * x - self.a[0] * y + self.z[1];
        self.z[1] = self.b[2] * x - self.a[1] * y;
        y
    }
}

fn butterworth4(highpass: bool, cutoff_hz: f64, fs: f64) -> Vec<Biquad> {
    BUTTERWORTH4_Q
        .iter()
        .map(|&q| Biquad::new(highpass, cutoff_hz, q, fs))
        .collect()
}

// windowed-sinc FIR (hamming), with MNE's default transition bandwidths and length
fn design_fir(l_freq: Option<f64>, h_freq: Option<f64>, fs: f64) -> Vec<f64> {
    let nyquist = fs / 2.0;
    let l_trans = l_freq.map(|l| (0.25 * l).max(2.0).min(l));
    let h_trans = h_freq.map(|h| (0.25 * h).max(2.0).min(nyquist - h));
    let narrowest = l_trans
        .into_iter()
        .chain(h_trans)
        .fold(f64::INFINITY, f64::min);
    let n = (3.3 / narrowest * fs).ceil() as usize | 1;
    let mid = (n - 1) as f64 / 2.0;

    let lowpass = |fc: f64, i: usize| {
        let t = i as f64 - mid;
        let wc = 2.0 * fc / fs;
        if t == 0.0 {
            wc
        } else {
            (PI * wc * t).sin() / (PI * t)
        }
    };

    // cutoffs at the middle of each transition band, like MNE
    let low_edge = l_freq.zip(l_trans).map(|(l, t)| l - t / 2.0);
    let high_edge = h_freq.zip(h_trans).map(|(h, t)| h + t / 2.0);

    (0..n)
        .map(|i| {
            let ideal = match (low_edge, high_edge) {
                (Some(lo), Some(hi)) => lowpass(hi, i) - lowpass(lo, i),
                (None, Some(hi)) => lowpass(hi, i),
                (Some(lo), None) => (if i as f64 == mid { 1.0 } else { 0.0 }) - lowpass(lo, i),
                (None, None) => {
                    if i as f64 == mid {
                        1.0
                    } else {
                        0.0
                    }
                }
            };
            let hamming = 0.54 - 0.46 * (2.0 * PI * i as f64 / (n - 1) as f64).cos();
            ideal * hamming
        })
        .collect()
}

#[derive(Debug, Clone)]
enum FilterKind {
    Iir(Vec<Biquad>),
    Fir {
        taps: Vec<f64>,
        history: Vec<f64>,
        pos: usize,
    },
}

#[derive(Debug, Clone)]
pub struct StreamFilter {
    kind: FilterKind,
}

impl StreamFilter {
    /// `l_freq` is the high-pass cutoff and `h_freq` the low-pass cutoff; leave one out for a
    /// pure low-pass or high-pass.
    pub fn new(
        l_freq: Option<f64>,
        h_freq: Option<f64>,
        use_iir: bool,
        fs: f64,
    ) -> Result<Self, String> {
        let nyquist = fs / 2.0;
        if let Some(l) = l_freq {
            if !(l.is_finite() && l > 0.0) {
                return Err(format!("Low cutoff must be above 0 Hz (got {l} Hz)."));
            }
            if l >= nyquist {
                return Err(format!(
                    "Low cutoff ({l} Hz) must be below half the sample rate ({nyquist} Hz)."
                ));
            }
        }
        if let Some(h) = h_freq {
            if !(h.is_finite() && h > 0.0) {
                return Err(format!("High cutoff must be above 0 Hz (got {h} Hz)."));
            }
            if h >= nyquist {
                return Err(format!(
                    "High cutoff ({h} Hz) must be below half the sample rate ({nyquist} Hz)."
                ));
            }
        }
        if let (Some(l), Some(h)) = (l_freq, h_freq) {
            if l >= h {
                return Err(format!(
                    "Low cutoff ({l} Hz) must be below the high cutoff ({h} Hz)."
                ));
            }
        }

        let kind = if use_iir {
            let mut sections = Vec::new();
            if let Some(l) = l_freq {
                sections.extend(butterworth4(true, l, fs));
            }
            if let Some(h) = h_freq {
                sections.extend(butterworth4(false, h, fs));
            }
            FilterKind::Iir(sections)
        } else {
            let taps = design_fir(l_freq, h_freq, fs);
            FilterKind::Fir {
                history: vec![0.0; taps.len()],
                taps,
                pos: 0,
            }
        };
        Ok(Self { kind })
    }

    pub fn process(&mut self, input: &[f64]) -> Vec<f64> {
        input.iter().map(|&x| self.step(x)).collect()
    }

    fn step(&mut self, x: f64) -> f64 {
        match &mut self.kind {
            FilterKind::Iir(sections) => sections.iter_mut().fold(x, |acc, s| s.step(acc)),
            FilterKind::Fir { taps, history, pos } => {
                let n = taps.len();
                history[*pos] = x;
                // taps[k] multiplies the input from k samples ago.
                let mut y = 0.0;
                for (k, tap) in taps.iter().enumerate() {
                    y += tap * history[(*pos + n - k) % n];
                }
                *pos = (*pos + 1) % n;
                y
            }
        }
    }
}

/// Linear-interpolation resampler, with an anti-aliasing low-pass when downsampling. Output
/// sample `k` sits at input position `k * in_rate / out_rate`; timestamps are interpolated
/// the same way.
#[derive(Debug, Clone)]
pub struct Resampler {
    step: f64,
    /// Position of the next output sample, relative to the start of the next batch. `-1.0`
    /// refers to the last sample of the previous batch.
    next_pos: f64,
    previous: Option<(f64, Vec<f64>)>,
    anti_alias: Option<Vec<StreamFilter>>,
}

impl Resampler {
    pub fn new(in_rate: f64, out_rate: f64, n_channels: usize) -> Result<Self, String> {
        if !(out_rate.is_finite() && out_rate > 0.0) {
            return Err(format!(
                "Resampling rate must be above 0 Hz (got {out_rate} Hz)."
            ));
        }
        let anti_alias = if out_rate < in_rate {
            // Cut off just under the new Nyquist frequency before throwing samples away.
            let cutoff = 0.45 * out_rate;
            Some(
                (0..n_channels)
                    .map(|_| StreamFilter::new(None, Some(cutoff), true, in_rate))
                    .collect::<Result<_, _>>()?,
            )
        } else {
            None
        };
        Ok(Self {
            step: in_rate / out_rate,
            next_pos: 0.0,
            previous: None,
            anti_alias,
        })
    }

    /// Resamples one batch. `times` has one entry per sample and `signals` is channel-major.
    pub fn process(&mut self, times: &[f64], signals: &[Vec<f64>]) -> (Vec<f64>, Vec<Vec<f64>>) {
        let filtered;
        let signals = match &mut self.anti_alias {
            Some(filters) => {
                filtered = filters
                    .iter_mut()
                    .zip(signals)
                    .map(|(f, ch)| f.process(ch))
                    .collect::<Vec<_>>();
                &filtered
            }
            None => signals,
        };

        let n = times.len();
        let mut out_times = Vec::new();
        let mut out_signals = vec![Vec::new(); signals.len()];
        if n == 0 {
            return (out_times, out_signals);
        }

        // Value at integer position i, where -1 is the previous batch's last sample.
        let at = |i: isize, ch: Option<usize>| -> f64 {
            if i < 0 {
                let (t, values) = self.previous.as_ref().expect("position -1 needs history");
                ch.map_or(*t, |c| values[c])
            } else {
                ch.map_or(times[i as usize], |c| signals[c][i as usize])
            }
        };

        while self.next_pos <= (n - 1) as f64 {
            let i = self.next_pos.floor() as isize;
            let frac = self.next_pos - i as f64;
            let lerp = |ch: Option<usize>| {
                let left = at(i, ch);
                if frac == 0.0 {
                    left
                } else {
                    left + (at(i + 1, ch) - left) * frac
                }
            };
            out_times.push(lerp(None));
            for (c, out) in out_signals.iter_mut().enumerate() {
                out.push(lerp(Some(c)));
            }
            self.next_pos += self.step;
        }

        self.next_pos -= n as f64;
        self.previous = Some((times[n - 1], signals.iter().map(|ch| ch[n - 1]).collect()));
        (out_times, out_signals)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FS: f64 = 256.0;

    fn sine(freq: f64, n: usize) -> Vec<f64> {
        (0..n)
            .map(|i| (2.0 * PI * freq * i as f64 / FS).sin())
            .collect()
    }

    /// RMS of the second half, after the filter has settled.
    fn settled_rms(x: &[f64]) -> f64 {
        let tail = &x[x.len() / 2..];
        (tail.iter().map(|v| v * v).sum::<f64>() / tail.len() as f64).sqrt()
    }

    fn gain(filter: &mut StreamFilter, freq: f64) -> f64 {
        let input = sine(freq, 8192);
        settled_rms(&filter.process(&input)) / settled_rms(&input)
    }

    #[test]
    fn bandpass_passes_band_and_rejects_outside_both_methods() {
        for use_iir in [true, false] {
            let make = || StreamFilter::new(Some(8.0), Some(30.0), use_iir, FS).unwrap();
            let pass = gain(&mut make(), 15.0);
            let low = gain(&mut make(), 1.0);
            let high = gain(&mut make(), 80.0);
            assert!(pass > 0.9, "iir={use_iir} pass={pass}");
            assert!(low < 0.1, "iir={use_iir} low={low}");
            assert!(high < 0.1, "iir={use_iir} high={high}");
        }
    }

    #[test]
    fn lowpass_and_highpass_only_cut_one_side() {
        let mut lp = StreamFilter::new(None, Some(20.0), true, FS).unwrap();
        assert!(gain(&mut lp, 2.0) > 0.95);
        let mut lp = StreamFilter::new(None, Some(20.0), true, FS).unwrap();
        assert!(gain(&mut lp, 60.0) < 0.05);

        let mut hp = StreamFilter::new(Some(20.0), None, false, FS).unwrap();
        assert!(gain(&mut hp, 60.0) > 0.95);
        let mut hp = StreamFilter::new(Some(20.0), None, false, FS).unwrap();
        assert!(gain(&mut hp, 2.0) < 0.05);
    }

    #[test]
    fn batching_does_not_change_the_output() {
        let input = sine(10.0, 1000);
        for use_iir in [true, false] {
            let mut whole = StreamFilter::new(Some(1.0), Some(40.0), use_iir, FS).unwrap();
            let mut batched = whole.clone();
            let expected = whole.process(&input);
            let got: Vec<f64> = input.chunks(64).flat_map(|c| batched.process(c)).collect();
            for (a, b) in expected.iter().zip(&got) {
                assert!((a - b).abs() < 1e-12);
            }
        }
    }

    #[test]
    fn rejects_cutoffs_that_do_not_fit() {
        assert!(StreamFilter::new(Some(0.0), None, true, FS).is_err());
        assert!(StreamFilter::new(None, Some(128.0), true, FS).is_err());
        assert!(StreamFilter::new(Some(30.0), Some(10.0), false, FS).is_err());
    }

    #[test]
    fn resampler_produces_the_right_count_and_times_across_batches() {
        let n = 1024;
        let times: Vec<f64> = (0..n).map(|i| i as f64 / FS).collect();
        let signal = [sine(5.0, n)];
        let mut r = Resampler::new(FS, 128.0, 1).unwrap();
        let mut out_t = Vec::new();
        let mut out_x = Vec::new();
        for start in (0..n).step_by(64) {
            let (t, x) = r.process(
                &times[start..start + 64],
                &[signal[0][start..start + 64].to_vec()],
            );
            out_t.extend(t);
            out_x.extend(x.into_iter().next().unwrap());
        }
        assert_eq!(out_t.len(), 512);
        for (k, t) in out_t.iter().enumerate() {
            assert!((t - k as f64 / 128.0).abs() < 1e-9, "t[{k}] = {t}");
        }
        // A 5 Hz sine survives downsampling to 128 Hz (allowing for the anti-alias filter's lag).
        assert!((settled_rms(&out_x) - settled_rms(&signal[0])).abs() < 0.05);
    }

    #[test]
    fn resampler_handles_non_integer_ratios_and_upsampling() {
        for out_rate in [200.0, 100.0, 300.0] {
            let n = 2560;
            let times: Vec<f64> = (0..n).map(|i| i as f64 / FS).collect();
            let mut r = Resampler::new(FS, out_rate, 1).unwrap();
            let mut count = 0;
            let mut last = f64::NEG_INFINITY;
            for start in (0..n).step_by(100) {
                let end = (start + 100).min(n);
                let (t, _) = r.process(&times[start..end], &[vec![0.0; end - start]]);
                for v in t {
                    assert!(v > last, "timestamps must increase");
                    last = v;
                    count += 1;
                }
            }
            let expected = (n as f64 - 1.0) * out_rate / FS + 1.0;
            assert!(
                (count as f64 - expected).abs() <= 1.0,
                "rate {out_rate}: {count} vs {expected}"
            );
        }
    }
}
