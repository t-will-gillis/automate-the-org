// Import modules
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { logger } = require('./format-log-messages');

/**
 * Resolves configuration by merging defaults, project config, and overrides
 * @param {Object} options
 * @param {string} options.projectRepoPath       - Path to the project repository
 * @param {string} options.configPath            - Relative path to config file
 * @param {Object} options.defaults              - Default configuration values
 * @param {Object} options.overrides             - Runtime overrides (from action inputs)
 * @param {Array<string>} options.requiredFields - Required fields in dot-notation
 * @returns {Object}                             - Merged and validated configuration
 */
function resolveConfigs({ 
  projectRepoPath = process.env.GITHUB_WORKSPACE,
  configPath, 
  defaults = {}, 
  overrides = {}, 
  requiredFields = [] 
}) {

  // Construct full path to config file
  const fullPath = path.join(projectRepoPath, configPath);

  let projectConfig = {};
  
  // Load project config if it exists, continue with defaults if not
  if (fs.existsSync(fullPath)) {
    try {
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      projectConfig = yaml.load(fileContents) || {};
      logger.info(`Loaded configuration from: ${configPath}`);
    } catch (error) {
      if (error.name === 'YAMLException') {
        throw new Error(
          `Failed to parse configuration YAML at ${configPath}: ${error.message}`
        );
      }
      throw error;
    }
  } else {
    logger.warn(`Configuration file not found at ${configPath}, using defaults only`);
  }
  
  // Deep merge: defaults < projectConfig < overrides
  const config = deepMerge(defaults, projectConfig, overrides);
  
  // Load the bot's Add Update Instructions comment template, if exists
    try {
    const botCommentTemplatePath =
      config.botCommentTemplatePath || 
      'github-actions/workflow-configs/templates/add-update-instructions-template.md';

    const fullPathTemplate = path.join(projectRepoPath, botCommentTemplatePath);

    if (fs.existsSync(fullPathTemplate)) {
      config.commentTemplate = fs.readFileSync(fullPathTemplate, 'utf8');
      logger.info(`Loaded comment template from: ${botCommentTemplatePath}`);
    } else {
      logger.warn(`Comment template not found at ${botCommentTemplatePath}, using defaults`);
    }
  } catch (err) {
    logger.error(`Failed to load comment template file`, err);
  }

  // Log the final configuration in DEBUG mode
  logger.debug('Final configuration:');
  logger.debug(JSON.stringify(config, null, 2));
  
  // Validate required fields
  validateRequiredFields(config, requiredFields);
  
  return config;
}

/**
 * Deep merges multiple objects, with later objects overriding earlier ones
 * @param {...Object} objects - Objects to merge
 * @returns {Object} Merged object
 */
function deepMerge(...objects) {
  const result = {};
  
  for (const obj of objects) {
    if (!obj) continue;
    
    for (const key in obj) {
      if (!obj.hasOwnProperty(key)) continue;
      
      const value = obj[key];
      
      // If value is an object (but not array or null), recurse
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = deepMerge(result[key] || {}, value);
      } 
      // For arrays and primitives, override completely
      else if (value !== undefined) {
        result[key] = value;
      }
    }
  }
  
  return result;
}

/**
 * Validates that required fields exist in the config
 * @param {Object} config                - Configuration object to validate
 * @param {Array<string>} requiredFields - Array of dot-notation field paths
 */
function validateRequiredFields(config, requiredFields) {
  const missing = [];
  
  for (const field of requiredFields) {
    const keys = field.split('.');
    let value = config;
    
    // Navigate through nested structure
    for (const key of keys) {
      if (value === null || value === undefined) {
        value = undefined;
        break;
      }
      value = value[key];
    }
    
    // Check if value exists and is not empty
    if (value === undefined || value === null || value === '') {
      missing.push(field);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(
      `Config validation failed. Missing required fields:\n` +
      `  ${missing.join('\n  ')}\n` +
      `   ⮡  Provide required fields as shown in the config files`
    );
  }
  
  logger.info(`Resolved required configuration fields`);
}

module.exports = { resolve:resolveConfigs, deepMerge, validateRequiredFields };