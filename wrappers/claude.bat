@echo off
REM enterprise-wrapper/wrappers/claude.bat
REM CMD fallback wrapper for Claude CLI with enterprise constraints
REM
REM 无需管理员权限，用户级部署
REM 安装位置: %USERPROFILE%\bin\claude.bat
REM
REM 此脚本调用 PowerShell wrapper 以获得更完整的功能

setlocal

REM 检查是否支持 PowerShell
where powershell >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: PowerShell not found. Please install PowerShell.
    exit /b 1
)

REM 获取脚本目录
set "WRAPPER_DIR=%~dp0"

REM 调用 PowerShell wrapper（传递所有参数）
powershell -NoProfile -ExecutionPolicy Bypass -File "%WRAPPER_DIR%claude.ps1" %*

exit /b %ERRORLEVEL%