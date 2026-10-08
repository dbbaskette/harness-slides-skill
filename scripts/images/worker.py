# SPDX-License-Identifier: AGPL-3.0-only
# Optional Gemini Web worker. See LICENSE in this directory and NOTICE.md.
"""One JSON request on stdin, one compact result on stdout, then exit.
No listener or bridge process. Private receipts preserve download recovery.
"""
import asyncio
import contextlib
import fcntl
import hashlib
import inspect
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import time
import warnings

PIN = '8c5b1dcbf54ecf093551cc20bd25cef438190ba8'
AUDIT = {
    'client.py': 'abe9928bf00bb96118ed8f2eb40a3e6920ef2eb66344de958eb25c79116e0575',
    'utils/decorators.py': '5e4a2510d97e8151ca425b72866804b869bf171b440b1f39e9f2c50de3ea8ac9',
}
LIMIT = 20 * 1024 * 1024


class ImageError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def private_dir(path):
    path = Path(path).absolute()
    # Never follow a symlink into credential storage.
    for part in [*reversed(path.parents), path]:
        if part.is_symlink():
            raise ImageError('unsafe_state')
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    info = path.stat()
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise ImageError('unsafe_state')
    return path


def read_private(path):
    if path.is_symlink():
        raise ImageError('unsafe_state')
    info = path.stat()
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise ImageError('unsafe_state')
    return json.loads(path.read_text())


def save_private(path, value):
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix='.receipt-')
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, separators=(',', ':'))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
        # Persist submission/receipt across a crash, before any network mutation.
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        Path(temp).unlink(missing_ok=True)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def image_info(path):
    from PIL import Image
    if not path.is_file() or path.stat().st_size > LIMIT:
        raise ImageError('invalid_image')
    with warnings.catch_warnings():
        warnings.simplefilter('error', Image.DecompressionBombWarning)
        try:
            with Image.open(path) as image:
                if image.format not in ('PNG', 'JPEG', 'WEBP') or image.width * image.height > 40_000_000:
                    raise ImageError('invalid_image')
                result = {'width': image.width, 'height': image.height, 'format': image.format}
                image.verify()
        except ImageError:
            raise
        except Exception:
            raise ImageError('invalid_image') from None
    return {**result, 'sha256': sha(path.read_bytes())}


def target(project, relative):
    project = Path(project).resolve(strict=True)
    path = Path(relative)
    if path.is_absolute() or '..' in path.parts or len(path.parts) < 2 or path.parts[0] != 'assets':
        raise ImageError('output_must_be_in_assets')
    if path.suffix.lower() != '.png':
        raise ImageError('output_must_be_png')
    output = project / path
    for part in [*reversed(output.relative_to(project).parents)][1:]:
        if (project / part).is_symlink():
            raise ImageError('unsafe_output')
    if output.is_symlink() or output.with_suffix('.image.json').is_symlink():
        raise ImageError('unsafe_output')
    output.parent.mkdir(parents=True, exist_ok=True)
    if not output.parent.resolve().is_relative_to(project):
        raise ImageError('unsafe_output')
    return project, output


class WebTransport:
    def __init__(self):
        from gemini_webapi import GeminiClient
        from gemini_webapi.types import GeneratedImage
        from gemini_webapi.exceptions import GeminiError
        from loguru import logger
        logger.remove()
        base = Path(inspect.getfile(GeminiClient)).parent
        for relative, expected in AUDIT.items():
            if sha((base / relative).read_bytes()) != expected:
                raise ImageError('runtime_version_mismatch')
        # The audited decorator accepts current_retry=0. Disable its generation
        # retries AND stream history recovery; an ambiguous send is never replayed.
        class SingleAttemptClient(GeminiClient):
            async def _generate(self, *args, **kwargs):
                kwargs['current_retry'] = 0
                async for item in super()._generate(*args, **kwargs):
                    yield item

            async def read_chat(self, *args, **kwargs):
                raise GeminiError('Automatic history recovery disabled')
        self.client_type = SingleAttemptClient
        self.generated_type = GeneratedImage
        self.client = None

    async def ready(self, cookies):
        self.client = self.client_type(cookies['__Secure-1PSID'], cookies.get('__Secure-1PSIDTS'))
        await self.client.init(timeout=120, auto_close=False, auto_refresh=True, verbose=False)
        if self.client.account_status.name != 'AVAILABLE':
            raise ImageError('auth_required')

    def models(self):
        return [{'id': m.model_id, 'name': m.model_name, 'available': m.available}
                for m in self.client.list_models() or []]

    def select_model(self, name):
        if not name:
            return None  # Explicit contract: account default, recorded as such.
        matches = [m for m in self.client.list_models() or []
                   if name.lower() in {str(x).lower() for x in [m.model_id, m.model_name, *m.aliases]}]
        if len(matches) != 1 or not matches[0].available:
            raise ImageError('model_unavailable')
        return matches[0]

    async def generate(self, prompt, references, model):
        result = await self.client.generate_content(prompt, files=references or None, model=model)
        images = [image for image in result.images if isinstance(image, self.generated_type)]
        if len(images) != 1:
            raise ImageError('expected_one_generated_image')
        image = images[0]
        return {key: getattr(image, key) for key in ('url', 'cid', 'rid', 'rcid', 'image_id')}

    async def download(self, receipt, directory):
        image = self.generated_type(**receipt, client_ref=self.client)
        return Path(await image.save(path=str(directory), filename='download.bin', verbose=False))

    async def close(self):
        if self.client:
            await self.client.close()


