import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const productStyles = ['src/styles/base.css', 'src/styles/balanced.css'];

describe('deployed product typography policy', () => {
  it('never renders declared product text below the 11px readability floor', () => {
    const violations = productStyles.flatMap((file) => {
      const css = readFileSync(file, 'utf8');
      return [...css.matchAll(/(?:font-size\s*:|font\s*:[^;{}]*?)(\d+(?:\.\d+)?)px/g)]
        .filter((match) => Number(match[1]) < 11)
        .map((match) => `${file}:${match[0]}`);
    });

    expect(violations).toEqual([]);
  });
});
