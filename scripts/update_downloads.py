#!/usr/bin/env python3
"""Build docs/downloads.tsv: every Splunk Enterprise and Universal Forwarder
package that actually exists on download.splunk.com, for each version in
version.list.

Splunk has renamed its package files many times, so rather than predicting
filenames we probe a list of known naming patterns with HEAD requests and only
record files that exist. Any filename seen on Splunk's official download pages
is added to the pattern list, so new naming schemes are picked up automatically.

Usage:
  scripts/update_downloads.py          # probe versions missing from the manifest, plus the newest few
  scripts/update_downloads.py --all    # re-probe every version
"""
import argparse
import concurrent.futures
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION_LIST = os.path.join(ROOT, 'version.list')
MANIFEST = os.path.join(ROOT, 'docs', 'downloads.tsv')
BASE = 'https://download.splunk.com/products'
RECHECK_NEWEST = 5

PRODUCTS = {
    # product path on download.splunk.com: filename prefix
    'splunk': 'splunk',
    'universalforwarder': 'splunkforwarder',
}

PAGES = [
    'https://www.splunk.com/en_us/download/splunk-enterprise.html',
    'https://www.splunk.com/en_us/download/previous-releases.html',
    'https://www.splunk.com/en_us/download/universal-forwarder.html',
    'https://www.splunk.com/en_us/download/previous-releases-universal-forwarder.html',
]

# (directory, filename suffix after "<prefix>-<version>-<build>")
CANDIDATES = [
    ('linux', s) for s in [
        '-Linux-x86_64.tgz', '-linux-amd64.tgz', '-Linux-i686.tgz',
        '-linux-2.6-x86_64.rpm', '.x86_64.rpm', '.i386.rpm',
        '-linux-2.6-amd64.deb', '-linux-amd64.deb', '-linux-2.6-intel.deb',
        '-Linux-arm.tgz', '-Linux-armv8.tgz', '-Linux-armv8.deb', '-Linux-aarch64.tgz',
        '-linux-arm64.tgz', '-linux-arm64.deb', '.aarch64.rpm',
        '-Linux-ppc64le.tgz', '-linux-ppc64le.tgz', '.ppc64le.rpm', '-linux-2.6-ppc64le.rpm',
        '-Linux-s390x.tgz', '-linux-s390x.tgz', '.s390x.rpm', '-linux-2.6-s390x.rpm',
    ]
] + [
    ('windows', s) for s in [
        '-x64-release.msi', '-x86-release.msi', '-windows-x64.msi', '-windows-x86.msi',
        '-windows-64.zip', '-windows-32.zip',
    ]
] + [
    ('osx', s) for s in [
        '-darwin-64.tgz', '-darwin-intel.tgz', '-darwin-universal2.tgz', '-darwin-arm64.tgz',
        '-macosx-10.9-intel.dmg', '-macosx-10.11-intel.dmg', '-darwin-intel.dmg',
        '-darwin-universal2.dmg', '-darwin-arm64.dmg',
    ]
] + [
    ('freebsd', s) for s in [
        '-FreeBSD9-amd64.tgz', '-FreeBSD10-amd64.tgz', '-FreeBSD11-amd64.tgz', '-FreeBSD11-amd64.txz',
        '-FreeBSD-amd64.tgz', '-FreeBSD-amd64.txz',
        '-freebsd12-amd64.tgz', '-freebsd12-amd64.txz', '-freebsd13-amd64.tgz', '-freebsd13-amd64.txz',
        '-freebsd14-amd64.tgz', '-freebsd14-amd64.txz',
    ]
] + [
    ('solaris', s) for s in [
        '-SunOS-sparc.tar.Z', '-SunOS-x86_64.tar.Z',
        '-solaris-10-intel.pkg.Z', '-solaris-10-sparc.pkg.Z',
        '-solaris-11-intel.p5p', '-solaris-11-sparc.p5p',
        '-solaris-intel.p5p', '-solaris-sparc.p5p', '-solaris-amd64.p5p',
        '-solaris-amd64.tar.Z', '-solaris-sparc.tar.Z',
    ]
] + [
    ('aix', s) for s in ['-AIX-powerpc.tgz', '-aix-powerpc.tgz']
]


def version_key(v):
    return tuple(int(x) for x in v.split('.'))


def fetch(url, method='GET', attempts=4):
    """Return (status, body). Retries transient failures."""
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, method=method, headers={'User-Agent': 'downloadSplunk-manifest'})
            with urllib.request.urlopen(req, timeout=60) as res:
                return res.status, (res.read() if method == 'GET' else b'')
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return e.code, b''
            err = e
        except Exception as e:  # network errors, timeouts
            err = e
        time.sleep(2 ** i)
    raise RuntimeError(f'{url}: {err}')


