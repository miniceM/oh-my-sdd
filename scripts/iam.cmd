@echo off
REM scripts/iam.cmd — native Node.js mock.
node "%~dp0mock-cli.mjs" iam %*
exit /b %ERRORLEVEL%
