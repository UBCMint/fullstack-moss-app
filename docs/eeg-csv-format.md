# EEG CSV format (import and export)

The same format is used for importing and exporting session data, so an
exported file can be imported again unchanged.

## File

| Property    | Requirement                                                             |
| ----------- | ----------------------------------------------------------------------- |
| Type        | Plain-text CSV, file name ending in `.csv`                              |
| Encoding    | UTF-8 (a byte-order mark is fine)                                       |
| Separator   | Comma (`,`). Semicolons or tabs are not accepted.                       |
| Size        | Up to 50 MB per import (`MAX_IMPORT_BYTES` in `shared-logic/src/db.rs`) |
| Blank lines | Ignored                                                                 |

## Columns

The first line is a header. Columns are matched **by name** (letter case and
surrounding spaces don't matter) and can be in any order. Exports always write
all of them, in this order:

```
time,eeg1,eeg2,eeg3,eeg4,eeg5,eeg6,eeg7,eeg8,emg1,emg2,emg3,emg4
```

| Column                        | Accepted values                                                                                                            | Examples                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `time` (required)             | RFC 3339 timestamp **with** a time zone (`Z` or `±hh:mm`) and a `T` between date and time. Fractional seconds are allowed. | `2024-01-15T13:45:00Z`, `2024-01-15T13:45:00.25-08:00` |
| `eeg1` – `eeg8`, `emg1` – `emg4` | Numbers in µV; decimals are allowed. No units, thousands separators, `NaN` or `inf`. An empty cell means the channel wasn't recorded. | `12.5`, `-45`, (empty)                                  |

- At least one channel column is required; include only the channels your
  device has. Missing columns and empty cells are stored as `NULL`.
- Unknown or repeated column names are rejected, so a typo can't silently drop
  a channel.
- Legacy 4-channel files with `channel1` – `channel4` are still accepted and
  read as `eeg1` – `eeg4`.
- Every row must have one value per header column, and each `time` must be
  unique within the file. At least one data row is required.

```csv
time,eeg1,eeg2,eeg3,eeg4,eeg5,eeg6,eeg7,eeg8,emg1,emg2,emg3,emg4
2024-01-15T13:45:00Z,12.5,-4.1,8,3.3,0.7,-2,5.9,1.2,40.1,-12,7.5,
2024-01-15T13:45:00.004Z,11.8,-4.7,7.6,3.1,0.9,-1.8,6.2,1.1,38.4,-10.9,7.1,
```

Channels are `DOUBLE PRECISION` columns in the `eeg_data` table; the channel
count a session streams is configured with `EEG_CHANNEL_COUNT` /
`EMG_CHANNEL_COUNT` (see `backend/docs/websocket-protocol.md`).

## Import behaviour

- The entire file is validated before anything is written. If any row is
  invalid, **nothing is imported**. The rows are then saved in a single database
  transaction, so a database failure part-way through also imports nothing.
- Errors say where the problem is: line number (header = line 1), column, the
  offending value, and what is accepted. Up to 10 problems are listed, plus the
  total count.
- Rows whose `time` already exists in the target session are skipped; existing
  data is never overwritten. The import result reports how many rows were
  skipped this way.

## Export behaviour

- Output is exactly the format above, with every channel column, ordered by
  `time` ascending, with `time` in UTC (`+00:00`). Channels the device didn't
  record are empty cells.
- `format` must be `"csv"` (the only supported format).
- `include_header` (default `true`) controls the header row.
- `start_time` / `end_time` (RFC 3339, optional): `end_time` defaults to now,
  `start_time` to the session's earliest sample. `start_time` must not be after
  `end_time`.
- If the session (or the chosen range) has no data, the export fails with a
  message saying so rather than producing a header-only file.

## Where this is enforced

- Backend parser/validator: `parse_eeg_csv` in `backend/shared-logic/src/db.rs`;
  column names come from `CHANNEL_COLUMNS` in `backend/shared-logic/src/channels.rs`
- Import/export endpoints: `backend/api-server/src/main.rs`
- User-facing rules, shown up front in the Import and Export dialogs (with a
  downloadable example file): `frontend/components/ui/eeg-csv-format.tsx`, using
  the constants in `frontend/lib/eeg-api.ts`

If you change a rule, update all three places and this file.
