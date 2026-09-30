// Every link on this page comes from downloads.tsv, which scripts/update_downloads.py
// builds by checking each file actually exists on download.splunk.com.
const MANIFEST_URLS = [
  'downloads.tsv',
  'https://raw.githubusercontent.com/livehybrid/downloadSplunk/main/docs/downloads.tsv',
];
const BASE = 'https://download.splunk.com/products';

const PRODUCTS = {
  splunk: 'Splunk Enterprise',
  universalforwarder: 'Universal Forwarder',
};

const OS_LABELS = {
  linux: 'Linux',
  windows: 'Windows',
  osx: 'macOS',
  freebsd: 'FreeBSD',
  solaris: 'Solaris',
  aix: 'AIX',
};
const OS_ORDER = Object.keys(OS_LABELS);

const TYPE_LABELS = [
  [/\.tar\.Z$/, 'Tarball (.tar.Z)'],
  [/\.pkg\.Z$/, 'Solaris package (.pkg.Z)'],
  [/\.p5p$/, 'Solaris IPS package (.p5p)'],
  [/\.txz$/, 'FreeBSD package (.txz)'],
  [/\.tgz$/, 'Tarball (.tgz)'],
  [/\.deb$/, 'Debian / Ubuntu (.deb)'],
  [/\.rpm$/, 'RHEL / SUSE (.rpm)'],
  [/\.msi$/, 'Installer (.msi)'],
  [/\.zip$/, 'Zip (.zip)'],
  [/\.dmg$/, 'Disk image (.dmg)'],
];

const state = {
  data: {},        // product -> [{ version, build, files }] newest first
  product: 'splunk',
  version: null,
  os: 'all',
};

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function loadManifest() {
  let lastError;
  for (const url of MANIFEST_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return parseManifest(await res.text());
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function parseManifest(text) {
  const data = {};
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [product, version, build, paths = ''] = line.split('\t');
    const files = paths.split(' ').filter(Boolean);
    if (!files.length) continue;
    (data[product] = data[product] || []).push({ version, build, files });
  }
  for (const list of Object.values(data)) list.sort((a, b) => compareVersions(b.version, a.version));
  return data;
}

// Describe a package from its path, e.g. "linux/splunk-10.4.4-f0f12fcdcaa1-linux-arm64.deb"
function describe(path) {
  const [dir, file] = path.split('/');
  const lower = file.toLowerCase();
  const type = (TYPE_LABELS.find(([re]) => re.test(file)) || [null, file.split('.').pop()])[1];

  let arch;
  if (dir === 'osx') {
    if (lower.includes('universal2')) arch = 'Universal (Intel + Apple Silicon)';
    else if (lower.includes('arm64')) arch = 'Apple Silicon';
    else arch = 'Intel';
  } else if (/armv8|arm64|aarch64/.test(lower)) arch = 'ARM64';
  else if (/-arm\./.test(lower)) arch = 'ARM (32-bit)';
  else if (lower.includes('ppc64le')) arch = 'PowerPC 64 LE';
  else if (lower.includes('s390x')) arch = 's390x';
  else if (lower.includes('sparc')) arch = 'SPARC';
  else if (lower.includes('powerpc')) arch = 'PowerPC';
  else if (/x86_64|amd64|x64|-64\./.test(lower)) arch = 'x86_64';
  else if (/i686|i386|x86|intel|-32\./.test(lower)) arch = dir === 'solaris' ? 'x86' : 'x86 (32-bit)';
  else arch = '';

  const osVersion = (lower.match(/freebsd-?(\d+)/) || lower.match(/solaris-(1\d)-/) || [])[1];
  const title = [OS_LABELS[dir] || dir, osVersion, arch].filter(Boolean).join(' ');
  return { dir, file, type, title };
}

function currentEntry() {
  return (state.data[state.product] || []).find(e => e.version === state.version);
}

function urlFor(entry, path) {
  return `${BASE}/${state.product}/releases/${entry.version}/${path}`;
}

function copyToClipboard(text, what) {
  navigator.clipboard.writeText(text)
    .then(() => showToast(`${what} copied`))
    .catch(() => showToast('Copy failed', 'error'));
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 1800);
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) node.append(child);
  return node;
}

