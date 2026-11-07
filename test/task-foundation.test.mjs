import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PermissionGateway } from "../local/permission-gateway.mjs";
import { TaskStore } from "../local/task-store.mjs";
import { validatePlan } from "../local/task-planner.mjs";
import { ToolRegistry } from "../local/tool-registry.mjs";
import { TaskOrchestrator } from "../local/task-orchestrator.mjs";

test("approval argument hash is key-order independent and preserves nested structure", () => {
  const a = { recipient: "A", nested: { x: 1, y: 2 }, list: [{ b: 2, a: 1 }] };
  const b = { list: [{ a: 1, b: 2 }], nested: { y: 2, x: 1 }, recipient: "A" };
  assert.equal(PermissionGateway.hashArgs(a), PermissionGateway.hashArgs(b));
  assert.notEqual(PermissionGateway.hashArgs(a), PermissionGateway.hashArgs({ ...b, nested: { y: 2, x: 3 } }));
});

test("approval decision does not consume grant; execution consumes it exactly once", () => {
  const gateway = new PermissionGateway();
  const args = { to: "+254700000000", text: "Hello" };
  const request = gateway.createRequest({ taskId: "task-123", stepId: "step-1", tool: "send_whatsapp_message", args, risk: "sensitive" });
  const decision = gateway.decide({ requestId: request.requestId, token: request.token, approved: true, taskId: "task-123", stepId: "step-1", tool: "send_whatsapp_message", args });
  assert.deepEqual(decision, { ok: true, decision: "approved" });
  const binding = { requestId: request.requestId, taskId: "task-123", stepId: "step-1", tool: "send_whatsapp_message", args };
  assert.deepEqual(gateway.authorizeExecution(binding), { allowed: true });
  assert.equal(gateway.authorizeExecution(binding).allowed, false);
});

test("approval refuses altered arguments and wrong task binding", () => {
  const gateway = new PermissionGateway();
  const args = { nested: { a: 1, b: 2 } };
  const request = gateway.createRequest({ taskId: "task-123", stepId: "step-1", tool: "sensitive_tool", args, risk: "sensitive" });
  assert.equal(gateway.decide({ requestId: request.requestId, token: request.token, approved: true, taskId: "task-else", stepId: "step-1", tool: "sensitive_tool", args }).ok, false);
  assert.equal(gateway.decide({ requestId: request.requestId, token: request.token, approved: true, taskId: "task-123", stepId: "step-1", tool: "sensitive_tool", args: { nested: { a: 1, b: 3 } } }).ok, false);
});

test("task store redacts index metadata and recovers uncertain in-flight operations", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exile-task-store-"));
  try {
    const store = new TaskStore(dir);
    store.create({
      id: "task-123", title: "sk-abcdefghijklmnop", objective: "AIza123456789012345678901234",
      status: "running", approvals: [{ requestId: "request-1", decision: null }],
      steps: [{ id: "step-1", status: "running" }, { id: "step-2", status: "waiting_approval", approval: { requestId: "old" } }],
      events: [],
    });
    const index = fs.readFileSync(path.join(dir, "tasks-index.json"), "utf8");
    assert.match(index, /\[redacted\]/);
    assert.doesNotMatch(index, /sk-abcdefghijklmnop|AIza123456789012345678901234/);
    const recovered = store.recoverInterrupted();
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].status, "paused");
    assert.equal(recovered[0].steps[0].uncertainSideEffects, true);
    assert.equal(recovered[0].steps[1].status, "pending");
    assert.equal(recovered[0].steps[1].approval, null);
    assert.equal(recovered[0].approvals.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("corrupt task index fails closed instead of appearing empty", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exile-task-index-"));
  try {
    const store = new TaskStore(dir);
    fs.writeFileSync(path.join(dir, "tasks-index.json"), "{broken");
    assert.throws(() => store.list(), /unreadable or corrupt/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("planner rejects dependency cycles and unsafe final verification", () => {
  const registry = {
    catalog: () => [{ name: "read_state" }, { name: "record_verification_note" }],
    validateCall: () => [],
    requiresApproval: () => false,
  };
  const cyclic = validatePlan({
    title: "Cycle", summary: "cycle",
    steps: [
      { id: "a", intent: "read", kind: "tool", tool: "read_state", args: {}, dependsOn: ["b"] },
      { id: "b", intent: "verify", kind: "verification", tool: "record_verification_note", args: { note: "done" }, dependsOn: ["a"], verification: { method: "output_present" } },
    ],
  }, registry, "test");
  assert.equal(cyclic.ok, false);
  assert.ok(cyclic.errors.some((e) => /cycle/.test(e)));
  assert.ok(cyclic.errors.some((e) => /state_check/.test(e)));
});


test("state-check verification rejects model or tool output without independent evidence", () => {
  const orchestrator = Object.create(TaskOrchestrator.prototype);
  const step = { kind: "verification", tool: "record_verification_note", verification: { method: "state_check", criteria: "the change exists" } };
  const result = orchestrator._verifyStep(step, { ok: true, output: "The change exists and is complete." });
  assert.equal(result.passed, false);
  assert.match(result.reason, /independent state-check evidence/);
});

test("memory verification reads persisted state and supplies independent evidence", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exile-memory-verification-"));

  try {
    const store = new TaskStore(dir);
    const registry = new ToolRegistry();
    const orchestrator = new TaskOrchestrator({
      store,
      registry,
      gateway: new PermissionGateway(),
      callModel: async () => "",
    });

    const ctx = orchestrator._toolCtx(
      { id: "memory-test-task" },
      { id: "memory-test-step", tool: "verify_memory_note", args: {} }
    );

    const saved = await registry.invoke("save_memory_note", {
      key: "phase1.test",
      value: "persisted-value",
    }, ctx);

    assert.equal(saved.ok, true);

    const verified = await registry.invoke("verify_memory_note", {
      key: "phase1.test",
      expectedValue: "persisted-value",
    }, ctx);

    assert.equal(verified.ok, true);
    assert.equal(verified.verificationEvidence?.verified, true);

    const verification = orchestrator._verifyStep({
      kind: "verification",
      tool: "verify_memory_note",
      verification: { method: "state_check" },
    }, verified);

    assert.equal(verification.passed, true);

    const mismatch = await registry.invoke("verify_memory_note", {
      key: "phase1.test",
      expectedValue: "not-the-stored-value",
    }, ctx);

    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.verificationEvidence, undefined);

    ctx.recordAudit("Phase 1 audit persistence test");

    const auditLines = fs.readFileSync(
      path.join(dir, "audit.jsonl"),
      "utf8"
    ).trim().split("\n");

    assert.equal(auditLines.length, 1);
    assert.equal(
      JSON.parse(auditLines[0]).summary,
      "Phase 1 audit persistence test"
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

