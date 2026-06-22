@echo off
REM scripts/set-mock-env.cmd — Windows 版本：把 mock iam + dop 注入当前 PATH
REM
REM 用法（在当前 cmd 会话生效）：
REM   call scripts\set-mock-env.cmd
REM
REM 注入后可跑：
REM   claude                                  REM 启动 Claude Code
REM   node bin\oh-my-sdd-login.js                    REM 测试登录流程
REM   iam auth status --json                   REM 直接调 mock iam
REM   dop change view ARD123456                REM 直接调 mock dop

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

set "PATH=%SCRIPT_DIR%;%PATH%"

echo → PATH 已注入 mock iam 和 dop（来自 %SCRIPT_DIR%）
echo → 环境变量控制：
echo    OMS_MOCK_USER_DEVOPS / OMS_MOCK_USER_GITEE   用户名
echo    OMS_MOCK_LOGGED_OUT=1                       模拟未登录
echo    OMS_MOCK_HALF_LOGIN=1                       模拟只登 devops
echo    OMS_MOCK_DOP_FAIL_GET=1                     dop change view 模拟失败

where iam >nul 2>&1 || (
  echo ❌ mock iam 不可达。 >&2
  exit /b 1
)

echo.
echo → 验证: iam auth status --json
call iam auth status --json
