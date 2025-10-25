# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Dry-run mode for testing without making changes
- Additional maintenance workflows
- Enhanced error reporting
- Label validation tools
- PROJECT_SETUP.md for consuming projects
- Comprehensive documentation and examples
- Troubleshooting guide

## v0.1.0 - 2025-10-24

### Added
- Initial release of centralized maintenance actions
- Includes "Add Update Label Weekly" workflow (aka "Schedule Friday 0700") for issue staleness checking
- Configuration resolver for merging defaults with project configs
- Label resolver for mapping label keys to project-specific label names
- Support for custom comment templates
- Support for custom timezones
- Automatic minimization of outdated bot comments


### Architecture
- Clean separation between orchestration (index.js) and business logic (core/)
- Reusable shared utilities for config and label resolution
- Minimal drift from original logic files
- Configuration via YAML files in consuming projects

### Documentation
- README.md with quick start guide
- CHANGELOG.md for consuming projects
- Example configuration files


---

## Version Strategy

We follow semantic versioning:
- **Major (v1.0.0 → v2.0.0)**: Breaking changes requiring project updates
- **Minor (v1.0.0 → v1.1.0)**: New features, backward compatible
- **Patch (v1.0.0 → v1.0.1)**: Bug fixes, backward compatible

### Version Tags for Consumers

Projects can reference versions in multiple ways:

```yaml
# Recommended: Pin to major version (gets minor/patch updates)
uses: your-org/automate-the-org/add-update-label-weekly@v1

# Pin to minor version (gets patch updates only)
uses: your-org/automate-the-org/add-update-label-weekly@v1.0

# Pin to exact version (no automatic updates)
uses: your-org/automate-the-org/add-update-label-weekly@v1.0.0

# Not recommended: Use latest commit
uses: your-org/automate-the-org/add-update-label-weekly@main
```

---

## Migration Guides

### Upgrading from Pre-1.0 (Legacy Implementation)

If you're migrating from a project-local implementation:

1. **Create label directory** (`.github/automate-the-org/label-directory.yml`)
   ```yaml
   statusUpdated: "Status: Updated"
   statusInactive1: "Status: To Update"
   statusInactive2: "Status: Inactive"
   # Add your other labels...
   ```

2. **Create config file** (`.github/automate-the-org/add-update-label-config.yml`)
   - Copy your hardcoded values from the old implementation
   - Use example config as a template

3. **Update workflow file** (`.github/workflows/maintenance.yml`)
   ```yaml
   # Old
   - uses: actions/github-script@v7
     with:
       script: |
         # Inline script here...
   
   # New
   - uses: your-org/automate-the-org/add-update-label-weekly@v1
     with:
       github-token: ${{ secrets.GITHUB_TOKEN }}
   ```

4. **Test with dry-run** before going live

5. **Remove old files** once confirmed working
   - Old inline scripts
   - Old local action files

---

## Contributing

When making changes:

1. Update this CHANGELOG under `[Unreleased]`
2. Follow semantic versioning for version numbers
3. Document breaking changes clearly
4. Update example configs if needed
5. Test with dry-run mode
6. Update documentation as needed

### Breaking Changes

If introducing breaking changes:
- Clearly document in CHANGELOG
- Provide migration guide
- Update major version number
- Consider deprecation period for major features