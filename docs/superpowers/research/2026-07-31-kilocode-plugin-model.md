# KiloCode Plugin Model Research

**Date:** 2026-07-31
**Researcher:** Claude Agent (Task 2.1)

## 1. Where are plugins installed?

### VS Code Extension
- **Extension ID**: `kilocode.kilo-code`
- **Publisher**: Kilo Code
- **Install**: VS Code Marketplace or Open VSX
- **Path**: VS Code's standard extension directory (platform-dependent)

### Kilo Configuration & Data Directories
- **Global Config**: `~/.config/kilo/kilo.jsonc` (Mac/Linux), `C:\Users\<username>\.config\kilo\kilo.jsonc` (Windows)
- **Global Skills**: `~/.kilo/skills/` (Mac/Linux), `\Users\<username>\.kilo\skills\` (Windows)
- **Global Commands**: `~/.config/kilo/commands/`
- **Project-level**: `.kilo/` directory in project root
- **Project Config**: `kilo.jsonc` or `.kilo/kilo.jsonc` in project root

### Path Constants for Adapter
```js
const KILO_GLOBAL_CONFIG = '~/.config/kilo/kilo.jsonc';
const KILO_GLOBAL_SKILLS = '~/.kilo/skills/';
const KILO_GLOBAL_COMMANDS = '~/.config/kilo/commands/';
const KILO_PROJECT_DIR = '.kilo/';
const KILO_PROJECT_CONFIG = 'kilo.jsonc';
```

## 2. How are skills registered?

### Location
- **Global**: `~/.kilo/skills/`
- **Project**: `.kilo/skills/`
- **Compatibility**: `.agents/skills/`, `.claude/skills/` (also scanned)

### Format
```
skill-name/
  SKILL.md        # Required: frontmatter + instructions
  scripts/        # Optional: bundled scripts
  references/     # Optional: reference documents
  assets/         # Optional: assets
```

### SKILL.md Format
```markdown
---
name: skill-name
description: Brief description (max 1024 chars)
license: MIT              # Optional
compatibility:            # Optional
  - kilo
  - claude
---

