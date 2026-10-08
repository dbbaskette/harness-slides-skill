"""Offline provider fixtures: no Google sign-in, generation or billing."""
import asyncio
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from PIL import Image

spec = importlib.util.spec_from_file_location('images', Path(__file__).parents[1] / 'scripts/images/worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class FakeTransport:
    def __init__(self):
        self.generations = 0
        self.downloads = 0
        self.closes = 0
        self.failure = None
        self.download_failure = False
        self.format = 'JPEG'

    async def ready(self, cookies):
        self.cookies = cookies

    def select_model(self, model):
        if model == 'missing':
            raise worker.ImageError('model_unavailable')
        return model

    async def generate(self, prompt, references, model):
        self.generations += 1
        self.request = [prompt, references, model]
        if self.failure:
            raise self.failure
        return {'url': 'https://lh3.googleusercontent.com/private-generated-image', 'cid': 'chat',
                'rid': 'reply', 'rcid': 'candidate', 'image_id': 'image'}

    async def download(self, receipt, directory):
        self.downloads += 1
        if self.download_failure:
            raise RuntimeError('secret upstream URL and cookies MUST NOT LEAK')
        path = directory / 'returned.bin'
        if self.format == 'INVALID':
            path.write_bytes(b'not an image')
        else:
            Image.new('RGB', (40, 24), 'blue').save(path, self.format)
        return path

    async def close(self):
        self.closes += 1

    def models(self):
        return [{'id': 'test', 'name': 'fixture', 'available': True}]


class ImagesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.state = worker.private_dir(self.base / 'state')
        self.project = self.base / 'project'
        self.project.mkdir()
        self.prompt = self.project / 'brief.txt'
        self.prompt.write_text('A hero image of a cloud platform, no words.')
        worker.save_private(self.state / 'cookies.json', {'__Secure-1PSID': 'private-cookie', 'identity': 'signed-in-fixture'})
        self.transport = FakeTransport()
        self.request = {'action': 'generate', 'id': 'deck-slide-04', 'project': str(self.project),
                        'output': 'assets/slide-04.png', 'promptFile': str(self.prompt)}

    def execute(self, request=None):
        return asyncio.run(worker.execute(request or self.request, self.state, lambda: self.transport))

    def error(self, code, request=None):
        with self.assertRaises(worker.ImageError) as caught:
            self.execute(request)
        self.assertEqual(caught.exception.code, code)

    def test_generated_jpeg_normalized_to_png_and_compact_metadata(self):
        ref = self.project / 'reference.png'
        Image.new('RGB', (3, 3), 'red').save(ref)
        self.request['references'] = [str(ref)]
        self.request['model'] = 'selected'
        result = self.execute()
        self.assertEqual((result['width'], result['height']), (40, 24))
        path = Path(result['path'])
        with Image.open(path) as image:
            self.assertEqual(image.format, 'PNG')
        public = json.loads(Path(result['metadata']).read_text())
        self.assertTrue(public['generated'])
        self.assertEqual(public['model'], 'selected')
        self.assertEqual(public['sha256'], worker.sha(path.read_bytes()))
        self.assertEqual(len(public['referenceSha256']), 1)
        self.assertEqual(self.transport.request[1], [ref])
        self.assertNotIn('cookie', json.dumps(public))
        self.assertNotIn('googleusercontent', json.dumps(result))
        self.assertNotIn('cloud platform', json.dumps(public))
        for private in [self.state / 'cookies.json', self.state / 'jobs/deck-slide-04.json', path, Path(result['metadata'])]:
            self.assertEqual(private.stat().st_mode & 0o077, 0)
        self.assertEqual(self.execute(), result)
        self.assertEqual(self.transport.generations, 1)
        self.assertEqual(self.transport.downloads, 1)

    def test_failed_download_retains_receipt_and_can_resume_in_another_process(self):
        self.transport.download_failure = True
        self.error('download_failed')
        self.assertEqual(self.transport.generations, 1)
        saved = worker.read_private(self.state / 'jobs/deck-slide-04.json')
        self.assertEqual(saved['status'], 'generated')
        self.assertIn('image', saved)
        self.transport = FakeTransport()
        self.prompt.unlink()
        result = self.execute({'action': 'download', 'id': self.request['id'], 'project': str(self.project)})
        self.assertEqual(result['status'], 'downloaded')
        self.assertEqual(self.transport.generations, 0)
        self.assertEqual(self.transport.downloads, 1)
        # Crash between saving completion and metadata is recovered locally.
        Path(result['metadata']).unlink()
        self.assertEqual(self.execute({'action': 'download', 'id': self.request['id'], 'project': str(self.project)}), result)
        self.assertTrue(Path(result['metadata']).exists())
        self.assertEqual(self.transport.downloads, 1)

    def test_uncertain_submission_is_never_replayed(self):
        self.transport.failure = RuntimeError('secret cookies')
        self.error('generation_uncertain')
        self.transport.failure = None
        self.error('generation_uncertain')
        self.error('generation_uncertain', {'action': 'download', 'id': self.request['id'], 'project': str(self.project)})
        self.assertEqual(self.transport.generations, 1)
        self.assertEqual(worker.read_private(self.state / 'jobs/deck-slide-04.json')['status'], 'uncertain')

    def test_non_generated_result_is_rejected_once(self):
        self.transport.failure = worker.ImageError('expected_one_generated_image')
        self.error('expected_one_generated_image')
        self.error('expected_one_generated_image')
        self.assertEqual(self.transport.generations, 1)
        self.assertEqual(self.transport.downloads, 0)

    def test_preflight_failures_do_not_submit(self):
        self.request['model'] = 'missing'
        self.error('model_unavailable')
        self.request.pop('model')
        self.request['output'] = '../outside.png'
        self.error('output_must_be_in_assets')
        self.request['output'] = 'assets/image.jpg'
        self.error('output_must_be_png')
        self.request['output'] = 'assets/slide-04.png'
        (self.project / 'assets').rmdir()
        (self.project / 'assets').symlink_to(self.base, target_is_directory=True)
        self.error('unsafe_output')
        self.assertEqual(self.transport.generations, 0)

    def test_conflicting_request_does_not_send(self):
        self.execute()
        self.prompt.write_text('A different image')
        self.error('request_id_conflict')
        self.assertEqual(self.transport.generations, 1)

    def test_changed_asset_and_metadata_are_not_overwritten(self):
        result = self.execute()
        path = Path(result['path'])
        Image.new('RGB', (40, 24), 'red').save(path)
        self.error('downloaded_asset_changed')
        self.assertEqual(self.transport.generations, 1)

    def test_invalid_download_can_retry_without_regenerating(self):
        self.transport.format = 'INVALID'
        self.error('invalid_image')
        self.assertFalse((self.project / 'assets/slide-04.png').exists())
        self.transport.format = 'WEBP'
        result = self.execute()
        self.assertEqual(result['status'], 'downloaded')
        self.assertEqual(self.transport.generations, 1)

    def test_status_is_offline_and_private_paths_are_enforced(self):
        self.assertEqual(self.execute({'action': 'status'})['liveChecked'], False)
        (self.state / 'cookies.json').chmod(0o644)
        self.error('unsafe_state', {'action': 'status'})
        unsafe = self.base / 'unsafe'
        unsafe.mkdir(mode=0o755)
        unsafe.chmod(0o755)
        with self.assertRaises(worker.ImageError):
            worker.private_dir(unsafe)
        alias = self.base / 'alias'
        alias.symlink_to(self.state, target_is_directory=True)
        with self.assertRaises(worker.ImageError):
            worker.private_dir(alias)

    def test_worker_lock_and_error_output_do_not_expose_input(self):
        req = {**self.request, 'state': str(self.state)}
        with (self.state / 'worker.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            result = subprocess.run([sys.executable, '-I', str(Path(worker.__file__))], input=json.dumps(req), text=True, capture_output=True)
            self.assertEqual(json.loads(result.stdout), {'status': 'error', 'code': 'busy'})
            self.assertEqual(result.returncode, 1)
            self.assertEqual(result.stderr, '')

    def test_real_adapter_classifies_web_images_and_disables_generation_retry(self):
        # Injectable module fixtures exercise the actual adapter without importing
        # network dependencies. Audit source check is tested separately at setup.
        import types
        from unittest.mock import patch
        class WebImage: pass
        class GeneratedImage:
            url = 'https://lh3.googleusercontent.com/generated'
            cid = rid = rcid = image_id = 'receipt'
        class Client:
            async def _generate(self, **kwargs):
                self.retry = kwargs['current_retry']
                yield 'chunk'
            async def generate_content(self, *args, **kwargs):
                return types.SimpleNamespace(images=self.images)
        class Logger:
            def remove(self): pass
        mods = {'gemini_webapi': types.SimpleNamespace(GeminiClient=Client),
                'gemini_webapi.types': types.SimpleNamespace(GeneratedImage=GeneratedImage),
                'gemini_webapi.exceptions': types.SimpleNamespace(GeminiError=RuntimeError),
                'loguru': types.SimpleNamespace(logger=Logger())}
        with patch.dict(sys.modules, mods), patch.object(worker, 'AUDIT', {}):
            adapter = worker.WebTransport()
            adapter.client = adapter.client_type()
            adapter.client.images = [WebImage()]
            with self.assertRaises(worker.ImageError):
                asyncio.run(adapter.generate('generate', [], None))
            adapter.client.images = [WebImage(), GeneratedImage()]
            self.assertIn('url', asyncio.run(adapter.generate('generate', [], None)))
            async def run():
                self.assertEqual([item async for item in adapter.client._generate()], ['chunk'])
                with self.assertRaises(RuntimeError):
                    await adapter.client.read_chat()
            asyncio.run(run())
            self.assertEqual(adapter.client.retry, 0)


class ModelAvailabilityTests(unittest.TestCase):
    def test_actual_pinned_available_model_shape(self):
        from types import SimpleNamespace
        transport = object.__new__(worker.WebTransport)
        available = SimpleNamespace(model_id='model-a', model_name='Model A', aliases=['a'], is_available=True)
        unavailable = SimpleNamespace(model_id='model-b', model_name='Model B', aliases=['b'], is_available=False)
        transport.client = SimpleNamespace(list_models=lambda: [available, unavailable])
        self.assertEqual([m['available'] for m in transport.models()], [True, False])
        self.assertIs(transport.select_model('a'), available)
        self.assertIsNone(transport.select_model(None))
        with self.assertRaises(worker.ImageError):
            transport.select_model('b')
        with self.assertRaises(worker.ImageError):
            transport.select_model('missing')

if __name__ == '__main__':
    os.umask(0o077)
    unittest.main()
