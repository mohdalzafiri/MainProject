function attachQueryNameCompletion(input, getNames, options = {}) {
  const maxItems = options.maxItems || 50;
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  let items = [];
  let activeIndex = -1;

  function normalize(value) {
    return String(value || '')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function getMatches(value) {
    const keyword = normalize(value);
    if (!keyword) return [];
    const seen = new Set();
    const starts = [];
    const contains = [];
    getNames().forEach((name) => {
      const label = String(name || '').trim();
      const key = normalize(label);
      if (!label || seen.has(key)) return;
      seen.add(key);
      if (key.startsWith(keyword)) starts.push(label);
      else if (key.includes(keyword)) contains.push(label);
    });
    return starts.concat(contains).slice(0, maxItems);
  }

  let list = null;
  if (doc) {
    if (!doc.getElementById('nameSuggestStyle')) {
      const style = doc.createElement('style');
      style.id = 'nameSuggestStyle';
      style.textContent = `
        .name-suggest-host { position: relative; }
        .name-suggest-list { position: absolute; top: 100%; right: 0; left: 0; z-index: 50; max-height: 260px; overflow-y: auto; margin: 4px 0 0; padding: 4px 0; list-style: none; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 8px 20px rgba(15, 23, 42, .15); }
        .name-suggest-list li { padding: 8px 12px; cursor: pointer; text-align: right; }
        .name-suggest-list li:hover, .name-suggest-list li.active { background: #e8f0fe; }
      `;
      doc.head.appendChild(style);
    }
    list = doc.createElement('ul');
    list.className = 'name-suggest-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    input.parentElement.classList.add('name-suggest-host');
    input.parentElement.appendChild(list);
    input.setAttribute('autocomplete', 'off');
  }

  function close() {
    items = [];
    activeIndex = -1;
    if (list) {
      list.innerHTML = '';
      list.hidden = true;
    }
  }

  function select(name) {
    input.value = name;
    close();
    if (typeof input.dispatchEvent === 'function' && typeof Event !== 'undefined') {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function render() {
    if (!list) return;
    list.innerHTML = '';
    items.forEach((name, index) => {
      const item = doc.createElement('li');
      item.setAttribute('role', 'option');
      item.textContent = name;
      if (index === activeIndex) item.className = 'active';
      item.addEventListener('mousedown', (event) => {
        event.preventDefault();
        select(name);
      });
      list.appendChild(item);
    });
    list.hidden = !items.length;
  }

  function update() {
    items = getMatches(input.value);
    activeIndex = -1;
    render();
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', () => { if (input.value.trim()) update(); });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (event) => {
    if (!items.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      activeIndex = (activeIndex + step + items.length) % items.length;
      render();
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      select(items[activeIndex]);
    } else if (event.key === 'Escape') {
      close();
    }
  });

  return { getMatches, getItems: () => items.slice(), select, close };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { attachQueryNameCompletion };
}