// Ordinary local test-app launcher, not a UI/input helper. No elevation.
using System;
using System.Diagnostics;
using System.IO;
class LiveAcceptanceLauncher {
  [STAThread] static void Main() {
    var webRoot = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", ".."));
    var info = new ProcessStartInfo(Path.Combine(webRoot, "node_modules", "electron", "dist", "electron.exe"));
    info.UseShellExecute = false;
    info.Arguments = "\"" + Path.Combine(webRoot, "tests", "electron-live-entry.cjs") + "\"";
    info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
    Process.Start(info);
  }
}
