"""Real protocol tests. Set OCR_MODEL_DIR to the two pinned local ONNX files."""
import base64, json, os, pathlib, subprocess, sys, unittest
ROOT = pathlib.Path(__file__).resolve().parent
MODELS = os.environ.get('OCR_MODEL_DIR', str(ROOT / 'models'))
class WorkerTests(unittest.TestCase):
    @unittest.skipUnless(os.environ.get('OCR_TEST_IMAGE'), 'OCR_TEST_IMAGE not set')
    def test_v2_invalid_version_and_mode_do_not_silently_run_general(self):
        image = base64.b64encode(pathlib.Path(os.environ['OCR_TEST_IMAGE']).read_bytes()).decode()
        jobs = [{'id': 8, 'protocolVersion': 999, 'mode': 'auto', 'image': image}, {'id': 9, 'protocolVersion': 2, 'mode': 'remote', 'image': image}]
        run = subprocess.run([sys.executable, str(ROOT / 'worker.py'), '--models', MODELS], input=''.join(json.dumps(job) + '\n' for job in jobs), text=True, encoding='utf-8', capture_output=True, timeout=40)
        self.assertEqual(run.returncode, 0)
        replies = [json.loads(line) for line in run.stdout.splitlines()][1:]
        self.assertTrue(all('error' in reply for reply in replies))
    @unittest.skipUnless(os.environ.get('OCR_TEST_IMAGE'), 'OCR_TEST_IMAGE not set')
    def test_persistent_worker_reads_two_images_and_rejects_non_png_without_exiting(self):
        image = pathlib.Path(os.environ['OCR_TEST_IMAGE']).read_bytes()
        jobs = [{'id': 1, 'image': 'not-base64'}, {'id': 2, 'image': base64.b64encode(image).decode()}, {'id': 3, 'image': base64.b64encode(image).decode()}]
        run = subprocess.run([sys.executable, str(ROOT / 'worker.py'), '--models', MODELS], input=''.join(json.dumps(job) + '\n' for job in jobs), text=True, encoding='utf-8', capture_output=True, timeout=40)
        self.assertEqual(run.returncode, 0, run.stderr[-1000:])
        output = [json.loads(line) for line in run.stdout.splitlines()]
        self.assertTrue(output[0]['ready'])
        self.assertIn('error', output[1])
        for reply in output[2:]:
            self.assertEqual(reply['engine'], 'PP-OCRv5-server')
            self.assertEqual((reply['width'], reply['height']), (911, 798))
            self.assertTrue(any('元素充能效率+6.5%' in line['text'] for line in reply['lines']))
            self.assertTrue(any('暴击率+6.2%' in line['text'] for line in reply['lines']))
            self.assertFalse(any(line['occluded'] for line in reply['lines']))
        self.assertEqual([r['id'] for r in output[1:]], [1, 2, 3])
    def test_missing_models_fail_closed_without_downloading(self):
        run = subprocess.run([sys.executable, str(ROOT / 'worker.py'), '--models', str(ROOT / 'does-not-exist')], text=True, encoding='utf-8', capture_output=True, timeout=10)
        self.assertNotEqual(run.returncode, 0)
        self.assertNotIn('"ready": true', run.stdout)
if __name__ == '__main__': unittest.main()
