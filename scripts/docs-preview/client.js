const select = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];
const announce = message => { select('#announcement').textContent = message; };

function setExpanded(button, open) {
  button.setAttribute('aria-expanded', String(open));
  document.getElementById(button.getAttribute('aria-controls')).hidden = !open;
}

all('.section-toggle, .toc-toggle').forEach(button => {
  button.addEventListener('click', () => {
    setExpanded(button, button.getAttribute('aria-expanded') !== 'true');
  });
});

const mobileMenu = select('.mobile-menu');
const mobileToc = select('.mobile-toc');
function closeMobileMenus() {
  document.body.classList.remove('menu-open', 'toc-open');
  mobileMenu.setAttribute('aria-expanded', 'false');
  mobileToc?.setAttribute('aria-expanded', 'false');
}
mobileMenu.addEventListener('click', () => {
  const open = !document.body.classList.contains('menu-open');
  closeMobileMenus();
  document.body.classList.toggle('menu-open', open);
  mobileMenu.setAttribute('aria-expanded', String(open));
});
mobileToc?.addEventListener('click', () => {
  const open = !document.body.classList.contains('toc-open');
  closeMobileMenus();
  document.body.classList.toggle('toc-open', open);
  mobileToc.setAttribute('aria-expanded', String(open));
});
all('#on-this-page a').forEach(link => {
  link.addEventListener('click', () => {
    closeMobileMenus();
    document.querySelector(link.getAttribute('href'))?.scrollIntoView();
  });
});

const themeButtons = all('.theme-switcher [data-theme]');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
function updateTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.appearance = theme === 'system'
    ? (systemTheme.matches ? 'dark' : 'light') : theme;
  themeButtons.forEach(button => {
    const checked = button.dataset.theme === theme;
    button.setAttribute('aria-checked', String(checked));
    button.tabIndex = checked ? 0 : -1;
  });
  try { localStorage.setItem('docs-theme', theme); }
  catch { /* Theme still works when storage is unavailable. */ }
}
updateTheme(document.documentElement.dataset.theme);
systemTheme.addEventListener('change', () => {
  if (document.documentElement.dataset.theme === 'system') updateTheme('system');
});
themeButtons.forEach((button, index) => {
  button.addEventListener('click', () => updateTheme(button.dataset.theme));
  button.addEventListener('keydown', event => {
    const offset = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!offset) return;
    event.preventDefault();
    const next = themeButtons[(index + offset + themeButtons.length) % themeButtons.length];
    next.focus();
    updateTheme(next.dataset.theme);
  });
});

const more = select('#more');
const pageMenu = select('#page-menu');
const menuItems = all('#page-menu [role="menuitem"]');
function closePageMenu(restoreFocus = false) {
  setExpanded(more, false);
  if (restoreFocus) more.focus();
}
function openPageMenu() {
  setExpanded(more, true);
  menuItems[0].focus();
}
more.addEventListener('click', () => {
  if (pageMenu.hidden) openPageMenu();
  else closePageMenu(true);
});
more.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown') { event.preventDefault(); openPageMenu(); }
});
pageMenu.addEventListener('keydown', event => {
  const current = menuItems.indexOf(document.activeElement);
  let next;
  if (event.key === 'ArrowDown') next = (current + 1) % menuItems.length;
  if (event.key === 'ArrowUp') next = (current - 1 + menuItems.length) % menuItems.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = menuItems.length - 1;
  if (next !== undefined) { event.preventDefault(); menuItems[next].focus(); }
  if (event.key === 'Tab') closePageMenu();
});

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const label = button.querySelector('span') || button;
    const previous = label.innerHTML;
    label.textContent = 'Copied!';
    announce('Copied to clipboard');
    setTimeout(() => { label.innerHTML = previous; }, 1600);
  } catch {
    announce('Clipboard access was denied. Use View as Markdown or select the code to copy it.');
  }
}
all('[data-copy-page]').forEach(button => {
  button.addEventListener('click', async () => {
    try {
      const response = await fetch(document.body.dataset.markdown);
      if (!response.ok) throw new Error('Could not load Markdown');
      await copyText(await response.text(), button);
    } catch { announce('Could not load the page Markdown. Please reload and try again.'); }
  });
});
all('.copy-code').forEach(button => {
  button.addEventListener('click', () => {
    copyText(button.parentElement.querySelector('code').textContent, button);
  });
});

const searchInput = select('#search-input');
const searchTrigger = select('.search-trigger');
const searchPanel = select('#search-panel');
const searchResults = select('#search-results');
const searchStatus = select('#search-status');
let searchIndex;
let selectedResult = -1;
let searchRevision = 0;

