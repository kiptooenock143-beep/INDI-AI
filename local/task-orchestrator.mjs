/**
 * INDI AI execution orchestrator.
 *
 * Bounded loop: Objective -> Plan -> Validate -> Execute -> Observe -> Adapt
 *               -> Verify -> Complete.
 *
 * Guarantees:
 *  - sequential steps, max 12 steps per task (plan limit) and MAX_ATTEMPTS_PER_STEP tries each
 *  - bounded planner/adaptor model iterations and a configurable timeout
 *  - every event recorded; actual tool output fed back into adaptation
 *  - cancellation + pause/resume checked between attempts
 *  - sensitive tools pause in waiting_approval until the permission gateway
 *    approves the EXACT operation
 *  - a task only reaches `completed` when required verification passes —
 *    a model saying "done" is never sufficient
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assertTaskTransition, assertStepTransition, TERMINAL_TASK_STATUSES } from "./task-states.mjs";
import { createPlan, validatePlan, extractJson } from "./task-planner.mjs";

export const DEFAULT_LIMITS = Object.freeze({
  maxSteps: 12,
  maxRetriesPerStep: 2, // attempts beyond the first
  maxModelIterations: 6,
  taskTimeoutMs: Number(process.env.EXILE_TASK_TIMEOUT_MS || 10 * 60 * 1000),
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CancelledError extends Error {}
class PausedError extends Error {}
class TimeoutError extends Error {}

export class TaskOrchestrator {
  /**
   * @param {object} deps
   * @param {TaskStore} deps.store
   * @param {ToolRegistry} deps.registry
   * @param {PermissionGateway} deps.gateway
   * @param {(messages) => Promise<string>} deps.callModel  non-streaming reasoning call
   * @param {(task) => void} [deps.onTaskUpdated]           SSE/polling notification hook
   */
  constructor({ store, registry, gateway, callModel, onTaskUpdated, limits }) {
    this.store = store;
    this.registry = registry;
    this.gateway = gateway;
    this.callModel = callModel;
    this.onTaskUpdated = onTaskUpdated ?? (() => {});
    this.limits = { ...DEFAULT_LIMITS, ...(limits ?? {}) };
    this.active = new Map(); // taskId -> control flags
    this.approvalChallenges = new Map(); // one-time tokens; memory only, never persisted
  }

  /* ---------------- public control surface ---------------- */

  createTask({ objective, title }) {
    const obj = String(objective ?? "").trim();
    if (!obj) throw Object.assign(new Error("objective is required."), { statusCode: 400 });
    if (obj.length > 4000) throw Object.assign(new Error("objective must be 4000 characters or fewer."), { statusCode: 400 });
    const task = {
      id: crypto.randomUUID(),
      title: String(title ?? obj).slice(0, 120),
      objective: obj,
      status: "queued",
      plan: null,
      steps: [],
      approvals: [],
      events: [],
      verification: null,
      result: null,
      error: null,
      recovery: null,
      cancelRequestedAt: null,
      pauseRequestedAt: null,
    };
    return this.store.create(task);
  }

  requestCancel(taskId) {
    const task = this._mustGet(taskId);
    if (TERMINAL_TASK_STATUSES.has(task.status)) return task; // already finished
    const live = this.active.get(taskId);
    if (live) live.cancelRequested = true;
    else {
      assertTaskTransition(task.status, "cancelled");
      this._event(task, "cancelled", "Task cancelled before execution started.");
      task.status = "cancelled";
      task.result = { summary: "Cancelled by operator before execution." };
      this._save(task);
    }
    return this.store.get(taskId);
  }

  requestPause(taskId) {
    const task = this._mustGet(taskId);
    if (TERMINAL_TASK_STATUSES.has(task.status)) {
      throw Object.assign(new Error(`Cannot pause a ${task.status} task.`), { statusCode: 409 });
    }
    const live = this.active.get(taskId);
    if (live) live.pauseRequested = true;
    else {
      assertTaskTransition(task.status, "paused");
      task.status = "paused";
      this._event(task, "paused", "Paused by operator.");
      this._save(task);
    }
    return this.store.get(taskId);
  }

  async startOrResume(taskId) {
    const task = this._mustGet(taskId);
    if (this.active.has(taskId)) return task; // already executing
    if (TERMINAL_TASK_STATUSES.has(task.status)) {
      throw Object.assign(new Error(`Task is ${task.status}; it cannot be started again.`), { statusCode: 409 });
    }
    // Kick the loop; callers poll /events for progress.
    void this._runLoop(taskId).catch((e) => {
      console.error("[tasks] loop fault:", e?.message ?? e);
    });
    return this.store.get(taskId);
  }

  /** Return a one-time approval challenge to the local API response layer. */
  takeApprovalChallenge(requestId) {
    const id = String(requestId);
    const token = this.approvalChallenges.get(id);
    if (!token) return null;
    this.approvalChallenges.delete(id);
    return token;
  }

  /** Operator decision on an exact approval request. */
  async decideApproval({ taskId, requestId, token, approved }) {
    const task = this._mustGet(taskId);
    const entry = (task.approvals ?? []).find((a) => a.requestId === requestId);
    if (!entry) throw Object.assign(new Error("Unknown approval for this task."), { statusCode: 404 });
    if (entry.decision !== null) throw Object.assign(new Error("Approval already answered."), { statusCode: 409 });

    const step = task.steps.find((s) => s.id === entry.stepId);
    const result = this.gateway.decide({
      requestId,
      token,
      approved,
      taskId,
      stepId: entry.stepId,
      tool: entry.tool,
      args: step?.args ?? {},
    });
    if (!result.ok) throw Object.assign(new Error(result.error), { statusCode: 403 });

    entry.decision = result.decision;
    entry.decidedAt = new Date().toISOString();
    if (step?.approval) {
      step.approval.decision = result.decision;
      step.approval.decidedAt = entry.decidedAt;
    }
    this._event(task, "approval", `Operator ${result.decision.toUpperCase()} operation ${entry.tool}.`, { requestId, decision: result.decision });
    this._save(task);

    const live = this.active.get(taskId);
    if (live && live.pendingApproval?.requestId === requestId) {
      live.pendingApproval.settled = { approved: result.decision === "approved" };
    } else if (task.status === "waiting_approval" && !live) {
      // Approval arrived after a restart — resume under the same exact grant.
      void this.startOrResume(taskId);
    }
    return this.store.get(taskId);
  }

  /* ---------------- internals ---------------- */

  _mustGet(id) {
    const task = this.store.get(id);
    if (!task) throw Object.assign(new Error("Task not found."), { statusCode: 404 });
    return task;
  }

  _event(task, type, message, data) {
    if (!Array.isArray(task.events)) task.events = [];
    const seq = (task.events[task.events.length - 1]?.seq ?? 0) + 1;
    task.events.push({ seq, at: new Date().toISOString(), type, message: String(message).slice(0, 500), data });
    const cap = 300;
    if (task.events.length > cap) task.events.splice(0, task.events.length - cap);
  }

  _save(task) {
    this.store.save(task);
    try {
      this.onTaskUpdated(this.store.get(task.id));
    } catch {
      /* notification is best-effort */
    }
  }

  _setStatus(task, next, message, data) {
    assertTaskTransition(task.status, next);
    task.status = next;
    if (message) this._event(task, next, message, data);
    this._save(task);
  }

  _setStepStatus(step, next) {
    assertStepTransition(step.status, next);
    step.status = next;
  }

  _checkControls(control) {
    if (control.cancelRequested) throw new CancelledError();
    if (control.pauseRequested) throw new PausedError();
    if (Date.now() > control.deadline) throw new TimeoutError();
  }

  async _runLoop(taskId) {
    const control = { cancelRequested: false, pauseRequested: false, deadline: Date.now() + this.limits.taskTimeoutMs, pendingApproval: null };
    this.active.set(taskId, control);
    let task = this._mustGet(taskId);

    try {
      /* ---- Plan (if missing) ---- */
      if (!task.plan) {
        this._setStatus(task, "planning", "Planning execution steps…");
        task = this._mustGet(taskId);
        const plan = await createPlan({
          objective: task.objective,
          registry: this.registry,
          callModel: (messages) => this.callModel(messages),
          memoryNotes: this._memoryNotesText(),
        });
        this._checkControls(control);
        if (plan.planningFailed) {
          task = this._mustGet(taskId);
          task.error = { stage: "planning", details: plan.errors };
          this._setStatus(task, "failed", "Planning failed schema validation; no plan was executed.");
          return;
        }
        task = this._mustGet(taskId);
        task.plan = plan;
        task.steps = plan.steps;
        task.title = task.title || plan.title;
        this._event(task, "plan", `Plan accepted: ${plan.steps.length} step(s).`, { planId: plan.planId, steps: plan.steps.map((s) => ({ id: s.id, intent: s.intent, tool: s.tool })) });
        this._setStatus(task, "running", "Executing plan.");
      } else if (task.status === "waiting_approval") {
        this._setStatus(task, "running", "Resumed after approval decision.");
      } else if (task.status !== "running") {
        // queued / planning / paused -> running (validated transitions)
        this._setStatus(task, "running", task.status === "paused" ? "Task resumed by operator." : "Executing plan.");
      }

      /* ---- Execute sequentially with observation & adaptation ---- */
      let modelIterations = 0;
      let adaptations = 0;
      let blockedReason = null;

      while (true) {
        task = this._mustGet(taskId);
        this._checkControls(control);

        const ready = this._nextReadyStep(task);
        if (!ready) break;
        const step = ready;
        if (step.uncertainSideEffects) {
          step.status = "failed";
          step.error = "Execution outcome is uncertain after interruption; automatic replay is prohibited. Reconcile externally and create a new task or explicit recovery procedure.";
          this._event(task, "uncertain_side_effect_blocked", `Step ${step.id} was not replayed because its side-effect outcome is uncertain.`, { stepId: step.id });
          task.error = { stage: "recovery", stepId: step.id, reason: step.error };
          this._save(task);
          blockedReason = step.error;
          break;
        }

        /* approval gate for the exact operation */
        if (step.requiresApproval || this.registry.requiresApproval(step.tool)) {
          const existing = (task.approvals ?? []).find((a) => a.stepId === step.id);
          if (!existing || existing.decision === null) {
            let requestId = existing?.requestId;
            let summary = step.approval?.summary;
            if (!requestId || !this.gateway.getRequest(requestId)) {
              // Fresh request. After a server restart the gateway map is empty,
              // so an old token can never authorize anything — fail closed and
              // require a brand-new explicit approval.
              const created = this.gateway.createRequest({
                taskId: task.id,
                stepId: step.id,
                tool: step.tool,
                args: step.args,
                risk: this.registry.get(step.tool)?.risk ?? "sensitive",
              });
              requestId = created.requestId;
              summary = created.summary;
              this.approvalChallenges.set(requestId, created.token);
              task.approvals = (task.approvals ?? []).filter((a) => a.stepId !== step.id);
              task.approvals.push({ requestId, stepId: step.id, tool: step.tool, decision: null, createdAt: new Date().toISOString() });
              step.approval = { requestId, summary, decision: null };
              this._event(task, "approval_request", `Approval required: ${summary}`, { requestId, stepId: step.id, tool: step.tool });
              this._save(task);
            } else if (task.status !== "waiting_approval") {
              this._event(task, "approval_wait", `Still waiting for approval on step ${step.id}.`, { requestId });
            }
            if (task.status !== "waiting_approval") {
              this._setStatus(task, "waiting_approval", `Waiting for approval on step ${step.id} (${step.tool}).`, { requestId });
            }
            control.pendingApproval = { requestId, settled: null };
            await this._awaitApproval(control, task.id);
            control.pendingApproval = null;
            continue; // re-enter loop; decision now recorded
          }
          if (existing.decision === "refused") {
            this._setStepStatus(step, "skipped");
            this._event(task, "step_skipped", `Step ${step.id} skipped: operator refused approval.`, { stepId: step.id });
            this._save(task);
            continue;
          }
          if (existing.decision === "expired") {
            this._setStepStatus(step, "failed");
            task.error = { stage: "approval", stepId: step.id, reason: "Approved arguments did not match execution arguments." };
            this._setStatus(task, "failed", "Task failed: approval binding violated.");
            return;
          }
          // decision === approved -> authorizeExecution consumes the grant below
        }

        this._setStepStatus(step, "running");
        this._event(task, "step_started", `Running step ${step.id}: ${step.intent}`, { stepId: step.id, tool: step.tool });
        this._save(task);

        if (step.kind === "reasoning") {
          const outcome = await this._runReasoningStep(task, step, control, () => modelIterations++);
          task = this._mustGet(taskId);
          const fresh = task.steps.find((s) => s.id === step.id);
          if (outcome.ok) {
            this._setStepStatus(fresh, "completed");
            fresh.output = outcome.output;
            this._event(task, "step_completed", `Step ${fresh.id} reasoned.`, { stepId: fresh.id, outputPreview: String(outcome.output).slice(0, 300) });
          } else {
            this._setStepStatus(fresh, "failed");
            fresh.error = outcome.error;
            this._event(task, "step_failed", `Step ${fresh.id} reasoning failed: ${outcome.error}`, { stepId: fresh.id });
          }
          this._save(task);
          continue;
        }

        /* tool / verification step: execute with bounded retries */
        const isSensitive = step.requiresApproval || this.registry.requiresApproval(step.tool);
        const maxAttempts = isSensitive ? 1 : 1 + this.limits.maxRetriesPerStep;
        let attemptResult = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          task = this._mustGet(taskId);
          const cur = task.steps.find((s) => s.id === step.id);
          this._checkControls(control);

          const invocation = await this.registry.invoke(cur.tool, cur.args, this._toolCtx(task, cur));
          const record = { attempt, at: new Date().toISOString(), input: cur.args, result: { ok: invocation.ok, output: invocation.output ?? null, error: invocation.error ?? null, recoverable: !!invocation.recoverable } };
          cur.attempts.push(record);
          // bounded attempt storage
          if (cur.attempts.length > 5) cur.attempts.splice(0, cur.attempts.length - 5);

          if (invocation.ok) {
            attemptResult = invocation;
            this._event(task, "tool_result", `Step ${cur.id} attempt ${attempt} succeeded.`, { stepId: cur.id, tool: cur.tool, outputPreview: String(invocation.output).slice(0, 300) });
            this._save(task);
            break;
          }

          this._event(task, "tool_error", `Step ${cur.id} attempt ${attempt} failed: ${invocation.error}`, { stepId: cur.id, recoverable: !!invocation.recoverable });
          this._save(task);
          if (isSensitive) {
            cur.uncertainSideEffects = true;
            cur.recoveryNote = "Sensitive operation returned an error; its external outcome is uncertain. Automatic retry is prohibited.";
            attemptResult = { ...invocation, recoverable: false, uncertainSideEffects: true };
            this._save(task);
            break;
          }
          if (!invocation.recoverable || attempt === maxAttempts) {
            attemptResult = invocation;
            break;
          }
          await sleep(Math.min(1000 * attempt, 3000)); // bounded backoff
        }

        task = this._mustGet(taskId);
        const cur = task.steps.find((s) => s.id === step.id);

        if (attemptResult?.ok) {
          const verified = this._verifyStep(cur, attemptResult);
          cur.output = attemptResult.output;
          cur.data = attemptResult.data ?? null;
          cur.verificationResult = verified;
          if (verified.passed) {
            this._setStepStatus(cur, "completed");
            this._event(task, "step_verified", `Step ${cur.id} verified: ${verified.reason}`, { stepId: cur.id });
            this._save(task);
          } else {
            this._setStepStatus(cur, "failed");
            cur.error = `Verification failed: ${verified.reason}`;
            this._event(task, "verification_failed", `Step ${cur.id} executed but verification failed: ${verified.reason}`, { stepId: cur.id });
            this._save(task);
          }
        } else {
          const errorMsg = attemptResult?.error ?? "No attempt result.";
          cur.error = errorMsg;
          // Adapt: bounded replan of remaining steps when quota allows.
          if (!cur.uncertainSideEffects && adaptations < 2 && modelIterations < this.limits.maxModelIterations) {
            modelIterations++;
            adaptations++;
            const adapted = await this._adapt(task, cur, errorMsg, control);
            if (adapted) {
              this._setStepStatus(cur, "pending"); // retry under revised plan/args
              cur.recoveryNotes.push(`Adaptation ${adaptations}: ${adapted.note}`);
              this._event(task, "adaptation", `Revised plan after failure of ${cur.id}: ${adapted.note}`, { stepId: cur.id });
              this._save(task);
              continue;
            }
          }
          this._setStepStatus(cur, "failed");
          this._event(task, "step_failed", `Step ${cur.id} failed permanently: ${errorMsg}`, { stepId: cur.id });
          this._save(task);
          blockedReason = errorMsg;
          break;
        }
      }

      /* ---- Final verification & completion ---- */
      task = this._mustGet(taskId);
      const finalStep = task.steps[task.steps.length - 1];
      const requiredVerified =
        finalStep &&
        finalStep.kind === "verification" &&
        finalStep.status === "completed" &&
        finalStep.verificationResult?.passed === true;

      const allDone = task.steps.every((s) => ["completed", "skipped"].includes(s.status));

      if (requiredVerified && allDone) {
        task.verification = {
          passed: true,
          method: finalStep.verification.method ?? "final_step",
          evidence: String(finalStep.output ?? "").slice(0, 1000),
          at: new Date().toISOString(),
        };
        task.result = { summary: `Objective achieved: ${task.plan?.summary ?? task.objective}`, completedSteps: task.steps.filter((s) => s.status === "completed").length };
        this._setStatus(task, "completed", "Task completed — required verification passed.");
      } else if (allDone && !requiredVerified) {
        // All steps ran but the required verification is absent/failed:
        // refuse false completion.
        task.verification = { passed: false, reason: "Required final verification step did not pass.", at: new Date().toISOString() };
        task.error = { stage: "verification", reason: "Verification criteria were not met; refusing to mark complete." };
        this._setStatus(task, "failed", "Task failed verification — not marked completed.");
      } else {
        const failing = task.steps.find((s) => s.status === "failed");
        task.error = { stage: "execution", stepId: failing?.id ?? null, reason: blockedReason ?? failing?.error ?? "Unfinished steps remain." };
        task.result = { summary: "Task blocked: " + (task.error.reason ?? "unknown"), unfinishedSteps: task.steps.filter((s) => !["completed", "skipped"].includes(s.status)).map((s) => s.id) };
        this._setStatus(task, "failed", `Task failed/blocked: ${task.error.reason}`);
      }
    } catch (e) {
      task = this.store.get(taskId);
      if (!task) return;
      if (e instanceof CancelledError) {
        if (!TERMINAL_TASK_STATUSES.has(task.status)) {
          for (const s of task.steps) if (s.status === "running") this._setStepStatus(s, "pending");
          this._setStatus(task, "cancelled", "Task cancelled by operator mid-execution.");
        }
      } else if (e instanceof PausedError) {
        if (!TERMINAL_TASK_STATUSES.has(task.status)) {
          for (const s of task.steps) if (s.status === "running") this._setStepStatus(s, "pending");
          this._setStatus(task, "paused", "Task paused by operator; resume to continue.");
        }
      } else if (e instanceof TimeoutError) {
        if (!TERMINAL_TASK_STATUSES.has(task.status)) {
          task.error = { stage: "timeout", reason: `Exceeded ${this.limits.taskTimeoutMs}ms budget.` };
          this._setStatus(task, "failed", "Task exceeded its execution timeout.");
        }
      } else {
        console.error("[tasks] unexpected orchestrator fault:", e);
        if (!TERMINAL_TASK_STATUSES.has(task.status)) {
          task.error = { stage: "internal", reason: String(e?.message ?? e) };
          this._setStatus(task, "failed", "Task failed due to an internal fault.");
        }
      }
    } finally {
      this.active.delete(taskId);
    }
  }

  async _awaitApproval(control, taskId) {
    // Bounded wait; the loop re-checks state each second via stored approvals.
    while (!control.cancelRequested && !control.pauseRequested) {
      if (control.pendingApproval?.settled) return;
      const task = this.store.get(taskId);
      const entry = (task?.approvals ?? []).find((a) => a.requestId === control.pendingApproval?.requestId);
      if (entry && entry.decision !== null) {
        control.pendingApproval.settled = { approved: entry.decision === "approved" };
        return;
      }
      if (Date.now() > control.deadline) throw new TimeoutError();
      await sleep(750);
    }
    if (control.cancelRequested) throw new CancelledError();
    if (control.pauseRequested) throw new PausedError();
  }

  _nextReadyStep(task) {
    const done = new Set(task.steps.filter((s) => ["completed", "skipped"].includes(s.status)).map((s) => s.id));
    for (const s of task.steps) {
      if (s.status !== "pending") continue;
      if ((s.dependsOn ?? []).every((d) => done.has(d))) return s;
      const unsatisfied = (s.dependsOn ?? []).filter((d) => !done.has(d));
      const dead = task.steps.some((dep) => unsatisfied.includes(dep.id) && ["failed"].includes(dep.status));
      if (dead) {
        s.status = "skipped";
        s.error = "Skipped: dependency failed.";
        this._event(task, "step_skipped", `Step ${s.id} skipped: dependency failed.`, { stepId: s.id });
        this._save(task);
      }
    }
    return null;
  }

  async _runReasoningStep(task, step, control, bumpIterations) {
    if (bumpIterations() >= this.limits.maxModelIterations) {
      return { ok: false, error: "Model iteration budget exhausted." };
    }
    this._checkControls(control);
    const context = task.steps
      .filter((s) => s.id !== step.id && ["completed", "failed"].includes(s.status))
      .map((s) => `- ${s.id} [${s.status}] ${s.intent}${s.output ? ` → ${String(s.output).slice(0, 200)}` : ""}`)
      .join("\n");
    try {
      const text = await this.callModel([
        {
          role: "system",
          content: "You are INDI AI's task reasoner. Produce a short practical answer for this step only. Do not claim actions you did not perform. Output plain text.",
        },
        { role: "user", content: `Objective: ${task.objective}\nStep intent: ${step.intent}\nPrior step results:\n${context || "(none)"}` },
      ]);
      return { ok: true, output: String(text).slice(0, 2000) };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }

  async _adapt(task, failedStep, errorMsg, control) {
    if (control) this._checkControls(control);
    const remaining = task.steps.filter((s) => s.status === "pending" && s.id !== failedStep.id);
    try {
      const text = await this.callModel([
        {
          role: "system",
          content:
            "You revise INDI AI task plans after a failure. Reply ONLY with JSON: " +
            '{"action":"retry|revise|abandon","note":"one sentence","steps":[...]} where steps replaces the REMAINING steps using the same schema as before (id, intent, kind, tool, args, dependsOn, expectedOutput, verification). ' +
            "Only registered tools may be used; never invent tools; never repeat uncertain side effects without marking requiresApproval.",
        },
        {
          role: "user",
          content:
            `Failed step: ${failedStep.id} (${failedStep.tool}) error: ${errorMsg}\n` +
            `Remaining steps: ${JSON.stringify(remaining.map(({ id, intent, tool, args }) => ({ id, intent, tool, args })))}\n` +
            `Registered catalogue: ${JSON.stringify(this.registry.catalog().map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, risk: t.risk })))}`,
        },
      ]);
      const parsed = extractJson(text);
      if (!parsed || (parsed.action !== "retry" && parsed.action !== "revise")) return null;
      if (parsed.action === "retry") return { note: parsed.note ?? "Retrying with unchanged plan." };

      const validated = validatePlan(
        { title: task.plan?.title ?? "revised", summary: task.plan?.summary ?? "revised plan", steps: Array.isArray(parsed.steps) ? parsed.steps : [] },
        this.registry,
        task.objective
      );
      if (!validated.ok) return { note: "Revision rejected by schema; retrying original step." };
      // Replace only the still-pending tail with the revised steps.
      const keepHead = task.steps.filter((s) => s.status === "completed" || s.status === "skipped" || s.id === failedStep.id);
      const tail = validated.plan.steps.filter((ns) => !keepHead.some((k) => k.id === ns.id));
      task.steps = [...keepHead, ...tail];
      task.plan = { ...task.plan, revision: (task.plan?.revision ?? 1) + 1, steps: task.steps };
      return { note: parsed.note ?? "Subsequent steps revised." };
    } catch {
      return null;
    }
  }

  _verifyStep(step, invocation) {
    const v = step.verification ?? {};
    const output = String(invocation.output ?? "");
    if (v.method === "output_contains" && v.criteria) {
      const needle = v.criteria.toLowerCase();
      const tokens = needle.split(/\s+/).filter(Boolean);
      const hit = tokens.length > 0 && tokens.every((t) => output.toLowerCase().includes(t));
      return { passed: hit, method: "output_contains", reason: hit ? `Output contains "${v.criteria.slice(0, 80)}".` : `Output lacks "${v.criteria.slice(0, 80)}".`, evidence: output.slice(0, 500) };
    }
    if (step.kind === "verification" || v.method === "state_check" || this.registry.requiresApproval(step.tool)) {
      const evidence = invocation.verificationEvidence;
      const passed = !!evidence && typeof evidence === "object" && evidence.verified === true && typeof evidence.source === "string" && evidence.source.trim().length > 0;
      return {
        passed,
        method: "state_check",
        reason: passed ? "Independent state-check evidence supplied by the tool." : "Tool output alone cannot verify an external side effect; independent state-check evidence is required.",
        evidence: passed ? JSON.stringify(evidence).slice(0, 500) : "",
      };
    }
    const passed = invocation.ok === true && output.trim().length > 0;
    return { passed, method: "output_present", reason: passed ? "Non-empty successful output recorded." : "No usable output recorded.", evidence: output.slice(0, 500) };
  }

  _toolCtx(task, step) {
    return {
      authorizeExecution: ({ tool, args }) => this.gateway.authorizeExecution({
        requestId: step?.approval?.requestId,
        taskId: task?.id,
        stepId: step?.id,
        tool,
        args,
      }),
      recordMemoryNote: (key, value) => this._appendMemory(key, value),
      readMemoryNote: (key) =>
        this._memoryNotes().find((note) => note.key === key) ?? null,
      recordAudit: (summary) => this._appendAudit(summary),
    };
  }

  _memoryFile() {
    return path.join(this.store.dir, "task-memory.json");
  }

  _memoryNotes() {
    try {
      return JSON.parse(fs.readFileSync(this._memoryFile(), "utf8"));
    } catch {
      return [];
    }
  }

  _memoryNotesText() {
    return this._memoryNotes()
      .slice(0, 20)
      .map((m) => `- ${m.key}: ${m.value}`)
      .join("\n");
  }

  _appendMemory(key, value) {
    const list = this._memoryNotes();
    list.unshift({ key, value, at: new Date().toISOString() });
    fs.writeFileSync(this._memoryFile(), JSON.stringify(list.slice(0, 200), null, 2), "utf8");
  }

  _appendAudit(summary) {
    const auditFile = path.join(this.store.dir, "audit.jsonl");
    const entry = {
      at: new Date().toISOString(),
      summary: String(summary).slice(0, 500),
    };

    fs.appendFileSync(auditFile, `${JSON.stringify(entry)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });

    return entry;
  }
}
