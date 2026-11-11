param([string]$Source,[string]$Image,[ValidateSet('edges','reorder','translate','missing')][string]$Mode)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$taskCode=[regex]::Match((Get-Content -Raw -Encoding UTF8 -LiteralPath $Source),"(?s)using System;.*?(?=\r?\n'@)").Value
Add-Type -ReferencedAssemblies System.Drawing,System.Core -TypeDefinition $taskCode
$taskMethod=[ArtifactPageScanner].GetMethods([Reflection.BindingFlags]'Static,Public,NonPublic') | Where-Object {$_.Name -eq 'Analyze' -and $_.GetParameters().Length -eq 2}
if(!$taskMethod){[Console]::WriteLine('{"supportsAnchors":false}');exit 0}
$taskOriginal=[System.Drawing.Bitmap]::new($Image)
$taskChanged=[System.Drawing.Bitmap]$taskOriginal.Clone()
$taskFlags=[Reflection.BindingFlags]'Instance,NonPublic'
try{
 $taskBefore=[ArtifactPageScanner]::Analyze($taskOriginal)
 $taskFirst=$taskBefore.cells[0].GetType().GetField('rect',$taskFlags).GetValue($taskBefore.cells[0])
 $taskGraphics=[System.Drawing.Graphics]::FromImage($taskChanged)
 $taskGraphics.CompositingMode=[System.Drawing.Drawing2D.CompositingMode]::SourceCopy
 $taskGraphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
 try{
  if($Mode -eq 'edges'){
   $taskGold=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(190,135,65))
   try{$taskGraphics.FillRectangle($taskGold,$taskFirst.X-4,$taskFirst.Y-4,$taskFirst.Width+8,$taskFirst.Height+8)}finally{$taskGold.Dispose()}
   $taskGraphics.DrawImage($taskOriginal,$taskFirst,$taskFirst,[System.Drawing.GraphicsUnit]::Pixel)
  }elseif($Mode -eq 'reorder'){
   $taskA=$taskBefore.cells|Where-Object id -eq 'r2c1';$taskB=$taskBefore.cells|Where-Object id -eq 'r3c1'
   $taskRectA=$taskA.GetType().GetField('rect',$taskFlags).GetValue($taskA);$taskRectB=$taskB.GetType().GetField('rect',$taskFlags).GetValue($taskB)
   $taskGraphics.DrawImage($taskOriginal,$taskRectA,$taskRectB,[System.Drawing.GraphicsUnit]::Pixel)
   $taskGraphics.DrawImage($taskOriginal,$taskRectB,$taskRectA,[System.Drawing.GraphicsUnit]::Pixel)
  }elseif($Mode -eq 'translate'){
   $taskPane=[System.Drawing.Rectangle]::new(0,0,[int]($taskChanged.Width*.68),[int]($taskChanged.Height*.90))
   $taskGraphics.FillRectangle([System.Drawing.Brushes]::SteelBlue,$taskPane)
   $taskDestination=[System.Drawing.Rectangle]::new(8,0,$taskPane.Width,$taskPane.Height)
   $taskGraphics.DrawImage($taskOriginal,$taskDestination,$taskPane,[System.Drawing.GraphicsUnit]::Pixel)
  }else{
   $taskLast=$taskBefore.cells[-1];$taskRect=$taskLast.GetType().GetField('rect',$taskFlags).GetValue($taskLast)
   $taskGraphics.FillRectangle([System.Drawing.Brushes]::SteelBlue,$taskRect.X-8,$taskRect.Y-8,$taskRect.Width+16,$taskRect.Height+16)
  }
 }finally{$taskGraphics.Dispose()}
 $taskRaw=[ArtifactPageScanner]::Analyze($taskChanged)
 $taskAnchored=$taskMethod.Invoke($null,[object[]]@($taskChanged,$taskBefore.cells))
 [Console]::WriteLine((@{supportsAnchors=$true;before=$taskBefore;raw=$taskRaw;anchored=$taskAnchored}|ConvertTo-Json -Depth 8 -Compress))
}finally{$taskOriginal.Dispose();$taskChanged.Dispose()}
