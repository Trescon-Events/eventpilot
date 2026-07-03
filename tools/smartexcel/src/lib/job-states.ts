// Job lifecycle state machine (PRD §9). The conversational execution cycle is:
// clarify -> summarize -> plan -> approve/reject -> sample -> approve/rework ->
// full run -> optional post-run refinement. Transitions are validated centrally
// so the UI and server agree on what's reachable.

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

// In the chat-driven flow there's no separate plan-approval state: the user
// chats to refine, then clicks Run sample (direct → sample_running). On
// sample_pending they can keep chatting (status stays) or click Run full
// (→ full_running). The legacy plan_pending / rework_requested states remain
// enum-valid for historical rows but no new code path transitions into them.
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
