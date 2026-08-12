@echo off
REM Builds appium-dotnet-bridge.dll (C++/CLI, /clr mixed-mode) and drops it into
REM native/win-x64/, mirroring how java-agent/build.bat produces appium-desktop-agent.jar
REM into the same directory.
REM
REM Requires: Visual Studio with the "Desktop development with C++" workload and the
REM "C++/CLI support for v143 build tools" individual component. Run from a
REM "Developer Command Prompt for VS" (or after calling vcvars64.bat) so msbuild is on PATH.

setlocal

where msbuild >nul 2>nul
if not errorlevel 1 (
    set "MSBUILD=msbuild"
    goto :build
)

REM Not on PATH (not run from a Developer Command Prompt) — ask vswhere, the tool every VS 2017+
REM installer registers at this fixed location, to locate the newest installed MSBuild instead.
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if exist "%VSWHERE%" (
    for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -prerelease -products * -requires Microsoft.Component.MSBuild -find MSBuild\**\Bin\MSBuild.exe`) do (
        set "MSBUILD=%%i"
    )
)

if not defined MSBUILD (
    echo msbuild not found on PATH and vswhere could not locate it.
    echo Run this from a "Developer Command Prompt for VS 2022", or install
    echo the "Desktop development with C++" workload with C++/CLI support.
    exit /b 1
)

:build
"%MSBUILD%" "%~dp0BridgeAgent.vcxproj" /p:Configuration=Release /p:Platform=x64
if errorlevel 1 exit /b 1

echo Built native\win-x64\appium-dotnet-bridge.dll
endlocal