# Instructions
Detailed instructions for the AI agent.
```

**Rules**:
- `name` must match parent directory name
- `name`: max 64 chars, lowercase letters/numbers/hyphens
- `description`: max 1024 chars

### Discovery & Loading
1. Skills scanned from designated directories on initialization
2. Only metadata (frontmatter) read at this stage
3. Relevant skill metadata included in system prompt
4. Full SKILL.md loaded on-demand when agent invokes the skill

### Configuration (kilo.jsonc)
```json
{
  "skills": {
    "paths": ["/path/to/shared/skills", "~/my-skills"],
    "urls": ["https://example.com/.well-known/skills/"]
  }
}
```

### Adapter Steps for Skills
1. Copy skills to `~/.kilo/skills/<skill-name>/`
2. Create SKILL.md with proper frontmatter
3. No explicit registration needed (auto-discovered)
4. User runs `/reload` in Kilo to pick up changes

## 3. How are hooks registered?

### CRITICAL FINDING: No Hooks System

**Kilo Code does NOT have a hooks system like Claude Code.**

This is the most significant architectural difference:
- No PreToolUse hooks
- No PostToolUse hooks
- No SessionStart hooks
- No lifecycle event system

### Implications for oh-my-sdd
1. **Cannot enforce HARD_RULE at the hook layer** - Kilo Code lacks this capability
2. **Baseline injection is purely advisory** - no enforcement mechanism
3. **Security model differs fundamentally** - Claude Code's onion model layers 3-5 (hooks) don't apply
4. **Alternative enforcement needed** - must rely on:
   - AGENTS.md conventions (advisory)
   - MCP server tool permissions (partial)
   - User education / process controls

### Extension Mechanisms Available
1. **MCP Servers** - for external tool integration
2. **Skills** - for extending agent capabilities
3. **Commands/Workflows** - for automation
4. **Custom Agents** - specialized agent configurations

## 4. How is baseline injected?

### Primary Mechanism: AGENTS.md

AGENTS.md is the standard for project-specific AI agent instructions.

### File Locations
- **Project root**: `AGENTS.md` (primary) or `AGENT.md` (fallback)
- **Global**: `~/.config/kilo/AGENTS.md`
- **Per-directory**: AGENTS.md in subdirectories (loaded when agent reads files in that directory)

### Loading Priority
1. Agent prompt (highest)
2. Instructions (project config)
3. **AGENTS.md**
4. Instructions (global config)
5. Skills (on-demand)

### Injection Mechanism
- Project-level AGENTS.md loaded at task start
- Per-directory AGENTS.md injected as `<system-reminder>` tags when agent reads files in that directory
- Global AGENTS.md always loaded if present

### Configuration (kilo.jsonc)
```json
{
  "instructions": [
    "./docs/coding-standards.md",
    "./teams/frontend-rules.md"
  ]
}
```

### Alternative: Custom Instructions
- Configured via Settings UI under "Agent Behaviour → Agents"
- Files: AGENTS.md, CLAUDE.md, CONTEXT.md (auto-discovered)
- Per-agent prompts injected into system prompt

### Adapter Steps for Baseline
1. Create `~/.config/kilo/AGENTS.md` with baseline content
2. Or add baseline content to project's AGENTS.md
3. No explicit registration needed (auto-discovered)
4. Changes take effect in new tasks

## 5. Build step needed?

### No Build Required

Kilo Code uses plain files:
- SKILL.md: Markdown with YAML frontmatter
- AGENTS.md: Plain Markdown
- kilo.jsonc: JSON with comments
- Commands: Markdown files

**Same as Claude Code and Lingma - no compilation/bundling.**

## 6. CLI Detection

### Kilo CLI
- **Binary**: `kilo` (not `kilocode`)
- **Install methods**:
  - npm: `npm install -g @kilo-ai/kilo-cli`
  - Homebrew: `brew install kilo`
  - AUR: Available for Arch Linux

### Detection
```bash
which kilo
kilo --version
```

### Config Path
- Global: `~/.config/kilo/kilo.jsonc`
- Skills: `~/.kilo/skills/`

## 7. Reference Implementations

### Official Examples
1. **Kilo Code Repository**: https://github.com/Kilo-Org/kilocode
   - Open-source, MIT licensed
   - Contains `.kilo/skills/vscode-visual-regression` example

2. **Agent Skills Specification**:
   - Standard format for AI agent skills
   - Interoperable across tools (Kilo, Claude, etc.)

### Skill Format Compatibility
- Kilo Code's SKILL.md format is compatible with Claude Code
- Same frontmatter conventions (name, description)
- Same directory structure (SKILL.md, scripts/, references/)

## 8. Adapter Sketch

```js
/**
 * KiloCodeAdapter - Host adapter for Kilo Code
 *
 * DESIGN NOTES:
 * - Kilo Code does NOT have a hooks system (critical difference from Claude Code)
 * - Baseline injection is advisory only via AGENTS.md
 * - Skills use same SKILL.md format as Claude Code
 * - No enforcement mechanism - purely convention-based
 */
export class KiloCodeAdapter extends HostAdapter {
  static id = 'kilocode';
  static displayName = 'Kilo Code';
  static extensionId = 'kilocode.kilo-code';

  // Paths
  static GLOBAL_CONFIG = '~/.config/kilo/kilo.jsonc';
  static GLOBAL_SKILLS_DIR = '~/.kilo/skills/';
  static GLOBAL_COMMANDS_DIR = '~/.config/kilo/commands/';
  static PROJECT_DIR = '.kilo/';
  static BASELINE_FILE = 'AGENTS.md';

  /**
   * Check if Kilo Code is installed
   * Checks for: CLI, VS Code extension, or config directory
   */
  static isInstalled() {
    // Check CLI
    if (which('kilo')) return true;

    // Check VS Code extension
    const vscodeExtPath = getVscodeExtensionPath('kilocode.kilo-code');
    if (existsSync(vscodeExtPath)) return true;

    // Check global config
    if (existsSync(expandTilde(this.GLOBAL_CONFIG))) return true;

    return false;
  }

  /**
   * Preflight checks
   * Returns { ok, warnings } where warnings explain limitations
   */
  static preflight(ctx) {
    const warnings = [];

    // CRITICAL: No hooks system
    warnings.push({
      level: 'CRITICAL',
      message: 'Kilo Code has NO hooks system. HARD_RULE enforcement is NOT possible.',
      impact: 'Security onion layers 3-5 (hook enforcement) do not apply.'
    });

    // Advisory baseline
    warnings.push({
      level: 'WARNING',
      message: 'Baseline injection is advisory only via AGENTS.md.',
      impact: 'Agent may ignore or override rules.'
    });

    return {
      ok: true,
      warnings,
      capabilities: {
        hooks: false,
        skills: true,
        mcp: true,
        baselineInjection: 'advisory'
      }
    };
  }

