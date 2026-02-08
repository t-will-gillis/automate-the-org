// Import modules
const { logger } = require('./format-log-messages');

/** Retrieves all labels from a repo 
 * @param {Object} github               -the octokit instance
 * @param {Object} context              -the GitHub Actions context object
 * @returns {Array<string>} response    - an array of all labels in the repository
 * 
 */
async function getAllRepoLabels(github, context) {
  let allRepoLabels = [];
  let page = 1;

  while (true) {
    const response = await github.request('GET /repos/{owner}/{repo}/labels', {
      owner: context.repo.owner,
      repo: context.repo.repo,
      page: page,
      per_page: 100,
    });
    if (!response.data.length) {
      break;
    } else {
      allRepoLabels = allRepoLabels.concat(response.data.map(label => label.name));
      page++;
    }
  }

  logger.info(`Retrieved ${allRepoLabels.length} total labels from the repository`);

  return allRepoLabels;
}

/**
 * Validates that required labels exist in the repo; warns if filtering labels are missing
 * @param {Object} github                       -the octokit instance
 * @param {Object} context                      -the GitHub Actions context object
 * @param {Array<string>} requiredLabels        - Array of required label names
 * @param {Array<string>} [filteringLabels=[]]  - Array of filtering label names
 * @throws {Error} If any required labels are missing
 */
async function checkIfLabelsInRepo(github, context, requiredLabels, filteringLabels = []) {
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const allRepoLabels = await getAllRepoLabels(github, context);
  // Create a Set for efficient lookup
  const allRepoSet = new Set(allRepoLabels);

  // Check required labels against repository labels
  const missingRequired = requiredLabels.filter(label => !allRepoSet.has(label));
  if (missingRequired.length > 0) {
    throw new Error(
      `Required labels missing in ${owner}/${repo}: ${missingRequired.join(', ')};\n` +
      ` ⮡  Update the config with existing label names; won't continue until resolved...`
    );
  }

  // Check for missing filtering labels against repo
  const missingFilteringLabels = filteringLabels
    .filter(label => label.trim() !== '')
    .filter(label => !allRepoSet.has(label));
  if (missingFilteringLabels.length > 0) {
    logger.warn(
      `Filtering labels missing in ${owner}/${repo}: ${missingFilteringLabels.join(', ')};\n` +
      ` ⮡  Check for unexpected behavior without these labels; continuing...`
    );
  }

  logger.debug(`All **required** labels exist in ${owner}/${repo}`);
}

module.exports = { getAllRepoLabels, checkIfLabelsInRepo };