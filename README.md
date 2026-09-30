# Download Splunk

This repository was created to aid in downloading Splunk and the Splunk Universal Forwarder. The `bash.sh` script creates wget statements based on your version of choice.

Usage: `./bash.sh` (interactive) or `./bash.sh <version> [enterprise|uf|both]`, e.g. `./bash.sh 9.4.2 uf`.

For Linux and macOS:
`./bash.sh` should work natively.

For Windows:
You may need to install the Windows Subsystem for Linux (WSL) in order to utilize `./bash.sh` through PowerShell.

The `update.sh` and `version.list` files are used to update the repo's list of versions and builds that Splunk has produced. Some are now unsupported, deprecated, or no longer available. In some cases, it may be necessary to download an older version in order to properly upgrade or remove a version of Splunk.

`docs/downloads.tsv` lists every package that actually exists on download.splunk.com for each version, for both Splunk Enterprise and the Universal Forwarder. Splunk has renamed its package files many times (and some Universal Forwarder platforms use a different build hash from the main packages), so rather than predicting filenames, `scripts/update_downloads.py` checks a list of known naming patterns plus every filename on Splunk's download pages, and records only files that exist. Both `bash.sh` and the web page read this file. It is refreshed automatically by the `Update download manifest` workflow; run `scripts/update_downloads.py --all` to re-check everything.

Download and install with caution, and behave responsibly.

## Web interface

A download page is available in the `docs/` directory and can be hosted using GitHub Pages. Choose Splunk Enterprise or the Universal Forwarder and a version (the latest is selected by default) to see every available package, grouped by platform, with copyable URLs and wget commands. Links can be shared with `?product=enterprise|uf&version=9.4.2` (a partial version such as `9.4` selects the newest 9.4 release) and optionally `&os=linux|windows|osx|freebsd|solaris|aix`.
