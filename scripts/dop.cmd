@echo off
REM scripts/dop.cmd — native Node.js mock.
node "%~dp0mock-cli.mjs" dop %*
exit /b %ERRORLEVEL%
