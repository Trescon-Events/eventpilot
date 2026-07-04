// Deterministic transformation vocabulary, ported as-is. Keep in sync with the
// Python worker's executor (tools/smartexcel/worker/app/main.py, or wherever
// the worker service's source of truth lives post-port).

export type OperationKind =
  | "trim_whitespace"
  | "normalize_headers"
  | "rename_column"
  | "drop_columns"
  | "drop_empty_rows"
  | "dedupe"
  | "fill_missing"
  | "sort"
  | "filter_rows"
  | "regex_replace"
  | "custom_transform";

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
  description?: string;
  expression?: string;
}
