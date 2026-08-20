import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = path.join(ROOT, "bin", "oms.js");

function runOms(args = [], { env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("oms --help shows supported commands", async () => {
  const { code, stdout } = await runOms(["--help"]);
  assert.equal(code, 0);
  assert.match(stdout, /status/);
  assert.match(stdout, /doctor/);
  assert.match(stdout, /repair/);
});

test("oms status --tool opencode --json returns status report", async () => {
  const { code, stdout } = await runOms(["status", "--tool", "opencode", "--json"]);
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.type, "status-report");
  assert.ok(parsed.hosts.length > 0);
  assert.equal(parsed.hosts[0].id, "opencode");
});

test("oms status --tool claude --json returns Claude protection facts", async () => {
  const { code, stdout } = await runOms(["status", "--tool", "claude", "--json"]);
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.type, "status-report");
  assert.equal(parsed.hosts[0].id, "claude");
});

test("oms status --tool lingma --json returns Lingma facts", async () => {
  const { code, stdout } = await runOms(["status", "--tool", "lingma", "--json"]);
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.type, "status-report");
  assert.equal(parsed.hosts[0].id, "lingma");
});

test("oms doctor --tool kilocode --json returns doctor report with advisory protection", async () => {
  const { code, stdout } = await runOms(["doctor", "--tool", "kilocode", "--json"]);
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.type, "doctor-report");
  assert.ok(parsed.hosts.length > 0);
  assert.equal(parsed.hosts[0].protection.level, "advisory");
});

test("oms repair defaults to dry run without --apply", async () => {
  const { code, stdout } = await runOms(["repair", "--tool", "opencode", "--json"]);
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.type, "repair-plan");
});

test("oms repair --apply returns repair-result", async () => {
  const { code, stdout } = await runOms(["repair", "--tool", "kilocode", "--apply", "--json"]);
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.type, "repair-result");
});
