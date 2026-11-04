import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const forbidden = ['fixture-00000', 'demo-text-small', 'fixture_only', '前端开发 · 模拟数据'];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await inspect(file);
    else if (/\.(?:js|json|html)$/.test(entry.name)) {
      const source = await readFile(file, 'utf8');
      if (forbidden.some(value => source.includes(value))) throw new Error(`Development fixture included in ${file}`);
    }
  }
}
await inspect(root);
console.log('Production bundle excludes the fixture and mock workbench.');
