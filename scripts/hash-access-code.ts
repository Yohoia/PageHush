import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createAccessCodeHash } from '../packages/api/src/auth/access-code.ts';

async function readAccessCode() {
  const provided = process.argv[2];
  if (provided) return provided.trim();

  const readline = createInterface({ input: stdin, output: stdout });
  const value = await readline.question('Access code: ');
  readline.close();
  return value.trim();
}

const accessCode = await readAccessCode();
if (accessCode.length < 6 || accessCode.length > 128) {
  throw new Error('Access code must be between 6 and 128 characters.');
}

console.log(await createAccessCodeHash(accessCode));
