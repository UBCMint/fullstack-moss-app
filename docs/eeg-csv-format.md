# EEG CSV format (import and export)

The same format is used for importing and exporting session data, so an
exported file can be imported again unchanged.

## File

| Property  | Requirement                                                             |
| --------- | ----------------------------------------------------------------------- |
| Type      | Plain-text CSV, file name ending in `.csv`                              |
| Encoding  | UTF-8 (a byte-order mark is fine)                                       |
| Separator | Comma (`,`). Semicolons or tabs are not accepted.                       |
| Size      | Up to 50 MB per import (`MAX_IMPORT_BYTES` in `shared-logic/src/db.rs`) |
| Blank lines | Ignored                                                               |

## Columns

The first line is a header with exactly these five columns, in this order
(letter case and surrounding spaces don't matter):

```
time,channel1,channel2,channel3,channel4
```

| Column                  | Accepted values                                                                                                                 | Examples                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `time`                  | RFC 3339 timestamp **with** a time zone (`Z` or `±hh:mm`) and a `T` between date and time. Fractional seconds are allowed.      | `2024-01-15T13:45:00Z`, `2024-01-15T13:45:00.25-08:00` |
| `channel1` – `channel4` | Whole numbers from -2,147,483,648 to 2,147,483,647. No decimals, scientific notation (`1e3`), units, blanks, or thousands separators. | `120`, `-45`                                       |

Every row must have exactly 5 values, and each `time` must be unique within the
file. At least one data row is required.

```csv
time,channel1,channel2,channel3,channel4
2024-01-15T13:45:00Z,120,-45,310,8
2024-01-15T13:45:00.004Z,118,-47,305,10
```

Channel values are whole numbers because the `eeg_data` table stores them as
`INTEGER`.

## Import behaviour

- The entire file is validated before anything is written. If any row is
  invalid, **nothing is imported**.
- Errors say where the problem is: line number (header = line 1), column, the
  offending value, and what is accepted. Up to 10 problems are listed, plus the
  total count.
- Rows whose `time` already exists in the target session are skipped; existing
  data is never overwritten.

## Export behaviour

- Output is exactly the format above, ordered by `time` ascending, with `time`
  in UTC (`+00:00`).
- `format` must be `"csv"` (the only supported format).
- `include_header` (default `true`) controls the header row.
- `start_time` / `end_time` (RFC 3339, optional): `end_time` defaults to now,
  `start_time` to the session's earliest sample. `start_time` must not be after
  `end_time`.
- If the session (or the chosen range) has no data, the export fails with a
  message saying so rather than producing a header-only file.

## Where this is enforced

- Backend parser/validator: `parse_eeg_csv` in `backend/shared-logic/src/db.rs`
- Import/export endpoints: `backend/api-server/src/main.rs`
- User-facing rules: `frontend/components/ui/import-dialog.tsx`,
  `frontend/components/ui/export-dialog.tsx`, `frontend/lib/eeg-api.ts`

If you change a rule, update all three places and this file.
