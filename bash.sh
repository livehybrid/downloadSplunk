#!/bin/bash

# Function to determine file naming pattern based on version
get_file_pattern() {
    local version=$1
    local build=$2
    
    # Extract major and minor version numbers
    local major=$(echo $version | cut -d. -f1)
    local minor=$(echo $version | cut -d. -f2)
    local patch=$(echo $version | cut -d. -f3)
    if [ -z "$patch" ]; then
        patch="0"
    fi
    
    # Determine naming pattern based on version
    # NOTE: The pattern changed at 9.4.0 (not based on version logic,  but on release date)
    # 9.4.0+ uses lowercase: linux-amd64
    # Pre-9.4.0 uses capitalized: Linux-x86_64
    if [ "$major" -ge "10" ] || ([ "$major" -eq "9" ] && [ "$minor" -ge "4" ]); then
        # 10.x and 9.4+ use linux-amd64 pattern
        echo "linux-amd64"
    else
        # Older versions use Linux-x86_64 pattern (capital L)
        echo "Linux-x86_64"
    fi
}

# Function to determine if version supports .deb packages
supports_deb() {
    local version=$1
    local major=$(echo $version | cut -d. -f1)
    local minor=$(echo $version | cut -d. -f2)
    local patch=$(echo $version | cut -d. -f3)
    
    # 9.3.2 and newer support .deb packages
    if [ "$major" -eq "9" ] && [ "$minor" -ge "3" ]; then
        echo "true"
    else
        echo "false"
    fi
}


# Returns success if version $1 is lower than version $2 (dotted numeric compare)
ver_lt() {
    local IFS=.
    local -a a=($1) b=($2)
    local i x y
    for ((i = 0; i < 4; i++)); do
        x=${a[i]:-0}; y=${b[i]:-0}
        ((10#$x < 10#$y)) && return 0
        ((10#$x > 10#$y)) && return 1
    done
    return 1
}

ver_ge() { ! ver_lt "$1" "$2"; }

# Returns success if $1 >= $2 and $1 < $3
ver_in() { ver_ge "$1" "$2" && ver_lt "$1" "$3"; }

# Splunk Enterprise filename suffix (after "splunk-<version>-<build>") for an OS/package.
# Rules verified against download.splunk.com. Prints nothing when no such package exists.
enterprise_suffix() {
    local os=$1 pkg=$2 v=$3

    # Hotfix releases that were only published for Linux
    case "$v" in
        8.1.3.2|8.1.4.3|8.1.5.2|8.1.5.3|8.2.2.2|8.2.4.1|8.2.4.2|8.2.4.3)
            [ "$os" != "linux" ] && return ;;
    esac

    case "$os-$pkg" in
        linux-tgz)
            if ver_ge "$v" 9.4; then echo "-linux-amd64.tgz"; else echo "-Linux-x86_64.tgz"; fi ;;
        linux-deb)
            [ "$v" = "7.0.10" ] && return
            if ver_ge "$v" 9.4; then echo "-linux-amd64.deb"; else echo "-linux-2.6-amd64.deb"; fi ;;
        linux-rpm)
            if ver_ge "$v" 9.0.5 || ver_in "$v" 8.2.11 9.0 || ver_in "$v" 8.1.14 8.2; then
                echo ".x86_64.rpm"
            else
                echo "-linux-2.6-x86_64.rpm"
            fi ;;
        windows-msi)
            if ver_ge "$v" 9.4; then echo "-windows-x64.msi"; else echo "-x64-release.msi"; fi ;;
        windows-zip)
            if ver_lt "$v" 8.1.13 || ver_in "$v" 8.2 8.2.10 || ver_in "$v" 9.0 9.0.2; then
                echo "-windows-64.zip"
            fi ;;
        osx-tgz)
            if ver_ge "$v" 10.4; then echo "-darwin-arm64.tgz"
            elif ver_ge "$v" 9.3; then echo "-darwin-intel.tgz"
            else echo "-darwin-64.tgz"; fi ;;
        osx-dmg)
            [ "$v" = "8.1.0" ] && return
            if ver_ge "$v" 10.4; then echo "-darwin-arm64.dmg"
            elif ver_ge "$v" 9.3; then echo "-darwin-intel.dmg"
            elif ver_ge "$v" 7.1; then echo "-macosx-10.11-intel.dmg"
            else echo "-macosx-10.9-intel.dmg"; fi ;;
    esac
}

# Prints the wget statement for a Splunk Enterprise package, if it exists for this version
enterprise_wget() {
    local os=$1 pkg=$2 suffix
    suffix=$(enterprise_suffix "$os" "$pkg" "$version")
    [ -z "$suffix" ] && return
    local file="splunk-$version-$build$suffix"
    echo "wget -O $file 'https://download.splunk.com/products/splunk/releases/$version/$os/$file'"
}

