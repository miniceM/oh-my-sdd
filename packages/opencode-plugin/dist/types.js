export function sanitizeSessionId(raw) {
    if (!raw)
        return `oms-opencode-${Date.now()}`;
    return raw.replace(/[^A-Za-z0-9_-]/g, '_');
}
//# sourceMappingURL=types.js.map