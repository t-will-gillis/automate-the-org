// Import modules
const { logger } = require('./format-log-messages');

/**
 * Adds labels to a specified issue
 * @param {Object} github      -the octokit instance
 * @param {Object} context     -the GitHub Actions context object
 * @param {Object} config      -configuration object
 * @param {Number} issueNum    -an issue's number
 * @param {Array} labels       -an array containing the labels to add (captures the rest of the parameters)
 */
async function addLabels(github, context, config, issueNum, ...labelsToAdd) {
  if (config.dryRun) {
    logger.debug(`Would add '${labelsToAdd}'`, 2);
    return;
  }
  try {
    // https://octokit.github.io/rest.js/v20#issues-add-labels
    await github.rest.issues.addLabels({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issueNum,
      labels: labelsToAdd,
    });
    logger.log(`'${labelsToAdd}' label has been added`, 2);
    // If an error is found, the rest of the script does not stop.
  } catch (err) {
    logger.warn(`Failed to add '${labelsToAdd}': ${err}`, 2);
  }
}



/**
 * Removes labels from a specified issue
 * @param {Object} github      -the octokit instance
 * @param {Object} context     -the GitHub Actions context object
 * @param {Object} config      -configuration object
 * @param {Number} issueNum    -an issue's number
 * @param {Array} labels       - an array containing the labels to remove (captures the rest of the parameters)
 */
async function removeLabels(github, context, config, issueNum, ...labelsToRemove) {
  for (let label of labelsToRemove) {
    if (config.dryRun) {
      logger.debug(`Would remove '${label}'`, 2);
      continue;
    }
    try {
     // https://octokit.github.io/rest.js/v20#issues-remove-label
      await github.rest.issues.removeLabel({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issueNum,
        name: label,
      });
      logger.log(`'${label}' label has been removed`, 2);
    } catch (err) {
      if (err.status !== 404) {
        logger.warn(`Failed to remove '${label}': ${err}`, 2);
      }
    }
  }
}

module.exports = { addLabels, removeLabels }