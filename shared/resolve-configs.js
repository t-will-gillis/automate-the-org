import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { load, YAMLException } from 'js-yaml';

/**
 * Resolves configuration settings by merging defaults, project configs, and overrides
 * @param {Object} options                       - The options object
 * @param {string} options.projectRepoPath       - Path to the project repository
 * @param {string} options.configPath            - Relative path to config file
 * @param {Object} options.defaults              - Default configuration values
 * @param {Object} options.overrides             - Runtime overrides (from action.yml inputs)
 * @param {Array<string>} options.requiredFields - Required fields in dot-notation
 * @returns {Object}                             - Merged and validated configuration
 */
function resolveConfig({ 
  projectRepoPath = process.env.GITHUB_WORKSPACE, 
  configPath, 
  defaults = {}, 
  overrides = {}, 
  requiredFields = [] 
}) {

  // Construct full path to config file
  const fullConfigPath = join(projectRepoPath, configPath);

  let projectConfig = {};
  // Load project configuration if file exists
  if (existsSync(fullConfigPath)) {
    try {
      const fileContents = readFileSync(fullConfigPath, 'utf8');
      projectConfig = load(fileContents) || {};
      console.log(`✅ Loaded config file from ${configPath}`);
    } catch (error) {
      if (error instanceof YAMLException) {
        throw new Error(`❌ Failed to read or parse config file at ${configPath}: ${error.message}`);
      }
      throw error;
    }
  } else {
    console.log(`⚠️ Config file not found at ${configPath}, proceeding with defaults and overrides.`);
  }

  // Deep merge: defaults < projectConfig < overrides
  const config = deepMerge(defaults, projectConfig, overrides);

  // Validate required fields
  validateRequiredFields(config, requiredFields);

  return config;
}



/**
 * Deep merges multiple objects
 * @param  {...Object} sources - Objects to merge
 * @returns {Object}           - Merged object
 */
function deepMerge(...objects) {
  const result = {};

  for (const obj of objects.filter(Boolean)) {
    for (const [key, value] of Object.entries(obj)) {
      // If value is an object (but not array or null), recurse
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = deepMerge(result[key], value);
      } 
      // Else copy array or primitive value
      else {
        result[key] = value;
      }
    }
  }

  return result;
}



/** * Validates that required fields are present in the config
 * @param {Object} config                - The configuration object
 * @param {Array<string>} requiredFields - List of required fields in dot-notation
 */
function validateRequiredFields(config, requiredFields) {
  const missing = [];

  for (const field of requiredFields) {
    const keys = field.split('.');
    let value = config;

    // traverse nested keys (e.g., "database.host")
    for (const key of keys) {
      if (value == null || typeof value !== 'object') {
        value = undefined;
        break;
      }
      value = value[key];
    }

    // flag field if missing or empty
    if (value == null || value === '') {
      missing.push(field);
    }
  }

  // throw error if any required field is missing
  if (missing.length > 0) {
    throw new Error(
      `❌ Config validation failed. Missing required fields:
        ${missing.join('\n  ')}
        ⮡  Provide required fields as shown in the config files`
    );
  }

  console.log(`✅ Resolved required configuration fields`);
}

export default { resolveConfig, deepMerge, validateRequiredFields };