const { extractDeliveryRows, extractAddresses, hasContactDetails } = require('../src/geocode');

const header = '[11/20, 13:31] שולח לדוגמה: ';
// All contact information below is synthetic.
const records = [
  ['אלפא דמה', 'כתובת- סימטה א 27 דירה 3 קומה 2 כניסה ב׳', 'דוברת- שפת דמה', 'נייד 0000000001'],
  ['בטא דמה', 'ז׳נרל 8 ', '0000000002'],
  ['עבור צוות הדגמה', 'שם- *גמא* *דמה*', 'כתובת- רחוב הדמיון 17 דירה 12', 'טלפון- 0000000003', 'דובר שפה. בן 74 בודד'],
  ['שם- דלתא דמה', 'כתובת- שדרות הדוגמה 37 דירה 5 קומה 7', 'טלפון - 0000000004', 'מספר נפשות- 8'],
  ['אפסילון דמה', '0000000005', 'כתובת - שביל הבדיקה 84 דירה 300']
];
const expected = [
  { address: 'סימטה א 27', name: 'אלפא דמה', phone: '0000000001', details: 'דירה 3 · קומה 2 · כניסה ב׳' },
  { address: 'ז׳נרל 8', name: 'בטא דמה', phone: '0000000002' },
  { address: 'רחוב הדמיון 17', name: 'גמא דמה', phone: '0000000003', details: 'דירה 12' },
  { address: 'שדרות הדוגמה 37', name: 'דלתא דמה', phone: '0000000004', details: 'דירה 5 · קומה 7' },
  { address: 'שביל הבדיקה 84', name: 'אפסילון דמה', phone: '0000000005', details: 'דירה 300' }
];

test.each(['plain', 'escaped'])('imports five delivery cards with %s WhatsApp formatting', format => {
  const lines = records.flatMap(([first, ...rest]) => [header + first, ...rest]);
  const message = format === 'plain' ? lines.join('\n') : lines.join('\\\r\n').replace(/\*/g, '\\*');
  expect(extractDeliveryRows(message)).toEqual(expected);
  expect(extractAddresses(message)).toEqual(expected.map(row => row.address));
});

test('removes indoor details while keeping the city and the street suffix', () => {
  expect(extractDeliveryRows('כתובת: רחוב הדוגמה 12א, דירה 17, קומה 3, עיר דמה')).toEqual([
    { address: 'רחוב הדוגמה 12א, עיר דמה', name: '', phone: '', details: 'דירה 17 · קומה 3' }
  ]);
  expect(extractAddresses('בן דוגמה 7, עיר דמה')).toEqual(['בן דוגמה 7, עיר דמה']);
  expect(extractAddresses('רחוב שם הגדולים 7, עיר דמה')).toEqual(['רחוב שם הגדולים 7, עיר דמה']);
});

test('never interprets phone, age, household and floor lines as street addresses', () => {
  const extra = ['מספר נפשות- 8', 'נייד 0000000001', 'בן 71', 'גיל: 59', 'קומה 13', 'דירה 76'];
  expect(extractAddresses(extra.join('\n'))).toEqual([]);
  for (const line of extra) expect(hasContactDetails(line)).toBe(true);
  expect(hasContactDetails('רחוב הדוגמה 34 קומה 3')).toBe(true);
});
