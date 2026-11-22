// Channel layout shared by the live stream, imported CSVs and the chart UI.
//
// The websocket server sends the layout once per connection as a metadata
// message (see backend/docs/websocket-protocol.md, "Stream metadata"), so the
// frontend never hardcodes a channel count: a board with a different number of
// EEG or EMG channels works without a frontend change.

export type ChannelGroup = 'eeg' | 'emg';

export const CHANNEL_GROUPS: readonly ChannelGroup[] = ['eeg', 'emg'];

/** Display name for every channel, in sample order. Counts are the lengths. */
export type ChannelLayout = Record<ChannelGroup, string[]>;

/** One sample of every channel, as shown in charts and tables. */
export type DataPoint = {
    /** HH:MM:SS.mmm, for axis labels. */
    time: string;
    /** Full timestamp as received. */
    rawTime: string;
    eeg: number[];
    emg: number[];
};

/** Which group(s) a chart shows. */
export type ChannelGroupView = ChannelGroup | 'both';

export type StreamMetadataMessage = {
    type: 'metadata';
    channels: ChannelLayout;
};

type GroupInfo = {
    /** Short name, e.g. "EEG". */
    name: string;
    unit: string;
    colours: readonly string[];
};

// Colours cycle if a board ever has more channels than listed here.
export const GROUP_INFO: Record<ChannelGroup, GroupInfo> = {
    eeg: {
        name: 'EEG',
        unit: 'µV',
        colours: [
            '#0000ff',
            '#00a000',
            '#ff00d0',
            '#ff0000',
            '#ff8c00',
            '#8a2be2',
            '#00a3a3',
            '#8b4513',
        ],
    },
    emg: {
        name: 'EMG',
        unit: 'µV',
        colours: ['#d62728', '#1f77b4', '#2ca02c', '#9467bd'],
    },
};

export function channelColour(group: ChannelGroup, index: number): string {
    const { colours } = GROUP_INFO[group];
    return colours[index % colours.length];
}

/** Generic names ("EEG 1", "EMG 1", ...) for a layout with the given counts. */
export function genericLayout(
    eegCount: number,
    emgCount: number
): ChannelLayout {
    const names = (group: ChannelGroup, count: number) =>
        Array.from(
            { length: count },
            (_, i) => `${GROUP_INFO[group].name} ${i + 1}`
        );
    return { eeg: names('eeg', eegCount), emg: names('emg', emgCount) };
}

export function isStreamMetadataMessage(
    message: unknown
): message is StreamMetadataMessage {
    if (typeof message !== 'object' || message === null) return false;
    const { type, channels } = message as Record<string, unknown>;
    if (type !== 'metadata' || typeof channels !== 'object' || !channels) {
        return false;
    }
    const isNameList = (value: unknown) =>
        Array.isArray(value) && value.every((v) => typeof v === 'string');
    const { eeg, emg } = channels as Record<string, unknown>;
    return isNameList(eeg) && isNameList(emg);
}

/** Groups that have at least one channel. */
export function availableGroups(layout: ChannelLayout): ChannelGroup[] {
    return CHANNEL_GROUPS.filter((group) => layout[group].length > 0);
}

/** The groups a view shows, limited to those the layout actually has. */
export function groupsForView(
    view: ChannelGroupView,
    layout: ChannelLayout
): ChannelGroup[] {
    const available = availableGroups(layout);
    if (view === 'both') return available;
    return available.includes(view) ? [view] : available;
}

/** Layout implied by the data itself, for when no metadata is available. */
export function inferLayout(data: readonly DataPoint[]): ChannelLayout {
    const sample = data[data.length - 1];
    return genericLayout(sample?.eeg.length ?? 0, sample?.emg.length ?? 0);
}

/**
 * `preferred` (e.g. the server's metadata) if it matches the shape of `data`,
 * otherwise a generic layout inferred from the data. Guards against a stale
 * layout from a previous connection being applied to different data.
 */
export function resolveLayout(
    data: readonly DataPoint[],
    preferred: ChannelLayout | null
): ChannelLayout {
    const sample = data[data.length - 1];
    if (!sample) return preferred ?? genericLayout(0, 0);
    if (
        preferred &&
        preferred.eeg.length === sample.eeg.length &&
        preferred.emg.length === sample.emg.length
    ) {
        return preferred;
    }
    return inferLayout(data);
}

export function isChannelGroupView(value: unknown): value is ChannelGroupView {
    return value === 'eeg' || value === 'emg' || value === 'both';
}

/** HH:MM:SS.mmm from an RFC 3339 or "YYYY-MM-DD HH:MM:SS..." timestamp. */
export function formatTimestamp(raw: unknown): string {
    const s = String(raw);
    if (s.includes('T')) return s.slice(11, 23);
    const spaceIdx = s.indexOf(' ');
    if (spaceIdx !== -1) return s.slice(spaceIdx + 1, spaceIdx + 13);
    return s;
}

/** "8 EEG · 4 EMG", leaving out empty groups. */
export function describeLayout(layout: ChannelLayout): string {
    return availableGroups(layout)
        .map((group) => `${layout[group].length} ${GROUP_INFO[group].name}`)
        .join(' · ');
}