function renderProductButtons() {
  document.querySelectorAll('[data-product]').forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.product === state.product));
  });
}

function renderVersionSelect() {
  const select = document.getElementById('version');
  const list = state.data[state.product] || [];
  select.replaceChildren();

  // Group by release line (e.g. 10.4, 9.4), newest first
  let group;
  list.forEach((entry, i) => {
    const line = entry.version.split('.').slice(0, 2).join('.');
    if (!group || group.label !== line) {
      group = el('optgroup', { label: line });
      select.append(group);
    }
    group.append(el('option', {
      value: entry.version,
      textContent: i === 0 ? `${entry.version} (latest)` : entry.version,
    }));
  });
  select.value = state.version;
  select.disabled = false;
}

function renderOsFilter(entry) {
  const counts = {};
  for (const path of entry.files) {
    const dir = path.split('/')[0];
    counts[dir] = (counts[dir] || 0) + 1;
  }
  if (state.os !== 'all' && !counts[state.os]) state.os = 'all';

  const container = document.getElementById('os-filter');
  const chip = (os, label, count) => {
    const btn = el('button', { type: 'button', className: 'chip', textContent: label });
    btn.append(el('span', { className: 'count', textContent: count }));
    btn.setAttribute('aria-pressed', String(state.os === os));
    btn.addEventListener('click', () => { state.os = os; render(); });
    return btn;
  };
  container.replaceChildren(
    chip('all', 'All platforms', entry.files.length),
    ...sortedDirs(Object.keys(counts)).map(dir => chip(dir, OS_LABELS[dir] || dir, counts[dir])),
  );
}

function sortedDirs(dirs) {
  const rank = d => (OS_ORDER.indexOf(d) + 1) || 99;
  return dirs.sort((a, b) => rank(a) - rank(b));
}

function renderSummary(entry) {
  const summary = document.getElementById('summary');
  const shareBtn = el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Copy link to this page' });
  shareBtn.addEventListener('click', () => copyToClipboard(location.href, 'Page link'));
  // Some releases use a second build for some platforms, so list every build in the filenames
  const builds = [...new Set([entry.build, ...entry.files.map(f => (f.match(/-[0-9.]+-([0-9a-f]+)[-.]/) || [])[1]).filter(Boolean)])];
  const buildLabel = el('span', {}, builds.length > 1 ? 'Builds ' : 'Build ');
  builds.forEach((b, i) => buildLabel.append(...(i ? [', '] : []), el('code', { textContent: b })));
  summary.replaceChildren(
    el('span', {}, `${PRODUCTS[state.product]} `, el('strong', { textContent: entry.version })),
    buildLabel,
    el('span', { className: 'spacer' }),
    shareBtn,
  );

  const notice = document.getElementById('notice');
  const latest = state.data[state.product][0].version;
  const messages = [];
  if (state.fallbackFrom) {
    messages.push(`${PRODUCTS[state.product]} ${state.fallbackFrom} is not available, so the nearest earlier release is shown.`);
  }
  if (parseInt(entry.version, 10) < 9) {
    messages.push(`Splunk ${entry.version} is long past end of support and has known security vulnerabilities. Use it only as a stepping stone for upgrades. The latest release is ${latest}.`);
  }
  notice.textContent = messages.join(' ');
  notice.style.display = messages.length ? 'block' : 'none';
}

