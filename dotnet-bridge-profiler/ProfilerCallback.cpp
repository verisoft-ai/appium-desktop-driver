#include "ProfilerCallback.h"
#include <cor.h>
#include <CorError.h>
#include <vector>
#include <cstdio>
#include <cstdarg>

// Diagnostic-only breadcrumb log — %TEMP%\appium-dotnet-profiler-{pid}.log — so the ReJIT chain
// (module scan -> anchor found -> RequestReJIT -> GetReJITParameters -> ExceptionThrown) can be
// inspected from outside the target process. Attach-time diagnostics only, not a hot path.
static void DebugLog(const char* fmt, ...)
{
    char path[MAX_PATH];
    sprintf_s(path, "%s\\appium-dotnet-profiler-%lu.log", getenv("TEMP") ? getenv("TEMP") : "C:\\Windows\\Temp", GetCurrentProcessId());
    FILE* f = nullptr;
    if (fopen_s(&f, path, "a") != 0 || f == nullptr) return;
    va_list args;
    va_start(args, fmt);
    vfprintf(f, fmt, args);
    va_end(args);
    fprintf(f, "\n");
    fclose(f);
}

// Writes to the same file CoreClrAttacher.WaitForPortFile polls for —
// %TEMP%\appium-dotnet-bridge-{pid}.error — so a GetReJITParameters failure surfaces to the host
// immediately instead of as a generic 15s timeout. Same convention as BridgeStart.cs's own
// catch block on the managed side.
static void ReportAttachFailure(const char* message)
{
    char path[MAX_PATH];
    sprintf_s(path, "%s\\appium-dotnet-bridge-%lu.error", getenv("TEMP") ? getenv("TEMP") : "C:\\Windows\\Temp", GetCurrentProcessId());
    FILE* f = nullptr;
    if (fopen_s(&f, path, "w") != 0 || f == nullptr) return;
    fputs(message, f);
    fclose(f);
}

// Fallback for the metadata/IL-emit failure points in GetReJITParameters that don't have a more
// specific message — a raw HRESULT plus which step produced it beats a generic 15s timeout.
static void ReportGenericStepFailure(const char* step, HRESULT hr)
{
    char message[512];
    sprintf_s(message,
        "CoreCLR bridge: attach failed during IL rewrite, step '%s' (HRESULT 0x%08lX). "
        "This is an unexpected failure, not the known EH-clause limitation — see "
        "dotnet-bridge-agent/CORECLR-BRIDGE-SPEC.md and the profiler's own debug log "
        "(%%TEMP%%\\appium-dotnet-profiler-<pid>.log) for more detail.",
        step, (unsigned long)hr);
    ReportAttachFailure(message);
}

// {6F1A2E8C-6F9B-4B7D-9A3E-2C4B8E7F1A90} — must match CoreClrAttacher.ProfilerClsid in
// csharp/NovaUIAutomationServer/DotNet/CoreClrAttacher.cs.
const GUID CLSID_AppiumDotNetBridgeProfiler =
{ 0x6f1a2e8c, 0x6f9b, 0x4b7d, { 0x9a, 0x3e, 0x2c, 0x4b, 0x8e, 0x7f, 0x1a, 0x90 } };

// Anchor methods, tried in module-scan order — first candidate found wins. NOT Application.Run/
// Dispatcher.Run: RequestReJIT only rewrites *future* invocations, and Application.Run is already
// on the stack blocking in its message loop by the time attach happens, so it's never re-entered.
// Control.WndProc runs continuously (once per window message), so the ReJIT'd body actually fires
// — see CORECLR-BRIDGE-SPEC.md phase 2 for the live-attach history.
static const ProfilerCallback::AnchorCandidate kAnchorCandidates[] = {
    { L"System.Windows.Forms", L"System.Windows.Forms.Control", L"WndProc" },
};

ProfilerCallback::~ProfilerCallback()
{
    if (_info != nullptr)
    {
        _info->Release();
        _info = nullptr;
    }
}

// ── IUnknown ─────────────────────────────────────────────────────────────────────────────────

