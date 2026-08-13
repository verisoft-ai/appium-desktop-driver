// UNVERIFIED — written without a C++/CLI (MSVC) toolchain available to compile it.
// Needs a Windows + Visual Studio box (Desktop development with C++ workload, "C++/CLI support"
// individual component) for a first build and debug pass. Treat everything below as a strong
// first draft of the intended design, not tested code.
//
// This DLL is injected into a target .NET Framework process (see BridgeInjector.cs on the C#
// host side: LoadLibraryW, then a second CreateRemoteThread into the exported BridgeStart below).
// Because it's compiled with /clr (C++/CLI, "mixed mode"), a single binary can expose a plain
// native export while also containing ordinary managed C# runs directly inside the DLL — that's
// why this doesn't need a separate managed assembly the way the Java bridge splits injector vs.
// agent JAR.
//
// Wire protocol mirrors the Java Swing bridge deliberately: newline-delimited JSON-RPC over a
// loopback TCP socket, port advertised via %TEMP%\appium-dotnet-bridge-{pid}.port. See
// BridgeAgentService.cs on the C# host side for the client, and java-agent/CommandHandler.java
// for the condition-matching semantics this mirrors.

#include <windows.h>

// windows.h #defines GetTempPath to GetTempPathW (via the UNICODE macros below) — that silently
// rewrites Path::GetTempPath() calls further down to a nonexistent Path::GetTempPathW(). Undefine
// it since this file has no need for the raw Win32 API under that name.
#undef GetTempPath

// #using is the C++/CLI directive that actually imports a managed assembly's metadata (distinct
// from `using namespace`, a plain C++ construct that only works once the assembly defining that
// namespace has been #using-imported). Without these, every "using namespace System::..." below
// resolves to nothing and the compiler reports the namespaces as not existing.
#using <mscorlib.dll>
#using <System.dll>
#using <System.Drawing.dll>
#using <System.Windows.Forms.dll>
#using <WindowsBase.dll>
#using <PresentationCore.dll>
#using <PresentationFramework.dll>
#using <System.Xaml.dll>

using namespace System;
using namespace System::IO;
using namespace System::Text;
using namespace System::Net;
using namespace System::Net::Sockets;
using namespace System::Threading;
using namespace System::Collections::Generic;
using namespace System::Reflection;
using namespace System::Windows::Forms;
using namespace System::Windows;
using namespace System::Windows::Media;

