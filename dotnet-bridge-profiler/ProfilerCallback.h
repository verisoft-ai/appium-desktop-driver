#pragma once

// See dotnet-bridge-agent/CORECLR-BRIDGE-SPEC.md for the overall design. This is the native
// ICorProfilerCallback4 COM object CoreCLR loads and calls InitializeForAttach on when the host
// sends a ProfilerAttach Diagnostics IPC command (see CoreClrAttacher.cs /
// CoreClrDiagnosticsIpcClient.cs). Uses the .NET Framework SDK's (NETFXSDK) corprof.h — its
// ICorProfilerCallback interfaces are identical to CoreCLR's — so no separate header vendoring
// from dotnet/runtime was needed.

#include <atomic>
#include <string>
// cor.h must precede corprof.h: corprof.h's interface declarations assume the mdMethodDef/
// mdTypeDef/ModuleID typedefs are already visible, but only pulls in rpc.h/windows.h/ole2.h itself.
#include <cor.h>
#include <corprof.h>

// CLSID this profiler answers to in DllGetClassObject — must match CoreClrAttacher.ProfilerClsid
// in csharp/NovaUIAutomationServer/DotNet/CoreClrAttacher.cs. Keep both sides in sync by hand;
// there is no shared source of truth across the C++/C# boundary.
// {6F1A2E8C-6F9B-4B7D-9A3E-2C4B8E7F1A90}
extern const GUID CLSID_AppiumDotNetBridgeProfiler;

class ProfilerCallback final : public ICorProfilerCallback4
{
public:
    ProfilerCallback() = default;
    virtual ~ProfilerCallback();

    // ── IUnknown ──────────────────────────────────────────────────────────────────────────
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppvObject) override;
    ULONG STDMETHODCALLTYPE AddRef() override;
    ULONG STDMETHODCALLTYPE Release() override;

    // ── Hand-written: the methods this profiler actually does something with ───────────────
    HRESULT STDMETHODCALLTYPE Initialize(IUnknown* pICorProfilerInfoUnk) override;
    HRESULT STDMETHODCALLTYPE Shutdown(void) override;
    HRESULT STDMETHODCALLTYPE InitializeForAttach(IUnknown* pCorProfilerInfoUnk, void* pvClientData, UINT cbClientData) override;
    HRESULT STDMETHODCALLTYPE ModuleLoadFinished(ModuleID moduleId, HRESULT hrStatus) override;
    HRESULT STDMETHODCALLTYPE GetReJITParameters(ModuleID moduleId, mdMethodDef methodId, ICorProfilerFunctionControl* pFunctionControl) override;
    HRESULT STDMETHODCALLTYPE ReJITCompilationStarted(FunctionID functionId, ReJITID rejitId, BOOL fIsSafeToBlock) override;
    HRESULT STDMETHODCALLTYPE ReJITCompilationFinished(FunctionID functionId, ReJITID rejitId, HRESULT hrStatus, BOOL fIsSafeToBlock) override;
    HRESULT STDMETHODCALLTYPE ReJITError(ModuleID moduleId, mdMethodDef methodId, FunctionID functionId, HRESULT hrStatus) override;
    HRESULT STDMETHODCALLTYPE ExceptionThrown(ObjectID thrownObjectId) override;

    // ── Everything else: auto-generated no-op stubs (return S_OK) — see CallbackStubs.inc. ──
#include "CallbackStubs.inc"

    // Anchor methods tried in order, first found wins. Public: referenced by kAnchorCandidates
    // in ProfilerCallback.cpp.
    struct AnchorCandidate
    {
        const wchar_t* assemblySimpleName; // e.g. L"System.Windows.Forms"
        const wchar_t* typeName;           // e.g. L"System.Windows.Forms.Application"
        const wchar_t* methodName;         // e.g. L"Run"
    };

private:
    void ScanLoadedModulesForAnchor();
    void TryRequestReJitForAnchor(ModuleID moduleId);
    bool FindAnchorMethodToken(ModuleID moduleId, const AnchorCandidate& candidate, mdMethodDef* outToken);

    std::atomic<ULONG> _refCount{ 0 };
    // Raw pointer, manually AddRef'd/Released — no ATL/CComPtr in this SDK.
    ICorProfilerInfo8* _info = nullptr;
    bool _rejitRequested = false;
    // Absolute path of appium-dotnet-bridge-core.dll, received via InitializeForAttach's
    // pvClientData (see CoreClrAttacher.cs) — needed for GetReJITParameters' Assembly.LoadFrom call.
    std::wstring _bridgeCoreDllPath;
};
