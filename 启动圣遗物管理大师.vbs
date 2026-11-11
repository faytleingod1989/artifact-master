Option Explicit

Dim shell, fso, appExe, dryRun, argument
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appExe = fso.GetParentFolderName(WScript.ScriptFullName) & "\apps\web\release-fullpage-candidate-r3\ArtifactMaster-0.1.0-fullpage-candidate-20261110-r3.exe"
dryRun = False
For Each argument In WScript.Arguments
  If LCase(argument) = "--dry-run" Then dryRun = True
Next

If dryRun Then WScript.Echo appExe
If Not fso.FileExists(appExe) Then
  If dryRun Then
    WScript.Echo "MISSING: capture personal package required; no public or old EXE fallback."
  Else
    MsgBox "Capture personal Windows app was not found:" & vbCrLf & appExe & vbCrLf & "Restore this exact release-local package and try again. Public and old packages will not be opened.", 16, "Artifact Master"
  End If
  WScript.Quit 1
End If

If dryRun Then
  WScript.Echo "FOUND: path verified only; app was not started."
  WScript.Quit 0
End If
shell.Run Chr(34) & appExe & Chr(34), 1, False
