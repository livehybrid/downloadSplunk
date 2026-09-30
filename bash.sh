#!/bin/bash
#
# Prints wget statements for Splunk Enterprise and Universal Forwarder packages.
# Every link comes from docs/downloads.tsv, which scripts/update_downloads.py builds
# by checking each file actually exists on download.splunk.com.
#
# Usage: ./bash.sh [version] [enterprise|uf|both]

MANIFEST_URL="https://raw.githubusercontent.com/livehybrid/downloadSplunk/main/docs/downloads.tsv"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

if [ -f "$SCRIPT_DIR/docs/downloads.tsv" ]; then
    manifest=$(grep -v '^#' "$SCRIPT_DIR/docs/downloads.tsv")
else
    manifest=$(curl -fsSL "$MANIFEST_URL" | grep -v '^#')
fi
if [ -z "$manifest" ]; then
    echo "Could not load the download list from $MANIFEST_URL"
    exit 1
fi

os_label() {
    case "$1" in
        linux) echo "Linux" ;;
        windows) echo "Windows" ;;
        osx) echo "Mac" ;;
        freebsd) echo "FreeBSD" ;;
        solaris) echo "Solaris" ;;
        aix) echo "AIX" ;;
        *) echo "$1" ;;
    esac
}

# Versions available for a product (only those with files), oldest first
versions_for() {
    echo "$manifest" | awk -F'\t' -v p="$1" '$1 == p && $4 != "" {print $2}' \
        | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n
}

print_product() {
    local product=$1 name=$2 version=$3
    local line build files
    line=$(echo "$manifest" | awk -F'\t' -v p="$product" -v v="$version" '$1 == p && $2 == v')
    files=$(echo "$line" | cut -f4)

    echo
    echo "================ $name $version ================"
    if [ -z "$files" ]; then
        echo
        echo "No $name packages are available for $version."
        return
    fi
    # Some releases use a second build for some platforms, so list every build in the filenames
    build=$( { echo "$line" | cut -f3; echo "$files" | tr ' ' '\n' | sed -E 's/.*-[0-9.]+-([0-9a-f]+)[-.].*/\1/'; } \
        | awk '!seen[$0]++' | paste -sd, - | sed 's/,/, /g')
    echo "Build: $build"

    local last_dir="" path dir file
    for path in $(echo "$files" | tr ' ' '\n' | awk -F/ '
        { order = index("linux windows osx freebsd solaris aix", $1); if (!order) order = 99; print order "\t" $0 }' \
        | sort -t$'\t' -k1,1n -k2,2 | cut -f2); do
        dir=${path%%/*}
        file=${path#*/}
        if [ "$dir" != "$last_dir" ]; then
            echo
            echo "-------- $(os_label "$dir") --------"
            last_dir=$dir
        fi
        echo "wget -O $file 'https://download.splunk.com/products/$product/releases/$version/$path'"
    done
}

latest=$(versions_for splunk | tail -1)
req_version=$1
req_product=$2

if [ -z "$req_version" ]; then
    clear
    echo
    echo "Welcome To The Splunk Download Script."
    echo
    echo "The Latest Release Of Splunk is: $latest"
    echo
    echo "Would you like WGET statements for the latest version? (y/n)"
    read grabLatest
    if [ -z "$grabLatest" ] || [ "$grabLatest" = "y" ]; then
        req_version=$latest
    else
        echo "Which version would you like? Example: (9.4.2 or 7.2.10.1)"
        read req_version
    fi
    echo
    echo "Which product? (1) Splunk Enterprise (2) Universal Forwarder (3) Both [3]"
    read choice
    case "$choice" in
        1) req_product=enterprise ;;
        2) req_product=uf ;;
        *) req_product=both ;;
    esac
fi

if ! echo "$manifest" | awk -F'\t' -v v="$req_version" '$2 == v && $4 != "" {found=1} END {exit !found}'; then
    echo
    echo "The version you have selected is unavailable for download. Please try again with a different version."
    exit 1
fi

if [ "${req_version%%.*}" -lt 9 ]; then
    echo
    echo -e "\033[33;5m==WARNING==\033[0m"
    echo
    echo "Splunk $req_version is long past end of support and has known security vulnerabilities. If you download this, and then submit a support case for anything other than using this to upgrade to a supported version, that's bad, and you should feel bad. Relevant Docs: https://docs.splunk.com/Documentation/VersionCompatibility/current/Matrix/CompatMatrix .. Please make the right decision to stay on supported versions of Splunk, for Security and Sustainability. And for support sanity."
    echo
    if [ -z "$1" ]; then
        echo "Would you like to continue? (y/n)"
        read continue
        if [ "$continue" = "n" ]; then
            exit 1
        fi
    fi
fi

case "$req_product" in
    enterprise|splunk) print_product splunk "Splunk Enterprise" "$req_version" ;;
    uf|forwarder|universalforwarder) print_product universalforwarder "Universal Forwarder" "$req_version" ;;
    *)
        print_product splunk "Splunk Enterprise" "$req_version"
        print_product universalforwarder "Universal Forwarder" "$req_version"
        ;;
esac

echo
echo "Thank you, and have a day"
echo
