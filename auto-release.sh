#!/bin/bash
set -e

# --- CONFIG ---
CHANGELOG="CHANGELOG.md"
PACKAGE_JSON="package.json"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# --- 1. Get last git tag ---
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")

# Extract major.minor.patch numbers
VERSION_REGEX="v([0-9]+)\.([0-9]+)\.([0-9]+)"
if [[ $LAST_TAG =~ $VERSION_REGEX ]]; then
  MAJOR="${BASH_REMATCH[1]}"
  MINOR="${BASH_REMATCH[2]}"
  PATCH="${BASH_REMATCH[3]}"
else
  echo "Could not parse last tag ($LAST_TAG). Exiting."
  exit 1
fi

# --- 1.5. Confirm branch ---
echo ""
echo "⚠️ You are working on: --> $CURRENT_BRANCH"
echo ""
read -p "Proceed with this branch? (y/N) " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Release canceled. Change to the desired branch."
  exit 0
fi
# --- 2. Show last version ---
echo "Last version: $LAST_TAG"

# --- 3. Extract [Unreleased] changes ---
UNRELEASED_CHANGES=$(awk '/## \[Unreleased\]/{flag=1;next}/## \[/{flag=0}flag' $CHANGELOG)

if [ -z "$UNRELEASED_CHANGES" ]; then
  echo "No changes found in [Unreleased] section!"
  exit 1
fi

echo -e "\nChanges to release:\n$UNRELEASED_CHANGES"

# --- 4. Ask user for increment type ---
echo -e "\nChoose version increment (patch/minor/major):"
read -r INCREMENT

case $INCREMENT in
  patch)
    PATCH=$((PATCH + 1))
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  *)
    echo "Invalid increment type. Use patch, minor, or major."
    exit 1
    ;;
esac

NEW_VERSION="v$MAJOR.$MINOR.$PATCH"
echo -e "\nProposed new version: $LAST_TAG --> $NEW_VERSION"
echo -e "\nWith the following changes:\n$UNRELEASED_CHANGES"

# --- 5. Confirm release ---
read -p "Proceed with this release? (y/N) " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Release canceled. Fix changelog or choose a different version."
  exit 0
fi

# --- 6. Update package.json version ---
sed -i.bak -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$MAJOR.$MINOR.$PATCH\"/" $PACKAGE_JSON
rm $PACKAGE_JSON.bak


# --- 7. Create annotated git tag ---
git tag -a $NEW_VERSION -m "Release $NEW_VERSION

Changes:
$UNRELEASED_CHANGES"

# --- 8. Update CHANGELOG.md ---
DATE=$(date +%F)

# Append new version header with date and changes
sed -i "/## \[Unreleased\]/a \
## [$NEW_VERSION] - $DATE\\
$UNRELEASED_CHANGES" $CHANGELOG

# Clear [Unreleased] section
sed -i "/## \[Unreleased\]/,+1d" $CHANGELOG

# --- 9. Commit updated files ---
git add $CHANGELOG $PACKAGE_JSON
git commit -m "Update CHANGELOG and package.json for $NEW_VERSION release"

# --- 10. Push changes ---
git push origin $CURRENT_BRANCH
git push origin $NEW_VERSION

echo -e "\n✅ Release $NEW_VERSION created and pushed successfully!"
