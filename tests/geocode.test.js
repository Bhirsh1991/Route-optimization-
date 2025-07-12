const { detectLanguage, shortenAddress } = require('../src/geocode');

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
});
