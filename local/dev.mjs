#!/usr/bin/env node
/** Starts the INDI AI local API server and the Vite UI together. */
import { spawn } from "node:child_process";

const procs = [
  spawn(process.execPath, ["local/server.mjs"], { stdio: "inherit" }),
  spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev"], { stdio: "inherit" }),
];

const shutdown = () => {
  for (const p of procs) if (!p.killed) p.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
for (const p of procs) p.on("exit", shutdown);
