@echo off
REM Builds appium-dotnet-profiler.dll (plain C++, no /clr — see ProfilerAgent.vcxproj's header
REM comment) for both x64 and Win32 (x86), dropping them into native/win-x64/ and
REM native/win-x86/ respectively — mirrors dotnet-bridge-agent/build.bat's two-platform build and
REM MSBuild-discovery logic.
REM
REM Requires: Visual Studio Build Tools with the "Desktop development with C++" workload
REM (no C++/CLI component needed this time). Run from a "Developer Command Prompt for VS" (or
REM after calling vcvars64.bat) so msbuild is on PATH.

setlocal

where msbuild >nul 2>nul
if not errorlevel 1 (
    set "MSBUILD=msbuild"
    goto :build
)

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if exist "%VSWHERE%" (
    for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -prerelease -products * -requires Microsoft.Component.MSBuild -find MSBuild\**\Bin\MSBuild.exe`) do (
        set "MSBUILD=%%i"
    )
)

if not defined MSBUILD (
    echo msbuild not found on PATH and vswhere could not locate it.
    echo Run this from a "Developer Command Prompt for VS 2022", or install
    echo the "Desktop development with C++" workload.
    exit /b 1
)

:build
"%MSBUILD%" "%~dp0ProfilerAgent.vcxproj" /p:Configuration=Release /p:Platform=x64
if errorlevel 1 exit /b 1
echo Built native\win-x64\appium-dotnet-profiler.dll

"%MSBUILD%" "%~dp0ProfilerAgent.vcxproj" /p:Configuration=Release /p:Platform=Win32
if errorlevel 1 exit /b 1
echo Built native\win-x86\appium-dotnet-profiler.dll

endlocal