FILE_RE = re.compile(r'^(?P<dir>[^/]+)/(?:splunk|splunkforwarder)-(?P<version>[0-9.]+)-(?P<build>[0-9a-f]+)(?P<suffix>[^/]+)$')


def official_files():
    """Collect (product, path) pairs for every file linked from Splunk's download pages."""
    found = set()
    pattern = re.compile(r'data-link="https://download\.splunk\.com/products/([^/]+)/releases/[0-9.]+/([^"]+)"')
    for page in PAGES:
        try:
            _, body = fetch(page)
        except RuntimeError as e:
            print(f'warning: could not read {page}: {e}', file=sys.stderr)
            continue
        found.update((prod, path) for prod, path in pattern.findall(body.decode('utf-8', 'replace'))
                     if prod in PRODUCTS and FILE_RE.match(path))
    return found


def read_versions():
    versions = []
    with open(VERSION_LIST) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or line.startswith('version,'):
                continue
            version, build = [p.strip() for p in line.split(',')[:2]]
            versions.append((version, build))
    return versions


def read_manifest():
    entries = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST) as f:
            for line in f:
                if line.startswith('#') or not line.strip():
                    continue
                parts = line.rstrip('\n').split('\t')
                product, version, build = parts[:3]
                files = parts[3].split() if len(parts) > 3 else []
                entries[(product, version)] = (build, files)
    return entries


def write_manifest(entries):
    lines = [
        '# Generated by scripts/update_downloads.py - do not edit by hand.\n',
        '# product<TAB>version<TAB>build<TAB>space-separated paths under '
        'https://download.splunk.com/products/<product>/releases/<version>/\n',
    ]
    for (product, version) in sorted(entries, key=lambda k: (k[0], version_key(k[1]))):
        build, files = entries[(product, version)]
        lines.append(f'{product}\t{version}\t{build}\t{" ".join(files)}\n')
    with open(MANIFEST, 'w') as f:
        f.writelines(lines)


def builds_in(entry):
    """Build hashes that appear in a manifest entry's filenames."""
    if not entry:
        return set()
    return {m['build'] for m in map(FILE_RE.match, entry[1]) if m} | {entry[0]}


def probe(product, version, builds, candidates):
    prefix = PRODUCTS[product]
    paths = [f'{d}/{prefix}-{version}-{b}{s}' for b in builds for d, s in candidates]

    def exists(path):
        status, _ = fetch(f'{BASE}/{product}/releases/{version}/{path}', method='HEAD')
        return status == 200

    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(exists, paths))
    return [p for p, ok in zip(paths, results) if ok]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--all', action='store_true', help='re-probe every version')
    args = parser.parse_args()

    official = official_files()
    matches = [(prod, FILE_RE.match(path)) for prod, path in official]
    candidates = list(dict.fromkeys(CANDIDATES + sorted({(m['dir'], m['suffix']) for _, m in matches})))
    versions = read_versions()
    entries = read_manifest()

    # Some releases use a second build hash for some platforms (e.g. UF on AIX, FreeBSD,
    # Solaris since 9.3). Those hashes only appear on Splunk's pages, so remember every
    # build seen there or already recorded in the manifest.
    extra_builds = {}
    for prod, m in matches:
        extra_builds.setdefault((prod, m['version']), set()).add(m['build'])
    for (prod, version), (_, files) in entries.items():
        for path in files:
            m = FILE_RE.match(path)
            if m:
                extra_builds.setdefault((prod, version), set()).add(m['build'])

    newest = {v for v, _ in sorted(versions, key=lambda x: version_key(x[0]))[-RECHECK_NEWEST:]}
    todo = [
        (product, version, build)
        for version, build in versions
        for product in PRODUCTS
        if args.all or version in newest or entries.get((product, version), (None,))[0] != build
        or not set(extra_builds.get((product, version), set())) <= builds_in(entries.get((product, version)))
    ]

    print(f'Probing {len(todo)} product/version pairs against {len(candidates)} filename patterns')
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {
            pool.submit(probe, p, v, [b] + sorted(extra_builds.get((p, v), set()) - {b}), candidates): (p, v, b)
            for p, v, b in todo
        }
        for future in concurrent.futures.as_completed(futures):
            product, version, build = futures[future]
            files = future.result()
            entries[(product, version)] = (build, files)
            print(f'  {product} {version}: {len(files)} files')

    # Drop versions that were removed from version.list
    known = {v for v, _ in versions}
    entries = {k: e for k, e in entries.items() if k[1] in known}
    write_manifest(entries)


if __name__ == '__main__':
    main()
