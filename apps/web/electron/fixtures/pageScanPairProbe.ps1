param([string]$Source,[string]$Before,[string]$After,[int]$CropX=0,[int]$CropY=0,[ValidateSet('actual','reorder','level','four-stars','no-footer','row-border','warm-merge','warm-obscured','scaled-card','selected-glow','state-icon','state-icon-lower','state-recolor','state-level','state-unavailable')][string]$Mode='actual',[string]$LevelImage='',[int]$LevelOffsetX=0,[int]$LevelOffsetY=0,[ValidateRange(1,30)][int]$Repeat=1,[ValidateRange(0,59)][int]$Target=0,[ValidateRange(1.0,1.05)][double]$Scale=1.02,[int]$PointerX=-1,[int]$PointerY=-1,[switch]$ReferenceSelectionUnknown,[switch]$ReferenceSelectedUnzoomed,[switch]$ExperimentNormalized,[switch]$ExperimentGrade)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$taskCode=[regex]::Match((Get-Content -Raw -Encoding UTF8 -LiteralPath $Source),"(?s)using System;.*?(?=\r?\n'@)").Value
if($ExperimentNormalized){$taskCode=$taskCode.Replace('if(a.SequenceEqual(b))return true;','if(a.SequenceEqual(b))return true; if(!reference.emphasized&&!current.emphasized&&SameCanonical(NormalizeAppearance(a),NormalizeAppearance(b)))return true;')}
if($ExperimentGrade){$taskCode=$taskCode.Replace('SameBand(a,b,40,47,.985,8.0)','SameBand(a,b,40,47,.97,8.0)')}
Add-Type -ReferencedAssemblies System.Drawing,System.Core -TypeDefinition $taskCode
$taskMethod=[ArtifactPageScanner].GetMethods([Reflection.BindingFlags]'Static,Public,NonPublic') | Where-Object {$_.Name -eq 'Analyze' -and $_.GetParameters().Length -eq 2}
$taskFirst=[System.Drawing.Bitmap]::new($Before)
$taskAfterFile=[System.Drawing.Bitmap]::new($After)
$taskSecond=[System.Drawing.Bitmap]$taskFirst.Clone()
try {
 $taskOriginal=[ArtifactPageScanner]::Analyze($taskFirst)
 $taskGraphics=[System.Drawing.Graphics]::FromImage($taskSecond)
 try {
  $taskGraphics.CompositingMode=[System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  if($Mode -eq 'actual' -or $Mode.StartsWith('state-')){
   # Explicit source crop offset, NOT image rescaling or a changed game window.
   if($CropX -lt 0 -or $CropY -lt 0 -or $taskAfterFile.Width+$CropX -gt $taskFirst.Width -or $taskAfterFile.Height+$CropY -gt $taskFirst.Height -or $taskAfterFile.Width+$CropX -lt $taskFirst.Width*.70 -or $taskAfterFile.Height+$CropY -lt $taskFirst.Height*.90){throw 'Unexpected screenshot crop'}
   $taskGraphics.DrawImageUnscaled($taskAfterFile,$CropX,$CropY)
   if($Mode -in @('state-icon','state-icon-lower')){
    $taskR=$taskOriginal.cells[0].GetType().GetField('rect',[Reflection.BindingFlags]'Instance,NonPublic').GetValue($taskOriginal.cells[0])
    $taskOther=$taskOriginal.cells[17].GetType().GetField('rect',[Reflection.BindingFlags]'Instance,NonPublic').GetValue($taskOriginal.cells[17])
    $taskTop=if($Mode -eq 'state-icon-lower'){.70}else{.24};$taskHeight=if($Mode -eq 'state-icon-lower'){.20}else{.66}
    $taskDst=[Drawing.Rectangle]::new($taskR.X+[int]($taskR.Width*.15),$taskR.Y+[int]($taskR.Height*$taskTop),[int]($taskR.Width*.70),[int]($taskR.Height*$taskHeight))
    $taskSrc=[Drawing.Rectangle]::new($taskOther.X+[int]($taskOther.Width*.15),$taskOther.Y+[int]($taskOther.Height*$taskTop),[int]($taskOther.Width*.70),[int]($taskOther.Height*$taskHeight))
    $taskGraphics.DrawImage($taskFirst,$taskDst,$taskSrc,[Drawing.GraphicsUnit]::Pixel)
   }elseif($Mode -eq 'state-level'){
    $taskLevel=[Drawing.Bitmap]::new($LevelImage)
    try{$taskFooter=[Drawing.Rectangle]::new(232,609,256,55);$taskLevelRect=[Drawing.Rectangle]::new(232+$LevelOffsetX,609+$LevelOffsetY,256,55);$taskGraphics.DrawImage($taskLevel,$taskFooter,$taskLevelRect,[Drawing.GraphicsUnit]::Pixel)}finally{$taskLevel.Dispose()}
   }
  }elseif($Mode -eq 'scaled-card'){
   if($Target -ge $taskOriginal.cells.Count){throw 'No target card'}
   $r=$taskOriginal.cells[$Target].GetType().GetField('rect',[Reflection.BindingFlags]'Instance,NonPublic').GetValue($taskOriginal.cells[$Target])
   $taskSrcRect=[Drawing.Rectangle]::new($r.Left,$r.Top,$r.Width,[int]($r.Height*1.19))
   $cx=$r.Left+$r.Width*.5;$cy=$r.Top+$r.Height*.6
   $destination=[Drawing.Rectangle]::new([int]($cx+($taskSrcRect.Left-$cx)*$scale),[int]($cy+($taskSrcRect.Top-$cy)*$scale),[int]($taskSrcRect.Width*$scale),[int]($taskSrcRect.Height*$scale))
   $taskGraphics.DrawImage($taskFirst,$destination,$taskSrcRect,[Drawing.GraphicsUnit]::Pixel)
   }elseif($Mode -eq 'selected-glow'){
    if($Target -ge $taskOriginal.cells.Count){throw 'No target card'}
    $cellObj=$taskOriginal.cells[$Target]
    $r=$cellObj.GetType().GetField('rect',[Reflection.BindingFlags]'Instance,NonPublic').GetValue($cellObj)
    $r2=$taskOriginal.cells[2].GetType().GetField('rect',[Reflection.BindingFlags]'Instance,NonPublic').GetValue($taskOriginal.cells[2])
    $dst2=[Drawing.Rectangle]::new($r2.Left-12,$r2.Top-12,$r2.Width+24,[int]($r2.Height*1.19)+24)
    $src2=[Drawing.Rectangle]::new($dst2.X-$CropX,$dst2.Y-$CropY,$dst2.Width,$dst2.Height)
    $taskGraphics.DrawImage($taskAfterFile,$dst2,$src2,[Drawing.GraphicsUnit]::Pixel)
    $glowSrc=[System.Drawing.Bitmap]$taskSecond.Clone()
    try{
     for($gy=$r.Top;$gy -lt $r.Top+$r.Height;$gy++){
      for($gx=$r.Left;$gx -lt $r.Right;$gx++){
       $c=$glowSrc.GetPixel($gx,$gy)
       if($c.R -ge 130 -and $c.R -le 185 -and $c.G -ge 85 -and $c.G -le 130 -and $c.B -ge 30 -and $c.B -le 68 -and ($c.R-$c.B) -ge 80){
        $glowSrc.SetPixel($gx,$gy,[Drawing.Color]::FromArgb([Math]::Min(255,$c.R+26),[Math]::Min(255,$c.G+12),[Math]::Max(0,$c.B-5)))
       }
      }
     }
     $trueCx=236+$cellObj.col*292.57+124.0;$trueCy=$r.Top+$r.Height*.6
     $taskSrcRect=[Drawing.Rectangle]::new([int]($trueCx-124),$r.Top,248,[int]($r.Height*1.19))
     $destination=[Drawing.Rectangle]::new([int]($trueCx+($taskSrcRect.Left-$trueCx)*$Scale),[int]($trueCy+($taskSrcRect.Top-$trueCy)*$Scale),[int]($taskSrcRect.Width*$Scale),[int]($taskSrcRect.Height*$Scale))
     $taskGraphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear
     $taskGraphics.DrawImage($glowSrc,$destination,$taskSrcRect,[Drawing.GraphicsUnit]::Pixel)
     $rimPen=[Drawing.Pen]::new([Drawing.Color]::FromArgb(255,255,235),6)
     try{$taskGraphics.DrawRectangle($rimPen,$destination)}finally{$rimPen.Dispose()}
    }finally{$glowSrc.Dispose()}
  }elseif($Mode -in @('warm-merge','warm-obscured')){
   # Warm scenery outside the card grid joins the gold-row projection without
   # modifying any card, star, level, or actionable pixel.
   $rect=$taskOriginal.cells[16].GetType().GetField('rect',[Reflection.BindingFlags]'Instance,NonPublic').GetValue($taskOriginal.cells[16])
   $brush=[Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(180,120,40))
   try{
    $taskGraphics.FillRectangle($brush,0,$rect.Top-8,[int]($taskFirst.Width*.04),[int]($taskFirst.Height*.90)-$rect.Top+8)
    if($Mode -eq 'warm-obscured'){$taskGraphics.FillRectangle($brush,$rect.Left,$rect.Top+[int]($rect.Height*.80),$rect.Width,[int]($rect.Height*.225))}
   }finally{$brush.Dispose()}
  }elseif($Mode -eq 'row-border'){
   $taskR=$taskOriginal.cells[8].GetType().GetField('rect',[Reflection.BindingFlags]'Instance,NonPublic').GetValue($taskOriginal.cells[8])
   $taskBrush=[Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(190,135,65))
   try{$taskGraphics.FillRectangle($taskBrush,$taskR.X-4,$taskR.Y-4,$taskR.Width+8,$taskR.Height+8);$taskGraphics.DrawImage($taskFirst,$taskR,$taskR,[Drawing.GraphicsUnit]::Pixel)}finally{$taskBrush.Dispose()}
  }elseif($Mode -in @('four-stars','no-footer')){
   # Adversarial scene-like gold, not actual cards. Neither a regular projection
   # nor gold/light rectangular scenery may grant new actionable cells.
   $taskGold=[Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(190,135,65))
   $taskStar=[Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(255,200,20))
   try{
    $taskGraphics.FillRectangle($taskGold,0,1030,[int]($taskFirst.Width*.68),[int]($taskFirst.Height*.90)-1030)
    foreach($taskRow in 0..1){foreach($taskCol in 0..7){
     $taskX=236+$taskCol*292;$taskY=1062+$taskRow*352
     $taskN=$(if($Mode -eq 'four-stars'){4}else{5})
     for($taskS=0;$taskS -lt $taskN;$taskS++){$taskGraphics.FillRectangle($taskStar,$taskX+20+[int]($taskS*200/($taskN-1)),$taskY+218,20,28)}
     if($Mode -eq 'four-stars'){
      $taskGraphics.FillRectangle([Drawing.Brushes]::Beige,$taskX,$taskY+255,248,45)
      $taskGraphics.FillRectangle([Drawing.Brushes]::DarkSlateGray,$taskX+110,$taskY+275,24,16)
     }
    }}
   }finally{$taskGold.Dispose();$taskStar.Dispose()}
  }else{
   $taskFlags=[Reflection.BindingFlags]'Instance,NonPublic'
   $taskA=$taskOriginal.cells[0].GetType().GetField('rect',$taskFlags).GetValue($taskOriginal.cells[0])
   $taskB=$taskOriginal.cells[4].GetType().GetField('rect',$taskFlags).GetValue($taskOriginal.cells[4])
   if($Mode -eq 'level'){
    $taskDest=[Drawing.Rectangle]::new($taskA.X,$taskA.Y+[int]($taskA.Height*.98),$taskA.Width,[int]($taskA.Height*.21))
    $taskSrc=[Drawing.Rectangle]::new($taskB.X,$taskB.Y+[int]($taskB.Height*.98),$taskB.Width,[int]($taskB.Height*.21))
    $taskGraphics.DrawImage($taskFirst,$taskDest,$taskSrc,[Drawing.GraphicsUnit]::Pixel)
   }else{
    $taskDest=[Drawing.Rectangle]::new($taskA.X,$taskA.Y,$taskA.Width,[int]($taskA.Height*1.2))
    $taskSrc=[Drawing.Rectangle]::new($taskB.X,$taskB.Y,$taskB.Width,[int]($taskB.Height*1.2))
    $taskGraphics.DrawImage($taskFirst,$taskDest,$taskSrc,[Drawing.GraphicsUnit]::Pixel)
    $taskGraphics.DrawImage($taskFirst,$taskSrc,$taskDest,[Drawing.GraphicsUnit]::Pixel)
   }
  }
 }finally{$taskGraphics.Dispose()}
 if($Mode -eq 'state-recolor'){
  $taskR=$taskOriginal.cells[0].GetType().GetField('rect',[Reflection.BindingFlags]'Instance,NonPublic').GetValue($taskOriginal.cells[0])
  $taskRecolored=0
  for($taskY=$taskR.Y+[int]($taskR.Height*.24);$taskY -lt $taskR.Y+$taskR.Height*.90;$taskY++){
   for($taskX=$taskR.X+[int]($taskR.Width*.15);$taskX -lt $taskR.X+$taskR.Width*.85;$taskX++){
    $taskColor=$taskSecond.GetPixel($taskX,$taskY)
    if($taskColor.R -gt $taskColor.G*1.4 -and $taskColor.R -gt $taskColor.B*1.4 -and $taskColor.G -lt 125){$taskSecond.SetPixel($taskX,$taskY,[Drawing.Color]::FromArgb($taskColor.B,$taskColor.G,$taskColor.R));$taskRecolored++}
   }
  }
  if($taskRecolored -lt 100){throw 'Recolor fixture did not change enough foreground pixels'}
 }
 $taskRaw=[ArtifactPageScanner]::Analyze($taskSecond)
 if($ReferenceSelectionUnknown){
  # Model an unavailable rim classification, without changing item pixels.
  # Rebuild state evidence through the actual production method: clearing the
  # flag alone would leave canonical data for the former known selected state.
  $taskStatic=[Reflection.BindingFlags]'Static,NonPublic'
  $taskPrivate=[Reflection.BindingFlags]'Instance,NonPublic'
  $taskPixels=[ArtifactPageScanner].GetMethod('Pixels',$taskStatic).Invoke($null,[object[]]@($taskFirst))
  $taskCanonical=[ArtifactPageScanner].GetMethod('StateAppearance',$taskStatic)
  foreach($taskCell in $taskOriginal.cells){
   $taskCell.selected=$false
   $taskRect=$taskCell.GetType().GetField('rect',$taskPrivate).GetValue($taskCell)
   $taskEvidence=$taskCanonical.Invoke($null,[object[]]@($taskPixels,$taskFirst.Width,$taskFirst.Height,$taskRect,$taskCell))
   $taskCell.GetType().GetField('canonical',$taskPrivate).SetValue($taskCell,$taskEvidence)
  }
  $taskOriginal.GetType().GetField('selectedCellId').SetValue($taskOriginal,$null)
 }
 if($ReferenceSelectedUnzoomed){
  # Model a baseline where r0c0 already has a bright selection rim while still at
  # 1.00x unexpanded scale (layout 4337dbc9), before clicking r0c0 expands it to
  # 1.05x (layout 54315b29) with selectedCellId remaining r0c0.
  $taskStatic=[Reflection.BindingFlags]'Static,NonPublic'
  $taskPrivate=[Reflection.BindingFlags]'Instance,NonPublic'
  $taskPixels=[ArtifactPageScanner].GetMethod('Pixels',$taskStatic).Invoke($null,[object[]]@($taskFirst))
  $taskCanonical=[ArtifactPageScanner].GetMethod('StateAppearance',$taskStatic)
  $taskFirstCell=$taskOriginal.cells[0]
  $taskFirstCell.selected=$true
  $taskOriginal.cells[1].selected=$false
  $taskOriginal.selectedCellId='r0c0'
  $taskFirstCell.GetType().GetField('emphasized',$taskPrivate).SetValue($taskFirstCell,$true)
  $taskRect=$taskFirstCell.GetType().GetField('rect',$taskPrivate).GetValue($taskFirstCell)
  $taskEvidence=$taskCanonical.Invoke($null,[object[]]@($taskPixels,$taskFirst.Width,$taskFirst.Height,$taskRect,$taskFirstCell))
  $taskFirstCell.GetType().GetField('canonical',$taskPrivate).SetValue($taskFirstCell,$taskEvidence)
 }
 if($Mode -eq 'state-unavailable'){
  foreach($taskCell in $taskOriginal.cells){$taskCell.GetType().GetField('canonical',[Reflection.BindingFlags]'Instance,NonPublic').SetValue($taskCell,$null)}
 }
 $taskTimings=@()
 for($taskIteration=0;$taskIteration -lt $Repeat;$taskIteration++){
  $taskWatch=[Diagnostics.Stopwatch]::StartNew()
  $taskAnchored=$taskMethod.Invoke($null,[object[]]@($taskSecond,$taskOriginal.cells))
  if($PointerX -ge 0 -and $PointerY -ge 0){
   $guard=[ArtifactPageScanner].GetMethod('RejectCursorOverlap',[Reflection.BindingFlags]'Static,Public')
   if($null -eq $guard){throw 'RejectCursorOverlap guard missing'}
   $guard.Invoke($null,[object[]]@($taskAnchored,$PointerX,$PointerY)) | Out-Null
  }
  $taskWatch.Stop();$taskTimings+=$taskWatch.Elapsed.TotalMilliseconds
 }
 $taskBounds=@($taskOriginal.cells | ForEach-Object {
  $r=$_.GetType().GetField('rect',[Reflection.BindingFlags]'Instance,NonPublic').GetValue($_)
  @{id=$_.id;x=$r.X;y=$r.Y;width=$r.Width;height=$r.Height}
 })
 $taskCompare=[ArtifactPageScanner].GetMethod('SameAppearance',[Reflection.BindingFlags]'Static,NonPublic')
 $taskMismatches=@(for($i=0;$i -lt $taskOriginal.cells.Count -and $i -lt $taskAnchored.cells.Count;$i++){if(-not $taskCompare.Invoke($null,[object[]]@($taskOriginal.cells[$i],$taskAnchored.cells[$i]))){$taskOriginal.cells[$i].id}})
 $taskEvidence=@(for($i=0;$i -lt $taskOriginal.cells.Count -and $i -lt $taskAnchored.cells.Count;$i++){if($taskOriginal.cells[$i].id -in $taskMismatches){$f=$taskOriginal.cells[$i].GetType().GetField('emphasized',[Reflection.BindingFlags]'Instance,NonPublic');$cf=$taskOriginal.cells[$i].GetType().GetField('canonical',[Reflection.BindingFlags]'Instance,NonPublic');@{id=$taskOriginal.cells[$i].id;before=$f.GetValue($taskOriginal.cells[$i]);after=$f.GetValue($taskAnchored.cells[$i]);canonicalBefore=($null -ne $cf.GetValue($taskOriginal.cells[$i]));canonicalAfter=($null -ne $cf.GetValue($taskAnchored.cells[$i]))}}})
 $taskPoseReport=@()
 if($Mode -eq 'scaled-card'){
  $flags=[Reflection.BindingFlags]'Static,NonPublic';$cellFlags=[Reflection.BindingFlags]'Instance,NonPublic';$cls=[ArtifactPageScanner]
  $pixels=$cls.GetMethod('Pixels',$flags).Invoke($null,[object[]]@($taskSecond))
  $rect=$taskOriginal.cells[$Target].GetType().GetField('rect',$cellFlags).GetValue($taskOriginal.cells[$Target])
  $raw=$taskOriginal.cells[$Target].GetType().GetField('appearance',$cellFlags).GetValue($taskOriginal.cells[$Target])
  $norm=$cls.GetMethod('NormalizeAppearance',$flags);$read=$cls.GetMethod('ReadAppearance',$flags);$band=$cls.GetMethod('SameBand',$flags)
  $reference=$norm.Invoke($null,[object[]]@(,$raw))
  foreach($pose in @(.95,.96,.97,.98,.99,1.0,1.01,1.02,1.03,1.04,1.05)){
   $variant=$norm.Invoke($null,[object[]]@(,$read.Invoke($null,[object[]]@($pixels,$taskSecond.Width,$taskSecond.Height,$rect,[double]$pose))))
   if($null -ne $reference -and $null -ne $variant){
    $sum=0.;$aa=0.;$bb=0.;$ab=0.;$sa=0.;$sb=0.;$count=0
    for($y=40;$y -lt 47;$y++){for($x=1;$x -lt 31;$x++){$i=($y*32+$x)*3;$a=[double]$reference[$i];$b=[double]$variant[$i];$sum+=[Math]::Abs($a-$b);$sa+=$a;$sb+=$b;$aa+=$a*$a;$bb+=$b*$b;$ab+=$a*$b;$count++}}
    $den=[Math]::Sqrt(($aa-$sa*$sa/$count)*($bb-$sb*$sb/$count));$ncc=if($den -gt 0){($ab-$sa*$sb/$count)/$den}else{0}
    $taskPoseReport+=@{pose=$pose;icon=$band.Invoke($null,[object[]]@($reference,$variant,1,22,[double].97,[double]6.5));level=$band.Invoke($null,[object[]]@($reference,$variant,40,47,[double].97,[double]5.0));levelMAE=[Math]::Round($sum/$count,2);levelNCC=[Math]::Round($ncc,4)}
   }
  }
 }
 [Console]::WriteLine((@{before=$taskOriginal;raw=$taskRaw;anchored=$taskAnchored;bounds=$taskBounds;mismatches=$taskMismatches;evidence=$taskEvidence;poses=$taskPoseReport;analysisMilliseconds=$taskTimings}|ConvertTo-Json -Depth 8 -Compress))
} finally {$taskFirst.Dispose();$taskSecond.Dispose();$taskAfterFile.Dispose()}
