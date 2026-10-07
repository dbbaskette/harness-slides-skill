import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
export async function pptxTool(action, args, run = exec) {
  try {
    const helper = ['inspect','patch','compare'].includes(action) ? './pptx-edit.py' : './pptx_tools.py';
    const { stdout } = await run('python3', ['-B', fileURLToPath(new URL(helper, import.meta.url)), action, ...args], { maxBuffer: 16 * 1024 * 1024, timeout: 60000 });
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(error.code === 'ENOENT' ? 'Python 3.9+ is required. Run harness-slides doctor.' : error.stderr?.trim() || error.message);
  }
}
