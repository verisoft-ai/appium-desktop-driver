import type {AppiumDesktopDriver} from '../driver';

const ISO_8061_FORMAT = 'yyyy-MM-ddTHH:mm:sszzz';

/**
 * Gets the current date/time on the machine running the session, formatted via the C# server.
 * @param _sessionId - Unused; present to match the WebDriver command signature.
 * @param format - A .NET custom date/time format string; defaults to an ISO 8601 format.
 * @returns The formatted date/time string.
 */
export async function getDeviceTime(this: AppiumDesktopDriver, _sessionId?: string, format?: string): Promise<string> {
  const fmt = format ?? ISO_8061_FORMAT;
  // Use the C# server to get formatted date/time
  const script = `(Get-Date).ToString('${fmt.replace(/'/g, "''")}')`;
  return (await this.sendCommand('executePowerShellScript', {script})) as string;
}
