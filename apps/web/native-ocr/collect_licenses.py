"""Mechanical build artifact: retain bundled dependency licenses and hashes."""
import hashlib, importlib.metadata, json, pathlib, shutil, sys
target = pathlib.Path(__file__).parent / 'runtime' / 'ArtifactOcrWorker'
licenses = target / 'licenses'; licenses.mkdir(exist_ok=True)
for notice in ['MODEL_NOTICE.md', 'PaddleOCR-LICENSE.txt']:
    shutil.copyfile(pathlib.Path(__file__).parent / notice, licenses / notice)
packages = ['rapidocr', 'onnxruntime', 'numpy', 'opencv-python-headless', 'shapely', 'pyclipper', 'pillow', 'omegaconf', 'pyyaml', 'six', 'tqdm', 'requests', 'colorlog', 'colorama', 'charset-normalizer', 'certifi', 'idna', 'urllib3', 'packaging', 'psutil', 'flatbuffers', 'protobuf', 'sympy', 'mpmath']
versions = {}
for name in packages:
    try: dist = importlib.metadata.distribution(name)
    except importlib.metadata.PackageNotFoundError: continue
    versions[name] = dist.version
    for file in dist.files or []:
        if any(word in file.name.lower() for word in ['license', 'notice', 'copying']) and dist.locate_file(file).is_file():
            folder = licenses / name; folder.mkdir(exist_ok=True)
            shutil.copyfile(dist.locate_file(file), folder / (str(file).replace('/', '_').replace('\\', '_').replace(':', '_')))
python_license = pathlib.Path(sys.base_prefix) / 'LICENSE.txt'
if python_license.is_file(): shutil.copyfile(python_license, licenses / 'Python-LICENSE.txt')
files = []
for file in sorted(target.rglob('*')):
    if file.is_file() and file.name != 'manifest.json': files.append({'path': file.relative_to(target).as_posix(), 'bytes': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
manifest = {'engine': 'PP-OCRv5-server', 'protocolVersion': 2, 'modelRegistrySha256': hashlib.sha256((target / 'model_registry.json').read_bytes()).hexdigest(), 'routerSourceSha256': hashlib.sha256((target / 'recognition_router.py').read_bytes()).hexdigest(), 'versions': versions, 'workerSourceSha256': hashlib.sha256((pathlib.Path(__file__).parent / 'worker.py').read_bytes()).hexdigest(), 'files': files}
(target / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps({'files': len(files), 'bytes': sum(f['bytes'] for f in files), 'licenses': len(list(licenses.rglob('*')))}))
