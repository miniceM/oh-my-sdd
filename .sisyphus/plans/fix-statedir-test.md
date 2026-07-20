# Fix getStateDir Test Failure

## TL;DR

> **Quick Summary**: 修复 `getStateDir()` 函数，使其返回正确的状态目录路径 `~/.oh-my-sdd`，解决测试失败问题。
>
> **Deliverables**:
> - 修复 `hooks/lib/platform.js` 中的 `getStateDir()` 函数
> - 所有测试通过
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO - 单个任务
> **Critical Path**: Task 1 → Final Verification

---

## Context

### Original Request
用户要求构建并完成项目测试。

### 发现的问题
运行 `npm test` 后发现测试失败：
- 测试 `getStateDir ends with .oh-my-sdd` 失败
- `getStateDir()` 当前返回 `~/.local/state/oh-my-sdd`
- 但文档（AGENTS.md）和实际使用（uninstall.js、session meta）都期望 `~/.oh-my-sdd`

### 根因分析
`getStateDir()` 函数遵循 XDG Base Directory Spec，返回 `~/.local/state/oh-my-sdd`。但项目其他部分都使用 `~/.oh-my-sdd/` 作为状态目录，导致不一致。

---

## Work Objectives

### Core Objective
修复 `getStateDir()` 函数，使其返回 `~/.oh-my-sdd`，与项目其他部分保持一致。

### Concrete Deliverables
- `hooks/lib/platform.js` 中的 `getStateDir()` 函数返回 `~/.oh-my-sdd`

### Definition of Done
- [x] `npm test` 所有测试通过（36 个测试文件，352 tests, 0 失败）

### Must Have
- `getStateDir()` 返回以 `.oh-my-sdd` 结尾的路径

### Must NOT Have (Guardrails)
- 不修改测试文件（测试是正确的）
- 不修改其他文件（除非必要）

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after（修复后运行现有测试）
- **Framework**: Node.js built-in test runner

### QA Policy
运行 `npm test` 验证所有测试通过。

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Single task):
└── Task 1: Fix getStateDir() [quick]

Wave FINAL (After task):
└── Task F1: Run tests to verify [quick]

Critical Path: Task 1 → F1
```

### Agent Dispatch Summary

- **Wave 1**: 1 task - T1 → `quick`
- **FINAL**: 1 task - F1 → `quick`

---

## TODOs

- [x] 1. Fix getStateDir() function

  **What to do**:
  - Edit `hooks/lib/platform.js` line 42-48
  - Change `getStateDir()` to return `path.join(getHomeDir(), '.oh-my-sdd')`
  - Remove XDG logic (not used by project)

  **Must NOT do**:
  - Do not modify test files
  - Do not modify other files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, simple change
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: F1
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `hooks/lib/platform.js:42-48` - Current `getStateDir()` implementation
  - `hooks/lib/platform.js:50-52` - `getPluginInstallDir()` for reference pattern

  **API/Type References**:
  - `hooks/lib/platform.js:61-65` - `sessionMetaPath()` uses `getStateDir()`

  **WHY Each Reference Matters**:
  - Shows current implementation that needs to change
  - Shows how `getStateDir()` is used downstream

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify getStateDir returns correct path
    Tool: Bash (node REPL)
    Preconditions: None
    Steps:
      1. Run: node -e "import('./hooks/lib/platform.js').then(m => console.log(m.getStateDir()))"
      2. Assert output ends with ".oh-my-sdd"
    Expected Result: Path ends with ".oh-my-sdd"
    Failure Indicators: Path does not end with ".oh-my-sdd"
    Evidence: .sisyphus/evidence/task-1-statedir-path.txt
  ```

  **Commit**: YES
  - Message: `fix(platform): getStateDir returns ~/.oh-my-sdd`
  - Files: `hooks/lib/platform.js`

---

## Final Verification Wave

- [x] F1. **Run Tests** — \`quick\`
  Run `npm test` and verify all 36 test files pass with 0 failures.
  Output: `Tests [36/36 pass] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **Task 1**: `fix(platform): getStateDir returns ~/.oh-my-sdd` - hooks/lib/platform.js

---

## Success Criteria

### Verification Commands
```bash
npm test  # Expected: All 36 test files pass
node -e "import('./hooks/lib/platform.js').then(m => console.log(m.getStateDir()))"  # Expected: ends with .oh-my-sdd
```

### Final Checklist
- [x] `getStateDir()` returns path ending with `.oh-my-sdd`
- [x] All tests pass
