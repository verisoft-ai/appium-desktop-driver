@echo off
setlocal

set SRC_DIR=%~dp0src
set OUT_DIR=%~dp0out
set JAR_OUT=%~dp0..\native\win-x64\appium-desktop-agent.jar

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

echo Compiling Java agent...
javac -source 8 -target 8 -d "%OUT_DIR%" ^
  "%SRC_DIR%\io\verisoft\appium\AppiumDesktopAgent.java" ^
  "%SRC_DIR%\io\verisoft\appium\ComponentRegistry.java" ^
  "%SRC_DIR%\io\verisoft\appium\CommandHandler.java" ^
  "%SRC_DIR%\io\verisoft\appium\Json.java" ^
  "%SRC_DIR%\io\verisoft\appium\AgentLoader.java"

if errorlevel 1 (
    echo Compilation failed.
    exit /b 1
)

echo Packaging JAR...
jar cfm "%JAR_OUT%" "%~dp0manifest.mf" -C "%OUT_DIR%" .

if errorlevel 1 (
    echo JAR creation failed.
    exit /b 1
)

echo Done: %JAR_OUT%
endlocal
