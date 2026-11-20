const AI = require('../src/ai-route');
const request = {city:'נתניה', start:'רחוב האור 4', stops:['רחוב הגפן 2','שד׳ צה״ל 3'], end:'השקד 5'};
const points = [0,1,2,3].map(i => ({lat:32 + i / 100, lng:34.86}));
const snapshot = {'שד הניסוי':{'12א':[[32.31,34.85]]}, 'שדרות המבחן':{'5':[[32.315,34.87]]},
  'המבחן':{'5':[[32.33,34.87]]}};

test('preserves text, role order and reserved URL characters; unrelated fragments are ignored', () => {
  const special = {...request, stops:['גפן + תמר 9', "א' & ב 10", 'שד׳ צה״ל 3', 'כיכר # 12%']};
  const url = new URL(AI.makeLink(special));
  expect(url.search).toBe('');
  expect(url.hash.startsWith('#route=1&city=')).toBe(true);
  expect(AI.parseLink(url.hash)).toEqual(special);
  expect(AI.pointsFor(special).map(x => x.role)).toEqual(['start','stop','stop','stop','stop','end']);
  expect(AI.parseLink('#driveMaps')).toBeNull();
  expect(AI.parseLink('')).toBeNull();
});

test.each([
  '#route=2&start=A&end=B', '#route=1&start=x&end=y&route=1', '#route=1&start=%E0%A4&end=B',
  '#route=1&start=x&start=y&end=B', '#route=1&start=A&end=B&order=0,1', '#route=1&stop=&end=B',
  '#route=1&lat=34&lng=35&start=A&end=B', '#route=1&stop=A', '#route=1&stop=B'+'&stop=A'.repeat(25)
])('rejects malformed or unsupported handoff %s', hash => {
  expect(() => AI.parseLink(hash)).toThrow();
});

test.each(['דרך הדוגמה 4 דירה 3', 'בדיקה +972 50 111 1111', 'לקוח: פלוני', 'מקום demo@example.org',
  'https://example.org/foo', 'דוגמה\u0000', 'שורה\nשנייה', 'abc\u202Edef', 'א'.repeat(161)
])('rejects contact and delivery details, links, oversized or multiline fields: %s', value => {
  expect(() => AI.makeLink({stops:[value, 'כיכר הדוגמה']})).toThrow();
});

test('limits encoded URL size and preserves all stops when it fits', () => {
  const long = {stops:Array(25).fill('א'.repeat(157) + ' 9')};
  expect(() => AI.makeLink(long)).toThrow(/ארוך/);
  const withoutEndpoints = {stops:['דיזנגוף 4','התמר 6']};
  expect(AI.parseLink(new URL(AI.makeLink(withoutEndpoints)).hash)).toEqual(withoutEndpoints);
  expect(() => AI.makeLink({...withoutEndpoints, lat:32})).toThrow();
});

test('the reference matches only a precise numbered street in its city, with Hebrew spelling variants', () => {
  for (const [address, city] of [
    ['רחוב הניסוי 12א','נתניה'], ['הניסוי 12א, נתניה',''], ['12א הניסוי, Netanya','נתניה'],
    ['נתניה, הניסוי 12א',''], ['הניסוי 12א נתניה','נתניה']
  ]) {
    const choices = AI.referenceChoices(address, city, snapshot);
    expect(AI.autoPick(choices, address, city)).toMatchObject({lat:32.31,lng:34.85,reference:true});
  }
  for (const [address, city] of [
    ['הניסוי','נתניה'], ['הניסוי 12','נתניה'], ['הניסוי 12א, חיפה','נתניה'],
    ['הניסוי 12א',''], ['הניסוי 12א','חיפה'], ['הניסוי החדשה 12א','נתניה']
  ]) expect(AI.referenceChoices(address, city, snapshot)).toEqual([]);
});