async def execute(request, root, transport_factory=WebTransport):
    action = request['action']
    cookie_file = root / 'cookies.json'
    if action == 'status':
        return {'status': 'configured' if cookie_file.exists() and read_private(cookie_file) else 'setup_required',
                'provider': 'gemini-web', 'liveChecked': False}
    if action == 'runtime':
        transport_factory()
        return {'status': 'ready', 'audited': True}
    if action == 'auth':
        cookies = {key: request['cookies'][key] for key in ('__Secure-1PSID', '__Secure-1PSIDTS')
                   if request['cookies'].get(key)}
        if not cookies.get('__Secure-1PSID'):
            raise ImageError('auth_required')
        old = read_private(cookie_file) if cookie_file.exists() else {}
        cookies['identity'] = old.get('identity') if old.get('__Secure-1PSID') == cookies['__Secure-1PSID'] else sha(os.urandom(32))
    if action not in ('auth', 'check', 'generate', 'download'):
        raise ImageError('unknown_action')
    if action != 'auth':
        if not cookie_file.exists():
            raise ImageError('setup_required')
        cookies = read_private(cookie_file)
    job = None
    if action in ('generate', 'download'):
        job_id = request.get('id', '')
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', job_id):
            raise ImageError('request_id_required')
        jobs = private_dir(root / 'jobs')
        job_path = jobs / (job_id + '.json')
        project, output = target(request['project'], request['output']) if action == 'generate' else (None, None)
        if action == 'generate':
            prompt_path = Path(request['promptFile']).resolve(strict=True)
            if prompt_path.stat().st_size > 64 * 1024:
                raise ImageError('prompt_too_large')
            prompt = prompt_path.read_text().strip()
            if not prompt:
                raise ImageError('empty_prompt')
            references = [Path(p).resolve(strict=True) for p in request.get('references', [])]
            if len(references) > 5:
                raise ImageError('too_many_references')
            reference_hashes = [image_info(p)['sha256'] for p in references]
            fingerprint = sha(json.dumps([str(project), request['output'], prompt, reference_hashes,
                                          request.get('model'), cookies['identity']], separators=(',', ':')).encode())
            if job_path.exists():
                job = read_private(job_path)
                if job['fingerprint'] != fingerprint:
                    raise ImageError('request_id_conflict')
            else:
                if output.exists() or output.with_suffix('.image.json').exists():
                    raise ImageError('output_exists')
                job = {'id': job_id, 'fingerprint': fingerprint, 'project': str(project), 'output': request['output'],
                       'promptSha256': sha(prompt.encode()), 'referenceSha256': reference_hashes,
                       'model': request.get('model') or 'account-default', 'identity': cookies['identity'],
                       'created': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'status': 'prepared'}
        else:
            if not job_path.exists():
                raise ImageError('unknown_request')
            job = read_private(job_path)
            if Path(request['project']).resolve(strict=True) != Path(job['project']):
                raise ImageError('request_project_conflict')
            project, output = target(job['project'], job['output'])
        if job['identity'] != cookies['identity']:
            raise ImageError('request_account_changed')
        if job['status'] in ('submitted', 'uncertain'):
            raise ImageError('generation_uncertain')
        if job['status'] == 'rejected':
            raise ImageError('expected_one_generated_image')
        if job['status'] == 'downloaded':
            if not output.exists() or image_info(output)['sha256'] != job['result']['sha256']:
                raise ImageError('downloaded_asset_changed')
            # Recover a missing metadata sidecar after a crash, without provider access.
            write_metadata(output, job)
            return job['result']
        if action == 'download' and job['status'] != 'generated':
            raise ImageError('no_download_receipt')
    transport = transport_factory()
    try:
        await transport.ready(cookies)
        if action in ('auth', 'check'):
            if action == 'auth':
                save_private(cookie_file, cookies)
            return {'status': 'ready', 'provider': 'gemini-web', 'liveChecked': True, 'models': transport.models()}
        if job['status'] == 'prepared':
            model = transport.select_model(request.get('model'))
            job['status'] = 'submitted'
            save_private(job_path, job)
            try:
                job['image'] = await transport.generate(
                    'Generate exactly one original image. Do not retrieve a web search image.\n' + prompt,
                    references, model)
            except ImageError as error:
                job['status'] = 'rejected' if error.code == 'expected_one_generated_image' else 'uncertain'
                save_private(job_path, job)
                raise
            except Exception:
                job['status'] = 'uncertain'
                save_private(job_path, job)
                raise ImageError('generation_uncertain') from None
            job['status'] = 'generated'
            save_private(job_path, job)
        # Retain this receipt even if saving/validation fails. No new generation.
        with tempfile.TemporaryDirectory(dir=root, prefix='download-') as folder:
            try:
                raw = await transport.download(dict(job['image']), Path(folder))
                if not raw.resolve().is_relative_to(Path(folder).resolve()):
                    raise ImageError('invalid_download_path')
                info = image_info(raw)
                # Gemini often returns JPEG even when the requested name is PNG.
                # Normalize pixels to actual PNG bytes for the deck's local asset.
                from PIL import Image
                normalized = Path(folder) / 'asset.png'
                with Image.open(raw) as image:
                    image.save(normalized, 'PNG')
                info = image_info(normalized)
                if output.exists():
                    if image_info(output)['sha256'] != info['sha256']:
                        raise ImageError('output_exists')
                else:
                    # Exclusive publication; never overwrite artwork already present.
                    publish_exclusive(output, normalized.read_bytes())
                job['result'] = {'status': 'downloaded', 'id': job['id'], 'path': str(output),
                                 'width': info['width'], 'height': info['height'], 'sha256': info['sha256'],
                                 'metadata': str(output.with_suffix('.image.json'))}
                job['status'] = 'downloaded'
                save_private(job_path, job)
                write_metadata(output, job)
                return job['result']
            except ImageError:
                raise
            except Exception:
                raise ImageError('download_failed') from None
    finally:
        with contextlib.suppress(Exception):
            await transport.close()


