param([string]$Source,[string]$Image,[string]$After='',[switch]$Serve,[int]$AfterCropX=12,[int]$AfterCropY=6)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$taskCode=[regex]::Match((Get-Content -Raw -Encoding UTF8 -LiteralPath $Source),"(?s)using System;.*?(?=\r?\n'@)").Value
if(!$taskCode.Contains('RestoreAnchor(')){[Console]::WriteLine('{"supportsSnapshot":false}');exit 0}
function Replace-TaskBody([string]$Text,[string]$Signature,[string]$Replacement){
 $taskStart=$Text.IndexOf($Signature);$taskEnd=$Text.IndexOf('{',$taskStart);$taskDepth=1;$taskEnd++
 while($taskDepth -gt 0){if($Text[$taskEnd] -eq '{'){$taskDepth++};if($Text[$taskEnd] -eq '}'){$taskDepth--};$taskEnd++}
 return $Text.Substring(0,$taskStart)+$Replacement+$Text.Substring($taskEnd)
}
# Replace OS capture/identity I/O only; actual InputReady, Anchor, serialization,
# RestoreAnchor and anchored Analyze run. No real HWND or input is constructed.
$taskCode=Replace-TaskBody $taskCode 'void Check(bool foreground)' 'void Check(bool foreground) {}'
$taskCode=Replace-TaskBody $taskCode 'string Geometry(out int width,out int height)' 'string Geometry(out int width,out int height) { width=Fixture.Width;height=Fixture.Height;return width+"x"+height+"@"+TestOffset+",0"; }'
$taskCode=Replace-TaskBody $taskCode 'Bitmap Grab()' 'Bitmap Grab() {return (Bitmap)Fixture.Clone();}'
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);','static short GetAsyncKeyState(int key) {return 0;}')
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();','static IntPtr GetForegroundWindow() {return IntPtr.Zero;}')
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);','static bool IsIconic(IntPtr h) {return false;}')
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr h, ref POINT p);','static bool ScreenToClient(IntPtr h, ref POINT p) {return true;}')
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);','static bool GetCursorPos(out POINT p) {p=new POINT {X=0,Y=0};return true;}')
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);','static bool SetCursorPos(int x,int y) {throw new Exception("NO_TEST_INPUT");}')
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern uint SendInput(uint count,INPUT[] inputs,int size);','static uint SendInput(uint count,INPUT[] inputs,int size) {throw new Exception("NO_TEST_INPUT");}')
$taskCode=$taskCode.Replace('public class ArtifactPageScanner : IDisposable {','public class ArtifactPageScanner : IDisposable { public static Bitmap Fixture;public static int TestOffset;')
Add-Type -ReferencedAssemblies System.Drawing,System.Core -TypeDefinition $taskCode
$taskBitmap=[System.Drawing.Bitmap]::new($Image)
$taskEdgeBitmap=[System.Drawing.Bitmap]$taskBitmap.Clone()
$taskComparison=[System.Drawing.Bitmap]$taskBitmap.Clone()
$script:taskFlags=[Reflection.BindingFlags]'Instance,NonPublic'
function New-TaskScanner([bool]$Paused,[uint32]$Owner=1234){
 $taskObject=[Runtime.Serialization.FormatterServices]::GetUninitializedObject([ArtifactPageScanner])
 [ArtifactPageScanner].GetField('paused',$script:taskFlags).SetValue($taskObject,$Paused)
 [ArtifactPageScanner].GetField('processId',$script:taskFlags).SetValue($taskObject,$Owner)
 [ArtifactPageScanner].GetField('started',$script:taskFlags).SetValue($taskObject,[long]638900000000000000)
 return $taskObject
}
if($Serve){
 # Execute the actual production JSON transport as well as the actual C#
 # snapshot reader. Constructor/capture/OS input are never invoked.
 [ArtifactPageScanner]::Fixture=$taskBitmap
 $scanner=New-TaskScanner $true
 $taskText=Get-Content -Raw -Encoding UTF8 -LiteralPath $Source
 $taskMatch=[regex]::Match($taskText,'(?s)try\s*\{\s*\$scanner\s*=\s*\[ArtifactPageScanner\]::new\(\$WindowHandle\).*\z')
 if(!$taskMatch.Success){throw 'Missing PageScanInput transport entry'}
 $taskTransport=([regex]'\$scanner\s*=\s*\[ArtifactPageScanner\]::new\(\$WindowHandle\)').Replace($taskMatch.Value,'$null = $scanner',1)
 try{Invoke-Expression $taskTransport}finally{$taskBitmap.Dispose();$taskEdgeBitmap.Dispose();$taskComparison.Dispose()}
 exit 0
}
try{
 [ArtifactPageScanner]::Fixture=$taskBitmap
 $taskBefore=[ArtifactPageScanner]::Analyze($taskBitmap);$taskBefore.geometryKey="$($taskBitmap.Width)x$($taskBitmap.Height)@0,0"
 $taskFirst=New-TaskScanner $false
 [ArtifactPageScanner].GetField('last',$taskFlags).SetValue($taskFirst,$taskBefore)
 $taskRect=$taskBefore.cells[0].GetType().GetField('rect',$taskFlags).GetValue($taskBefore.cells[0])
 $taskGraphics=[System.Drawing.Graphics]::FromImage($taskEdgeBitmap)
 $taskGold=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(190,135,65))
 try{$taskGraphics.FillRectangle($taskGold,$taskRect.X-4,$taskRect.Y-4,$taskRect.Width+8,$taskRect.Height+8);$taskGraphics.DrawImage($taskBitmap,$taskRect,$taskRect,[System.Drawing.GraphicsUnit]::Pixel)}finally{$taskGold.Dispose();$taskGraphics.Dispose()}
 [ArtifactPageScanner]::Fixture=$taskEdgeBitmap
 $taskToken=$taskFirst.Anchor();$taskRepeat=$taskFirst.Anchor()
 [ArtifactPageScanner]::Fixture=$taskBitmap
 $taskSecond=New-TaskScanner $true;$taskSecond.RestoreAnchor($taskToken)
 $taskSaved=[ArtifactPageScanner].GetField('gridAnchor',$taskFlags).GetValue($taskSecond)
 if($After){
  $taskCrop=[Drawing.Bitmap]::new($After);$taskG=[Drawing.Graphics]::FromImage($taskComparison)
  try{if($taskCrop.Width+$AfterCropX -ne $taskComparison.Width -or $taskCrop.Height+$AfterCropY -ne $taskComparison.Height){throw 'Unexpected crop'};$taskG.DrawImageUnscaled($taskCrop,$AfterCropX,$AfterCropY)}finally{$taskG.Dispose();$taskCrop.Dispose()}
 }
 $taskAnalyze=[ArtifactPageScanner].GetMethods([Reflection.BindingFlags]'Static,Public,NonPublic')|Where-Object {$_.Name -eq 'Analyze' -and $_.GetParameters().Length -eq 2}
 $taskAfter=$taskAnalyze.Invoke($null,[object[]]@($taskComparison,$taskSaved))
 $taskFailures=@()
 foreach($taskCase in @('owner','geometry','unpaused','truncated','extra','oversized','version','first-row','bounds','render-state','multiple-selected')){
  $taskCandidate=New-TaskScanner ($taskCase -ne 'unpaused') $(if($taskCase -eq 'owner'){9999}else{1234})
  [ArtifactPageScanner]::TestOffset=$(if($taskCase -eq 'geometry'){100}else{0})
  $taskBad=$taskToken
  if($taskCase -eq 'truncated'){$taskBad=$taskToken.Substring(0,8)}
  if($taskCase -eq 'oversized'){$taskBad='A'*1048577}
  if($taskCase -eq 'extra'){$taskBad=[Convert]::ToBase64String([byte[]]([Convert]::FromBase64String($taskToken)+[byte]1))}
  if($taskCase -eq 'version'){$taskBytes=[Convert]::FromBase64String($taskToken);$taskBytes[0]=99;$taskBad=[Convert]::ToBase64String($taskBytes)}
  if($taskCase -in @('first-row','bounds')){
   $taskBytes=[Convert]::FromBase64String($taskToken);$taskOffset=28+[BitConverter]::ToInt32($taskBytes,24)+4
   if($taskCase -eq 'bounds'){$taskOffset+=8;$taskValue=[int]::MaxValue}else{$taskValue=1}
   [BitConverter]::GetBytes([int]$taskValue).CopyTo($taskBytes,$taskOffset);$taskBad=[Convert]::ToBase64String($taskBytes)
  }
  if($taskCase -eq 'render-state'){$taskBytes=[Convert]::FromBase64String($taskToken);$taskOffset=28+[BitConverter]::ToInt32($taskBytes,24)+4+24;$taskBytes[$taskOffset]=8;$taskBad=[Convert]::ToBase64String($taskBytes)}
  if($taskCase -eq 'multiple-selected'){
   $taskBytes=[Convert]::FromBase64String($taskToken);$taskOffset=28+[BitConverter]::ToInt32($taskBytes,24)+4+24
   $taskBytes[$taskOffset]=$taskBytes[$taskOffset] -bor 5;$taskBytes[$taskOffset+9241]=$taskBytes[$taskOffset+9241] -bor 5
   $taskBad=[Convert]::ToBase64String($taskBytes)
  }
  $taskRejected=$false;try{$taskCandidate.RestoreAnchor($taskBad)}catch{$taskRejected=$true}
  $taskFailures+=@{case=$taskCase;rejected=$taskRejected;assigned=($null -ne [ArtifactPageScanner].GetField('gridAnchor',$taskFlags).GetValue($taskCandidate))}
 }
 [Console]::WriteLine((@{supportsSnapshot=$true;tokenChars=$taskToken.Length;repeatSame=($taskToken -eq $taskRepeat);before=$taskBefore.pageSignature;after=$taskAfter.pageSignature;failures=$taskFailures}|ConvertTo-Json -Depth 8 -Compress))
}finally{$taskBitmap.Dispose();$taskEdgeBitmap.Dispose();$taskComparison.Dispose()}
