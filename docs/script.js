async function loadVersions() {
  const res = await fetch('../version.list');
  const text = await res.text();
  return text.trim().split('\n').slice(1).map(line => {
    const [version, build] = line.split(',');
    return { version, build };
  });
}

function buildUrl(product, os, pkg, version, build) {
  const base = `https://download.splunk.com/products/${product}/releases/${version}`;
  const name = product === 'splunk' ? 'splunk' : 'splunkforwarder';
  if (os === 'linux') {
    if (pkg === 'tgz') return `${base}/linux/${name}-${version}-${build}-Linux-x86_64.tgz`;
    if (pkg === 'deb') return `${base}/linux/${name}-${version}-${build}-linux-2.6-amd64.deb`;
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

async function search() {
  const versions = await loadVersions();
  const search = document.getElementById('search').value.trim();
  const product = document.getElementById('product').value;
  const os = document.getElementById('os').value;
  const pkg = document.getElementById('pkg').value;
  const tbody = document.querySelector('#results tbody');
  tbody.innerHTML = '';

  versions.filter(v => !search || v.version.startsWith(search)).forEach(v => {
    const url = buildUrl(product, os, pkg, v.version, v.build);
    if (!url) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${v.version}</td><td><a href="${url}">${url}</a></td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('searchBtn').addEventListener('click', search);
