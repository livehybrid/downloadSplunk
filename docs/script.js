async function loadVersions() {
  try {
    // Try local first, fallback to GitHub
    let res;
    try {
      res = await fetch('../version.list');
      if (!res.ok) throw new Error('Local fetch failed');
    } catch {
      res = await fetch('https://raw.githubusercontent.com/livehybrid/downloadSplunk/main/version.list');
    }
    
    if (!res.ok) throw new Error('Failed to load version list');
    const text = await res.text();
    return text.trim().split('\n').slice(1).filter(line => line.trim()).map(line => {
      const [version, build] = line.split(',').map(s => s.trim());
      return { version, build };
    });
  } catch (error) {
    console.error('Error loading versions:', error);
    throw error;
  }
}

function getFilePattern(version) {
  const parts = version.split('.');
  const major = parseInt(parts[0]) || 0;
  const minor = parseInt(parts[1]) || 0;
  
  // Pattern changed at 9.4.0
  // 9.4.0+ uses lowercase: linux-amd64
  // Pre-9.4.0 uses capitalized: Linux-x86_64
  if (major >= 10 || (major === 9 && minor >= 4)) {
    return 'linux-amd64';
  } else {
    return 'Linux-x86_64';
  }
}

function buildUrl(product, os, pkg, version, build) {
  const base = `https://download.splunk.com/products/${product}/releases/${version}`;
  const name = product === 'splunk' ? 'splunk' : 'splunkforwarder';
  const pattern = getFilePattern(version);
  
  if (os === 'linux') {
    if (pkg === 'tgz') return `${base}/linux/${name}-${version}-${build}-${pattern}.tgz`;
    if (pkg === 'deb') return `${base}/linux/${name}-${version}-${build}-${pattern}.deb`;
    if (pkg === 'rpm') return `${base}/linux/${name}-${version}-${build}.x86_64.rpm`;
  }
  if (os === 'windows') {
    if (pkg === 'msi') return `${base}/windows/${name}-${version}-${build}-x64-release.msi`;
    if (pkg === 'zip') return `${base}/windows/${name}-${version}-${build}-windows-64.zip`;
  }
  if (os === 'osx') {
    if (pkg === 'tgz') return `${base}/osx/${name}-${version}-${build}-darwin-64.tgz`;
    if (pkg === 'dmg') return `${base}/osx/${name}-${version}-${build}-macosx-10.11-intel.dmg`;
  }
  return '';
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy:', err);
    showToast('Failed to copy', 'error');
  });
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('show');
  }, 100);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

async function search() {
  const searchBtn = document.getElementById('searchBtn');
  const tbody = document.querySelector('#results tbody');
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  
  try {
    searchBtn.disabled = true;
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    tbody.innerHTML = '';
    
    const versions = await loadVersions();
    const searchTerm = document.getElementById('search').value.trim();
    const product = document.getElementById('product').value;
    const os = document.getElementById('os').value;
    const pkg = document.getElementById('pkg').value;
    
    const filtered = versions.filter(v => !searchTerm || v.version.includes(searchTerm));
    
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #999;">No versions found</td></tr>';
      return;
    }
    
    filtered.forEach(v => {
      const url = buildUrl(product, os, pkg, v.version, v.build);
      if (!url) return;
      
      const wgetCmd = `wget -O ${url.split('/').pop()} "${url}"`;
      // Escape single quotes and backslashes for use in onclick attribute
      const escapedWgetCmd = wgetCmd.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${v.version}</strong><br><small style="color: #666;">${v.build}</small></td>
        <td class="url-cell">
          <a href="${url}" target="_blank" class="download-link">${url}</a>
        </td>
        <td>
          <button class="btn-copy" onclick="copyToClipboard('${url}')" title="Copy URL">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </td>
        <td>
          <button class="btn-copy" onclick="copyToClipboard('${escapedWgetCmd}')" title="Copy wget command">
            wget
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error('Search error:', error);
    errorEl.textContent = 'Failed to load versions. Please try again.';
    errorEl.style.display = 'block';
  } finally {
    searchBtn.disabled = false;
    loadingEl.style.display = 'none';
  }
}

// Initialize
document.getElementById('searchBtn').addEventListener('click', search);
document.getElementById('search').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') search();
});

// Check for URL query parameters on load
window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const versionParam = urlParams.get('version');
  
  if (versionParam) {
    // Set the search field to the version from the URL
    document.getElementById('search').value = versionParam;
  }
  
  // Always run search on page load
  search();
});
