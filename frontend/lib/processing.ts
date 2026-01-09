export type ProcessingConfig = {
    apply_bandpass: boolean
    use_iir: boolean
    l_freq: number | null
    h_freq: number | null
    downsample_factor: number | null
    sfreq: number
    n_channels: number
}
  