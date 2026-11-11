param([Parameter(Mandatory=$true)][string]$Python, [Parameter(Mandatory=$true)][string]$Models)
$ErrorActionPreference = 'Stop'
$ocrRoot = $PSScriptRoot
$ocrBuild = Join-Path $env:TEMP ('artifact-ocr-build-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $ocrBuild | Out-Null
$ocrStagedModels = Join-Path $ocrBuild 'models'
New-Item -ItemType Directory -Path $ocrStagedModels | Out-Null
foreach ($ocrModel in @('ch_PP-OCRv5_det_mobile.onnx', 'ch_PP-OCRv5_rec_server.onnx')) { Copy-Item -LiteralPath (Join-Path $Models $ocrModel) -Destination (Join-Path $ocrStagedModels $ocrModel) }
$ocrPackage = (& $Python -c "import pathlib,rapidocr; print(pathlib.Path(rapidocr.__file__).parent)").Trim()
if ($LASTEXITCODE -ne 0) { throw 'Install pinned requirements in an isolated build environment first.' }
$ocrData = @('--add-data', "$ocrPackage/config.yaml;rapidocr", '--add-data', "$ocrPackage/default_models.yaml;rapidocr")
& $Python -m PyInstaller --noconfirm --onedir --console --noupx --name ArtifactOcrWorker --distpath "$ocrRoot/runtime" --workpath "$ocrBuild/work" --specpath $ocrBuild @ocrData --hidden-import rapidocr.main --hidden-import rapidocr.inference_engine.onnxruntime.main --collect-binaries onnxruntime --exclude-module torch --exclude-module paddle --exclude-module tensorflow --exclude-module openvino --exclude-module matplotlib --exclude-module scipy --exclude-module pandas "$ocrRoot/worker.py"
if ($LASTEXITCODE -ne 0) { throw 'Native OCR helper build failed.' }
foreach ($ocrSource in @('recognition_router.py', 'model_registry.json')) { Copy-Item -LiteralPath (Join-Path $ocrRoot $ocrSource) -Destination (Join-Path $ocrRoot 'runtime/ArtifactOcrWorker') }
$ocrModelTarget = Join-Path $ocrRoot 'runtime/ArtifactOcrWorker/models'
New-Item -ItemType Directory -Path $ocrModelTarget -Force | Out-Null
foreach ($ocrModel in @('ch_PP-OCRv5_det_mobile.onnx', 'ch_PP-OCRv5_rec_server.onnx')) { Copy-Item -LiteralPath (Join-Path $ocrStagedModels $ocrModel) -Destination (Join-Path $ocrModelTarget $ocrModel) }
& $Python "$ocrRoot/collect_licenses.py"
if ($LASTEXITCODE -ne 0) { throw 'Native OCR attribution/manifest build failed.' }
Write-Output "Native helper built at $ocrRoot/runtime/ArtifactOcrWorker. Verify it before packaging."
