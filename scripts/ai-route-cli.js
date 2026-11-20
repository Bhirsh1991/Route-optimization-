'use strict';

const fs = require('node:fs');
const AiRoute = require('../src/ai-route');
const {mapsLinks} = require('../src/routing');
const dataset = require('../data/netanya-addresses.json');

function review(url, reason, unresolved) {
  const result = {status: 'needs_review', url, reason};
  if (unresolved) result.unresolved = unresolved;
  return result;
}

function run(command, input) {
  if (command !== 'prepare' && command !== 'finish') {
    throw new Error('Use prepare or finish and supply UTF-8 JSON on standard input.');
  }
  const request = command === 'finish' ? input?.request : input;
  const url = AiRoute.makeLink(request);
  const rows = AiRoute.pointsFor(request);
  const unresolved = [];
  const positions = new Map();
  const points = rows.map(({address, role}, index) => {
    const choices = AiRoute.referenceChoices(address, request.city, dataset);
    const selected = AiRoute.autoPick(choices, address, request.city);
    if (!selected) {
      unresolved.push({position: index + 1, address, reason: choices.length ? 'confirm_match' : 'no_local_match'});
      return null;
    }
    const pin = selected.lat + ',' + selected.lng;
    if (positions.has(pin) && !(role === 'end' && positions.get(pin) === 'start')) {
      unresolved.push({position: index + 1, address, reason: 'same_pin'});
    }
    positions.set(pin, role);
    return selected;
  });
  if (unresolved.length) return review(url, 'Confirm these addresses in the planner.', unresolved);
  const matrixUrl = AiRoute.tableUrl(points);
  if (command === 'prepare') return {status: 'needs_matrix', url, matrixUrl};
  if (input.matrixUrl !== matrixUrl) return review(url, 'The road table URL does not match these addresses in this order.');
  try {
    const {order, exact, seconds} = AiRoute.solve(request, points, input.osrm);
    const {fullUrl, segments} = mapsLinks(order.map(index => points[index]), true);
    const googleMapsUrls = fullUrl ? [fullUrl] : segments.map(segment => segment.url);
    return {status: 'ready', url, exact, seconds, stops: order.map(index => rows[index]), googleMapsUrls};
  } catch (error) {
    return review(url, error.message);
  }
}

if (require.main === module) {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
    console.log(JSON.stringify(run(process.argv[2], input)));
  } catch (error) {
    // JSON.parse diagnostics can contain part of the original text.
    const reason = error instanceof SyntaxError ? 'Expected valid UTF-8 JSON.' : error.message;
    console.log(JSON.stringify({status: 'invalid_request', reason}));
    process.exitCode = 1;
  }
}

module.exports = {run};
