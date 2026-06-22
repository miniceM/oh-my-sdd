@echo off
REM scripts/iam.cmd — Windows wrapper for scripts/iam (bash)
REM
REM Windows 用户需要 Git Bash 或 WSL 才能跑 bash mock。
REM 这个 wrapper 自动检测 bash 并转发参数。
REM
REM 如果没有 bash，提示用户安装 Git Bash 或 WSL。

setlocal

REM 优先用 Git Bash
where git >nul 2>&1 && (
  for /f "delims=" %%i in ('where git') do (
    set "GIT_DIR=%%~dpi"
    goto :found_git
  )
)
:found_git

if exist "%GIT_DIR%..\usr\bin\bash.exe" (
  "%GIT_DIR%..\usr\bin\bash.exe" "%~dp0iam" %*
  exit /b %ERRORLEVEL%
)

where bash >nul 2>&1 && (
  bash "%~dp0iam" %*
  exit /b %ERRORLEVEL%
)

echo ❌ No bash found. Install Git Bash or WSL to use mock iam. >&2
echo    Or ask IT for the real iam.exe. >&2
exit /b 1
