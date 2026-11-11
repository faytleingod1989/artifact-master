"""Offline PP-OCRv5 worker. Fixed models, bounded PNG-only stdin/stdout protocol."""
import argparse, base64, contextlib, hashlib, json, os, pathlib, socket, struct, sys, time
from recognition_router import recognize_image
os.environ['OMP_NUM_THREADS'] = '4'
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
ENGINE = 'PP-OCRv5-server'
LIMIT = 16 * 1024 * 1024
HASHES = {
    'ch_PP-OCRv5_det_mobile.onnx': '4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae',
    'ch_PP-OCRv5_rec_server.onnx': 'e09385400eaaaef34ceff54aeb7c4f0f1fe014c27fa8b9905d4709b65746562a',
}
def deny_network(*args, **kwargs): raise RuntimeError('Network is disabled in the local OCR worker')
socket.create_connection = deny_network
socket.socket.connect = deny_network
socket.socket.connect_ex = deny_network

def decode_png(value):
    if not isinstance(value, str) or len(value) > LIMIT * 4 // 3 + 4: raise ValueError('PNG size exceeds limit')
    data = base64.b64decode(value, validate=True)
    if len(data) < 33 or len(data) > LIMIT or data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR': raise ValueError('PNG required')
    width, height = struct.unpack('>II', data[16:24])
    if not (0 < width <= 4096 and 0 < height <= 4096 and width * height <= 8 * 1024 * 1024): raise ValueError('PNG dimensions exceed limit')
    import cv2, numpy as np
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.shape[:2] != (height, width): raise ValueError('PNG decode failed')
    return image

def box_occluded(image, box):
    import numpy as np
    height, width = image.shape[:2]
    left, right = max(0, int(min(p[0] for p in box))), min(width, int(max(p[0] for p in box)) + 1)
    top, bottom = max(0, int(min(p[1] for p in box))), min(height, int(max(p[1] for p in box)) + 1)
    line_height = max(1, bottom - top)
    scan_top, scan_bottom = max(0, top - line_height * 2), min(height, bottom + line_height * 2)
    # A flare beside a detected text box is irrelevant. Only a long saturated
    # streak crossing the actual text box can invalidate its observed value.
    white = np.min(image[scan_top:scan_bottom, left:right:2], axis=2) > 248
    for column in white.T:
        edges = np.flatnonzero(np.diff(np.r_[False, column, False].astype(np.int8)))
        for start, end in zip(edges[::2], edges[1::2]):
            if end - start > max(32, line_height * 1.45) and scan_top + start < bottom and scan_top + end > top: return True
    return False

def emit(value): print(json.dumps(value, ensure_ascii=False, allow_nan=False), flush=True)

def create_engine(folder):
    for name, digest in HASHES.items():
        path = folder / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest: raise ValueError('Pinned local OCR model missing or corrupt')
    with contextlib.redirect_stdout(sys.stderr):
        from rapidocr import RapidOCR, OCRVersion, ModelType
        engine = RapidOCR(params={
            'Global.use_cls': False, 'Global.log_level': 'error',
            'Det.ocr_version': OCRVersion.PPOCRV5, 'Det.model_type': ModelType.MOBILE, 'Det.model_path': str(folder / 'ch_PP-OCRv5_det_mobile.onnx'),
            'Rec.ocr_version': OCRVersion.PPOCRV5, 'Rec.model_type': ModelType.SERVER, 'Rec.model_path': str(folder / 'ch_PP-OCRv5_rec_server.onnx'),
            'EngineConfig.onnxruntime.intra_op_num_threads': 4, 'EngineConfig.onnxruntime.inter_op_num_threads': 1,
        })
        engine._load_det_model(); engine._load_rec_model()
    return engine

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--models', required=True)
    folder = pathlib.Path(parser.parse_args().models).resolve()
    engine = create_engine(folder)
    emit({'ready': True, 'engine': ENGINE, 'protocolVersion': 2})
    while True:
        line = sys.stdin.buffer.readline(LIMIT * 4 // 3 + 1024)
        if not line: return
        if not line.endswith(b'\n'): raise ValueError('Protocol input exceeds limit')
        request_id = None
        try:
            job = json.loads(line); request_id = job.get('id')
            if type(request_id) is not int or not 0 < request_id < 2**53: raise ValueError('Invalid request id')
            version = job.get('protocolVersion', 1)
            if type(version) is not int or version not in (1, 2): raise ValueError('Unknown protocol version')
            mode = job.get('mode', 'general') if version == 2 else 'general'
            if mode not in ('auto', 'general'): raise ValueError('Unknown OCR mode')
            started = time.perf_counter(); image = decode_png(job.get('image')); decoded = time.perf_counter()
            with contextlib.redirect_stdout(sys.stderr): result = recognize_image(engine, image, job.get('layout') if version == 2 else None, mode, box_occluded)
            result['timings']['decodeMs'] = round((decoded - started) * 1000, 2)
            emit({'id': request_id, 'engine': ENGINE, 'width': image.shape[1], 'height': image.shape[0], 'elapsedMs': round((time.perf_counter() - started) * 1000, 2), **result})
        except Exception:
            emit({'id': request_id, 'error': '本地 OCR 未能识别此帧，请重新采集；不会猜测数值。'})

if __name__ == '__main__':
    try: main()
    except Exception:
        print('Local OCR startup/protocol failed; no online fallback.', file=sys.stderr)
        sys.exit(1)
