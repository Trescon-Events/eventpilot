// Job lifecycle state machine, ported as-is (PRD §9).

export type JobStatus =
  | "draft"
  | "clarifying"
  | "plan_pending"
  | "sample_running"
  | "sample_pending"
  | "full_running"
  | "completed"
  | "rework_requested"
  | "failed"
  | "deleted";

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  clarifying: "Clarifying",
  plan_pending: "Plan awaiting approval",
  sample_running: "Sample run in progress",
  sample_pending: "Sample awaiting confirmation",
  full_running: "Full run in progress",
  completed: "Completed",
  rework_requested: "Rework requested",
  failed: "Failed / needs attention",
  deleted: "Deleted / archived",
};

const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft: ["clarifying", "failed", "deleted"],
  clarifying: ["sample_running", "failed", "deleted"],
  plan_pending: ["sample_running", "clarifying", "failed", "deleted"],
  sample_running: ["sample_pending", "failed", "deleted"],
  sample_pending: ["sample_running", "full_running", "failed", "deleted"],
  full_running: ["completed", "failed", "deleted"],
  completed: ["sample_running", "deleted"],
  rework_requested: ["clarifying", "sample_running", "deleted"],
  failed: ["clarifying", "sample_running", "deleted"],
  deleted: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal job transition: ${from} -> ${to}`);
  }
}

export const ACTIVE_STATUSES: JobStatus[] = [
  "draft",
  "clarifying",
  "plan_pending",
  "sample_running",
  "sample_pending",
  "full_running",
  "rework_requested",
];