def publish_exclusive(path, data):
    fd, staged = tempfile.mkstemp(dir=path.parent, prefix='.image-')
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(staged, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        Path(staged).unlink(missing_ok=True)


def write_metadata(output, job):
    metadata = {'provider': 'gemini-web', 'libraryRevision': PIN, 'requestId': job['id'],
                'generated': True, 'model': job['model'], 'created': job['created'],
                'promptSha256': job['promptSha256'], 'referenceSha256': job['referenceSha256'],
                **{k: job['result'][k] for k in ('width', 'height', 'sha256')}}
    path = output.with_suffix('.image.json')
    if path.exists():
        if read_private(path) != metadata:
            raise ImageError('metadata_exists')
    else:
        publish_exclusive(path, json.dumps(metadata, indent=2).encode())


def main():
    os.umask(0o077)
    request = json.loads(sys.stdin.readline(128 * 1024))
    root = private_dir(request['state'])
    os.environ['GEMINI_COOKIE_PATH'] = str(private_dir(root / 'cookie-cache'))
    fd = os.open(root / 'worker.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ImageError('busy') from None
        return asyncio.run(execute(request, root))
    finally:
        os.close(fd)


if __name__ == '__main__':
    try:
        print(json.dumps(main(), separators=(',', ':')))
    except ImageError as error:
        print(json.dumps({'status': 'error', 'code': error.code}, separators=(',', ':')))
        sys.exit(1)
    except Exception:
        # Never print upstream errors, URLs, prompts or cookie values.
        print('{"status":"error","code":"image_operation_failed"}')
        sys.exit(1)
