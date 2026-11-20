const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {run: runSource} = require('../scripts/ai-route-cli');
const dataset = require('../data/netanya-addresses.json');

const root = path.resolve(__dirname, '..');
const python = process.platform === 'win32' ? 'python' : 'python3';
const request = {city: 'נתניה', start: 'אבן גבירול 1', stops: ['אבן עזרא 10', 'אבנר בן נר 1'], end: 'אבן גבירול 11'};

function mapsPins(link) {
  const url = new URL(link);
  expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
  const params = url.searchParams;
  return [params.get('origin'), ...(params.get('waypoints')?.split('|') || []), params.get('destination')];
}

function checkLongRoute(run) {
  const street = 'אבן גבירול';
  const numbers = Array.from({length: 12}, (_, i) => i + 1);
  const addresses = numbers.map(n => street + ' ' + n);
  const request = {city: 'נתניה', start: addresses[0], stops: addresses.slice(1, -1), end: addresses.at(-1)};
  const {matrixUrl} = run('prepare', request);
  const durations = numbers.map(from => numbers.map(to => Math.abs(from - to)));
  const result = run('finish', {request, matrixUrl, osrm: {code: 'Ok', durations}});
  expect(result.stops.map(stop => stop.address)).toEqual(addresses);
  const segments = result.googleMapsUrls.map(mapsPins);
  expect(segments).toHaveLength(3);
  for (let i = 1; i < segments.length; i++) expect(segments[i][0]).toBe(segments[i - 1].at(-1));
  const route = segments.flatMap((pins, i) => i === 0 ? pins : pins.slice(1));
  expect(route).toEqual(numbers.map(number => dataset[street][number][0].join(',')));
}

test('the source runner gives direct navigation across every computed leg of a long trip', () => {
  checkLongRoute(runSource);
});

test('downloadable skills use the shared offline planner and handle a missing or unreliable road table', () => {
  execFileSync(python, ['scripts/build-ai-skill.py', '--check'], {cwd: root});
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'route-skill-'));
  try {
    for (const target of ['gemini', 'chatgpt']) {
      const folder = path.join(tmp, target);
      execFileSync(python, ['-m', 'zipfile', '-e', path.join(root, 'ai', 'route-planner-' + target + '.zip'), folder]);
      const skill = target === 'gemini' ? folder : path.join(folder, 'skills', 'route-planner');
      const run = (action, value) => JSON.parse(execFileSync(process.execPath, [path.join(skill, 'scripts', 'route.js'), action], {
        input: JSON.stringify(value), encoding: 'utf8'
      }));
      const plan = run('prepare', request);
      expect(plan.status).toBe('needs_matrix');
      expect(plan.matrixUrl).toMatch(/^https:\/\/router\.project-osrm\.org\/table\/v1\/driving\/[\d.,;-]+$/);
      const matrix = {code: 'Ok', durations: [[0, 8, 1, 9], [9, 0, 8, 1], [9, 1, 0, 8], [9, 9, 9, 0]]};
      const result = run('finish', {request, matrixUrl: plan.matrixUrl, osrm: matrix});
      expect(result).toMatchObject({status: 'ready', exact: true, seconds: 3, url: plan.url});
      expect(result.stops.map(point => point.address)).toEqual([request.start, request.stops[1], request.stops[0], request.end]);
      expect(result.googleMapsUrls.map(mapsPins)).toEqual([[
        dataset['אבן גבירול'][1][0].join(','), dataset['אבנר בן נר'][1][0].join(','),
        dataset['אבן עזרא'][10][0].join(','), dataset['אבן גבירול'][11][0].join(',')
      ]]);
      checkLongRoute(run);
      expect(new URL(result.url).search).toBe('');
      expect(run('prepare', {...request, city:'עיר לדוגמה'})).toMatchObject({status:'needs_review'});
      expect(run('prepare', {...request, end:request.start})).toMatchObject({status:'needs_matrix'});
      expect(run('prepare', {...request, stops:[request.stops[0], request.stops[0]]})).toMatchObject({status:'needs_review'});
      expect(run('finish', {request, matrixUrl: 'https://example.invalid', osrm:matrix})).toMatchObject({status:'needs_review'});
      expect(run('finish', {request, matrixUrl: plan.matrixUrl, osrm:{code:'NoTable'}})).toMatchObject({status:'needs_review'});
    }
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}, 30000);
