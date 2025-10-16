const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

/**
 * Resolves label keys to actual label names from a project's label directory
 * @param {Object} options
 * @param {string} options.projectRepoPath          - Path to the project repository
 * @param {string} options.labelDirectoryPath       - Relative path to `label-directory.yml`
 * @param {Array<string>} options.requiredLabelKeys - Required label keys for workflow
 * @param {Array<string>} options.optionalLabelKeys - Optional label keys for workflow
 * @returns {Object}                                - Map of labelKeys to Label Names
 */
async function resolveLabels({
  projectRepoPath,
  labelDirectoryPath,
  requiredLabelKeys = [],
  optionalLabelKeys = [],
}) {
  
  // Construct full path to label directory YAML file
  const fullLabelPath = path.join(projectRepoPath, labelDirectoryPath);

  // Check if label directory YAML file exists
  try {
    await fs.access(fullLabelPath);
  } catch {
    throw new Error(
      `❌ Label directory YAML file not found at: ${labelDirectoryPath}\n` +
      `   ⮡  Reference the config files for implementing the label directory.`
    );
  }


  // Retrieve and parse label directory YAML file
  let labelDirectory = {};
  try {
    const rawData = await fs.readFile(fullLabelPath, 'utf8');
    labelDirectory = yaml.load(rawData);

    if (!labelDirectory || typeof labelDirectory !== 'object') {
      throw new Error('❌ Label directory YAML file is empty or invalid');
    }
  } catch (error) {
    if (error instanceof yaml.YAMLException) {
      throw new Error(
        `❌ Failed to retrieve label directory YAML file at ${labelDirectoryPath}: ${error.message}`
      );
    }
    throw error;
  }

  console.log(`✅ Loaded label directory from: ${labelDirectoryPath}`);
  console.log(`✅ labelKeys found: ${Object.keys(labelDirectory).join(', ')}`);

  // Check that required labelKeys exist in the label directory YAML file
  const missingLabelKeys = requiredLabelKeys.filter(key => !(key in labelDirectory));
  if (missingLabelKeys.length > 0) {
    throw new Error(
      `❌ Missing required labelKeys: ${missingLabelKeys.join(', ')}\n` +
      `   ⮡  Provide required labelKeys as shown in the config files`
    );
  }
  
  // Build resolved labels object
  const resolvedLabels = {};
  const allLabelKeys = [...requiredLabelKeys, ...optionalLabelKeys];
  
  allLabelKeys.forEach(labelKey => {
    if (labelKey in labelDirectory) {
      resolvedLabels[labelKey] = labelDirectory[labelKey];
      console.log(`✔️ Found ${labelKey}: "${labelDirectory[labelKey]}"`);
    } else if (optionalLabelKeys.includes(labelKey)) {
      console.log(`⚠️ Optional ${labelKey} not found - skipping`);
    }
  });
  
  console.log(`✅ Success! Resolved ${Object.keys(resolvedLabels).length} labels`);
  return resolvedLabels;
}

module.exports = { resolveLabels };