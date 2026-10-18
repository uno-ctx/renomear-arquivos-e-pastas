@echo off
chcp 65001 >nul
setlocal DisableDelayedExpansion
title Renomear - Testes automatizados
cd /d "%TEMP%"
set "NODE_EXE="
where node.exe >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined NODE_EXE (
    echo Nao foi encontrado o Node.js. Instale o Node.js e tente novamente.
    pause
    exit /b 1
)
"%NODE_EXE%" --test --test-concurrency=1 "%~dp0tests\renomear.test.cjs"
set "TEST_EXIT=%ERRORLEVEL%"
echo.
if "%TEST_EXIT%"=="0" (echo RESULTADO: TODOS OS TESTES PASSARAM.) else (echo RESULTADO: EXISTEM FALHAS. Confira a lista acima.)
if not defined RENOMEADOR_TEST_NO_PAUSE pause
exit /b %TEST_EXIT%
