const test = require('node:test');
const assert = require('node:assert/strict');
const { attachQueryNameCompletion } = require('../public/query-name-completion');

function createInput(names) {
  const listeners = {};
  const input = {
    value: '',
    addEventListener(type, handler) { listeners[type] = handler; }
  };
  const api = attachQueryNameCompletion(input, () => names, { document: null });
  return {
    input,
    api,
    type(value) { input.value = value; listeners.input({}); },
    key(key) { const event = { key, preventDefault() {} }; listeners.keydown(event); },
    blur() { listeners.blur({}); }
  };
}

test('list shrinks while typing and matches Arabic letter variants', () => {
  const { api, type } = createInput(['أحمد محمد', 'احمد سالم', 'خالد أحمد', 'مريم علي']);
  type('م');
  assert.deepEqual(api.getItems(), ['مريم علي', 'أحمد محمد', 'احمد سالم', 'خالد أحمد']);
  type('احمد');
  assert.deepEqual(api.getItems(), ['أحمد محمد', 'احمد سالم', 'خالد أحمد']);
  type('احمد س');
  assert.deepEqual(api.getItems(), ['احمد سالم']);
  type('');
  assert.deepEqual(api.getItems(), []);
});

test('keyboard selection fills the field and closes the list', () => {
  const { input, api, type, key } = createInput(['محمد سالم', 'محمود علي']);
  type('مح');
  key('ArrowDown');
  key('ArrowDown');
  key('Enter');
  assert.equal(input.value, 'محمود علي');
  assert.deepEqual(api.getItems(), []);
});

test('only supplied (permission-scoped) names appear, without duplicates', () => {
  const names = ['محمد سالم', 'محمد سالم'];
  const { api, type, blur } = createInput(names);
  type('محمد');
  assert.deepEqual(api.getItems(), ['محمد سالم']);
  names.splice(0, names.length, 'خالد علي');
  type('محمد');
  assert.deepEqual(api.getItems(), []);
  type('خا');
  blur();
  assert.deepEqual(api.getItems(), []);
});