/**
 * OpenCode plugin entry point — bridges OpenCode lifecycle events to
 * oh-my-sdd hooks/*.js via child_process.spawn (same protocol as Claude Code).
 *
 * Event mapping:
 * event("session.created") → SessionStart (hooks/session-start.js)
 * event("session.deleted") → SessionEnd (hooks/session-end.js)
 * tool.execute.before → PreToolUse (hooks/pre-tool-use.js)
 * tool.execute.after → PostToolUse (hooks/post-tool-use.js)
 * command.execute.before → UserPromptSubmit (hooks/user-prompt-submit.js)
 *
 * Single source of truth: all hook logic lives in hooks/*.js, shared with
 * the Claude Code plugin path. This adapter only translates events.
 */

import type { Plugin, Hooks } from '@opencode-ai/plugin';

import {
 mapSessionStart,
 mapSessionEnd,
 mapPreToolUse,
 mapPostToolUse,
 mapUserPromptSubmit,
} from './mappers.js';
import { runHook } from './runner.js';
import { log } from './logger.js';

const HOOK_TIMEOUT_MS = 5_000;

const plugin: Plugin = async (_ctx) => {
 log('info', 'oh-my-sdd plugin loaded');

 const hooks: Hooks = {
 // ─── Event hook (catches session.created / session.deleted) ────────
 async event(input) {
 const { event } = input;

 if (event.type === 'session.created') {
 const session = event.properties.info;
 const mapped = mapSessionStart({
 session_id: session.id,
 cwd: session.directory,
 });
 await runHook('session-start.js', mapped, {
 cwd: session.directory,
 timeoutMs: HOOK_TIMEOUT_MS,
 });
 }

 if (event.type === 'session.deleted') {
 const session = event.properties.info;
 const mapped = mapSessionEnd({
 session_id: session.id,
 cwd: session.directory,
 });
 await runHook('session-end.js', mapped, {
 cwd: session.directory,
 timeoutMs: HOOK_TIMEOUT_MS,
 });
 }
 },

 // ─── Tool hooks (PreToolUse / PostToolUse) ─────────────────────────
 async 'tool.execute.before'(input, output) {
 const mapped = mapPreToolUse({
 tool: input.tool,
 input: output.args,
 sessionID: input.sessionID,
 });
 if (!mapped) return;

 const result = await runHook('pre-tool-use.js', mapped, {
 timeoutMs: HOOK_TIMEOUT_MS,
 });

 if (result?.permissionDecision === 'deny') {
 // Throw to block the tool execution in OpenCode
 const reason = typeof result.permissionDecisionReason === 'string'
 ? result.permissionDecisionReason
 : 'blocked by oh-my-sdd';
 throw new Error(reason);
 }
 },

 async 'tool.execute.after'(input) {
 const mapped = mapPostToolUse({
 tool: input.tool,
 input: input.args,
 sessionID: input.sessionID,
 });
 if (!mapped) return;

 await runHook('post-tool-use.js', mapped, {
 timeoutMs: HOOK_TIMEOUT_MS,
 });
 },

 // ─── Command hook (UserPromptSubmit) ───────────────────────────────
 async 'command.execute.before'(input) {
 const mapped = mapUserPromptSubmit({
 command: input.command,
 session_id: input.sessionID,
 arguments: input.arguments,
 });
 if (!mapped) return;

 await runHook('user-prompt-submit.js', mapped, {
 timeoutMs: HOOK_TIMEOUT_MS,
 });
 },
 };

 return hooks;
};

export default plugin;
