import { Button } from '@/components/ui/button';
import {
    EEG_CSV_EXAMPLE,
    EEG_CSV_HEADER,
    EEG_CSV_TIME_EXAMPLE,
    MAX_IMPORT_BYTES,
    downloadExampleCSV,
} from '@/lib/eeg-api';

/**
 * The CSV format, shown up front in the Import and Export dialogs so users
 * know what is valid before they pick a file. One definition for both, so the
 * two can't drift apart. Keep in sync with backend `parse_eeg_csv`
 * (shared-logic/src/db.rs) and docs/eeg-csv-format.md.
 */
export default function CsvFormatSummary({
    mode,
}: {
    mode: 'import' | 'export';
}) {
    const isImport = mode === 'import';
    // Exported times are always UTC, written with a +00:00 offset.
    const example = isImport
        ? EEG_CSV_EXAMPLE
        : EEG_CSV_EXAMPLE.replace(/Z/g, '+00:00');
    return (
        <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600">
            <p className="font-semibold text-gray-800 mb-1">
                {isImport ? 'File requirements' : 'Export format'}
            </p>
            <ul className="list-disc pl-4 space-y-0.5 mb-2">
                <li>
                    {isImport ? (
                        <>
                            A <b>.csv</b> text file (UTF-8, comma-separated), up
                            to {MAX_IMPORT_BYTES / 1024 / 1024} MB.
                        </>
                    ) : (
                        <>CSV (UTF-8, comma-separated), oldest row first.</>
                    )}
                </li>
                <li>
                    {isImport
                        ? 'First line is the header, exactly: '
                        : 'Header: '}
                    <code className="font-mono break-all">
                        {EEG_CSV_HEADER}
                    </code>
                    {isImport &&
                        ' (columns matched by name, any letter case or order)'}
                    .
                </li>
                {isImport && (
                    <li>
                        Include <b>time</b> and only the channels you have.
                        Every row has one value per header column and a unique{' '}
                        <b>time</b>. Older <code>channel1&ndash;channel4</code>{' '}
                        files are read as eeg1&ndash;eeg4.
                    </li>
                )}
                <li>
                    <b>time</b>:{' '}
                    {isImport
                        ? 'RFC 3339 with a time zone, e.g. '
                        : 'UTC in RFC 3339, e.g. '}
                    <code className="font-mono">
                        {isImport
                            ? EEG_CSV_TIME_EXAMPLE
                            : EEG_CSV_TIME_EXAMPLE.replace('Z', '+00:00')}
                    </code>
                    {isImport &&
                        '. Not accepted: 2024-01-15 13:45:00, 01/15/2024'}
                    .
                </li>
                <li>
                    <b>eeg1&ndash;eeg8, emg1&ndash;emg4</b>: numbers in µV (e.g.
                    12.5 or -45). No units or thousands separators. An empty
                    cell means the channel wasn&apos;t recorded.
                </li>
                {isImport ? (
                    <li>
                        The whole file is checked first; if anything is wrong,
                        nothing is imported. Rows whose time already exists in
                        the session are skipped.
                    </li>
                ) : (
                    <li>
                        The file can be re-imported as-is. If the chosen range
                        has no data, nothing is exported.
                    </li>
                )}
            </ul>
            <p className="font-semibold text-gray-800 mb-1">Example</p>
            {/* w-0 min-w-full: the long 12-channel rows scroll inside the box
                instead of widening the dialog. */}
            <div className="w-0 min-w-full">
                <pre className="bg-white border border-gray-200 rounded px-2 py-1.5 font-mono overflow-x-auto">
                    {example}
                </pre>
            </div>
            {isImport && (
                <Button
                    type="button"
                    variant="link"
                    onClick={downloadExampleCSV}
                    className="mt-1 h-auto p-0 text-xs"
                >
                    Download this example as a .csv file
                </Button>
            )}
        </div>
    );
}
