/**
 * Microsoft Excel automation (macOS only) through AppleScript. Used solely to
 * open a generated workbook, force a full recalculation, and save it, so the
 * cached values in the file are computed by Excel's own engine.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { ExcelStatus } from '../common/interfaces/generation.interface';

const EXCEL_APP = '/Applications/Microsoft Excel.app';
let cached: { at: number; status: ExcelStatus } | null = null;

function osascript(script: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: timeoutMs, maxBuffer: 1 << 20 }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim()));
      else resolve(stdout.trim());
    });
  });
}

export async function detectExcel(force = false): Promise<ExcelStatus> {
  if (!force && cached && Date.now() - cached.at < 60_000) return cached.status;
  let status: ExcelStatus;
  if (process.platform !== 'darwin') status = { available: false, platform: process.platform, detail: 'Excel automation is implemented for macOS (AppleScript) only' };
  else if (!existsSync(EXCEL_APP)) status = { available: false, platform: 'darwin', detail: 'Microsoft Excel is not installed in /Applications' };
  else if (process.env.SOMEC_DISABLE_EXCEL === '1') status = { available: false, platform: 'darwin', detail: 'Disabled by SOMEC_DISABLE_EXCEL=1' };
  else {
    try {
      // `count workbooks` fails while Excel is blocked by a modal dialog, which is exactly what we need to know.
      const out = await osascript('with timeout of 15 seconds\ntell application "Microsoft Excel" to return (version as string) & "|" & (count workbooks)\nend timeout', 20_000);
      status = { available: true, platform: 'darwin', detail: `Microsoft Excel ${out.split('|')[0]} answers AppleScript` };
    } catch (e) {
      status = { available: false, platform: 'darwin', detail: `Excel installed but not scriptable right now (${e instanceof Error ? e.message : String(e)}). Open Excel, dismiss any dialog, grant file access, then retry.` };
    }
  }
  cached = { at: Date.now(), status };
  return status;
}

export interface RecalcResult {
  ok: boolean;
  detail: string;
}

/** Open the file in Excel, recalculate everything, save in place. */
export async function recalculateWithExcel(file: string, timeoutMs = 20 * 60_000): Promise<RecalcResult> {
  const posix = file.replace(/"/g, '\\"');
  const script = `with timeout of ${Math.ceil(timeoutMs / 1000)} seconds
tell application "Microsoft Excel"
  try
    set display alerts to false
  end try
  set wb to open workbook workbook file name "${posix}" update links do not update links
  try
    calculate full rebuild
  on error
    try
      calculate full
    on error
      calculate
    end try
  end try
  save wb
  set n to count of worksheets of wb
  close wb saving no
  return "recalculated " & n & " sheets"
end tell
end timeout`;
  try {
    const out = await osascript(script, timeoutMs + 10_000);
    return { ok: true, detail: out };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
