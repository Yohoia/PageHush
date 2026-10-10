const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ID = 1n << 128n;

// Encode the complete UUID, not a hash or truncation: existing articles need no migration.
export function articleShortId(id: string): string | null {
  if (!UUID.test(id)) return null;
  let value = BigInt(`0x${id.replace(/-/g, '')}`);
  let result = '';
  do {
    result = ALPHABET[Number(value % 62n)] + result;
    value /= 62n;
  } while (value);
  return result.padStart(22, '0');
}

export function articleIdFromShortId(shortId: string): string | null {
  if (!/^[0-9A-Za-z]{22}$/.test(shortId)) return null;
  let value = 0n;
  for (const character of shortId) value = value * 62n + BigInt(ALPHABET.indexOf(character));
  if (value >= MAX_ID) return null;
  const hex = value.toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
