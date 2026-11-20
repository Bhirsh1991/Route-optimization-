const { createHash } = require('node:crypto');
const { readFileSync, readdirSync, writeFileSync } = require('node:fs');

function inlineHashes(blocks) {
  const hashes = [];
  for (const [, attributes, text] of blocks) {
    if (/\bsrc\s*=/i.test(attributes) || !text.trim()) continue;
    const digest = createHash('sha256').update(text).digest('base64');
    hashes.push("'sha256-" + digest + "'");
  }
  return hashes.join(' ');
}

function updatePolicy(file, connectionSources) {
  const html = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const meta = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/;
  const firstResource = html.search(/<(?:link|script|style)\b/i);
  if (!meta.test(html) || html.search(meta) > firstResource) {
    throw new Error(file + ' must declare its content security policy before loading any resource.');
  }
  const scripts = inlineHashes(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi));
  const styles = inlineHashes(html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi));
  const policy = [
    "default-src 'none'", ("script-src 'self' " + scripts).trimEnd(), "script-src-attr 'none'",
    ("style-src 'self' " + styles).trimEnd(), "style-src-attr 'none'", "img-src 'self'", "font-src 'self'",
    "manifest-src 'self'", "worker-src 'self'", "connect-src " + connectionSources,
    "object-src 'none'", "base-uri 'none'", "form-action 'none'"
  ].join('; ');
  const updated = html.replace(meta, '<meta http-equiv="Content-Security-Policy" content="' + policy + '">');
  if (updated !== html) writeFileSync(file, updated);
}

updatePolicy('index.html', "'self' https://nominatim.openstreetmap.org https://router.project-osrm.org");
updatePolicy('ai/index.html', "'self'");

const workerPath = 'service-worker.js';
const worker = readFileSync(workerPath, 'utf8').replace(/\r\n/g, '\n');
const staticFiles = ['index.html', 'manifest.json', 'logo-small.webp'];
for (const directory of ['assets', 'src']) {
  for (const file of readdirSync(directory).sort()) staticFiles.push(directory + '/' + file);
}

// Hash LF-normalized text so Windows and Pages CI produce the same release.
const hash = createHash('sha256');
for (const file of [...staticFiles, 'data/netanya-addresses.json']) {
  const bytes = readFileSync(file);
  hash.update(file + '\0');
  hash.update(/\.(css|js|html|json)$/.test(file) ? bytes.toString().replace(/\r\n/g, '\n') : bytes);
}
const revision = hash.digest('hex').slice(0, 16);
const output = worker.replace(/^const REVISION = .*;$/m, "const REVISION = '" + revision + "';")
  .replace(/^const FILES = .*;$/m, 'const FILES = ' + JSON.stringify(staticFiles) + ';');
if (output !== worker) writeFileSync(workerPath, output);
