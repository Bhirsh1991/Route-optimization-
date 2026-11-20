const { detectLanguage, shortenAddress, extractAddresses, extractDeliveryRows, hasContactDetails, stripHouseNumber } = require('../src/geocode');

describe('detectLanguage', () => {
  test('detects Hebrew', () => {
    expect(detectLanguage('שלום')).toBe('he');
  });

  test('detects English', () => {
    expect(detectLanguage('hello')).toBe('en');
  });
});

describe('shortenAddress', () => {
  test('returns first three parts', () => {
    const full = 'Part1, Part2, Part3, Part4, Part5';
    expect(shortenAddress(full)).toBe('Part1, Part2, Part3');
  });
  test('keeps Hebrew quotes, house numbers and distinct street aliases', () => {
    expect(shortenAddress('14, רחוב צה"ל, חיפה, ישראל')).toBe('רחוב צה"ל 14, חיפה, ישראל');
    expect(shortenAddress('שדרות ויצמן;ויצמן 14, כפר סבא')).toBe('שדרות ויצמן 14, כפר סבא');
    expect(shortenAddress('14, Alpha;Beta, Town')).toBe('Alpha / Beta 14, Town');
    expect(stripHouseNumber('הרצל 14, תל אביב')).toBe('הרצל, תל אביב');
  });
});

test('extracts editable address candidates locally, omitting contacts and WhatsApp timestamps', () => {
  const message = [
    '[09:30, 20.11.2026] משה: כתובת: שדרות ויצמן 17, כפר סבא | טלפון: 052-1234567',
    'דני לוי - הרצל 14, תל אביב - 0501234567',
    'כתובת: רחוב צה"ל 1, חיפה, טלפון: 04-1234567',
    'כתובת: רחוב צה"ל 1, חיפה',
    'טלפון: 054-1234567', 'שם: רוני', 'contact@example.com'
  ].join('\n');
  expect(extractAddresses(message)).toEqual(['שדרות ויצמן 17, כפר סבא', 'הרצל 14, תל אביב', 'רחוב צה"ל 1, חיפה']);
  expect(extractAddresses('היי רותי\n050-1111111')).toEqual([]);
});

test('keeps two recipients and their phones separate from the editable address', () => {
  const rows = extractDeliveryRows([
    'שם: יעל', 'כתובת: ויצמן 14, חיפה', 'טלפון: 050-1234567',
    'שם: נועם', 'טלפון: 050-7654321', 'כתובת: הרצל 7, חיפה'
  ].join('\n'));
  expect(rows).toEqual([
    { name: 'יעל', phone: '050-1234567', address: 'ויצמן 14, חיפה' },
    { name: 'נועם', phone: '050-7654321', address: 'הרצל 7, חיפה' }
  ]);
  expect(extractDeliveryRows('דני לוי - הרצל 14, חיפה - 052-1234567')[0].name).toBe('דני לוי');
  const ambiguous = extractDeliveryRows('הרצל 2, חיפה\nהרצל 3, חיפה\nטלפון: 050-1234567');
  expect(ambiguous.every(row => row.phone === '')).toBe(true);
  expect(hasContactDetails('הרצל 2, חיפה, 050-1234567')).toBe(true);
  expect(hasContactDetails('רחוב צה"ל 14, חיפה')).toBe(false);
});

describe('explicit geocoding', () => {
  const originalFetch = global.fetch;
  const sample = { display_name: '14, הרצל, חיפה, ישראל', lat: '32.1', lon: '35.1', address: { house_number: '14' } };
  let findAddresses;
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    ({ findAddresses } = require('../src/geocode'));
    global.fetch = jest.fn();
  });
  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });
  const ok = data => ({ ok: true, json: async () => data });
  test('keeps coordinates for each full match, filters only when requested, and reuses the result', async () => {
    global.fetch.mockResolvedValue(ok([sample, { ...sample, lat: '33', display_name: '14, הרצל, אשדוד' }]));
    const choices = await findAddresses('הרצל 14', false, () => true);
    expect(choices.map(choice => choice.lat)).toEqual([32.1, 33]);
    expect(new URL(global.fetch.mock.calls[0][0]).searchParams.has('countrycodes')).toBe(false);
    await expect(findAddresses('הרצל 14', false, () => true)).resolves.toEqual(choices);
    const filtered = findAddresses('Herzl', true, () => true);
    await jest.advanceTimersByTimeAsync(1100);
    await filtered;
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(new URL(global.fetch.mock.calls[1][0]).searchParams.get('countrycodes')).toBe('il');
  });
  test('serializes street fallback and explicitly marks the approximate result', async () => {
    global.fetch.mockResolvedValue(ok([])).mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([{ ...sample, display_name: 'הרצל, חיפה, ישראל', address: {road: 'הרצל', city: 'חיפה'} }]));
    const choices = findAddresses('הרצל 14, חיפה', false, () => true);
    await jest.advanceTimersByTimeAsync(900);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await jest.runAllTimersAsync();
    await expect(choices).resolves.toMatchObject([{ approximate: true }]);
    expect(new URL(global.fetch.mock.calls[1][0]).searchParams.get('street')).toBe('14 הרצל');
  });
  test('does not send stale queued searches and reports rate limiting with a cooldown', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '120' }) });
    await expect(findAddresses('Old', false, () => false)).resolves.toEqual([]);
    await expect(findAddresses('One', false, () => true)).rejects.toThrow('יותר מדי');
    await expect(findAddresses('Two', false, () => true)).rejects.toThrow('יותר מדי');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