HRESULT STDMETHODCALLTYPE ProfilerCallback::QueryInterface(REFIID riid, void** ppvObject)
{
    if (ppvObject == nullptr) return E_POINTER;

    if (riid == IID_IUnknown ||
        riid == __uuidof(ICorProfilerCallback) ||
        riid == __uuidof(ICorProfilerCallback2) ||
        riid == __uuidof(ICorProfilerCallback3) ||
        riid == __uuidof(ICorProfilerCallback4))
    {
        *ppvObject = static_cast<ICorProfilerCallback4*>(this);
        AddRef();
        return S_OK;
    }

    *ppvObject = nullptr;
    return E_NOINTERFACE;
}

ULONG STDMETHODCALLTYPE ProfilerCallback::AddRef()
{
    return ++_refCount;
}

ULONG STDMETHODCALLTYPE ProfilerCallback::Release()
{
    ULONG count = --_refCount;
    if (count == 0) delete this;
    return count;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────────────────────

HRESULT STDMETHODCALLTYPE ProfilerCallback::Initialize(IUnknown* /*pICorProfilerInfoUnk*/)
{
    // Launch-time profiling (CORECLR_PROFILER env vars) is not this bridge's attach flow — see
    // CORECLR-BRIDGE-SPEC.md: only InitializeForAttach (live attach via Diagnostics IPC) is
    // supported. Refusing here just means "this profiler doesn't do launch-time hooking," not an
    // error in the attach path.
    return E_NOTIMPL;
}

HRESULT STDMETHODCALLTYPE ProfilerCallback::Shutdown(void)
{
    if (_info != nullptr)
    {
        _info->Release();
        _info = nullptr;
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE ProfilerCallback::InitializeForAttach(
    IUnknown* pCorProfilerInfoUnk, void* pvClientData, UINT cbClientData)
{
    if (pCorProfilerInfoUnk == nullptr) return E_INVALIDARG;

    HRESULT hr = pCorProfilerInfoUnk->QueryInterface(__uuidof(ICorProfilerInfo8), (void**)&_info);
    if (FAILED(hr) || _info == nullptr) return E_NOINTERFACE;

    // pvClientData is the UTF-16LE (NUL-terminated) absolute path of appium-dotnet-bridge-core.dll
    // (see CoreClrAttacher.cs). cbClientData is a byte count; divide by 2 for wchar_t count, and
    // drop a trailing NUL if present so DefineUserString later doesn't embed one.
    if (pvClientData != nullptr && cbClientData >= sizeof(wchar_t))
    {
        size_t charCount = cbClientData / sizeof(wchar_t);
        auto* chars = static_cast<const wchar_t*>(pvClientData);
        if (chars[charCount - 1] == L'\0') charCount--;
        _bridgeCoreDllPath.assign(chars, charCount);
    }
    DebugLog("InitializeForAttach: bridgeCoreDllPath=%ls", _bridgeCoreDllPath.c_str());

    // COR_PRF_MONITOR_MODULE_LOADS: kept for ModuleLoadFinished as a fallback (see below).
    // COR_PRF_ENABLE_REJIT: required before RequestReJIT is callable at all.
    hr = _info->SetEventMask(COR_PRF_MONITOR_MODULE_LOADS | COR_PRF_ENABLE_REJIT | COR_PRF_MONITOR_EXCEPTIONS);
    DebugLog("InitializeForAttach: SetEventMask hr=0x%08lX", hr);
    if (FAILED(hr)) return hr;

    // COR_PRF_MONITOR_MODULE_LOADS only fires ModuleLoadFinished for modules loaded *after* this
    // call — CoreCLR does not replay historical load events, and attach normally happens well
    // after the target's anchor module is already loaded. EnumModules here covers that gap;
    // ModuleLoadFinished stays wired as a fallback for the rare race where attach beats startup.
    ScanLoadedModulesForAnchor();

    return S_OK;
}

void ProfilerCallback::ScanLoadedModulesForAnchor()
{
    if (_info == nullptr || _rejitRequested) return;

    ICorProfilerModuleEnum* moduleEnum = nullptr;
    HRESULT hr = _info->EnumModules(&moduleEnum);
    DebugLog("ScanLoadedModulesForAnchor: EnumModules hr=0x%08lX", hr);
    if (FAILED(hr) || moduleEnum == nullptr) return;

    ModuleID moduleId;
    ULONG fetched;
    int count = 0;
    while (!_rejitRequested && moduleEnum->Next(1, &moduleId, &fetched) == S_OK && fetched == 1)
    {
        count++;
        TryRequestReJitForAnchor(moduleId);
    }
    DebugLog("ScanLoadedModulesForAnchor: scanned %d already-loaded modules", count);
    moduleEnum->Release();
}

// ── Anchor discovery + ReJIT request ────────────────────────────────────────────────────────

HRESULT STDMETHODCALLTYPE ProfilerCallback::ModuleLoadFinished(ModuleID moduleId, HRESULT hrStatus)
{
    DebugLog("ModuleLoadFinished: moduleId=0x%llX hrStatus=0x%08lX", (unsigned long long)moduleId, hrStatus);
    if (SUCCEEDED(hrStatus) && !_rejitRequested)
        TryRequestReJitForAnchor(moduleId);
    return S_OK;
}

void ProfilerCallback::TryRequestReJitForAnchor(ModuleID moduleId)
{
    if (_info == nullptr || _rejitRequested) return;

    for (const auto& candidate : kAnchorCandidates)
    {
        mdMethodDef methodToken;
        if (!FindAnchorMethodToken(moduleId, candidate, &methodToken))
        {
            DebugLog("  candidate %ls::%ls not found in this module", candidate.typeName, candidate.methodName);
            continue;
        }

        DebugLog("  FOUND anchor %ls::%ls token=0x%08X — calling RequestReJIT", candidate.typeName, candidate.methodName, methodToken);
        ModuleID moduleIds[1] = { moduleId };
        mdMethodDef methodIds[1] = { methodToken };
        HRESULT hr = _info->RequestReJIT(1, moduleIds, methodIds);
        DebugLog("  RequestReJIT hr=0x%08lX", hr);
        if (SUCCEEDED(hr)) _rejitRequested = true;
        return; // found the right module either way — no point trying other candidates against it
    }
}

// Resolves candidate.typeName/methodName's mdMethodDef within moduleId, if this module is
// (by simple assembly name) the one the candidate expects. Best-effort: FindTypeDefByName can
// legitimately fail for a module that isn't the anchor's assembly, which is the common case for
// most ModuleLoadFinished calls — that's not an error, just "not this one."
bool ProfilerCallback::FindAnchorMethodToken(ModuleID moduleId, const AnchorCandidate& candidate, mdMethodDef* outToken)
{
    IMetaDataImport2* import = nullptr;
    HRESULT hr = _info->GetModuleMetaData(moduleId, ofRead, IID_IMetaDataImport2, (IUnknown**)&import);
    if (FAILED(hr) || import == nullptr) return false;

    bool found = false;
    mdTypeDef typeDef;
    hr = import->FindTypeDefByName(candidate.typeName, mdTokenNil, &typeDef);
    if (SUCCEEDED(hr))
    {
        mdMethodDef methodDef;
        // nullptr signature blob = match by name only, regardless of overload signature — Run()
        // has one relevant overload per candidate here, so this is unambiguous in practice.
        hr = import->FindMethod(typeDef, candidate.methodName, nullptr, 0, &methodDef);
        if (SUCCEEDED(hr))
        {
            *outToken = methodDef;
            found = true;
        }
    }

    import->Release();
    return found;
}

// ── ReJIT IL rewrite ─────────────────────────────────────────────────────────────────────────
//
// Injects Assembly.LoadFrom(absolutePath).GetType(...).GetMethod("BridgeStart").Invoke(null, null)
// rather than a bare `call` through a plain AssemblyRef to appium-dotnet-bridge-core.dll: CoreCLR's
// default AssemblyLoadContext only resolves assemblies listed in the target's own deps.json, so a
// plain AssemblyRef throws FileNotFoundException even with the DLL present next to the target's
// exe. Assembly/Type/MethodInfo live in System.Private.CoreLib, always resolvable via the anchor
// module's own AssemblyRef table (FindCoreLibAssemblyRef) rather than a hardcoded version/token.

namespace
{
    ULONG AppendCompressedToken(std::vector<BYTE>& sig, mdToken tok)
    {
        BYTE buf[4];
        ULONG n = CorSigCompressToken(tok, buf);
        sig.insert(sig.end(), buf, buf + n);
        return n;
    }

    // "RetType Method(string)" signature blob — covers LoadFrom(string)->Assembly (static,
    // IMAGE_CEE_CS_CALLCONV_DEFAULT) and GetType(string)/GetMethod(string) (instance, needs
    // IMAGE_CEE_CS_CALLCONV_HASTHIS ORed in) alike.
    std::vector<BYTE> BuildStringToClassSig(BYTE callConv, mdTypeRef retTypeRef)
    {
        std::vector<BYTE> sig;
        sig.push_back(callConv);
        sig.push_back(0x01); // param count
        sig.push_back(ELEMENT_TYPE_CLASS);
        AppendCompressedToken(sig, retTypeRef);
        sig.push_back(ELEMENT_TYPE_STRING);
        return sig;
    }

    // "object Invoke(object, object[])" — MethodBase.Invoke's real signature (declared on
    // MethodBase, inherited by MethodInfo; see the MemberRef parent comment below for why that's
    // fine to reference via the MethodInfo TypeRef instead of adding a 4th TypeRef for MethodBase).
    std::vector<BYTE> BuildInvokeSig()
    {
        std::vector<BYTE> sig;
        sig.push_back(IMAGE_CEE_CS_CALLCONV_HASTHIS);
        sig.push_back(0x02);
        sig.push_back(ELEMENT_TYPE_OBJECT);  // return
        sig.push_back(ELEMENT_TYPE_OBJECT);  // param1: target
        sig.push_back(ELEMENT_TYPE_SZARRAY);
        sig.push_back(ELEMENT_TYPE_OBJECT);  // param2: object[] args, element type
        return sig;
    }

    void AppendInstruction(std::vector<BYTE>& il, BYTE opcode, mdToken token)
    {
        il.push_back(opcode);
        const auto* bytes = reinterpret_cast<const BYTE*>(&token);
        il.insert(il.end(), bytes, bytes + sizeof(token)); // IL tokens are little-endian, native order on x86/x64
    }

    // Reuses the anchor module's own existing AssemblyRef to corelib instead of hardcoding a
    // version/public-key-token combo that would drift across .NET releases. System.Windows.Forms.dll
    // doesn't carry a direct AssemblyRef to "System.Private.CoreLib" — it's compiled against the
    // "System.Runtime" facade, which the runtime type-forwards to the real corelib — so try the
    // real name first, then the common facades in likelihood order.
    HRESULT FindCoreLibAssemblyRef(IMetaDataAssemblyImport* assemblyImport, mdAssemblyRef* outRef)
    {
        static const wchar_t* kCandidateNames[] = {
            L"System.Private.CoreLib", L"System.Runtime", L"mscorlib", L"netstandard"
        };

        HCORENUM henum = nullptr;
        mdAssemblyRef refs[64];
        ULONG count = 0;
        HRESULT hr = assemblyImport->EnumAssemblyRefs(&henum, refs, 64, &count);
        HRESULT result = FAILED(hr) ? hr : E_FAIL;
        if (SUCCEEDED(hr))
        {
            for (const wchar_t* candidateName : kCandidateNames)
            {
                for (ULONG i = 0; i < count; i++)
                {
                    const void* pk = nullptr; ULONG pkLen = 0;
                    WCHAR name[256]; ULONG nameLen = 0;
                    ASSEMBLYMETADATA meta = {};
                    const void* hash = nullptr; ULONG hashLen = 0;
                    DWORD flags = 0;
                    HRESULT propsHr = assemblyImport->GetAssemblyRefProps(
                        refs[i], &pk, &pkLen, name, 256, &nameLen, &meta, &hash, &hashLen, &flags);
                    if (SUCCEEDED(propsHr) && wcscmp(name, candidateName) == 0)
                    {
                        *outRef = refs[i];
                        result = S_OK;
                        break;
                    }
                }
                if (result == S_OK) break;
            }
        }
        if (result != S_OK)
        {
            DebugLog("  FindCoreLibAssemblyRef: no candidate matched among %lu AssemblyRefs:", count);
            for (ULONG i = 0; i < count; i++)
            {
                const void* pk = nullptr; ULONG pkLen = 0;
                WCHAR name[256]; ULONG nameLen = 0;
                ASSEMBLYMETADATA meta = {};
                const void* hash = nullptr; ULONG hashLen = 0;
                DWORD flags = 0;
                if (SUCCEEDED(assemblyImport->GetAssemblyRefProps(refs[i], &pk, &pkLen, name, 256, &nameLen, &meta, &hash, &hashLen, &flags)))
                    DebugLog("    - %ls", name);
            }
        }
        if (henum != nullptr) assemblyImport->CloseEnum(henum);
        return result;
    }
}

HRESULT STDMETHODCALLTYPE ProfilerCallback::GetReJITParameters(
    ModuleID moduleId, mdMethodDef methodId, ICorProfilerFunctionControl* pFunctionControl)
{
    DebugLog("GetReJITParameters: moduleId=0x%llX methodId=0x%08X", (unsigned long long)moduleId, methodId);
    if (_info == nullptr || pFunctionControl == nullptr)
    {
        ReportGenericStepFailure("GetReJITParameters entry (missing _info/pFunctionControl)", E_FAIL);
        return E_FAIL;
    }
    if (_bridgeCoreDllPath.empty())
    {
        // InitializeForAttach's client data (the bootstrap DLL's absolute path) was missing or
        // malformed — see CoreClrAttacher.cs, which is supposed to always send it.
        ReportGenericStepFailure("GetReJITParameters entry (bridgeCoreDllPath not set — client data missing)", E_UNEXPECTED);
        return E_UNEXPECTED;
    }

    IUnknown* metaUnk = nullptr;
    HRESULT hr = _info->GetModuleMetaData(moduleId, ofRead | ofWrite, IID_IMetaDataEmit2, &metaUnk);
    DebugLog("  GetModuleMetaData(Emit2) hr=0x%08lX", hr);
    if (FAILED(hr) || metaUnk == nullptr) { ReportGenericStepFailure("GetModuleMetaData(Emit2)", hr); return hr; }
    auto* emit = static_cast<IMetaDataEmit2*>(metaUnk);

    IUnknown* assemblyImportUnk = nullptr;
    hr = _info->GetModuleMetaData(moduleId, ofRead, IID_IMetaDataAssemblyImport, &assemblyImportUnk);
    if (FAILED(hr) || assemblyImportUnk == nullptr) { ReportGenericStepFailure("GetModuleMetaData(AssemblyImport)", hr); emit->Release(); return hr; }
    auto* assemblyImport = static_cast<IMetaDataAssemblyImport*>(assemblyImportUnk);

    mdAssemblyRef coreLibRef;
    hr = FindCoreLibAssemblyRef(assemblyImport, &coreLibRef);
    assemblyImport->Release();
    DebugLog("  FindCoreLibAssemblyRef hr=0x%08lX", hr);
    if (FAILED(hr)) { ReportGenericStepFailure("FindCoreLibAssemblyRef", hr); emit->Release(); return hr; }

    mdTypeRef typeRefAssembly = mdTypeRefNil, typeRefType = mdTypeRefNil, typeRefMethodInfo = mdTypeRefNil;
    hr = emit->DefineTypeRefByName(coreLibRef, L"System.Reflection.Assembly", &typeRefAssembly);
    if (SUCCEEDED(hr)) hr = emit->DefineTypeRefByName(coreLibRef, L"System.Type", &typeRefType);
    if (SUCCEEDED(hr)) hr = emit->DefineTypeRefByName(coreLibRef, L"System.Reflection.MethodInfo", &typeRefMethodInfo);
    DebugLog("  DefineTypeRefByName(Assembly/Type/MethodInfo) hr=0x%08lX", hr);
    if (FAILED(hr)) { ReportGenericStepFailure("DefineTypeRefByName", hr); emit->Release(); return hr; }

    auto loadFromSig = BuildStringToClassSig(IMAGE_CEE_CS_CALLCONV_DEFAULT, typeRefAssembly);
    mdMemberRef loadFromRef = mdMemberRefNil;
    hr = emit->DefineMemberRef(typeRefAssembly, L"LoadFrom", loadFromSig.data(), (ULONG)loadFromSig.size(), &loadFromRef);

    mdMemberRef getTypeRef = mdMemberRefNil;
    if (SUCCEEDED(hr))
    {
        auto getTypeSig = BuildStringToClassSig(IMAGE_CEE_CS_CALLCONV_HASTHIS, typeRefType);
        hr = emit->DefineMemberRef(typeRefAssembly, L"GetType", getTypeSig.data(), (ULONG)getTypeSig.size(), &getTypeRef);
    }

    mdMemberRef getMethodRef = mdMemberRefNil;
    if (SUCCEEDED(hr))
    {
        auto getMethodSig = BuildStringToClassSig(IMAGE_CEE_CS_CALLCONV_HASTHIS, typeRefMethodInfo);
        hr = emit->DefineMemberRef(typeRefType, L"GetMethod", getMethodSig.data(), (ULONG)getMethodSig.size(), &getMethodRef);
    }

    // Parent = MethodInfo's TypeRef even though Invoke is declared on MethodBase: the CLR
    // resolves a MemberRef by walking the parent type's hierarchy for a matching inherited
    // member, so this doesn't need a 4th TypeRef just for MethodBase.
    mdMemberRef invokeRef = mdMemberRefNil;
    if (SUCCEEDED(hr))
    {
        auto invokeSig = BuildInvokeSig();
        hr = emit->DefineMemberRef(typeRefMethodInfo, L"Invoke", invokeSig.data(), (ULONG)invokeSig.size(), &invokeRef);
    }
    DebugLog("  DefineMemberRef(LoadFrom/GetType/GetMethod/Invoke) hr=0x%08lX", hr);
    if (FAILED(hr)) { ReportGenericStepFailure("DefineMemberRef", hr); emit->Release(); return hr; }

    mdString pathTok = mdStringNil, typeNameTok = mdStringNil, methodNameTok = mdStringNil;
    hr = emit->DefineUserString(_bridgeCoreDllPath.c_str(), (ULONG)_bridgeCoreDllPath.size(), &pathTok);
    static const wchar_t kEntryPointTypeName[] = L"AppiumDotNetBridgeCore.EntryPoint";
    static const wchar_t kBridgeStartMethodName[] = L"BridgeStart";
    if (SUCCEEDED(hr)) hr = emit->DefineUserString(kEntryPointTypeName, (ULONG)(_countof(kEntryPointTypeName) - 1), &typeNameTok);
    if (SUCCEEDED(hr)) hr = emit->DefineUserString(kBridgeStartMethodName, (ULONG)(_countof(kBridgeStartMethodName) - 1), &methodNameTok);
    DebugLog("  DefineUserString(path/typeName/methodName) hr=0x%08lX", hr);
    emit->Release();
    if (FAILED(hr)) { ReportGenericStepFailure("DefineUserString", hr); return hr; }

    // Assembly.LoadFrom(path).GetType("...EntryPoint").GetMethod("BridgeStart").Invoke(null, null)
    // — max stack depth 3 (reached right before the Invoke call: MethodInfo + null + null).
    const BYTE kOpLdstr = 0x72, kOpCall = 0x28, kOpCallvirt = 0x6F, kOpLdnull = 0x14, kOpPop = 0x26;
    std::vector<BYTE> injected;
    AppendInstruction(injected, kOpLdstr, pathTok);
    AppendInstruction(injected, kOpCall, loadFromRef);
    AppendInstruction(injected, kOpLdstr, typeNameTok);
    AppendInstruction(injected, kOpCallvirt, getTypeRef);
    AppendInstruction(injected, kOpLdstr, methodNameTok);
    AppendInstruction(injected, kOpCallvirt, getMethodRef);
    injected.push_back(kOpLdnull);
    injected.push_back(kOpLdnull);
    AppendInstruction(injected, kOpCallvirt, invokeRef);
    injected.push_back(kOpPop);
    const unsigned kInjectedMaxStackNeeded = 3;

    // GetILFunctionBody returns the *entire* IL blob (its own TINY-or-FAT header, then raw code,
    // then optionally an EH-clause section) — not just code bytes. Have to parse past that header
    // to find where the actual code starts before splicing anything in front of it.
    LPCBYTE originalBlob = nullptr;
    ULONG originalBlobSize = 0;
    hr = _info->GetILFunctionBody(moduleId, methodId, &originalBlob, &originalBlobSize);
    if (FAILED(hr)) { ReportGenericStepFailure("GetILFunctionBody", hr); return hr; }
    if (originalBlobSize < 1) { ReportGenericStepFailure("GetILFunctionBody", E_UNEXPECTED); return E_UNEXPECTED; }

    BYTE headerFlags = originalBlob[0];
    BYTE format = headerFlags & CorILMethod_FormatMask;

    ULONG codeOffset;
    DWORD codeSize;
    mdSignature localVarSigTok;
    bool hasMoreSects;
    unsigned originalMaxStack;

    if (format == CorILMethod_TinyFormat || format == CorILMethod_TinyFormat1)
    {
        codeOffset = 1;
        codeSize = (DWORD)(headerFlags >> 2); // upper 6 bits of the single flags/size byte
        localVarSigTok = 0;
        hasMoreSects = false; // TinyFormat is defined to never have extra sections
        originalMaxStack = 8; // TinyFormat's defined constraint: maxstack always <= 8
    }
    else if (format == CorILMethod_FatFormat)
    {
        if (originalBlobSize < sizeof(IMAGE_COR_ILMETHOD_FAT))
        {
            ReportGenericStepFailure("parse FAT header (blob too small)", E_UNEXPECTED);
            return E_UNEXPECTED;
        }
        const auto* fat = reinterpret_cast<const IMAGE_COR_ILMETHOD_FAT*>(originalBlob);
        codeOffset = fat->Size * 4u; // Size is the FAT header's own length in DWORDs
        codeSize = fat->CodeSize;
        localVarSigTok = fat->LocalVarSigTok;
        hasMoreSects = (fat->Flags & CorILMethod_MoreSects) != 0;
        originalMaxStack = fat->MaxStack;
    }
    else
    {
        // unknown/compressed format — not handled
        ReportGenericStepFailure("parse method header (unknown format)", E_UNEXPECTED);
        return E_UNEXPECTED;
    }

    // A method with EH clauses (try/catch/finally) has a clause table after the code whose
    // offsets are absolute from the start of the code, not self-relative like branches — prepending
    // our call shifts every offset by injectedSize, which isn't rewritten yet. Bail out cleanly
    // (this ReJIT attempt fails, profiler keeps running) rather than emit corrupted IL. Real fix
    // needs to walk and rewrite the IMAGE_COR_ILMETHOD_SECT_EH_{SMALL,FAT} clause table.
    DebugLog("  format=%d codeOffset=%lu codeSize=%lu hasMoreSects=%d", format, codeOffset, codeSize, hasMoreSects);
    if (hasMoreSects)
    {
        DebugLog("  BAILING: method has EH clauses, not rewritten");
        ReportAttachFailure(
            "CoreCLR bridge: the anchor method (System.Windows.Forms.Control.WndProc) has "
            "exception-handling clauses (try/catch/finally) in this .NET runtime's compiled "
            "System.Windows.Forms.dll. Rewriting such methods is NOT YET SUPPORTED by this "
            "profiler (see dotnet-bridge-agent/CORECLR-BRIDGE-SPEC.md, 'Known remaining "
            "limitations' — the EH clause offset table needs to be walked and corrected for the "
            "inserted bytes, which is not implemented). This is a known, scoped gap, not a bug: "
            "if you're hitting this, please file it so it can be prioritized for a real fix.");
        return CORPROF_E_NOT_REJITABLE_METHODS;
    }

    const DWORD injectedSize = (DWORD)injected.size();
    const DWORD newCodeSize = injectedSize + codeSize;

    std::vector<BYTE> newBody(sizeof(IMAGE_COR_ILMETHOD_FAT) + newCodeSize);
    auto* fat = reinterpret_cast<IMAGE_COR_ILMETHOD_FAT*>(newBody.data());
    fat->Flags = CorILMethod_FatFormat;
    fat->Size = sizeof(IMAGE_COR_ILMETHOD_FAT) / 4; // in DWORDs, per the struct's own comment
    // Must preserve the original MaxStack, not hardcode one — a value too small for the original
    // method corrupts it. Our injected sequence peaks at kInjectedMaxStackNeeded and fully unwinds
    // before the original code runs, so the true requirement is whichever of the two is larger.
    fat->MaxStack = originalMaxStack > kInjectedMaxStackNeeded ? originalMaxStack : kInjectedMaxStackNeeded;
    fat->CodeSize = newCodeSize;
    fat->LocalVarSigTok = localVarSigTok; // preserved from the original — locals keep working

    BYTE* code = newBody.data() + sizeof(IMAGE_COR_ILMETHOD_FAT);
    memcpy(code, injected.data(), injectedSize);
    memcpy(code + injectedSize, originalBlob + codeOffset, codeSize);

    hr = pFunctionControl->SetILFunctionBody(static_cast<ULONG>(newBody.size()), newBody.data());
    DebugLog("  SetILFunctionBody hr=0x%08lX", hr);
    if (FAILED(hr)) ReportGenericStepFailure("SetILFunctionBody", hr);
    return hr;
}

HRESULT STDMETHODCALLTYPE ProfilerCallback::ReJITCompilationStarted(FunctionID, ReJITID, BOOL)
{
    return S_OK;
}

HRESULT STDMETHODCALLTYPE ProfilerCallback::ReJITCompilationFinished(FunctionID, ReJITID, HRESULT, BOOL)
{
    return S_OK;
}

HRESULT STDMETHODCALLTYPE ProfilerCallback::ReJITError(ModuleID, mdMethodDef, FunctionID, HRESULT)
{
    return S_OK;
}

// Diagnostic-only — logs which exception type was thrown inside the target, for debugging.
HRESULT STDMETHODCALLTYPE ProfilerCallback::ExceptionThrown(ObjectID thrownObjectId)
{
    ClassID classId = 0;
    HRESULT hr = _info->GetClassFromObject(thrownObjectId, &classId);
    if (FAILED(hr)) { DebugLog("ExceptionThrown: GetClassFromObject failed hr=0x%08lX", hr); return S_OK; }

    ModuleID moduleId = 0;
    mdTypeDef typeDef = 0;
    hr = _info->GetClassIDInfo(classId, &moduleId, &typeDef);
    if (FAILED(hr)) { DebugLog("ExceptionThrown: GetClassIDInfo failed hr=0x%08lX", hr); return S_OK; }

    IUnknown* metaUnk = nullptr;
    hr = _info->GetModuleMetaData(moduleId, ofRead, IID_IMetaDataImport, &metaUnk);
    if (FAILED(hr) || metaUnk == nullptr) { DebugLog("ExceptionThrown: GetModuleMetaData failed hr=0x%08lX", hr); return S_OK; }
    auto* import = static_cast<IMetaDataImport*>(metaUnk);

    WCHAR typeName[512];
    ULONG nameLen = 0;
    DWORD typeFlags = 0;
    mdToken baseType = 0;
    hr = import->GetTypeDefProps(typeDef, typeName, 512, &nameLen, &typeFlags, &baseType);
    if (SUCCEEDED(hr))
        DebugLog("ExceptionThrown: type=%ls", typeName);
    else
        DebugLog("ExceptionThrown: GetTypeDefProps failed hr=0x%08lX", hr);

    import->Release();
    return S_OK;
}
