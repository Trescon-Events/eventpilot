// Deterministic transformation vocabulary (PRD: AI orchestrates, code executes).
// The AI emits a list of these operations during planning; the Python worker
// executes them with pandas. Keep this in sync with the worker's executor in
// worker/app/main.py. Fields are flat (no unions) so they serialize cleanly and
// fit Gemini's responseSchema; the worker interprets fields per `op`.

export type OperationKind =
  | "trim_whitespace" // strip leading/trailing whitespace from all text cells
  | "normalize_headers" // clean column names (style: snake | title)
  | "rename_column" // rename `from` -> `to`
  | "drop_columns" // remove `columns`
  | "drop_empty_rows" // remove fully-empty rows
  | "dedupe" // drop duplicate rows (by `columns`, or all columns if omitted)
  | "fill_missing" // fill nulls in `column` with `value`
  | "sort" // sort by `column` (`order`: asc | desc)
  | "filter_rows" // keep rows where `column` == `value`
  | "regex_replace" // in `column`, replace regex `pattern` with `replacement`
  | "custom_transform"; // AI-authored sandboxed pandas expression (Tier 2 escape hatch)

export const OPERATION_KINDS: OperationKind[] = [
  "trim_whitespace",
  "normalize_headers",
  "rename_column",
  "drop_columns",
  "drop_empty_rows",
  "dedupe",
  "fill_missing",
  "sort",
  "filter_rows",
  "regex_replace",
  "custom_transform",
];

export interface Operation {
  op: OperationKind;
  columns?: string[];
  from?: string;
  to?: string;
  column?: string;
  value?: string;
  order?: "asc" | "desc";
  style?: "snake" | "title";
  pattern?: string;
  replacement?: string;
  // custom_transform: AI-authored pandas expression for the long tail.
  // Sandboxed; runs against `df` with `pd` and `re` available.
  description?: string;
  expression?: string;
}
