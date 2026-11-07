/**
 * INDI AI task/step state machines.
 *
 * Task states: queued, planning, running, waiting_approval, paused,
 *              completed, failed, cancelled.
 * Step states: pending, running, waiting_approval, completed, failed, skipped.
 *
 * Every transition goes through `assertTaskTransition` / `assertStepTransition`
 * so an invalid jump (e.g. completed -> running) is rejected instead of
 * silently mutating state.
 */

export const TASK_STATUSES = [
  "queued",
  "planning",
  "running",
  "waiting_approval",
  "paused",
  "completed",
  "failed",
  "cancelled",
];

export const STEP_STATUSES = [
  "pending",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "skipped",
];

export const TERMINAL_TASK_STATUSES = new Set(["completed", "failed", "cancelled"]);

const TASK_TRANSITIONS = {
  queued: ["planning", "running", "cancelled", "failed"],
  planning: ["running", "queued", "paused", "cancelled", "failed"],
  running: [
    "waiting_approval",
    "paused",
    "completed",
    "failed",
    "cancelled",
    "planning", // replan after a recoverable failure
  ],
  waiting_approval: ["running", "paused", "cancelled", "failed"],
  paused: ["running", "queued", "planning", "cancelled", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

const STEP_TRANSITIONS = {
  pending: ["running", "waiting_approval", "skipped", "failed"],
  running: ["waiting_approval", "completed", "failed", "skipped", "pending"],
  waiting_approval: ["running", "pending", "skipped", "failed"],
  completed: [],
  failed: ["pending", "running", "skipped"], // bounded retry paths
  skipped: ["pending"], // replan can revive a skipped step
};

export class InvalidTransitionError extends Error {
  constructor(from, to, kind = "task") {
    super(`Invalid ${kind} state transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
    this.statusCode = 409;
  }
}

export function isValidTaskTransition(from, to) {
  if (!TASK_STATUSES.includes(from) || !TASK_STATUSES.includes(to)) return false;
  return TASK_TRANSITIONS[from].includes(to);
}

export function assertTaskTransition(from, to) {
  if (!isValidTaskTransition(from, to)) throw new InvalidTransitionError(from, to, "task");
  return to;
}

export function isValidStepTransition(from, to) {
  if (!STEP_STATUSES.includes(from) || !STEP_STATUSES.includes(to)) return false;
  return STEP_TRANSITIONS[from].includes(to);
}

export function assertStepTransition(from, to) {
  if (!isValidStepTransition(from, to)) throw new InvalidTransitionError(from, to, "step");
  return to;
}
