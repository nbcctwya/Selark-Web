import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as asar from '@electron/asar';

const root = path.resolve(import.meta.dirname, '..');
const app = path.join(root, 'release/win-unpacked');
const archive = path.join(app, 'resources/app.asar');
const source = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const packaged = JSON.parse(asar.extractFile(archive, 'package.json'));
assert.equal(packaged.version, source.version);
assert.equal(packaged.main, source.main);
const digest = data => createHash('sha256').update(data).digest('hex');
let runtimeFiles = 0;
for (const name of asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, ''))) {
  const entryPath = path.normalize(name);
  if (asar.statFile(archive, entryPath).files || name === 'package.json') continue;
  assert(!/node_modules|\.test\.|mock|fixture|__pycache__/.test(name), `Development file: ${name}`);
  assert.equal(digest(asar.extractFile(archive, entryPath)), digest(await readFile(path.join(root, name))), name);
  runtimeFiles++;
}
const bundled = path.join(app, 'resources/backend');
const manifest = JSON.parse(await readFile(path.join(bundled, 'build-manifest.json'), 'utf8'));
const original = JSON.parse(await readFile(path.join(root, '../backend/dist/selark-core/build-manifest.json'), 'utf8'));
assert.deepEqual(manifest, original);
for (const [name, hash] of Object.entries(manifest.files)) assert.equal(digest(await readFile(path.join(bundled, name))), hash, name);
let payloadFiles = 0;
if (process.argv[2]) {
  const payload = path.resolve(process.argv[2]);
  const compare = async (directory, prefix = '') => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) await compare(path.join(directory, entry.name), name + '/');
      else {
        assert.equal(digest(await readFile(path.join(payload, name))), digest(await readFile(path.join(app, name))), name);
        payloadFiles++;
      }
    }
  };
  await compare(payload);
}
const installerName = `Selark-Setup-${source.version}-x64.exe`;
const installer = await readFile(path.join(root, 'release', installerName));
const sha256 = digest(installer);
await writeFile(path.join(root, 'release/SHA256SUMS.txt'), `${sha256}  ${installerName}\n`);
const report = { passed: true, version: source.version, runtimeFiles, backendFiles: Object.keys(manifest.files).length, installerPayloadFilesCompared: payloadFiles, backendBytes: manifest.bytes, installerBytes: installer.length, sha256, signed: false };
await writeFile(path.join(root, 'artifacts/package-integrity.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
