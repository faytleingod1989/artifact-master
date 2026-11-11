param([string]$Source,[string]$Image,[ValidateSet('parked','hover','during','unavailable')][string]$Pointer)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$text=Get-Content -Raw -Encoding UTF8 -LiteralPath $Source
$code=[regex]::Match($text,"(?s)using System;.*?(?=\r?\n'@)").Value
$code=[regex]::Replace($code,'void InputReady\(\) \{[^\r\n]*\}','void InputReady() {}')
$start=$code.IndexOf('Bitmap Grab() {');$end=$code.IndexOf('{',$start);$depth=1;$end++
while($depth -gt 0){if($code[$end] -eq '{'){$depth++};if($code[$end] -eq '}'){$depth--};$end++}
$code=$code.Substring(0,$start)+'public static Bitmap Fixture; public static int TestX,TestY,TestCalls; public static bool TestPointerOk=true,TestDuring; Bitmap Grab() {return (Bitmap)Fixture.Clone();}'+$code.Substring($end)
$code=$code.Replace('[DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr h, ref POINT p);','static bool ScreenToClient(IntPtr h, ref POINT p) {return true;}')
$code=$code.Replace('[DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);','static bool GetCursorPos(out POINT p) {TestCalls++;p=new POINT {X=TestDuring&&TestCalls==1?0:TestX,Y=TestDuring&&TestCalls==1?0:TestY};return TestPointerOk;}')
Add-Type -ReferencedAssemblies System.Drawing,System.Core -TypeDefinition $code -IgnoreWarnings -WarningAction SilentlyContinue
$bitmap=[Drawing.Bitmap]::new($Image)
try{
 $before=[ArtifactPageScanner]::Analyze($bitmap)
 $flags=[Reflection.BindingFlags]'Instance,NonPublic';$scanner=[Runtime.Serialization.FormatterServices]::GetUninitializedObject([ArtifactPageScanner])
 [ArtifactPageScanner].GetField('last',$flags).SetValue($scanner,$before);[ArtifactPageScanner]::Fixture=$bitmap
 if($Pointer -in @('hover','during')){$rect=$before.cells[0].GetType().GetField('rect',$flags).GetValue($before.cells[0]);[ArtifactPageScanner]::TestX=$rect.X+[int]($rect.Width/2);[ArtifactPageScanner]::TestY=$rect.Y+[int]($rect.Height/2);[ArtifactPageScanner]::TestDuring=$Pointer -eq 'during'}
 if($Pointer -eq 'unavailable'){[ArtifactPageScanner]::TestPointerOk=$false}
 $w=0;$h=0;$locked=$null;$success=$false
 try{$null=$scanner.Freeze('r0c0',[ref]$w,[ref]$h,[ref]$locked);$success=$true}catch{}
 @{selected=$before.selectedCellId;accepted=$success}|ConvertTo-Json -Compress
}finally{$bitmap.Dispose()}
