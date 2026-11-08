import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

if (process.platform !== 'win32') throw new Error('Windows 后端必须在 Windows 上构建。');
const backend = path.resolve(import.meta.dirname, '../../backend');
const bundled = path.join(backend, 'dist/selark-core');
const python = process.env.SELARK_BUILD_PYTHON || (existsSync(path.join(backend, '.venv/Scripts/python.exe')) ? path.join(backend, '.venv/Scripts/python.exe') : 'python');
const run = (args, options = {}) => {
  const result = spawnSync(python, args, { cwd: backend, windowsHide: true, shell: false, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw new Error(`后端构建失败。请先安装 backend/requirements-build.lock。${result.error?.message || result.stderr || ''}`);
  return result.stdout?.trim();
};
async function files(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === '__pycache__' || entry.name.endsWith('.pyc') || entry.name === 'build-manifest.json') continue;
    const name = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(path.join(root, entry.name), name + '/'));
    else if (entry.isFile()) result.push(name);
  }
  return result.sort();
}
const digest = contents => createHash('sha256').update(contents).digest('hex');
// PyInstaller copies installed distribution metadata. Refresh it from this checkout
// so a removed dependency cannot survive in an otherwise up-to-date bundle.
run(['-m', 'pip', 'install', '--no-index', '--no-deps', '--no-build-isolation', '--editable', '.']);
const environment = JSON.parse(run(['-c', 'import hashlib,importlib.metadata,json,sys,PyInstaller; metadata=importlib.metadata.distribution("selark").read_text("METADATA"); print(json.dumps({"python":sys.version,"pyinstaller":PyInstaller.__version__,"metadataHash":hashlib.sha256(metadata.encode()).hexdigest()}))']));
const names = [...(await files(path.join(backend, 'src/selark'))).map(name => 'src/selark/' + name), 'pyproject.toml', 'requirements.lock', 'requirements-build.lock', 'selark-windows.spec', 'scripts/windows_entry.py'];
const source = createHash('sha256').update(JSON.stringify(environment));
for (const name of names) source.update(name).update(await readFile(path.join(backend, name)));
const sourceHash = source.digest('hex');
const manifestFile = path.join(bundled, 'build-manifest.json');
let previous;
try { previous = JSON.parse(await readFile(manifestFile, 'utf8')); } catch { /* First build. */ }
if (previous?.sourceHash === sourceHash && previous.files?.['selark-core.exe']) {
  let valid = true;
  for (const [name, hash] of Object.entries(previous.files)) {
    try { if (digest(await readFile(path.join(bundled, name))) !== hash) valid = false; } catch { valid = false; }
  }
  if (valid) { console.log('Windows 后端已与当前源码一致，复用已验证的目录包。'); process.exit(0); }
}
run(['-m', 'PyInstaller', '--noconfirm', 'selark-windows.spec'], { stdio: 'inherit' });
const hashes = {};
let bytes = 0;
for (const name of await files(bundled)) {
  const contents = await readFile(path.join(bundled, name));
  hashes[name] = digest(contents); bytes += contents.length;
}
await writeFile(manifestFile, JSON.stringify({ protocol: 1, sourceHash, environment, bytes, files: hashes }, null, 2) + '\n');
console.log(`Windows 后端已打包：${(bytes / 1048576).toFixed(1)} MiB，${Object.keys(hashes).length} 个文件。`);