namespace AppiumDotNetBridge {

// ── Minimal JSON (no external dependency — this DLL runs inside an arbitrary host process,
//    so it can't assume System.Text.Json or any NuGet package is resolvable there; same reason
//    java-agent/Json.java is hand-rolled instead of using a JSON library). ────────────────────

public ref class Json abstract sealed
{
public:
    // Parses into: Dictionary<String^,Object^>^ (object), List<Object^>^ (array),
    // String^, double (boxed), bool (boxed), or nullptr.
    static Object^ Parse(String^ text)
    {
        int pos = 0;
        return ParseValue(text, pos);
    }

    static String^ Write(Object^ value)
    {
        auto sb = gcnew StringBuilder();
        WriteValue(value, sb);
        return sb->ToString();
    }

private:
    static void SkipWs(String^ s, int% pos)
    {
        while (pos < s->Length && Char::IsWhiteSpace(s[pos])) pos++;
    }

    static Object^ ParseValue(String^ s, int% pos)
    {
        SkipWs(s, pos);
        if (pos >= s->Length) return nullptr;
        wchar_t c = s[pos];
        if (c == '{') return ParseObject(s, pos);
        if (c == '[') return ParseArray(s, pos);
        if (c == '"') return ParseString(s, pos);
        if (s->Length - pos >= 4 && s->Substring(pos, 4) == "true") { pos += 4; return (Object^)true; }
        if (s->Length - pos >= 5 && s->Substring(pos, 5) == "false") { pos += 5; return (Object^)false; }
        if (s->Length - pos >= 4 && s->Substring(pos, 4) == "null") { pos += 4; return nullptr; }
        return ParseNumber(s, pos);
    }

    static Dictionary<String^, Object^>^ ParseObject(String^ s, int% pos)
    {
        auto dict = gcnew Dictionary<String^, Object^>();
        pos++; // '{'
        SkipWs(s, pos);
        if (pos < s->Length && s[pos] == '}') { pos++; return dict; }
        while (true)
        {
            SkipWs(s, pos);
            String^ key = ParseString(s, pos);
            SkipWs(s, pos);
            pos++; // ':'
            Object^ val = ParseValue(s, pos);
            dict[key] = val;
            SkipWs(s, pos);
            if (pos < s->Length && s[pos] == ',') { pos++; continue; }
            if (pos < s->Length && s[pos] == '}') { pos++; break; }
            break;
        }
        return dict;
    }

    static List<Object^>^ ParseArray(String^ s, int% pos)
    {
        auto list = gcnew List<Object^>();
        pos++; // '['
        SkipWs(s, pos);
        if (pos < s->Length && s[pos] == ']') { pos++; return list; }
        while (true)
        {
            Object^ val = ParseValue(s, pos);
            list->Add(val);
            SkipWs(s, pos);
            if (pos < s->Length && s[pos] == ',') { pos++; continue; }
            if (pos < s->Length && s[pos] == ']') { pos++; break; }
            break;
        }
        return list;
    }

    static String^ ParseString(String^ s, int% pos)
    {
        auto sb = gcnew StringBuilder();
        pos++; // opening quote
        while (pos < s->Length && s[pos] != '"')
        {
            wchar_t c = s[pos];
            if (c == '\\' && pos + 1 < s->Length)
            {
                pos++;
                wchar_t esc = s[pos];
                switch (esc)
                {
                case 'n': sb->Append('\n'); break;
                case 't': sb->Append('\t'); break;
                case 'r': sb->Append('\r'); break;
                case '"': sb->Append('"'); break;
                case '\\': sb->Append('\\'); break;
                case '/': sb->Append('/'); break;
                case 'u':
                {
                    String^ hex = s->Substring(pos + 1, 4);
                    int code = Convert::ToInt32(hex, 16);
                    sb->Append((wchar_t)code);
                    pos += 4;
                    break;
                }
                default: sb->Append(esc); break;
                }
            }
            else
            {
                sb->Append(c);
            }
            pos++;
        }
        pos++; // closing quote
        return sb->ToString();
    }

    static Object^ ParseNumber(String^ s, int% pos)
    {
        int start = pos;
        while (pos < s->Length && (Char::IsDigit(s[pos]) || s[pos] == '-' || s[pos] == '+' || s[pos] == '.' || s[pos] == 'e' || s[pos] == 'E'))
            pos++;
        String^ numStr = s->Substring(start, pos - start);
        double d;
        Double::TryParse(numStr, d);
        return (Object^)d;
    }

    static void WriteValue(Object^ value, StringBuilder^ sb)
    {
        if (value == nullptr) { sb->Append("null"); return; }
        if (auto s = dynamic_cast<String^>(value)) { WriteString(s, sb); return; }
        if (auto b = dynamic_cast<Boolean^>(value)) { sb->Append(*b ? "true" : "false"); return; }
        if (auto d = dynamic_cast<Double^>(value)) { sb->Append(Convert::ToString(*d, Globalization::CultureInfo::InvariantCulture)); return; }
        if (auto i = dynamic_cast<Int32^>(value)) { sb->Append(Convert::ToString(*i)); return; }
        if (auto dict = dynamic_cast<Dictionary<String^, Object^>^>(value))
        {
            sb->Append("{");
            bool first = true;
            for each (KeyValuePair<String^, Object^> kv in dict)
            {
                if (!first) sb->Append(",");
                first = false;
                WriteString(kv.Key, sb);
                sb->Append(":");
                WriteValue(kv.Value, sb);
            }
            sb->Append("}");
            return;
        }
        if (auto list = dynamic_cast<System::Collections::IEnumerable^>(value))
        {
            sb->Append("[");
            bool first = true;
            for each (Object^ item in list)
            {
                if (!first) sb->Append(",");
                first = false;
                WriteValue(item, sb);
            }
            sb->Append("]");
            return;
        }
        // Fallback: stringify.
        WriteString(value->ToString(), sb);
    }

    static void WriteString(String^ s, StringBuilder^ sb)
    {
        sb->Append("\"");
        for (int i = 0; i < s->Length; i++)
        {
            wchar_t c = s[i];
            switch (c)
            {
            case '"': sb->Append("\\\""); break;
            case '\\': sb->Append("\\\\"); break;
            case '\n': sb->Append("\\n"); break;
            case '\r': sb->Append("\\r"); break;
            case '\t': sb->Append("\\t"); break;
            default:
                if (c < 0x20) sb->AppendFormat("\\u{0:x4}", (int)c);
                else sb->Append(c);
            }
        }
        sb->Append("\"");
    }
};

// ── Element registry ────────────────────────────────────────────────────────────────────────

public ref class ElementRegistry abstract sealed
{
public:
    static Dictionary<String^, Object^>^ Elements = gcnew Dictionary<String^, Object^>();
    static int Counter = 0;
    static int Pid = 0;

    static String^ Save(Object^ target)
    {
        String^ id = String::Format("dotnet:{0}:{1}", Pid, ++Counter);
        Elements[id] = target;
        return id;
    }

    static Object^ Get(String^ id)
    {
        Object^ v = nullptr;
        Elements->TryGetValue(id, v);
        return v;
    }
};

// ── Synthetic wrapper objects for DevExpress GridView rows/cells — these have no backing
//    Control or DependencyObject of their own (GridView paints rows/cells internally, they're
//    never real child objects), so ElementRegistry::Save (which accepts any Object^) stores one
//    of these instead. Everything downstream (getInfo/getChildren/getValue/find) already goes
//    through Object^-generic dispatch, so no changes are needed outside Reflector for these to
//    work as first-class elements. ────────────────────────────────────────────────────────────

public ref class GridRowHandle
{
public:
    Object^ View;   // the GridView (held as Object^ — no compile-time DevExpress reference)
    int RowHandle;

    GridRowHandle(Object^ view, int rowHandle) : View(view), RowHandle(rowHandle) {}
};

public ref class GridCellHandle
{
public:
    Object^ View;
    int RowHandle;
    Object^ Column;   // the runtime GridColumn object
    String^ Caption;
    String^ FieldName;

    GridCellHandle(Object^ view, int rowHandle, Object^ column, String^ caption, String^ fieldName)
        : View(view), RowHandle(rowHandle), Column(column), Caption(caption), FieldName(fieldName) {}
};

// Synthetic wrapper for a "virtual" list item — for any Control that paints its own rows and
// isn't a real ListBox/ComboBox (so has no ListBox.Items to be real child objects). Unlike
// GridRowHandle/GridCellHandle, this is not tied to any specific fixture or 3rd-party control:
// TryGetOwnerDrawListItems below picks up ANY Control that exposes the ItemCount/GetItemText/
// SelectItem convention via reflection, so both our own test fixtures and, in principle, a real
// customer control following the same shape would work without the bridge needing to know about
// the concrete type at compile time — same reflection-only discipline as the DevExpress adapter.
public ref class ListItemHandle
{
public:
    Object^ Owner;   // the owning Control (held as Object^ — no compile-time fixture reference)
    int Index;

    ListItemHandle(Object^ owner, int index) : Owner(owner), Index(index) {}
};

// Synthetic wrapper for a "virtual" tree node — same convention-based, no-compile-time-reference
// discipline as ListItemHandle. Node ids are owner-defined ints (not necessarily contiguous),
// -1 is the reserved "root" parent id. TryGetTreeRootNodes/GetChildren below only descend into a
// node's children when the owner itself reports it expanded — that's what makes
// Reflector::Expand's ToggleExpand call observable (children genuinely absent until expanded),
// not a no-op that always returns the same full tree regardless of expand state.
public ref class TreeNodeHandle
{
public:
    Object^ Owner;
    int NodeId;

    TreeNodeHandle(Object^ owner, int nodeId) : Owner(owner), NodeId(nodeId) {}
};

// C++/CLI lambdas cannot capture managed-typed locals for delegate construction, so a tiny
// closure object stands in for GetDevExpressRowCellValue's Control.Invoke marshaling.
ref class CellValueInvoker
{
    MethodInfo^ _method;
    Object^ _view;
    int _rowHandle;
    Object^ _column;

public:
    CellValueInvoker(MethodInfo^ method, Object^ view, int rowHandle, Object^ column)
        : _method(method), _view(view), _rowHandle(rowHandle), _column(column) {}

    Object^ Run()
    {
        return _method->Invoke(_view, gcnew array<Object^> { _rowHandle, _column });
    }
};

// ── Reflection over WinForms / WPF trees, plus a best-effort DevExpress adapter that reads
//    common property names via pure reflection (no compile-time reference to DevExpress
//    assemblies — keeps this DLL license-free to build). ───────────────────────────────────

public ref class Reflector abstract sealed
{
public:
    // Finds a real Control near `target` whose handle lives on the actual WinForms UI thread —
    // used by BridgeServer::Dispatch to marshal every mutating command (invoke/select/expand/
    // setValue/requestFocus) via Control.Invoke before touching WinForms state. Without this,
    // those commands run directly on the bridge's TCP connection-handling thread, which is a
    // plain background Thread (never marked STA, never pumps a Windows message loop) — calling
    // WinForms UI-creating code from it (e.g. a fixture's PerformClick spawning a popup Form)
    // is a real threading violation that fails silently: the RPC call returns successfully but
    // the resulting window is never actually functional. GetDevExpressRowCellValue already had
    // to work around this exact problem locally (ctrl->Invoke(...)) before this existed.
    static Control^ FindUiThreadControl(Object^ target)
    {
        if (auto ctrl = dynamic_cast<Control^>(target)) return ctrl;
        if (auto item = dynamic_cast<ListItemHandle^>(target)) return dynamic_cast<Control^>(item->Owner);
        if (auto node = dynamic_cast<TreeNodeHandle^>(target)) return dynamic_cast<Control^>(node->Owner);
        if (auto row = dynamic_cast<GridRowHandle^>(target)) return GridControlOf(row->View);
        if (auto cell = dynamic_cast<GridCellHandle^>(target)) return GridControlOf(cell->View);
        return nullptr;
    }

    static Object^ GetWindowRoot(long long hwndValue)
    {
        IntPtr hwnd = IntPtr((void*)hwndValue);

        // Try WinForms first.
        Control^ ctrl = Control::FromHandle(hwnd);
        if (ctrl != nullptr) return ctrl;

        // Fall back to WPF: the HWND hosts a PresentationSource whose RootVisual is the tree root.
        try
        {
            auto hwndSourceType = Type::GetType("System.Windows.Interop.HwndSource, PresentationFramework");
            if (hwndSourceType != nullptr)
            {
                auto fromHwnd = hwndSourceType->GetMethod("FromHwnd", BindingFlags::Public | BindingFlags::Static);
                Object^ source = fromHwnd->Invoke(nullptr, gcnew array<Object^> { hwnd });
                if (source != nullptr)
                {
                    auto rootVisualProp = source->GetType()->GetProperty("RootVisual");
                    return rootVisualProp->GetValue(source, nullptr);
                }
            }
        }
        catch (Exception^) { /* not a WPF window either */ }

        return nullptr;
    }

    static List<Object^>^ GetChildren(Object^ target)
    {
        auto result = gcnew List<Object^>();

        if (auto rowsFromGrid = TryGetDevExpressGridRows(target))
            return rowsFromGrid;
        if (auto row = dynamic_cast<GridRowHandle^>(target))
            return GetDevExpressGridCells(row);
        if (auto listItems = TryGetOwnerDrawListItems(target))
            return listItems;
        if (auto rootNodes = TryGetTreeRootNodes(target))
            return rootNodes;
        if (auto node = dynamic_cast<TreeNodeHandle^>(target))
            return GetTreeNodeChildren(node);

        if (auto ctrl = dynamic_cast<Control^>(target))
        {
            for each (Control ^ child in ctrl->Controls)
                result->Add(child);
            return result;
        }
        if (auto dep = dynamic_cast<DependencyObject^>(target))
        {
            int count = VisualTreeHelper::GetChildrenCount(dep);
            for (int i = 0; i < count; i++)
                result->Add(VisualTreeHelper::GetChild(dep, i));
            return result;
        }
        return result;
    }

    static Dictionary<String^, Object^>^ BuildInfo(Object^ target)
    {
        auto info = gcnew Dictionary<String^, Object^>();
        if (target == nullptr) return info;

        // GridRowHandle/GridCellHandle are synthetic — neither a Control nor a DependencyObject —
        // so they need their own branch before the generic ones below.
        if (auto row = dynamic_cast<GridRowHandle^>(target))
        {
            info["ClassName"] = "GridRow";
            info["LocalizedControlType"] = "GridRow";
            info["Name"] = String::Format("Row {0}", row->RowHandle + 1);
            info["AutomationId"] = "";
            info["Description"] = "";
            info["x"] = 0.0; info["y"] = 0.0; info["width"] = 0.0; info["height"] = 0.0;
            info["IsEnabled"] = true;
            info["IsOffscreen"] = false;

            // Reflects the view's real FocusedRowHandle live on every getInfo/getChildren call —
            // this is what makes Reflector::Select's FocusedRowHandle write observable from the
            // outside, rather than a test only being able to assert "the call didn't throw."
            bool isSelected = false;
            try
            {
                auto focusedRowHandleProp = row->View->GetType()->GetProperty("FocusedRowHandle");
                if (focusedRowHandleProp != nullptr)
                {
                    int focused = safe_cast<int>(focusedRowHandleProp->GetValue(row->View, nullptr));
                    isSelected = focused == row->RowHandle;
                }
            }
            catch (Exception^) { /* best-effort — leave isSelected false */ }
            info["IsSelected"] = isSelected;
            return info;
        }
        if (auto cell = dynamic_cast<GridCellHandle^>(target))
        {
            info["ClassName"] = "GridCell";
            info["LocalizedControlType"] = "GridCell";
            info["Name"] = String::Format("{0} row {1}", cell->Caption, cell->RowHandle + 1);
            info["AutomationId"] = cell->FieldName;
            info["Description"] = "";
            info["x"] = 0.0; info["y"] = 0.0; info["width"] = 0.0; info["height"] = 0.0;
            info["IsEnabled"] = true;
            info["IsOffscreen"] = false;

            Object^ value = GetDevExpressRowCellValue(cell->View, cell->RowHandle, cell->Column);
            info["Value"] = value != nullptr ? value->ToString() : "";
            return info;
        }
        if (auto item = dynamic_cast<ListItemHandle^>(target))
        {
            auto ownerType = item->Owner->GetType();
            // "ListItem" (unlike "GridRow"/"GridCell") is a real UIA ControlType name — an xpath
            // node test like //ListItem would build a real ControlType==ListItem condition
            // instead of falling back to the ClassName match this bridge understands, silently
            // matching nothing. Prefixed to guarantee no collision with any current or future
            // real UIA ControlType.
            info["ClassName"] = "BridgeListItem";
            info["LocalizedControlType"] = "BridgeListItem";
            info["AutomationId"] = "";
            info["Description"] = "";
            info["IsEnabled"] = true;
            info["IsOffscreen"] = false;

            auto getItemTextMethod = ownerType->GetMethod("GetItemText", gcnew array<Type^> { int::typeid });
            String^ text = getItemTextMethod != nullptr
                ? (String^)getItemTextMethod->Invoke(item->Owner, gcnew array<Object^> { item->Index })
                : "";
            info["Name"] = text;
            info["Value"] = text;

            // Optional SelectedIndex convention — reflects live selection state so tests can
            // assert selectElement actually changed something, not just "the call didn't throw"
            // (same reasoning as GridRowHandle's IsSelected added in the invoke/select split).
            bool isSelected = false;
            auto selectedIndexProp = ownerType->GetProperty("SelectedIndex");
            if (selectedIndexProp != nullptr)
            {
                try
                {
                    int selected = safe_cast<int>(selectedIndexProp->GetValue(item->Owner, nullptr));
                    isSelected = selected == item->Index;
                }
                catch (Exception^) { /* best-effort — leave isSelected false */ }
            }
            info["IsSelected"] = isSelected;

            // Optional GetItemBounds(int) convention — cheap for fixtures we control, gives
            // native mouse .click() real coordinates instead of the 0,0,0,0 GridRowHandle/
            // GridCellHandle currently fall back to.
            info["x"] = 0.0; info["y"] = 0.0; info["width"] = 0.0; info["height"] = 0.0;
            auto getItemBoundsMethod = ownerType->GetMethod("GetItemBounds", gcnew array<Type^> { int::typeid });
            auto ownerCtrl = dynamic_cast<Control^>(item->Owner);
            if (getItemBoundsMethod != nullptr && ownerCtrl != nullptr)
            {
                try
                {
                    Object^ boundsObj = getItemBoundsMethod->Invoke(item->Owner, gcnew array<Object^> { item->Index });
                    auto bounds = safe_cast<System::Drawing::Rectangle>(boundsObj);
                    System::Drawing::Point screenTopLeft = ownerCtrl->PointToScreen(System::Drawing::Point(bounds.X, bounds.Y));
                    info["x"] = (double)screenTopLeft.X;
                    info["y"] = (double)screenTopLeft.Y;
                    info["width"] = (double)bounds.Width;
                    info["height"] = (double)bounds.Height;
                }
                catch (Exception^) { /* best-effort — leave 0,0,0,0 */ }
            }
            return info;
        }
        if (auto node = dynamic_cast<TreeNodeHandle^>(target))
        {
            auto ownerType = node->Owner->GetType();
            info["ClassName"] = "BridgeTreeNode"; // avoid colliding with the real UIA "TreeItem"
            info["LocalizedControlType"] = "BridgeTreeNode";
            info["AutomationId"] = "";
            info["Description"] = "";
            info["IsEnabled"] = true;
            info["IsOffscreen"] = false;
            info["x"] = 0.0; info["y"] = 0.0; info["width"] = 0.0; info["height"] = 0.0;

            auto getNodeTextMethod = ownerType->GetMethod("GetNodeText", gcnew array<Type^> { int::typeid });
            String^ text = (String^)getNodeTextMethod->Invoke(node->Owner, gcnew array<Object^> { node->NodeId });
            info["Name"] = text;
            info["Value"] = text;

            auto hasChildrenMethod = ownerType->GetMethod("NodeHasChildren", gcnew array<Type^> { int::typeid });
            info["HasChildren"] = safe_cast<bool>(hasChildrenMethod->Invoke(node->Owner, gcnew array<Object^> { node->NodeId }));

            auto isExpandedMethod = ownerType->GetMethod("IsNodeExpanded", gcnew array<Type^> { int::typeid });
            info["IsExpanded"] = safe_cast<bool>(isExpandedMethod->Invoke(node->Owner, gcnew array<Object^> { node->NodeId }));
            return info;
        }

        info["ClassName"] = target->GetType()->Name;
        info["LocalizedControlType"] = target->GetType()->Name;

        if (auto ctrl = dynamic_cast<Control^>(target))
        {
            info["Name"] = ctrl->Name != nullptr ? ctrl->Name : "";
            info["AutomationId"] = ctrl->Name != nullptr ? ctrl->Name : "";
            info["Description"] = "";
            try
            {
                System::Drawing::Point screenPt = ctrl->Parent != nullptr
                    ? ctrl->Parent->PointToScreen(ctrl->Location)
                    : ctrl->Location;
                info["x"] = (double)screenPt.X;
                info["y"] = (double)screenPt.Y;
            }
            catch (Exception^) { info["x"] = 0.0; info["y"] = 0.0; }
            info["width"] = (double)ctrl->Width;
            info["height"] = (double)ctrl->Height;
            info["IsEnabled"] = ctrl->Enabled;
            info["IsOffscreen"] = !ctrl->Visible;

            // Text-bearing controls (labels, textboxes, buttons) — surfaced as "Name" fallback too,
            // matching how UIA usually reports a control's accessible Name from its Text.
            try
            {
                auto textProp = target->GetType()->GetProperty("Text");
                if (textProp != nullptr)
                {
                    String^ text = (String^)textProp->GetValue(target, nullptr);
                    if (!String::IsNullOrEmpty(text) && String::IsNullOrEmpty((String^)info["Name"]))
                        info["Name"] = text;
                    info["Value"] = text;
                }
            }
            catch (Exception^) { /* no Text property, or reflection failed — not fatal */ }
        }
        else if (auto dep = dynamic_cast<DependencyObject^>(target))
        {
            auto fe = dynamic_cast<FrameworkElement^>(target);
            info["Name"] = fe != nullptr && fe->Name != nullptr ? fe->Name : "";
            info["AutomationId"] = info["Name"];
            info["Description"] = "";

            if (fe != nullptr)
            {
                try
                {
                    Point topLeft = fe->PointToScreen(Point(0, 0));
                    info["x"] = topLeft.X;
                    info["y"] = topLeft.Y;
                }
                catch (Exception^) { info["x"] = 0.0; info["y"] = 0.0; }
                info["width"] = fe->ActualWidth;
                info["height"] = fe->ActualHeight;
                info["IsEnabled"] = fe->IsEnabled;
                info["IsOffscreen"] = !fe->IsVisible;
            }
        }

        TryAddDevExpressProps(target, info);
        return info;
    }

    // DevExpress-specific properties, read purely via reflection on type-name conventions
    // (DevExpress.XtraGrid.*, DevExpress.Xpf.Grid.*, etc). No compile-time reference to any
    // DevExpress assembly — this DLL stays buildable with zero DevExpress license dependency.
    static void TryAddDevExpressProps(Object^ target, Dictionary<String^, Object^>^ info)
    {
        try
        {
            String^ typeName = target->GetType()->FullName;
            if (typeName == nullptr || !typeName->StartsWith("DevExpress.")) return;

            info["IsDevExpressControl"] = true;

            // Best-effort: many DevExpress editors/cells expose an "EditValue" or "Text" property
            // usable as the element's value, and grid views expose "SelectedRowsCount"/"FocusedRowHandle".
            for each (String ^ candidate in gcnew array<String^> { "EditValue", "DisplayText", "Text" })
            {
                auto prop = target->GetType()->GetProperty(candidate);
                if (prop == nullptr || !prop->CanRead) continue;
                Object^ value = prop->GetValue(target, nullptr);
                if (value != nullptr)
                {
                    info["Value"] = value->ToString();
                    break;
                }
            }

            auto selectedProp = target->GetType()->GetProperty("Selected");
            if (selectedProp != nullptr && selectedProp->CanRead)
            {
                Object^ selected = selectedProp->GetValue(target, nullptr);
                if (selected != nullptr) info["IsSelected"] = selected;
            }
        }
        catch (Exception^)
        {
            // Reflection over an unknown DevExpress internal shape is inherently best-effort —
            // never let it fail the whole getInfo() call.
        }
    }

    static void SetValue(Object^ target, String^ value)
    {
        auto textProp = target->GetType()->GetProperty("Text");
        if (textProp != nullptr && textProp->CanWrite)
        {
            textProp->SetValue(target, value, nullptr);
            return;
        }
        auto editValueProp = target->GetType()->GetProperty("EditValue");
        if (editValueProp != nullptr && editValueProp->CanWrite)
        {
            editValueProp->SetValue(target, value, nullptr);
            return;
        }
        throw gcnew InvalidOperationException("Element has no writable Text/EditValue property.");
    }

    static void Invoke(Object^ target)
    {
        // Prefer a public parameterless PerformClick()/OnClick() if present (Button-like controls),
        // else fall back to simulating a click via the control's bounds — left as a TODO for the
        // native mouse-event path (this managed-only Invoke covers the common WinForms Button case).
        auto performClick = target->GetType()->GetMethod("PerformClick", gcnew array<Type^>(0));
        if (performClick != nullptr)
        {
            performClick->Invoke(target, nullptr);
            return;
        }
        throw gcnew InvalidOperationException("Element does not support a reflectable invoke action.");
    }

    // Distinct from Invoke: "select" means "make this the current selection," not "click it."
    // Previously selectElement silently aliased to Invoke (PerformClick-only), so selecting a
    // grid row that isn't also a button-like control with PerformClick would throw a misleading
    // "does not support invoke" error instead of a real select.
    static void Select(Object^ target)
    {
        if (auto row = dynamic_cast<GridRowHandle^>(target))
        {
            auto focusedRowHandleProp = row->View->GetType()->GetProperty("FocusedRowHandle");
            if (focusedRowHandleProp != nullptr && focusedRowHandleProp->CanWrite)
            {
                focusedRowHandleProp->SetValue(row->View, row->RowHandle, nullptr);
                return;
            }
        }
        if (auto item = dynamic_cast<ListItemHandle^>(target))
        {
            auto selectItemMethod = item->Owner->GetType()->GetMethod("SelectItem", gcnew array<Type^> { int::typeid });
            if (selectItemMethod != nullptr)
            {
                selectItemMethod->Invoke(item->Owner, gcnew array<Object^> { item->Index });
                return;
            }
        }
        auto performClick = target->GetType()->GetMethod("PerformClick", gcnew array<Type^>(0));
        if (performClick != nullptr)
        {
            performClick->Invoke(target, nullptr);
            return;
        }
        throw gcnew InvalidOperationException(
            String::Format("selectElement not supported for {0}.", target->GetType()->Name));
    }

    // Deliberately no PerformClick/Invoke fallback here (unlike Select) — a click silently
    // "succeeding" on a non-expandable element while claiming to have expanded it would be
    // exactly the bug the invoke/select/expand split was meant to fix.
    static void Expand(Object^ target)
    {
        if (auto node = dynamic_cast<TreeNodeHandle^>(target))
        {
            auto toggleExpandMethod = node->Owner->GetType()->GetMethod("ToggleExpand", gcnew array<Type^> { int::typeid });
            if (toggleExpandMethod != nullptr)
            {
                toggleExpandMethod->Invoke(node->Owner, gcnew array<Object^> { node->NodeId });
                return;
            }
        }
        throw gcnew InvalidOperationException(
            String::Format("expandElement not supported for {0}.", target->GetType()->Name));
    }

    // ── Condition matching — mirrors java-agent/CommandHandler.java's matchesCondition() shape:
    //    {"type":"and"|"or"|"not"|"true"|"false"|"property", "property":..., "value":..., "conditions":[...], "condition":{...}}

    static bool MatchesCondition(Object^ target, Object^ conditionObj)
    {
        if (conditionObj == nullptr) return true;
        auto condition = dynamic_cast<Dictionary<String^, Object^>^>(conditionObj);
        if (condition == nullptr) return true;

        String^ type = condition->ContainsKey("type") ? (String^)condition["type"] : nullptr;
        if (type == nullptr || type == "true") return true;
        if (type == "false") return false;

        if (type == "not")
        {
            Object^ inner = condition->ContainsKey("condition") ? condition["condition"] : nullptr;
            return !MatchesCondition(target, inner);
        }
        if (type == "and")
        {
            auto subs = condition->ContainsKey("conditions") ? dynamic_cast<List<Object^>^>(condition["conditions"]) : nullptr;
            if (subs == nullptr) return true;
            for each (Object ^ sub in subs)
                if (!MatchesCondition(target, sub)) return false;
            return true;
        }
        if (type == "or")
        {
            auto subs = condition->ContainsKey("conditions") ? dynamic_cast<List<Object^>^>(condition["conditions"]) : nullptr;
            if (subs == nullptr) return false;
            for each (Object ^ sub in subs)
                if (MatchesCondition(target, sub)) return true;
            return false;
        }
        if (type == "property")
        {
            String^ prop = condition->ContainsKey("property") ? (String^)condition["property"] : nullptr;
            Object^ valueObj = condition->ContainsKey("value") ? condition["value"] : nullptr;
            String^ value = valueObj != nullptr ? valueObj->ToString() : "";
            return MatchesProperty(target, prop, value);
        }
        return false;
    }

    // ── Owner-draw "virtual list" extraction — convention-based, no compile-time reference to
    //    any specific fixture or control type. Any Control exposing all three of:
    //      int ItemCount { get; }
    //      string GetItemText(int index)
    //      void SelectItem(int index)
    //    is treated as a virtual list host — its items become ListItemHandle children. This is
    //    intentionally not a type-name check (unlike TryGetDevExpressGridRows below): the point
    //    is that any control following this shape works, including a real customer control we've
    //    never seen, not just our own test fixtures. GetItemBounds(int) is optional — if present,
    //    its (fixture-local) Rectangle is translated to screen coordinates via the owner's
    //    PointToScreen so native mouse .click() has real bounds to work with; otherwise bounds
    //    default to 0,0,0,0 and interaction must go through selectElement.
    static List<Object^>^ TryGetOwnerDrawListItems(Object^ target)
    {
        auto type = target->GetType();
        auto itemCountProp = type->GetProperty("ItemCount");
        auto getItemTextMethod = type->GetMethod("GetItemText", gcnew array<Type^> { int::typeid });
        auto selectItemMethod = type->GetMethod("SelectItem", gcnew array<Type^> { int::typeid });
        if (itemCountProp == nullptr || getItemTextMethod == nullptr || selectItemMethod == nullptr)
            return nullptr;

        int count = safe_cast<int>(itemCountProp->GetValue(target, nullptr));
        auto result = gcnew List<Object^>();
        for (int i = 0; i < count; i++)
            result->Add(gcnew ListItemHandle(target, i));
        return result;
    }

    // ── Owner-draw "virtual tree" extraction — same convention-based discipline as
    //    TryGetOwnerDrawListItems. Any Control exposing all of:
    //      int[] GetChildNodeIds(int parentNodeId)   // -1 for the tree's roots
    //      string GetNodeText(int nodeId)
    //      bool NodeHasChildren(int nodeId)
    //      bool IsNodeExpanded(int nodeId)
    //      void ToggleExpand(int nodeId)
    //    is treated as a virtual tree host. GetChildren on a TreeNodeHandle only calls
    //    GetChildNodeIds when the owner reports the node expanded — a collapsed node's children
    //    are genuinely absent from the tree, not just hidden, which is what makes Expand's
    //    ToggleExpand call a real, observable state change instead of a no-op.
    static bool IsTreeHost(Type^ type)
    {
        return type->GetMethod("GetChildNodeIds", gcnew array<Type^> { int::typeid }) != nullptr
            && type->GetMethod("GetNodeText", gcnew array<Type^> { int::typeid }) != nullptr
            && type->GetMethod("NodeHasChildren", gcnew array<Type^> { int::typeid }) != nullptr
            && type->GetMethod("IsNodeExpanded", gcnew array<Type^> { int::typeid }) != nullptr
            && type->GetMethod("ToggleExpand", gcnew array<Type^> { int::typeid }) != nullptr;
    }

    static array<int>^ GetChildNodeIds(Object^ owner, int parentNodeId)
    {
        auto method = owner->GetType()->GetMethod("GetChildNodeIds", gcnew array<Type^> { int::typeid });
        return safe_cast<array<int>^>(method->Invoke(owner, gcnew array<Object^> { parentNodeId }));
    }

    static List<Object^>^ TryGetTreeRootNodes(Object^ target)
    {
        if (!IsTreeHost(target->GetType())) return nullptr;

        auto result = gcnew List<Object^>();
        for each (int id in GetChildNodeIds(target, -1))
            result->Add(gcnew TreeNodeHandle(target, id));
        return result;
    }

    static List<Object^>^ GetTreeNodeChildren(TreeNodeHandle^ node)
    {
        auto result = gcnew List<Object^>();
        auto ownerType = node->Owner->GetType();
        auto isExpandedMethod = ownerType->GetMethod("IsNodeExpanded", gcnew array<Type^> { int::typeid });
        bool expanded = safe_cast<bool>(isExpandedMethod->Invoke(node->Owner, gcnew array<Object^> { node->NodeId }));
        if (!expanded) return result;

        for each (int id in GetChildNodeIds(node->Owner, node->NodeId))
            result->Add(gcnew TreeNodeHandle(node->Owner, id));
        return result;
    }

    // ── DevExpress GridView row/cell extraction — pure reflection, no compile-time DevExpress
    //    reference (same rationale as TryAddDevExpressProps below). GridControl.MainView.RowCount
    //    plus per-row GetRowCellValue(rowHandle, column) is how DevExpress's own code reads grid
    //    data internally; UIA never sees these values (confirmed empirically — DevExpress's grid
    //    AccessibleObject only ever exposes a generic "<Column> row <N>" placeholder), so this is
    //    the actual value the bridge exists to read. ──────────────────────────────────────────

    static List<Object^>^ TryGetDevExpressGridRows(Object^ target)
    {
        String^ typeName = target->GetType()->FullName;
        if (typeName == nullptr || typeName != "DevExpress.XtraGrid.GridControl") return nullptr;

        auto mainViewProp = target->GetType()->GetProperty("MainView");
        if (mainViewProp == nullptr) return nullptr;
        Object^ view = mainViewProp->GetValue(target, nullptr);
        if (view == nullptr) return nullptr;

        auto rowCountProp = view->GetType()->GetProperty("RowCount");
        if (rowCountProp == nullptr) return nullptr;
        int rowCount = safe_cast<int>(rowCountProp->GetValue(view, nullptr));

        auto result = gcnew List<Object^>();
        for (int i = 0; i < rowCount; i++)
            result->Add(gcnew GridRowHandle(view, i));
        return result;
    }

    static List<Object^>^ GetDevExpressGridCells(GridRowHandle^ row)
    {
        auto result = gcnew List<Object^>();
        auto columnsProp = row->View->GetType()->GetProperty("Columns");
        if (columnsProp == nullptr) return result;
        auto columns = dynamic_cast<System::Collections::IEnumerable^>(columnsProp->GetValue(row->View, nullptr));
        if (columns == nullptr) return result;

        for each (Object ^ column in columns)
        {
            auto visibleProp = column->GetType()->GetProperty("Visible");
            if (visibleProp != nullptr && !safe_cast<bool>(visibleProp->GetValue(column, nullptr))) continue;

            auto captionProp = column->GetType()->GetProperty("Caption");
            auto fieldNameProp = column->GetType()->GetProperty("FieldName");
            String^ caption = captionProp != nullptr ? (String^)captionProp->GetValue(column, nullptr) : "";
            String^ fieldName = fieldNameProp != nullptr ? (String^)fieldNameProp->GetValue(column, nullptr) : "";

            result->Add(gcnew GridCellHandle(row->View, row->RowHandle, column, caption, fieldName));
        }
        return result;
    }

    static Control^ GridControlOf(Object^ view)
    {
        auto gridControlProp = view->GetType()->GetProperty("GridControl");
        return gridControlProp != nullptr
            ? dynamic_cast<Control^>(gridControlProp->GetValue(view, nullptr))
            : nullptr;
    }

    static Object^ GetDevExpressRowCellValue(Object^ view, int rowHandle, Object^ column)
    {
        auto method = view->GetType()->GetMethod("GetRowCellValue",
            gcnew array<Type^> { int::typeid, column->GetType() });
        if (method == nullptr) return nullptr;

        // Unbound-column reads go through DevExpress's own CustomUnboundColumnData event,
        // which is only raised reliably when called on the UI thread — called directly from
        // this injected thread it silently returns null instead of firing. Marshal via
        // Control.Invoke (found through the view's GridControl property) so the event fires.
        Control^ ctrl = GridControlOf(view);

        if (ctrl != nullptr && ctrl->IsHandleCreated && ctrl->InvokeRequired)
        {
            auto invoker = gcnew CellValueInvoker(method, view, rowHandle, column);
            return ctrl->Invoke(gcnew Func<Object^>(invoker, &CellValueInvoker::Run));
        }

        return method->Invoke(view, gcnew array<Object^> { rowHandle, column });
    }

private:
    // Case-insensitive lookup directly against whatever BuildInfo populated for this target —
    // covers name/automationid/classname (previously the only 3 hardcoded branches) plus "value"
    // and any future element kind's custom info fields, with no per-property branch needed here.
    static bool MatchesProperty(Object^ target, String^ property, String^ value)
    {
        if (property == nullptr) return false;
        auto info = BuildInfo(target);
        String^ prop = property->ToLowerInvariant();

        String^ key = nullptr;
        for each (String ^ k in info->Keys)
        {
            if (k->ToLowerInvariant() == prop) { key = k; break; }
        }
        if (key == nullptr) return false;

        Object^ actual = info[key];
        String^ actualStr = actual != nullptr ? actual->ToString() : "";
        return actualStr == value;
    }
};

// C++/CLI lambdas cannot capture managed-typed locals for delegate construction (see
// CellValueInvoker above) — this closure stands in for Control.Invoke's MethodInvoker target
// when marshaling a mutating Reflector call onto the real UI thread from Dispatch.
ref class UiThreadCommand
{
public:
    enum class Kind { Invoke, Select, Expand, SetValue, RequestFocus };

private:
    Kind _kind;
    Object^ _target;
    String^ _value;

public:
    UiThreadCommand(Kind kind, Object^ target, String^ value) : _kind(kind), _target(target), _value(value) {}

    void Run()
    {
        switch (_kind)
        {
        case Kind::Invoke: Reflector::Invoke(_target); break;
        case Kind::Select: Reflector::Select(_target); break;
        case Kind::Expand: Reflector::Expand(_target); break;
        case Kind::SetValue: Reflector::SetValue(_target, _value); break;
        case Kind::RequestFocus:
            if (auto ctrl = dynamic_cast<Control^>(_target)) ctrl->Focus();
            break;
        }
    }
};

// ── TCP JSON-RPC server ────────────────────────────────────────────────────────────────────

public ref class BridgeServer abstract sealed
{
public:
    static void Run()
    {
        ElementRegistry::Pid = System::Diagnostics::Process::GetCurrentProcess()->Id;

        auto listener = gcnew TcpListener(IPAddress::Loopback, 0);
        listener->Start();
        int port = ((IPEndPoint^)listener->LocalEndpoint)->Port;

        String^ portFile = Path::Combine(Path::GetTempPath(), String::Format("appium-dotnet-bridge-{0}.port", ElementRegistry::Pid));
        File::WriteAllText(portFile, port.ToString());

        while (true)
        {
            TcpClient^ client = listener->AcceptTcpClient();
            auto thread = gcnew Thread(gcnew ParameterizedThreadStart(&BridgeServer::HandleClient));
            thread->IsBackground = true;
            thread->Start(client);
        }
    }

private:
    static void HandleClient(Object^ clientObj)
    {
        auto client = (TcpClient^)clientObj;
        try
        {
            auto stream = client->GetStream();
            auto reader = gcnew StreamReader(stream, Encoding::UTF8);
            auto writer = gcnew StreamWriter(stream, gcnew UTF8Encoding(false));
            writer->AutoFlush = true;
            writer->NewLine = "\n";

            String^ line;
            while ((line = reader->ReadLine()) != nullptr)
            {
                String^ response = HandleLine(line);
                writer->WriteLine(response);
            }
        }
        catch (Exception^)
        {
            // Client disconnected or malformed input — just close this connection.
        }
        finally
        {
            client->Close();
        }
    }

    static String^ HandleLine(String^ line)
    {
        auto request = dynamic_cast<Dictionary<String^, Object^>^>(Json::Parse(line));
        Object^ idObj = request != nullptr && request->ContainsKey("id") ? request["id"] : nullptr;
        try
        {
            String^ command = request != nullptr && request->ContainsKey("command") ? (String^)request["command"] : nullptr;
            auto params = request != nullptr && request->ContainsKey("params") ? dynamic_cast<Dictionary<String^, Object^>^>(request["params"]) : nullptr;
            Object^ result = Dispatch(command, params);

            auto response = gcnew Dictionary<String^, Object^>();
            response["id"] = idObj;
            response["result"] = result;
            return Json::Write(response);
        }
        catch (Exception^ ex)
        {
            auto response = gcnew Dictionary<String^, Object^>();
            response["id"] = idObj;
            response["error"] = ex->Message;
            return Json::Write(response);
        }
    }

    static Object^ Dispatch(String^ command, Dictionary<String^, Object^>^ params)
    {
        if (command == "getWindowRoot")
        {
            double hwndVal = 0.0;
            if (params != nullptr && params->ContainsKey("hwnd")) hwndVal = safe_cast<double>(params["hwnd"]);
            Object^ root = Reflector::GetWindowRoot((long long)hwndVal);
            if (root == nullptr) return nullptr;
            return ElementToResultDict(root);
        }
        if (command == "getChildren")
        {
            Object^ target = RequireElement(params);
            auto children = Reflector::GetChildren(target);
            auto results = gcnew List<Object^>();
            for each (Object ^ child in children)
                results->Add(ElementToResultDict(child));
            return results;
        }
        if (command == "getInfo")
        {
            Object^ target = RequireElement(params);
            return Reflector::BuildInfo(target);
        }
        if (command == "findFirst" || command == "findAll")
        {
            String^ rootId = params != nullptr && params->ContainsKey("rootId") ? (String^)params["rootId"] : nullptr;
            Object^ root = ElementRegistry::Get(rootId);
            if (root == nullptr) return command == "findAll" ? (Object^)gcnew List<Object^>() : nullptr;
            Object^ condition = params != nullptr && params->ContainsKey("condition") ? params["condition"] : nullptr;

            auto matches = gcnew List<Object^>();
            CollectMatches(root, condition, matches, command == "findFirst");

            if (command == "findFirst")
                return matches->Count > 0 ? (Object^)matches[0] : nullptr;

            auto ids = gcnew List<Object^>();
            for each (Object ^ m in matches)
                ids->Add(m);
            return ids;
        }
        if (command == "getValue")
        {
            Object^ target = RequireElement(params);
            auto info = Reflector::BuildInfo(target);
            return info->ContainsKey("Value") ? info["Value"] : (info->ContainsKey("Name") ? info["Name"] : "");
        }
        if (command == "setValue")
        {
            Object^ target = RequireElement(params);
            String^ value = params->ContainsKey("value") ? (String^)params["value"] : "";
            RunOnUiThread(target, UiThreadCommand::Kind::SetValue, value);
            return nullptr;
        }
        if (command == "invoke")
        {
            Object^ target = RequireElement(params);
            RunOnUiThread(target, UiThreadCommand::Kind::Invoke, nullptr);
            return nullptr;
        }
        if (command == "selectElement")
        {
            Object^ target = RequireElement(params);
            RunOnUiThread(target, UiThreadCommand::Kind::Select, nullptr);
            return nullptr;
        }
        if (command == "expandElement")
        {
            Object^ target = RequireElement(params);
            RunOnUiThread(target, UiThreadCommand::Kind::Expand, nullptr);
            return nullptr;
        }
        if (command == "requestFocus")
        {
            Object^ target = RequireElement(params);
            RunOnUiThread(target, UiThreadCommand::Kind::RequestFocus, nullptr);
            return nullptr;
        }
        if (command == "getToggleState")
        {
            Object^ target = RequireElement(params);
            auto checkedProp = target->GetType()->GetProperty("Checked");
            if (checkedProp != nullptr)
            {
                Object^ val = checkedProp->GetValue(target, nullptr);
                bool isChecked = val != nullptr && dynamic_cast<Boolean^>(val) != nullptr && safe_cast<bool>(val);
                return isChecked ? "On" : "Off";
            }
            return "Off";
        }
        if (command == "isAlive")
        {
            String^ id = params != nullptr && params->ContainsKey("id") ? (String^)params["id"] : nullptr;
            return ElementRegistry::Get(id) != nullptr;
        }

        throw gcnew InvalidOperationException(String::Format("Unknown command: {0}", command));
    }

    // Marshals a mutating Reflector call onto the real UI thread when one can be found near the
    // target (see Reflector::FindUiThreadControl) — the bridge's own TCP connection-handling
    // thread never pumps a Windows message loop, so touching WinForms UI state directly from it
    // (e.g. a fixture's PerformClick creating a popup Form) fails silently: the RPC call returns
    // successfully but the resulting window is never actually functional. Falls back to running
    // inline when no Control can be found (nothing to marshal onto, e.g. a detached object).
    static void RunOnUiThread(Object^ target, UiThreadCommand::Kind kind, String^ value)
    {
        auto cmd = gcnew UiThreadCommand(kind, target, value);
        Control^ ctrl = Reflector::FindUiThreadControl(target);
        if (ctrl != nullptr && ctrl->IsHandleCreated && ctrl->InvokeRequired)
        {
            ctrl->Invoke(gcnew MethodInvoker(cmd, &UiThreadCommand::Run));
        }
        else
        {
            cmd->Run();
        }
    }

    static Object^ RequireElement(Dictionary<String^, Object^>^ params)
    {
        String^ id = params != nullptr && params->ContainsKey("id") ? (String^)params["id"] : nullptr;
        Object^ target = id != nullptr ? ElementRegistry::Get(id) : nullptr;
        if (target == nullptr) throw gcnew InvalidOperationException(String::Format("Unknown element id: {0}", id));
        return target;
    }

    static Dictionary<String^, Object^>^ ElementToResultDict(Object^ target)
    {
        String^ id = ElementRegistry::Save(target);
        auto info = Reflector::BuildInfo(target);
        auto result = gcnew Dictionary<String^, Object^>(info);
        result["id"] = id;
        return result;
    }

    // depth-capped recursive walk — same 100-level guard as JavaAgentService.BuildXmlRecursive
    // on the C# host side, and same rationale (never let a cyclic or absurdly deep tree hang).
    static void CollectMatches(Object^ node, Object^ condition, List<Object^>^ results, bool stopAtFirst, int depth)
    {
        if (depth > 100) return;
        if (Reflector::MatchesCondition(node, condition))
        {
            results->Add(ElementRegistry::Save(node));
            if (stopAtFirst) return;
        }
        for each (Object ^ child in Reflector::GetChildren(node))
        {
            CollectMatches(child, condition, results, stopAtFirst, depth + 1);
            if (stopAtFirst && results->Count > 0) return;
        }
    }

    static void CollectMatches(Object^ node, Object^ condition, List<Object^>^ results, bool stopAtFirst)
    {
        CollectMatches(node, condition, results, stopAtFirst, 0);
    }
};

} // namespace AppiumDotNetBridge

