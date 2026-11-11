param([Parameter(Mandatory=$true)][Int64]$WindowHandle)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
public class ArtifactWindowFrames {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out RECT rect);
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dest, int x, int y, int w, int h, IntPtr src, int sx, int sy, uint rop);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  readonly IntPtr handle; readonly uint processId; readonly long started;
  public uint ProcessId { get { return processId; } }
  public string Started { get { return started.ToString(); } }
  public ArtifactWindowFrames(long value) {
    SetProcessDPIAware(); handle = new IntPtr(value);
    if (!IsWindow(handle)) throw new Exception("FRAME_SOURCE_CHANGED");
    GetWindowThreadProcessId(handle, out processId);
    started = Process.GetProcessById((int)processId).StartTime.ToUniversalTime().Ticks;
  }
  public void Check() {
    uint current;
    if (!IsWindow(handle) || GetWindowThreadProcessId(handle, out current) == 0 || current != processId || Process.GetProcessById((int)current).StartTime.ToUniversalTime().Ticks != started) throw new Exception("FRAME_SOURCE_CHANGED");
  }
  public string Capture(out int width, out int height) {
    Check(); width = height = 0;
    if (IsIconic(handle) || !IsWindowVisible(handle) || GetForegroundWindow() != handle) throw new Exception("FRAME_UNAVAILABLE");
    RECT rect;
    if (!GetClientRect(handle, out rect)) throw new Exception("FRAME_SOURCE_CHANGED");
    width = rect.Right - rect.Left; height = rect.Bottom - rect.Top;
    if (width < 1 || height < 1 || width > 8192 || height > 8192 || (long)width * height > 33554432) throw new Exception("FRAME_UNAVAILABLE");
    using (var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb)) {
      IntPtr source = GetDC(handle);
      if (source == IntPtr.Zero) throw new Exception("FRAME_UNAVAILABLE");
      try { using (var graphics = Graphics.FromImage(bitmap)) {
        IntPtr target = graphics.GetHdc();
        try { if (!BitBlt(target, 0, 0, width, height, source, 0, 0, 0x00CC0020)) throw new Exception("FRAME_UNAVAILABLE"); }
        finally { graphics.ReleaseHdc(target); }
      } } finally { ReleaseDC(handle, source); }
      Check();
      if (GetForegroundWindow() != handle) throw new Exception("FRAME_UNAVAILABLE");
      int light = 0;
      for (int y = 1; y < 10; y++) for (int x = 1; x < 10; x++) { var p = bitmap.GetPixel(width*x/10, height*y/10); if (p.R + p.G + p.B > 30) light++; }
      if (light < 4) throw new Exception("FRAME_UNAVAILABLE");
      using (var memory = new MemoryStream()) { bitmap.Save(memory, ImageFormat.Png); if (memory.Length > 33554432) throw new Exception("FRAME_UNAVAILABLE"); return "data:image/png;base64," + Convert.ToBase64String(memory.ToArray()); }
    }
  }
}
'@
try { $frameSession = [ArtifactWindowFrames]::new($WindowHandle); [Console]::WriteLine((@{ ready=$true; pid=$frameSession.ProcessId; started=$frameSession.Started } | ConvertTo-Json -Compress)) }
catch { [Console]::WriteLine('{"ready":false}'); exit 1 }
while ($null -ne ($commandLine = [Console]::ReadLine())) {
  $requestId = 0
  try {
    if ($commandLine.Length -gt 128) { throw 'FRAME_UNAVAILABLE' }
    $request = $commandLine | ConvertFrom-Json
    if ($request.action -ne 'capture' -or $request.id -isnot [long] -and $request.id -isnot [int] -or $request.id -lt 1) { throw 'FRAME_UNAVAILABLE' }
    $requestId = $request.id; $frameWidth = 0; $frameHeight = 0
    $png = $frameSession.Capture([ref]$frameWidth, [ref]$frameHeight)
    [Console]::WriteLine((@{ id=$requestId; width=$frameWidth; height=$frameHeight; image=$png } | ConvertTo-Json -Compress))
  } catch {
    $reason = if ($_.Exception.ToString().Contains('FRAME_SOURCE_CHANGED')) { 'FRAME_SOURCE_CHANGED' } else { 'FRAME_UNAVAILABLE' }
    [Console]::WriteLine((@{ id=$requestId; error=$reason } | ConvertTo-Json -Compress))
  }
}
