@echo off
REM scripts/dop.cmd — Windows wrapper for scripts/dop (bash)
REM 同 scripts/iam.cmd，转发到 bash。

setlocal

where git >nul 2>&1 && (
  for /f "delims=" %%i in ('where git') do (
    set "GIT_DIR=%%~dpi"
    goto :found_git
  )
)
:found_git

if exist "%GIT_DIR%..\usr\bin\bash.exe" (
  "%GIT_DIR%..\usr\bin\bash.exe" "%~dp0dop" %*
  exit /b %ERRORLEVEL%
)

where bash >nul 2>&1 && (
  bash "%~dp0dop" %*
  exit /b %ERRORLEVEL%
)

echo ❌ No bash found. Install Git Bash or WSL to use mock dop. >&2
exit /b 1