  /**
   * Install oh-my-sdd for Kilo Code
   * Copies skills + creates baseline AGENTS.md
   */
  static async install(ctx) {
    const { pluginRoot, baselineContent, skills } = ctx;

    // Step 1: Copy skills to global skills directory
    const skillsDir = expandTilde(this.GLOBAL_SKILLS_DIR);
    await fs.mkdir(skillsDir, { recursive: true });

    for (const skill of skills) {
      const targetDir = join(skillsDir, skill.name);
      await copyDir(skill.path, targetDir);
    }

    // Step 2: Create baseline AGENTS.md
    const baselinePath = expandTilde(this.GLOBAL_CONFIG_DIR + this.BASELINE_FILE);
    await fs.writeFile(baselinePath, baselineContent);

    // Step 3: Update kilo.jsonc with skill paths (optional)
    // Kilo auto-discovers skills, but explicit paths can be added

    return {
      installed: true,
      skillsDir,
      baselinePath,
      limitations: ['No hooks - advisory enforcement only']
    };
  }

  /**
   * Uninstall oh-my-sdd from Kilo Code
   */
  static async uninstall(ctx) {
    const skillsDir = expandTilde(this.GLOBAL_SKILLS_DIR);
    const baselinePath = expandTilde('~/.config/kilo/AGENTS.md');

    // Remove skills
    for (const skill of ctx.skills) {
      await fs.rm(join(skillsDir, skill.name), { recursive: true });
    }

    // Remove baseline (if we own it)
    await fs.rm(baselinePath, { force: true });

    return { uninstalled: true };
  }
}
```

## 9. Estimated Adapter Size

| Component | Lines |
|-----------|-------|
| isInstalled() | ~15 |
| preflight() | ~25 |
| install() | ~30 |
| uninstall() | ~15 |
| Constants/helpers | ~20 |
| **Total** | **~105 lines** |

**Verdict: <= 150 lines - abstraction is good.**

## 10. Architectural Implications

### Key Differences from Claude Code

| Feature | Claude Code | Kilo Code |
|---------|-------------|-----------|
| Hooks system | Yes (PreToolUse, PostToolUse, etc.) | **NO** |
| Skills format | SKILL.md | SKILL.md (same) |
| Baseline injection | System prompt file | AGENTS.md (advisory) |
| Enforcement | Hook-layer blocking | Advisory only |
| CLI | `claude` | `kilo` |
| Config file | settings.json | kilo.jsonc |

### Security Model Impact

For Kilo Code, the oh-my-sdd "7-layer onion" becomes:

| Layer | Claude Code | Kilo Code |
|-------|-------------|-----------|
| 7. CI gate | Yes | Yes (repo-level) |
| 6. Amendment governance | Yes | Yes (docs-level) |
| 5. Mandatory hooks | Yes | **NO EQUIVALENT** |
| 4. Analyze CRITICAL | Yes | Advisory only |
| 3. Plan gate | Yes | Advisory only |
| 2. Injection | Yes | Yes (AGENTS.md) |
| 1. Data | Yes | Yes |

**Layers 3-5 (enforcement) are NOT enforceable on Kilo Code.**

### Recommendation

The HostAdapter abstraction must expose enforcement capabilities:

```js
const capabilities = {
  canEnforceHooks: false,      // Kilo Code cannot
  canBlockWrites: false,       // Kilo Code cannot
  baselineEnforcement: 'advisory'
};
```

Install should WARN user that Kilo Code provides advisory-only protection.

## 11. Sources

- Kilo Code Documentation: https://kilo.ai/docs
- Kilo Code GitHub: https://github.com/Kilo-Org/kilocode
- Skills Documentation: https://kilo.ai/docs/features/skills
- Custom Instructions: https://kilo.ai/docs/customize/custom-instructions
- AGENTS.md: https://kilo.ai/docs/customize/agents-md
- Settings: https://kilo.ai/docs/getting-started/settings
- Workflows: https://kilo.ai/docs/customize/workflows
- VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=kilocode.kilo-code