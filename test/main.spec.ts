import { assert } from 'chai';

import main from '../src/main.js';

describe('Sample test', () => {
  it('exports the correct string', () => {
    assert.strictEqual(main, 'Hello, world!');
  });
});
