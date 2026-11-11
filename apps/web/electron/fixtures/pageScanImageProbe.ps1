param([string]$Source,[string]$Image,[ValidateSet('freeze','reorder','selection')][string]$Mode)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$taskText=Get-Content -Raw -Encoding UTF8 -LiteralPath $Source
$taskCode=[regex]::Match($taskText,"(?s)using System;.*?(?=\r?\n'@)").Value
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr h, ref POINT p);','static bool ScreenToClient(IntPtr h, ref POINT p) {return true;}')
$taskCode=$taskCode.Replace('[DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);','static bool GetCursorPos(out POINT p) {p=new POINT {X=0,Y=0};return true;}')
# Replace only platform capture/validation I/O in the test compilation. The real
# Analyze and Freeze decision code below remains unchanged. No scanner ctor,
# HWND, cursor movement, SendInput or live screenshot runs in this test.
$taskCode=[regex]::Replace($taskCode,'void InputReady\(\) \{[^\r\n]*\}','void InputReady() {}')
$taskStart=$taskCode.IndexOf('Bitmap Grab() {')
$taskEnd=$taskCode.IndexOf('{',$taskStart);$taskDepth=1;$taskEnd++
while($taskDepth -gt 0){if($taskCode[$taskEnd] -eq '{'){$taskDepth++};if($taskCode[$taskEnd] -eq '}'){$taskDepth--};$taskEnd++}
$taskCode=$taskCode.Substring(0,$taskStart)+'public static Bitmap Fixture; Bitmap Grab() { return (Bitmap)Fixture.Clone(); }'+$taskCode.Substring($taskEnd)
Add-Type -ReferencedAssemblies System.Drawing,System.Core -TypeDefinition $taskCode -IgnoreWarnings -WarningAction SilentlyContinue
$taskOriginal=[System.Drawing.Bitmap]::new($Image)
$taskChanged=[System.Drawing.Bitmap]$taskOriginal.Clone()
$taskFlags=[Reflection.BindingFlags]'Instance,NonPublic'
try{
  $taskBefore=[ArtifactPageScanner]::Analyze($taskOriginal)
  $taskGraphics=[System.Drawing.Graphics]::FromImage($taskChanged)
  try{
    if($Mode -eq 'freeze'){
      $taskGraphics.FillRectangle([System.Drawing.Brushes]::White,[int]($taskChanged.Width*.78),[int]($taskChanged.Height*.05),[int]($taskChanged.Width*.17),[int]($taskChanged.Height*.04))
    }elseif($Mode -eq 'selection'){
      $taskFirst=$taskBefore.cells | Where-Object id -eq 'r0c0'
      $taskFirstRect=$taskFirst.GetType().GetField('rect',$taskFlags).GetValue($taskFirst)
      $taskBrush=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(35,135,178))
      try{
        $taskGraphics.FillRectangle($taskBrush,$taskFirstRect.X-10,$taskFirstRect.Y,10,$taskFirstRect.Height)
        $taskGraphics.FillRectangle($taskBrush,$taskFirstRect.Right,$taskFirstRect.Y,10,$taskFirstRect.Height)
      }finally{$taskBrush.Dispose()}
      $taskCell=$taskBefore.cells | Where-Object id -eq 'r0c1'
      $taskRect=$taskCell.GetType().GetField('rect',$taskFlags).GetValue($taskCell)
      $taskPen=[System.Drawing.Pen]::new([System.Drawing.Color]::White,3)
      try{$taskGraphics.DrawRectangle($taskPen,$taskRect.X-4,$taskRect.Y-4,$taskRect.Width+8,$taskRect.Height+8)}finally{$taskPen.Dispose()}
    }else{
      $taskA=$taskBefore.cells | Where-Object id -eq 'r2c1'
      $taskB=$taskBefore.cells | Where-Object id -eq 'r3c1'
      $taskRectA=$taskA.GetType().GetField('rect',$taskFlags).GetValue($taskA)
      $taskRectB=$taskB.GetType().GetField('rect',$taskFlags).GetValue($taskB)
      $taskGraphics.DrawImage($taskOriginal,$taskRectA,$taskRectB,[System.Drawing.GraphicsUnit]::Pixel)
      $taskGraphics.DrawImage($taskOriginal,$taskRectB,$taskRectA,[System.Drawing.GraphicsUnit]::Pixel)
    }
  }finally{$taskGraphics.Dispose()}
  $taskAfter=[ArtifactPageScanner]::Analyze($taskChanged)
  if($Mode -eq 'selection'){
    # Production selects only after the page reference has been sealed. Raw
    # rendering evidence is allowed to differ; the sealed page identity is not.
    $taskAnalyze=[ArtifactPageScanner].GetMethods([Reflection.BindingFlags]'Static,Public,NonPublic')|Where-Object {$_.Name -eq 'Analyze' -and $_.GetParameters().Length -eq 2}
    $taskAfter=$taskAnalyze.Invoke($null,[object[]]@($taskChanged,$taskBefore.cells))
  }
  $taskRejected=$false
  if($Mode -eq 'freeze'){
    $taskScanner=[Runtime.Serialization.FormatterServices]::GetUninitializedObject([ArtifactPageScanner])
    [ArtifactPageScanner].GetField('last',$taskFlags).SetValue($taskScanner,$taskBefore)
    [ArtifactPageScanner]::Fixture=$taskChanged
    $taskWidth=0;$taskHeight=0;$taskLocked=$null
    try{$null=$taskScanner.Freeze('r0c0',[ref]$taskWidth,[ref]$taskHeight,[ref]$taskLocked)}catch{$taskRejected=$true}
  }
  [Console]::WriteLine((@{before=$taskBefore;after=$taskAfter;rejected=$taskRejected}|ConvertTo-Json -Depth 8 -Compress))
}finally{$taskOriginal.Dispose();$taskChanged.Dispose()}
