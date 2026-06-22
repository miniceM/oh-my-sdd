@echo off
REM scripts/dev-launch-claude.cmd — Windows 版本（用 mock iam/dop 启动 Claude Code）
REM
REM 用法：
REM   scripts\dev-launch-claude.cmd              REM 默认 alice 已登录
REM   set OMS_MOCK_LOGGED_OUT=1 && scripts\dev-launch-claude.cmd
REM
REM 前置：需要 Git Bash（因为 mock iam/dop 是 bash 脚本，wrapper 会自动找 bash）

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "PROJECT_ROOT=%SCRIPT_DIR%\.."

REM 把 mock iam/dop 加到 PATH 最前（.cmd 让 where 能找到）
set "PATH=%SCRIPT_DIR%;%PATH%"

where iam >nul 2>&1
if errorlevel 1 (
  echo ❌ mock iam 不可达。检查 scripts\iam.cmd 是否存在。 >&2
  exit /b 1
)

where dop >nul 2>&1
if errorlevel 1 (
  echo ❌ mock dop 不可达。检查 scripts\dop.cmd 是否存在。 >&2
  exit /b 1
)

echo → PATH 已注入 mock iam 和 dop
echo → mock 用户: %OMS_MOCK_USER_DEVOPS%/%OMS_MOCK_USER_GITEE%
if "%OMS_MOCK_LOGGED_OUT%"=="1" (
  echo → ⚠️ 模拟未登录状态（测试 NEED_LOGIN 路径）
)
echo.

REM 验证 mock 输出
echo → mock iam auth status --json 输出:
call iam auth status --json
echo.
echo → mock dop change view ARD123456 ^(示例^):
call dop change view ARD123456 2>&1 | more +0
echo.

REM 启动 Claude Code
echo → 启动 Claude Code...
call claude %*