function closeSearch(hideMobile = true) {
  searchRevision++;
  searchPanel.hidden = true;
  searchInput.setAttribute('aria-expanded', 'false');
  searchInput.removeAttribute('aria-activedescendant');
  searchTrigger.setAttribute('aria-expanded', 'false');
  if (hideMobile) document.body.classList.remove('search-open');
}
function selectResult(index) {
  const results = [...searchResults.children];
  if (!results.length) return;
  selectedResult = (index + results.length) % results.length;
  results.forEach((result, position) => {
    result.setAttribute('aria-selected', String(position === selectedResult));
  });
  const active = results[selectedResult];
  searchInput.setAttribute('aria-activedescendant', active.id);
  active.scrollIntoView({ block: 'nearest' });
}
function resultNode(page, index, term) {
  const link = document.createElement('a');
  link.id = `search-result-${index}`;
  link.href = page.url;
  link.role = 'option';
  link.tabIndex = -1;
  const section = document.createElement('small');
  section.textContent = page.section;
  const title = document.createElement('strong');
  title.textContent = page.title;
  const snippet = document.createElement('span');
  const match = page.text.toLowerCase().indexOf(term);
  const start = Math.max(0, match - 45);
  snippet.textContent = (start ? '…' : '') + page.text.slice(start, start + 150) + '…';
  link.append(section, title, snippet);
  link.addEventListener('pointermove', () => selectResult(index));
  return link;
}
async function search() {
  const revision = ++searchRevision;
  const query = searchInput.value.trim().toLowerCase();
  if (!query) { closeSearch(false); select('#result-count').textContent = ''; return; }
  searchPanel.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
  searchTrigger.setAttribute('aria-expanded', 'true');
  searchStatus.textContent = 'Searching…';
  try {
    if (!searchIndex) {
      const response = await fetch('/search-index.json');
      if (!response.ok) throw new Error('Search unavailable');
      searchIndex = await response.json();
    }
    if (revision !== searchRevision) return;
    const terms = query.split(/\s+/);
    const results = searchIndex.map(page => {
      const text = (page.title + ' ' + page.text).toLowerCase();
      const score = terms.every(term => text.includes(term))
        ? terms.reduce((total, term) => total + (page.title.toLowerCase().includes(term) ? 10 : 1), 0) : 0;
      return { ...page, score };
    }).filter(page => page.score).sort((a, b) => b.score - a.score);
    searchResults.replaceChildren(...results.map((page, index) => resultNode(page, index, terms[0])));
    searchStatus.textContent = results.length ? '' : `No results for “${searchInput.value.trim()}”`;
    select('#result-count').textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;
    searchInput.removeAttribute('aria-activedescendant');
    selectedResult = -1;
    if (results.length) selectResult(0);
  } catch {
    if (revision !== searchRevision) return;
    searchResults.replaceChildren();
    searchStatus.textContent = 'Search could not load. Please try again.';
  }
}
searchInput.addEventListener('input', search);
searchInput.addEventListener('focus', () => { if (searchInput.value) search(); });
searchTrigger.addEventListener('click', () => {
  document.body.classList.add('search-open');
  searchInput.focus();
});
searchInput.addEventListener('keydown', event => {
  if (!searchPanel.hidden && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    selectResult(selectedResult + (event.key === 'ArrowDown' ? 1 : -1));
  }
  if (event.key === 'Enter' && !searchPanel.hidden) searchResults.children[selectedResult]?.click();
  if (event.key === 'Tab') closeSearch();
});

const imageDialog = select('#image-dialog');
all('.zoom-image').forEach(button => {
  button.addEventListener('click', () => {
    const source = button.querySelector('img');
    const enlarged = imageDialog.querySelector('img');
    enlarged.src = source.src;
    enlarged.alt = source.alt;
    imageDialog.showModal();
  });
});
imageDialog.querySelector('[data-close-dialog]').addEventListener('click', () => imageDialog.close());
imageDialog.addEventListener('click', event => { if (event.target === imageDialog) imageDialog.close(); });

document.addEventListener('click', event => {
  if (!event.target.closest('.page-actions')) closePageMenu();
  if (!event.target.closest('.header-search')) closeSearch();
  if (!event.target.closest('.sidebar, .mobile-menu, .page-outline, .mobile-toc')) closeMobileMenus();
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    document.body.classList.add('search-open');
    searchInput.focus();
  }
  if (event.key === 'Escape') {
    if (!pageMenu.hidden) closePageMenu(true);
    if (document.body.classList.contains('search-open')) searchTrigger.focus();
    closeSearch();
    if (document.body.classList.contains('menu-open')) mobileMenu.focus();
    if (document.body.classList.contains('toc-open')) mobileToc?.focus();
    closeMobileMenus();
  }
});

const headings = all('article h2, article h3');
const outlineLinks = all('#toc-links a');
if (headings.length) {
  const observer = new IntersectionObserver(entries => {
    const visible = entries.find(entry => entry.isIntersecting);
    if (!visible) return;
    outlineLinks.forEach(link => {
      if (link.hash === '#' + visible.target.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-80px 0px -65% 0px' });
  headings.forEach(heading => observer.observe(heading));
}

all('.updated time').forEach(time => {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(time.dateTime)) / 86400000));
  time.textContent = days === 0 ? 'today' : days === 1 ? '1 day ago'
    : days < 30 ? `${days} days ago` : days < 365
      ? `${Math.floor(days / 30)} month${days < 60 ? '' : 's'} ago`
      : `${Math.floor(days / 365)} year${days < 730 ? '' : 's'} ago`;
});
