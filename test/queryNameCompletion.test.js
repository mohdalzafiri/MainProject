const test = require('node:test');
const assert = require('node:assert/strict');
const { attachQueryNameCompletion } = require('../public/query-name-completion');

function createInput(names) {
  const listeners = {};
  const input = {
    value: '',
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    },
    dispatchEvent(event) {
      (listeners[event.type] || []).forEach((handler) => handler(event));
    }
  };
  const api = attachQueryNameCompletion(input, () => names, { document: null });
  return {
    input,
    api,
    type(value) {
      input.value = value;
      input.dispatchEvent({ type: 'input' });
    },
    search(value) {
      input.value = value;
      input.dispatchEvent({ type: 'search' });
    },
    key(key) {
      const event = { key, preventDefault() {} };
      input.dispatchEvent({ type: 'keydown', ...event });
    },
    blur() { input.dispatchEvent({ type: 'blur' }); }
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

test('native search clear closes name suggestions', () => {
  const { input, api, type, search } = createInput(['محمد سالم']);
  let clearEvents = 0;
  input.addEventListener('input', () => {
    if (!input.value) clearEvents += 1;
  });
  type('محمد');
  assert.deepEqual(api.getItems(), ['محمد سالم']);
  search('');
  assert.deepEqual(api.getItems(), []);
  assert.equal(clearEvents, 1);
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