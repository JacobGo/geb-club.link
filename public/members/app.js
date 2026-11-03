// Shared helpers for the members pages.

export async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) { location.href = `/enter?next=${encodeURIComponent(location.pathname + location.search)}`; throw new Error('signed out'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

/** el('div.card', {onclick}, child, 'text', ...) */
export function el(spec, attrs = {}, ...children) {
  const [tag, ...classes] = spec.split('.');
  const n = document.createElement(tag || 'div');
  if (classes.length) n.className = classes.join(' ');
  if (attrs === null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) { children.unshift(attrs); attrs = {}; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k in n && k !== 'list') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) n.append(c instanceof Node ? c : String(c));
  return n;
}

export const fmt = (x, d = 2) => (x == null ? '–' : Number(x).toFixed(d).replace(/\.?0+$/, '') || '0');

export const coverUrl = (id, size = 'M') => (id ? `https://covers.openlibrary.org/b/id/${id}-${size}.jpg` : null);

export function bookLinks(b) {
  const q = encodeURIComponent([b.title, b.author].filter(Boolean).join(' '));
  // Search by title + author: Open Library's first ISBN is often a foreign edition.
  return el('div.links',
    el('a', { href: `https://www.goodreads.com/search?q=${q}`, target: '_blank', rel: 'noopener' }, 'Goodreads'),
    el('a', { href: `https://app.thestorygraph.com/browse?search_term=${q}`, target: '_blank', rel: 'noopener' }, 'StoryGraph'),
    el('a', { href: `https://www.amazon.com/s?k=${q}&i=stripbooks`, target: '_blank', rel: 'noopener' }, 'Amazon'),
    b.ol_key && el('a', { href: `https://openlibrary.org${b.ol_key}`, target: '_blank', rel: 'noopener' }, 'Open Library'));
}

export function bookCard(b, extra = []) {
  const img = coverUrl(b.cover_id);
  return el('div.book',
    img ? el('img', { src: img, alt: '', loading: 'lazy' }) : el('div.noimg'),
    el('div.meta',
      el('div.title', b.title, b.year ? el('span.muted', ` (${b.year})`) : ''),
      b.author && el('div.muted', b.author),
      b.pitch && el('p.small', b.pitch),
      bookLinks(b),
      extra));
}

/** Search Open Library as you type; onPick({title, author, ol_key, cover_id, isbn, year}). */
export function bookSearch(onPick) {
  const input = el('input', { type: 'search', placeholder: 'Search by title or author…', style: 'width:100%', 'aria-label': 'Search for a book' });
  const list = el('ul.search-results', { hidden: true });
  let timer, seq = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { list.hidden = true; return; }
    timer = setTimeout(async () => {
      const mine = ++seq;
      list.hidden = false;
      list.replaceChildren(el('li.muted', 'Searching…'));
      try {
        const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8&fields=key,title,author_name,first_publish_year,cover_i,isbn`;
        const { docs } = await (await fetch(url)).json();
        if (mine !== seq) return;
        if (!docs.length) { list.replaceChildren(el('li.muted', 'No matches. Enter the book by hand below.')); return; }
        list.replaceChildren(...docs.map((d) => {
          const book = {
            title: d.title, author: (d.author_name || []).slice(0, 2).join(', '), ol_key: d.key,
            cover_id: d.cover_i ?? null, year: d.first_publish_year ?? null,
            isbn: (d.isbn || []).find((x) => x.length === 13) || (d.isbn || [])[0] || null,
          };
          const pick = () => { onPick(book); list.hidden = true; input.value = ''; };
          return el('li', { tabIndex: 0, onclick: pick, onkeydown: (e) => e.key === 'Enter' && (e.preventDefault(), pick()) },
            el('div.book',
              book.cover_id ? el('img', { src: coverUrl(book.cover_id, 'S'), alt: '', style: 'width:32px' }) : el('div.noimg', { style: 'width:32px;height:48px' }),
              el('div.meta', el('div.title', book.title), el('div.muted.small', [book.author, book.year].filter(Boolean).join(' · ')))));
        }));
      } catch {
        if (mine === seq) list.replaceChildren(el('li.muted', "Couldn't reach Open Library. Enter the book by hand below."));
      }
    }, 350);
  });
  return el('div', input, list);
}

export async function getMe() {
  return (await api('/api/me')).me;
}

export const STATUS = { nominating: 'Nominating', voting: 'Voting open', closed: 'Closed' };
export const pill = (status) => el(`span.pill.${status}`, STATUS[status]);

export async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  location.href = '/';
}
