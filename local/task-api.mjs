import path from "node:path";
import { fileURLToPath } from "node:url";
import { TaskStore } from "./task-store.mjs";
import { PermissionGateway } from "./permission-gateway.mjs";
import { ToolRegistry } from "./tool-registry.mjs";
import { TaskOrchestrator } from "./task-orchestrator.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = process.env.EXILE_DATA_DIR
  ? path.resolve(process.env.EXILE_DATA_DIR)
  : ROOT;

const store = new TaskStore(path.join(DATA_DIR, ".exile-ai", "tasks"));
await store.recoverInterrupted();

const gateway = new PermissionGateway();
const registry = new ToolRegistry();

async function callModel(messages) {
  // Preserve INDI AI's free-tier policy. No paid-provider fallback.
  const order = process.env.EXILE_GEMINI_FREE_TIER === "true"
    ? ["gemini", "openrouter"]
    : ["openrouter"];

  const providers = {
    gemini: {
      key: "GEMINI_API_KEY",
      base: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-2.5-flash",
    },
    openrouter: {
      key: "OPENROUTER_API_KEY",
      base: "https://openrouter.ai/api/v1",
      model: "openrouter/free",
    },
  };

  let lastError = "No permitted free reasoning provider is configured.";

  for (const id of order) {
    const provider = providers[id];
    const key = process.env[provider.key];
    if (!key) continue;

    try {
      const response = await fetch(`${provider.base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          stream: false,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!response.ok) {
        lastError = `${id} returned HTTP ${response.status}.`;
        continue;
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      const text = Array.isArray(content)
        ? content.map((part) => part?.text ?? "").join("")
        : String(content ?? "");

      if (text.trim()) return text;
      lastError = `${id} returned an empty response.`;
    } catch (error) {
      lastError = `${id} request failed: ${error.message}`;
    }
  }

  throw new Error(lastError);
}

const orchestrator = new TaskOrchestrator({
  store,
  registry,
  gateway,
  callModel,
});

function send(res, status, payload) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(payload));
}

function localRequest(req) {
  const origin = req.headers.origin;
  return !origin ||
    origin === "null" ||
    origin === "file://" ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

async function readRequestBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64 * 1024) {
      throw Object.assign(new Error("Task request body is too large."), {
        statusCode: 413,
      });
    }
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error("Invalid JSON request body."), {
      statusCode: 400,
    });
  }
}

function taskError(res, error) {
  send(res, error.statusCode || 400, {
    ok: false,
    error: error.message || "Task request failed.",
  });
}

export async function handleTaskApi(req, res, url) {
  if (url.pathname !== "/tasks" && !url.pathname.startsWith("/tasks/")) {
    return false;
  }

  if (!localRequest(req)) {
    send(res, 403, { ok: false, error: "Task API is restricted to the local app." });
    return true;
  }

  try {
    if (req.method === "GET" && url.pathname === "/tasks") {
      return send(res, 200, { ok: true, tasks: store.list() }), true;
    }

    const eventMatch = url.pathname.match(/^\/tasks\/([^/]+)\/events$/);
    const challengeMatch = url.pathname.match(/^\/tasks\/([^/]+)\/approval-challenge$/);
    const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/);

    if (req.method === "GET" && eventMatch) {
      const task = store.get(decodeURIComponent(eventMatch[1]));
      if (!task) {
        send(res, 404, { ok: false, error: "Task not found." });
      } else {
        send(res, 200, { ok: true, events: task.events ?? [] });
      }
      return true;
    }

    if (req.method === "GET" && taskMatch) {
      const task = store.get(decodeURIComponent(taskMatch[1]));
      send(res, task ? 200 : 404, task
        ? { ok: true, task }
        : { ok: false, error: "Task not found." });
      return true;
    }

    if (req.method === "GET" && challengeMatch) {
      const requestId = url.searchParams.get("requestId");
      if (!requestId) {
        send(res, 400, { ok: false, error: "requestId is required." });
      } else {
        const token = orchestrator.takeApprovalChallenge(requestId);
        send(res, token ? 200 : 404, token
          ? { ok: true, requestId, token }
          : { ok: false, error: "No unused approval challenge is available." });
      }
      return true;
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      send(res, 405, { ok: false, error: "Method not allowed." });
      return true;
    }

    const body = await readRequestBody(req);

    if (url.pathname === "/tasks") {
      const task = orchestrator.createTask({
        objective: body.objective,
        title: body.title,
      });
      if (body.start === true) {
        await orchestrator.startOrResume(task.id);
      }
      send(res, 201, { ok: true, task: store.get(task.id) });
      return true;
    }

    const actionMatch = url.pathname.match(
      /^\/tasks\/([^/]+)\/(start|resume|pause|cancel|approve)$/
    );

    if (!actionMatch) {
      send(res, 404, { ok: false, error: "Unknown task endpoint." });
      return true;
    }

    const taskId = decodeURIComponent(actionMatch[1]);
    const action = actionMatch[2];
    let task;

    if (action === "start" || action === "resume") {
      task = await orchestrator.startOrResume(taskId);
    } else if (action === "pause") {
      task = orchestrator.requestPause(taskId);
    } else if (action === "cancel") {
      task = orchestrator.requestCancel(taskId);
    } else {
      task = await orchestrator.decideApproval({
        taskId,
        requestId: body.requestId,
        token: body.token,
        approved: body.approved === true,
      });
    }

    send(res, 200, { ok: true, task });
    return true;
  } catch (error) {
    taskError(res, error);
    return true;
  }
}