// ── Native export — the second CreateRemoteThread target from BridgeInjector.cs. Kept as a
//    thin native shim so DllMain (which just returns TRUE) never touches managed code, avoiding
//    the classic "initialize the CLR from inside the loader lock" deadlock. ──────────────────

extern "C" __declspec(dllexport) DWORD WINAPI BridgeStart(LPVOID /*unused*/)
{
    try
    {
        AppiumDotNetBridge::BridgeServer::Run();
    }
    catch (System::Exception^ ex)
    {
        // The host process only learns BridgeStart's exit code (via GetExitCodeThread), not the
        // exception itself — there's no return channel across CreateRemoteThread. Persist it next
        // to where the port file would have gone so BridgeInjector.cs can surface a real error
        // instead of a bare nonzero exit code.
        try
        {
            int pid = System::Diagnostics::Process::GetCurrentProcess()->Id;
            String^ errorFile = Path::Combine(Path::GetTempPath(), String::Format("appium-dotnet-bridge-{0}.error", pid));
            File::WriteAllText(errorFile, ex->ToString());
        }
        catch (System::Exception^) { /* best-effort — nothing more we can do here */ }
        return 1;
    }
    return 0;
}

// The whole file compiles under /clr by default, which means even this trivial function would
// otherwise be emitted as managed IL — silently defeating the entire "keep DllMain native so the
// loader lock never touches the CLR" design. #pragma unmanaged forces true native codegen here.
#pragma managed(push, off)
BOOL APIENTRY DllMain(HMODULE /*hModule*/, DWORD /*ul_reason_for_call*/, LPVOID /*lpReserved*/)
{
    return TRUE;
}
#pragma managed(pop)
