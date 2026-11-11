param([string]$Source,[string]$Off,[string]$Hover,[string]$Selected)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$taskText=Get-Content -Raw -Encoding UTF8 -LiteralPath $Source
$taskCode=[regex]::Match($taskText,"(?s)using System;.*?(?=\r?\n'@)").Value
function Replace-TaskBody([string]$Text,[string]$Signature,[string]$Replacement){
 $taskStart=$Text.IndexOf($Signature);if($taskStart -lt 0){throw "Missing method $Signature"}
 $taskEnd=$Text.IndexOf('{',$taskStart);$taskDepth=1;$taskEnd++
 while($taskDepth -gt 0){if($Text[$taskEnd] -eq '{'){$taskDepth++};if($Text[$taskEnd] -eq '}'){$taskDepth--};$taskEnd++}
 return $Text.Substring(0,$taskStart)+$Replacement+$Text.Substring($taskEnd)
}
# Only OS I/O is replaced. Actual Prepare/Select/InputReady/Analyze decisions run;
# no constructor, HWND, actual cursor or SendInput call can execute in this test.
$taskCode=Replace-TaskBody $taskCode 'void Check(bool foreground)' 'void Check(bool foreground) { if(foreground&&!TestForeground) throw new Exception("FOCUS_LOST"); }'
$taskCode=Replace-TaskBody $taskCode 'string Geometry(out int width,out int height)' 'string Geometry(out int width,out int height) { width=FixtureOff.Width; height=FixtureOff.Height; return width+"x"+height+"@0,0"; }'
$taskCode=Replace-TaskBody $taskCode 'Bitmap Grab()' 'Bitmap Grab() { return (Bitmap)(TestHover?FixtureHover:FixtureOff).Clone(); }'
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);','static short GetAsyncKeyState(int key) { return TestRight?(short)-32768:(short)0; }')
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();','static IntPtr GetForegroundWindow() { return TestForeground?IntPtr.Zero:new IntPtr(1); }')
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);','static bool IsIconic(IntPtr h) { return false; }')
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h, ref POINT p);','static bool ClientToScreen(IntPtr h, ref POINT p) { return true; }')
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr h, ref POINT p);','static bool ScreenToClient(IntPtr h, ref POINT p) { return true; }')
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);','static bool GetCursorPos(out POINT p) {p=new POINT {X=0,Y=0};return true;}')
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);','static bool SetCursorPos(int x,int y) { Moves.Add("move:"+x+","+y); TestHover=y<FixtureOff.Height*.90; return true; }')
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern uint SendInput(uint count,INPUT[] inputs,int size);','static uint SendInput(uint count,INPUT[] inputs,int size) { Moves.Add("click"); FixtureOff=FixtureSelected; return count; }')
$taskCode=$taskCode.Replace('public class ArtifactPageScanner : IDisposable {','public class ArtifactPageScanner : IDisposable { public static Bitmap FixtureOff,FixtureHover,FixtureSelected; public static bool TestHover,TestRight,TestForeground=true; public static List<string> Moves=new List<string>();')
Add-Type -ReferencedAssemblies System.Drawing,System.Core -TypeDefinition $taskCode -IgnoreWarnings -WarningAction SilentlyContinue
$taskBeforeBitmap=[System.Drawing.Bitmap]::new($Off)
$taskHoverBitmap=[System.Drawing.Bitmap]::new($Hover)
$taskSelectedBitmap=[System.Drawing.Bitmap]::new($Selected)
try{
 [ArtifactPageScanner]::FixtureOff=$taskBeforeBitmap
 [ArtifactPageScanner]::FixtureHover=$taskHoverBitmap
 [ArtifactPageScanner]::FixtureSelected=$taskSelectedBitmap
 $taskFlags=[Reflection.BindingFlags]'Instance,NonPublic'
 $taskScanner=[Runtime.Serialization.FormatterServices]::GetUninitializedObject([ArtifactPageScanner])
 $taskBefore=[ArtifactPageScanner]::Analyze($taskBeforeBitmap)
 $taskBefore.geometryKey="$($taskBefore.width)x$($taskBefore.height)@0,0"
 [ArtifactPageScanner].GetField('last',$taskFlags).SetValue($taskScanner,$taskBefore)
 $null=$taskScanner.Anchor()
 $taskPrepare=[ArtifactPageScanner].GetMethod('Prepare')
 $taskPrepared=$null;$taskPrepareMoves=@()
 if($taskPrepare){
  [ArtifactPageScanner]::TestHover=$true
  $null=$taskPrepare.Invoke($taskScanner,@())
  $taskPrepared=$taskScanner.Observe()
  $taskPrepareMoves=@([ArtifactPageScanner]::Moves);[ArtifactPageScanner]::Moves.Clear()
 }
 $taskScanner.Select('r0c0')
 $taskAfter=$taskScanner.Observe()
 $taskMoves=@([ArtifactPageScanner]::Moves)
 $taskGuards=@()
 if($taskPrepare){
  foreach($taskGuard in @('paused','focus','right')){
   [ArtifactPageScanner]::Moves.Clear()
   [ArtifactPageScanner].GetField('paused',$taskFlags).SetValue($taskScanner,$taskGuard -eq 'paused')
   [ArtifactPageScanner]::TestForeground=$taskGuard -ne 'focus'
   [ArtifactPageScanner]::TestRight=$taskGuard -eq 'right'
   $taskRejected=$false
   try{$null=$taskPrepare.Invoke($taskScanner,@())}catch{$taskRejected=$true}
   $taskGuards+=@{guard=$taskGuard;rejected=$taskRejected;moves=[ArtifactPageScanner]::Moves.Count}
  }
 }
 [Console]::WriteLine((@{before=$taskBefore;prepared=$taskPrepared;prepareMoves=$taskPrepareMoves;after=$taskAfter;moves=$taskMoves;prepareExists=($null -ne $taskPrepare);guards=$taskGuards}|ConvertTo-Json -Depth 8 -Compress))
}finally{$taskBeforeBitmap.Dispose();$taskHoverBitmap.Dispose();$taskSelectedBitmap.Dispose()}
