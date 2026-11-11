import { describe, it, expect } from 'vitest';
import { matchPrompt, type BookFacts } from '../src/domain/promptMatch';

const book = (o: Partial<BookFacts> = {}): BookFacts => ({ title: 'The Dark Wolf of Texas', authors: ['Dana Reed'], heat: 4, stars: 4.5, format: 'audio', year: 1998, seriesLen: 3, seriesPos: 1, pages: 320, tags: ['enemies to lovers', 'cowboy'], places: ['austin, texas'], recommended: true, owned: false, ...o });

describe('matchPrompt', () => {
  it('reads letters, ignoring a leading article', () => {
    expect(matchPrompt('Title starts with D', book())).toBe('title starts with D');
    expect(matchPrompt('Title starts with T', book())).toBe('title starts with T');
    expect(matchPrompt('Title starts with Q', book())).toBeNull();
    expect(matchPrompt('Author last name starts with R', book())).toContain('R');
  });
  it('matches by facts', () => {
    expect(matchPrompt('A 3-book series', book())).toContain('3-book');
    expect(matchPrompt('A 4-book series', book())).toBeNull();
    expect(matchPrompt('A standalone', book())).toBeNull();
    expect(matchPrompt('A standalone', book({ seriesLen: null }))).not.toBeNull();
    expect(matchPrompt('Heat level 4', book())).toContain('4');
    expect(matchPrompt('Heat level 3', book())).toBeNull();
    expect(matchPrompt('A 4.5-star read', book())).not.toBeNull();
    expect(matchPrompt('A 5-star read', book())).toBeNull();
    expect(matchPrompt('Listen to an audiobook', book())).not.toBeNull();
    expect(matchPrompt('Read an ebook', book())).toBeNull();
    expect(matchPrompt('Published in the 1990s', book())).not.toBeNull();
    expect(matchPrompt('Published before 1990', book())).toBeNull();
  });
  it('reads the title, the setting, tags and does not guess', () => {
    expect(matchPrompt('An animal in the title', book())).toContain('wolf');
    expect(matchPrompt('A color in the title', book())).toBeNull();
    expect(matchPrompt('A color in the title', book({ title: 'A Court of Red Thorns' }))).toContain('red');
    expect(matchPrompt('Set in Texas', book())).not.toBeNull();
    expect(matchPrompt('Set in Ohio', book())).toBeNull();
    expect(matchPrompt('Enemies to Lovers', book())).toContain('enemies to lovers');
    expect(matchPrompt('A book that made you cry', book())).toBeNull();
  });
});