print_statements() {
	file_pattern=$(get_file_pattern $version $build)
	supports_deb_pkg=$(supports_deb $version)

	echo
	echo "Displaying WGET Statements for Splunk:
	Version: $version
	Build: $build"

	echo
	echo "-------- Linux --------"
	echo
	echo "-- Tarball (TGZ)"
	enterprise_wget linux tgz
	echo "wget -O splunkforwarder-$version-$build-$file_pattern.tgz 'https://download.splunk.com/products/universalforwarder/releases/$version/linux/splunkforwarder-$version-$build-$file_pattern.tgz'"
	echo
	echo "-- Debian (DEB)"
	enterprise_wget linux deb
	if [ "$supports_deb_pkg" = "true" ]; then
		echo "wget -O splunkforwarder-$version-$build-$file_pattern.deb 'https://download.splunk.com/products/universalforwarder/releases/$version/linux/splunkforwarder-$version-$build-$file_pattern.deb'"
	fi
	echo
	echo "-- RHEL (RPM)"
	enterprise_wget linux rpm
	echo "wget -O splunkforwarder-$version-$build.x86_64.rpm 'https://download.splunk.com/products/universalforwarder/releases/$version/linux/splunkforwarder-$version-$build.x86_64.rpm'"
	echo
	echo
	echo "-------- Windows --------"
	echo
	echo "-- Binary (MSI)"
	enterprise_wget windows msi
	echo "wget -O splunkforwarder-$version-$build-x64-release.msi 'https://download.splunk.com/products/universalforwarder/releases/$version/windows/splunkforwarder-$version-$build-x64-release.msi'"
	echo
	echo "-- ZIP"
	enterprise_wget windows zip
	echo "wget -O splunkforwarder-$version-$build-windows-64.zip 'https://download.splunk.com/products/universalforwarder/releases/$version/windows/splunkforwarder-$version-$build-windows-64.zip'"
	echo
	echo
	echo "-------- Mac --------"
	echo
	echo "-- Tarball (TGZ)"
	enterprise_wget osx tgz
	echo "wget -O splunkforwarder-$version-$build-darwin-64.tgz 'https://download.splunk.com/products/universalforwarder/releases/$version/osx/splunkforwarder-$version-$build-darwin-64.tgz'"
	echo
	echo "-- Disk Image (DMG)"
	enterprise_wget osx dmg
	echo "wget -O splunkforwarder-$version-$build-macosx-10.11-intel.dmg 'https://download.splunk.com/products/universalforwarder/releases/$version/osx/splunkforwarder-$version-$build-macosx-10.11-intel.dmg'"
	echo
	echo
}
if [ -f "version.list" ]; then
    version_list=$(cat version.list | grep -v version | grep -v missing | grep -vE "^#")
else
    version_list=$(curl -s https://raw.githubusercontent.com/ryanadler/downloadSplunk/main/version.list | grep -v version | grep -v missing | grep -vE "^#")
fi
wget -O splunkDownload.html 'https://www.splunk.com/en_us/download/splunk-enterprise.html' -q
version=$(cat splunkDownload.html | grep -oE "data-link\=\"https://.*data-md5" | head -1 | grep -oE "splunk-.*\"" | sed "s/splunk-//g" | sed "s/-.*//g")
build=$(cat splunkDownload.html | grep -oE "data-link\=\"https://.*data-md5" | head -1 | grep -oE "splunk-.*\"" | grep -oE "[[:digit:]]-\w+-" | sed 's/^[[:digit:]]-//g' | sed 's/-//g')
rm splunkDownload.html
clear

# Engage with the User
echo
echo
echo "Welcome To The Splunk Download Script."
echo
echo "The Latest Release Of Splunk is: 
Version: $version 
Build: $build"
echo
echo "Would you like WGET statements for the latest version? (y/n)"
read grabLatest
if [ -z "$grabLatest" ]; then
        grabLatest="y"
fi


if [ $grabLatest = "y" ]; then
	print_statements

elif [ $grabLatest = "n" ]; then
        echo "Which version would you like? Example: (8.1.8 or 7.2.10.1)"
        read req_version
	choice=$(echo "$version_list" | grep -E "^$req_version," | head -n 1)

	if [ -z "$choice" ]; then
	echo
	echo "The version you have selected is unavailable for download. Please try again with a different version."
	exit 1
	fi
	
	warn=${req_version%%.*}
	if [ "$warn" -lt "8" ]; then
	clear
	echo
	echo
	echo  -e "\033[33;5m==WARNING==\033[0m"
	echo
	echo "According to Splunk documentation, you are attempting to download an unsupported version of Splunk. If you download this, and then submit a support case for anything other than using this to upgrade to a supported version, that's bad, and you should feel bad. Relevant Docs: https://docs.splunk.com/Documentation/VersionCompatibility/current/Matrix/CompatMatrix .. Please make the right decision to stay on supported versions of Splunk, for Security and Sustainability. And for support sanity."
	echo
	sleep 2
	echo "Would you like to continue? (y/n)"
	read continue
		if [ $continue = "n" ]; then
		exit 1
		fi
	fi

	version=$(echo $choice | sed 's/,.*//g')
	build=$(echo $choice | sed 's/.*,//g')

	print_statements

fi
echo
echo "Thank you, and have a day"
echo
