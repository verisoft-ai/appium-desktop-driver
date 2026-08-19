using DesktopDriverServer.DotNet;

// args[0] = target pid, args[1] = path to the x86 build of appium-dotnet-bridge.dll.
// Exit 0 on success. On failure, the exception message goes to stderr and the exit code is
// nonzero — the 64-bit host process reads both to build a clear error for the caller.
if (args.Length < 2 || !int.TryParse(args[0], out int pid))
{
    Console.Error.WriteLine("Usage: BridgeInjectorX86Stub.exe <pid> <bridgeDllPath>");
    return 2;
}

try
{
    BridgeInjector.InjectFromPid(pid, args[1]);
    return 0;
}
catch (Exception ex)
{
    Console.Error.WriteLine(ex.Message);
    return 1;
}
