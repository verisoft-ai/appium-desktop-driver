#pragma once

#include <windows.h>
#include <unknwn.h>

// Minimal IClassFactory — CoreCLR calls DllGetClassObject for CLSID_AppiumDotNetBridgeProfiler
// (see ProfilerCallback.cpp), gets one of these back, then calls CreateInstance to get the
// actual ICorProfilerCallback4 object. No registry registration needed — profiler attach loads
// the DLL directly by path (see CoreClrDiagnosticsIpcClient.cs), it never goes through CoCreateInstance.
class ClassFactory final : public IClassFactory
{
public:
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppvObject) override;
    ULONG STDMETHODCALLTYPE AddRef() override;
    ULONG STDMETHODCALLTYPE Release() override;

    HRESULT STDMETHODCALLTYPE CreateInstance(IUnknown* pUnkOuter, REFIID riid, void** ppvObject) override;
    HRESULT STDMETHODCALLTYPE LockServer(BOOL fLock) override;

private:
    LONG _refCount = 1;
};
