const { createHash } = require('node:crypto');
const { readFileSync, readdirSync, writeFileSync } = require('node:fs');

const workerPath = 'service-worker.js';
const worker = readFileSync(workerPath, 'utf8').replace(/\r\n/g, '\n');
const staticFiles = ['index.html', 'manifest.json', 'logo-small.webp'];
for (const directory of ['assets', 'src']) {
  for (const file of readdirSync(directory).sort()) staticFiles.push(directory + '/' + file);
}

// Hash LF-normalized text so Windows and Pages CI produce the same release.
const hash = createHash('sha256');
for (const file of staticFiles) {
  const bytes = readFileSync(file);
  hash.update(file + '\0');
  hash.update(/\.(css|js|html|json)$/.test(file) ? bytes.toString().replace(/\r\n/g, '\n') : bytes);
}
const revision = hash.digest('hex').slice(0, 16);
const output = worker.replace(/^const REVISION = .*;$/m, "const REVISION = '" + revision + "';")
  .replace(/^const FILES = .*;$/m, 'const FILES = ' + JSON.stringify(staticFiles) + ';');
if (output !== worker) writeFileSync(workerPath, output);