test('conflicting aliases, approximate addresses, POIs, nonidentical house numbers and other cities require review', () => {
  const conflicting = AI.referenceChoices('המבחן 5','נתניה',snapshot);
  expect(conflicting).toHaveLength(2);
  expect(AI.autoPick(conflicting, 'המבחן 5','נתניה')).toBeNull();
  const candidate = {lat:32.3, lng:34.9, address:'הגפן 4, נתניה', mapsAddress:'הגפן 4, נתניה, ישראל'};
  expect(AI.autoPick([candidate], 'הגפן 4', 'נתניה')).toBe(candidate);
  expect(AI.autoPick([candidate], 'הגפן 5', 'נתניה')).toBeNull();
  expect(AI.autoPick([candidate], 'הדקל 4', 'נתניה')).toBeNull();
  expect(AI.autoPick([candidate], 'הגפן 4', '')).toBeNull();
  expect(AI.autoPick([candidate], 'הגפן 4', 'חיפה')).toBeNull();
  for (const change of [{approximate:true},{ambiguous:true},{placeName:'קפה'},{placeName:''},{mapsAddress:null},{lat:Infinity}]) {
    expect(AI.autoPick([{...candidate,...change}], 'הגפן 4', 'נתניה')).toBeNull();
  }
});

test('uses directed road times and fixed endpoints, retaining every intermediate stop', () => {
  const durations = [[0,20,1,10],[10,0,20,1],[10,2,0,20],[1,10,10,0]];
  expect(AI.solve(request,points,{code:'Ok',durations})).toEqual({order:[0,2,1,3],exact:true,seconds:4});
  expect(AI.tableUrl(points)).toBe('https://router.project-osrm.org/table/v1/driving/34.86,32;34.86,32.01;34.86,32.02;34.86,32.03');
});

test('allows round trips and rejects duplicated stops, missing locations and unreachable roads', () => {
  const r = {start:'הדקל 1',stops:[],end:'הדקל 1'};
  const matrix = {code:'Ok',durations:[[0,0],[0,0]]};
  expect(AI.solve(r,[points[0], points[0]],matrix)).toEqual({order:[0,1],exact:true,seconds:0});
  expect(() => AI.solve({stops:['א','ב']},[points[0],points[0]],matrix)).toThrow(/אותה נקודה/);
  expect(() => AI.solve(r,[points[0]],matrix)).toThrow();
  expect(() => AI.solve(r,points.slice(0,2),{code:'NoTable'})).toThrow();
  expect(() => AI.solve(r,points.slice(0,2),{code:'Ok',durations:[[0,null],[null,0]]})).toThrow(/לא נמצא/);
});

test('labels the planner heuristic for larger trips and preserves optional endpoint semantics', () => {
  const len = 15;
  const free = {stops:Array.from({length:len}, (_,i) => 'דרך הדוגמה ' + (i+1))};
  const places = Array.from({length:len}, (_,i) => ({lat:32+i/100,lng:34}));
  const durations = places.map((p,i) => places.map((q,j) => Math.abs(i-j)));
  expect(AI.solve(free,places,{code:'Ok',durations})).toEqual({order:places.map((_,i) => i),exact:false,seconds:14});
});

test('keeps individually confirmed deliveries at one location and exempts only the fixed round trip', () => {
  const r = {start:'הדקל 1', stops:['הדקל 1','השתיל 2','השתיל 2'], end:'הדקל 1'};
  const places = [points[0],points[0],points[1],points[1],points[0]];
  const matrix = {code:'Ok', durations:places.map(a => places.map(b => a === b ? 0 : 4))};
  expect(AI.duplicateStops(AI.pointsFor(r), places)).toEqual([1,3]);
  expect(() => AI.solve(r, places, matrix)).toThrow(/אותה נקודה/);
  const confirmed = AI.solve(r, places, matrix, {allowRepeatedStops:true});
  expect(confirmed.seconds).toBe(8);
  expect(confirmed.order[0]).toBe(0);
  expect(confirmed.order[4]).toBe(4);
  expect([...confirmed.order].sort()).toEqual([0,1,2,3,4]);
});
