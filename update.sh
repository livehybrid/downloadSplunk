#!/bin/bash
set -euo pipefail

# Splunk's site returns 403 to wget's User-Agent (since early Nov 2026), so use curl.
# -f makes HTTP errors fatal instead of silently producing an empty page.
fetch() { curl -fsSL --retry 3 --retry-delay 5 -o "$2" "$1"; }

# Only lines shaped like "<version>,<build>" are kept; anything else (e.g. a bare ","
# written when a page could not be parsed) is dropped.
VALID='^[0-9]+(\.[0-9]+)+,[0-9a-f]+[[:space:]]*$'

fetch 'https://www.splunk.com/en_us/download/splunk-enterprise.html' splunkDownload.html
version=$(grep -oE "data-link\=\"https://.*data-md5" splunkDownload.html | head -1 | grep -oE "splunk-.*\"" | sed "s/splunk-//g" | sed "s/-.*//g" || true)
build=$(grep -oE "data-link\=\"https://.*data-md5" splunkDownload.html | head -1 | grep -oE "splunk-.*\"" | grep -oE "[[:digit:]]-\w+-" | sed 's/^[[:digit:]]-//g' | sed 's/-//g' || true)

if ! [[ "$version,$build" =~ $VALID ]]; then
  echo "ERROR: could not parse latest version/build from the download page (got '$version,$build')" >&2
  exit 1
fi
echo "Latest: $version,$build"

fetch 'https://www.splunk.com/en_us/download/previous-releases.html?locale=en_us' olderVersions.list

echo
echo "Checking Version Pages and Filling in Any Gaps"
echo
grep -oE "data-filename=\"splunk-.*\" data-link" olderVersions.list \
  | sort -u \
  | sed 's/data-filename=\"splunk-//g' \
  | grep rpm \
  | sed 's/-linux.*//g' \
  | sed 's/\.x86.*//g' \
  | sed 's/-/,/g' >> version.list || true

echo "version,build" > new.list
(grep -E "$VALID" version.list; echo "$version,$build") | sort -t',' -k1V -u >> new.list

echo
echo "Cleaning Up"
rm -f olderVersions.list
rm -f version.list
mv new.list version.list
rm -f splunkDownload.html

echo
echo "Update Complete"
echo
