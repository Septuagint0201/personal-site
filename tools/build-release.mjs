// Run after `npm run build --prefix yard`. The output must be a new directory.
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, stat, writeFile, utimes } from 'node:fs/promises';
import { dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Usage: node tools/build-release.mjs <new-output-directory>');
const output = resolve(process.argv[2]);
await mkdir(output); // Refuse to mix this build with an older release.
const candy = resolve(output, 'candy');
await mkdir(candy);
const hash = data => createHash('sha256').update(data).digest('hex');
const names = new Map();
const images = ['avatar.jpg', 'bg.jpg', 'avatar-192.webp', 'avatar-384.webp', 'bg.avif'];
const scripts = ['site.css', 'ui-glass-preset.js', 'depth-background.js', 'liquid-glass.js', 'site.js'];
function rewrite(text) {
  for (const [source, destination] of names) {
    const pattern = `${source.replaceAll('.', '\\.')}(?:\\?v=\\d+)?`;
    text = text.replaceAll(new RegExp(pattern, 'g'), destination);
  }
  return text;
}
for (const source of [...images, ...scripts]) {
  let data = await readFile(resolve(root, source));
  if (scripts.includes(source)) data = Buffer.from(rewrite(data.toString('utf8')));
  const extension = extname(source);
  const prefix = scripts.includes(source) ? 'br-' : '';
  const name = `${prefix}${source.slice(0, -extension.length)}-${hash(data).slice(0, 12)}${extension}`;
  names.set(source, name);
  await writeFile(resolve(candy, name), data);
}
await writeFile(resolve(candy, 'index.html'), rewrite(await readFile(resolve(root, 'index.html'), 'utf8')));
await cp(resolve(root, 'ICON_LICENSE.txt'), resolve(candy, 'ICON_LICENSE.txt'));
await cp(resolve(root, 'yard/dist'), resolve(output, 'yard'), { recursive: true });
async function files(folder) {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = resolve(folder, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
const manifest = { files: {}, gzip: [], brotli: [], assets: Object.fromEntries(names) };
for (const file of await files(output)) {
  const data = await readFile(file);
  manifest.files[relative(output, file).replaceAll('\\', '/')] = hash(data);
  if (!/\.(?:html|js|css|svg|json|txt)$/.test(file)) continue;
  const info = await stat(file);
  const variants = [
    ['gzip', 'gz', gzipSync(data, { level: 9 })],
    ['brotli', 'br', brotliCompressSync(data, { params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
    } })],
  ];
  for (const [encoding, suffix, packed] of variants) {
    if (packed.length + 64 >= data.length) continue;
    await writeFile(`${file}.${suffix}`, packed);
    await utimes(`${file}.${suffix}`, info.atime, info.mtime);
    manifest.files[`${relative(output, file).replaceAll('\\', '/')}.${suffix}`] = hash(packed);
    manifest[encoding].push({ file: relative(output, file).replaceAll('\\', '/'), original: data.length, compressed: packed.length });
  }
}
await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, files: Object.keys(manifest.files).length, gzip: manifest.gzip.length, brotli: manifest.brotli.length }));