function renderResults(entry) {
  const results = document.getElementById('results');
  const byDir = {};
  for (const path of entry.files) {
    const info = describe(path);
    if (state.os !== 'all' && info.dir !== state.os) continue;
    (byDir[info.dir] = byDir[info.dir] || []).push(info);
  }

  const sections = sortedDirs(Object.keys(byDir)).map(dir => {
    const section = el('section', { className: 'card os-section' });
    const heading = el('h2', { textContent: OS_LABELS[dir] || dir });
    heading.append(el('span', { className: 'count', textContent: `${byDir[dir].length} package${byDir[dir].length === 1 ? '' : 's'}` }));
    section.append(heading);

    byDir[dir]
      .sort((a, b) => a.title.localeCompare(b.title) || a.type.localeCompare(b.type))
      .forEach(info => {
        const url = urlFor(entry, `${info.dir}/${info.file}`);
        const copyUrl = el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Copy URL' });
        copyUrl.addEventListener('click', () => copyToClipboard(url, 'URL'));
        const copyWget = el('button', { type: 'button', className: 'btn', textContent: 'Copy wget' });
        copyWget.addEventListener('click', () => copyToClipboard(`wget -O ${info.file} "${url}"`, 'wget command'));

        section.append(el('div', { className: 'pkg' },
          el('div', { className: 'pkg-title' }, `${info.title} `, el('span', { className: 'type', textContent: `· ${info.type}` })),
          el('a', { className: 'pkg-file', href: url, textContent: info.file, rel: 'noopener' }),
          el('div', { className: 'pkg-actions' }, copyUrl, copyWget),
        ));
      });
    return section;
  });

  results.replaceChildren(...(sections.length ? sections : [el('div', { className: 'card empty', textContent: 'No packages for this platform.' })]));
}

function updateUrl() {
  const params = new URLSearchParams({ product: state.product === 'splunk' ? 'enterprise' : 'uf', version: state.version });
  if (state.os !== 'all') params.set('os', state.os);
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function render() {
  const entry = currentEntry();
  renderProductButtons();
  renderVersionSelect();
  renderOsFilter(entry);
  renderSummary(entry);
  renderResults(entry);
  updateUrl();
}

// Pick an exact version if available, otherwise the newest one starting with the given
// prefix (e.g. "9.4"), otherwise the nearest earlier version (with a notice saying so)
function resolveVersion(product, wanted) {
  const list = state.data[product] || [];
  state.fallbackFrom = null;
  if (!wanted || !list.length) return list[0] && list[0].version;
  const exact = list.find(e => e.version === wanted);
  if (exact) return exact.version;
  const prefixed = list.find(e => e.version.startsWith(wanted.replace(/\.?$/, '.')));
  if (prefixed) return prefixed.version;
  if (!/^\d+(\.\d+)*$/.test(wanted)) return list[0].version;
  state.fallbackFrom = wanted;
  const earlier = list.find(e => compareVersions(e.version, wanted) < 0);
  return (earlier || list[list.length - 1]).version;
}

async function init() {
  const params = new URLSearchParams(location.search);
  const productParam = (params.get('product') || '').toLowerCase();
  if (['uf', 'universalforwarder', 'forwarder'].includes(productParam)) state.product = 'universalforwarder';

  try {
    state.data = await loadManifest();
  } catch (err) {
    console.error(err);
    const error = document.getElementById('error');
    error.textContent = 'Failed to load the download list. Please refresh to try again.';
    error.style.display = 'block';
    document.getElementById('loading').style.display = 'none';
    return;
  }
  document.getElementById('loading').style.display = 'none';

  state.version = resolveVersion(state.product, params.get('version'));
  state.os = params.get('os') || 'all';

  document.querySelectorAll('[data-product]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.product === state.product) return;
      state.product = btn.dataset.product;
      // Keep the same version if the other product has it
      state.version = resolveVersion(state.product, state.version);
      render();
    });
  });
  document.getElementById('version').addEventListener('change', e => {
    state.version = e.target.value;
    state.fallbackFrom = null;
    render();
  });

  render();
}

init();
