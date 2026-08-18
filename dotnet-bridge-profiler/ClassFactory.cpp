#include "ClassFactory.h"
#include "ProfilerCallback.h"

HRESULT STDMETHODCALLTYPE ClassFactory::QueryInterface(REFIID riid, void** ppvObject)
{
    if (ppvObject == nullptr) return E_POINTER;
    if (riid == IID_IUnknown || riid == IID_IClassFactory)
    {
        *ppvObject = static_cast<IClassFactory*>(this);
        AddRef();
        return S_OK;
    }
    *ppvObject = nullptr;
    return E_NOINTERFACE;
}

ULONG STDMETHODCALLTYPE ClassFactory::AddRef()
{
    return InterlockedIncrement(&_refCount);
}

ULONG STDMETHODCALLTYPE ClassFactory::Release()
{
    LONG count = InterlockedDecrement(&_refCount);
    if (count == 0) delete this;
    return count;
}

HRESULT STDMETHODCALLTYPE ClassFactory::CreateInstance(IUnknown* pUnkOuter, REFIID riid, void** ppvObject)
{
    if (ppvObject == nullptr) return E_POINTER;
    *ppvObject = nullptr;
    if (pUnkOuter != nullptr) return CLASS_E_NOAGGREGATION;

    auto* callback = new ProfilerCallback();
    callback->AddRef();
    HRESULT hr = callback->QueryInterface(riid, ppvObject);
    callback->Release();
    return hr;
}

HRESULT STDMETHODCALLTYPE ClassFactory::LockServer(BOOL /*fLock*/)
{
    return S_OK;
}

// ── DLL exports — CoreCLR calls DllGetClassObject directly after LoadLibraryW'ing this DLL.
//    No COM registration/regsvr32 involved. Exported via ProfilerAgent.def, not
//    __declspec(dllexport): combaseapi.h already forward-declares both names as extern "C" for
//    ole32.lib's copies, and __declspec(dllexport) here conflicts with that (MSVC C2375). ─────

extern "C" HRESULT STDAPICALLTYPE DllGetClassObject(REFCLSID rclsid, REFIID riid, LPVOID* ppv)
{
    if (ppv == nullptr) return E_POINTER;
    *ppv = nullptr;
    if (rclsid != CLSID_AppiumDotNetBridgeProfiler) return CLASS_E_CLASSNOTAVAILABLE;

    auto* factory = new ClassFactory();
    HRESULT hr = factory->QueryInterface(riid, ppv);
    factory->Release();
    return hr;
}

extern "C" HRESULT STDAPICALLTYPE DllCanUnloadNow(void)
{
    // Never report "safe to unload" — the profiler callback object outlives any single
    // attach/detach cycle for the process' lifetime, and CoreCLR doesn't actually call this for
    // profiler DLLs the way classic COM servers expect it.
    return S_FALSE;
}

BOOL APIENTRY DllMain(HMODULE /*hModule*/, DWORD /*ul_reason_for_call*/, LPVOID /*lpReserved*/)
{
    return TRUE;
}
