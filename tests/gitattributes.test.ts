import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('line endings', () => {
  it('pins migration files to LF so their checksums match on every machine', () => {
    expect(readFileSync('.gitattributes', 'utf8')).toMatch(/^\*\.sql text eol=lf$/m);
  });
});
