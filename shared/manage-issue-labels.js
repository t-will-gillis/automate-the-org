// Import modules
const { logger } = require('./format-log-messages');

/**
 * Adds labels to a specified issue
 * @param {Object} github      -the octokit instance
 * @param {Object} context     -the GitHub Actions context object
 * @param {Object} config      -configuration object
 * @param {Number} issueNum    -an issue's number
 * @param {Object} issueLog    -logger object for the specific issue
 * @param {Array} labels       -an array containing the labels to add (captures the rest of the parameters)
 */
async function addLabels(github, context, config, issueNum, issueLog, ...labelsToAdd) {
  if (config.dryRun) {
    issueLog.info(`  DEBUG: Would add '${labelsToAdd}'`);
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
    issueLog.info(`  '${labelsToAdd}' label has been added`);
    // If an error is found, the rest of the script does not stop.
  } catch (err) {
    issueLog.info(`  WARNING: failed to add '${labelsToAdd}': ${err}`);
  }
}



/**
 * Removes labels from a specified issue
 * @param {Object} github      -the octokit instance
 * @param {Object} context     -the GitHub Actions context object
 * @param {Object} config      -configuration object
 * @param {Number} issueNum    -an issue's number
 * @param {Object} issueLog    -logger object for the specific issue
 * @param {Array} labels       - an array containing the labels to remove (captures the rest of the parameters)
 */
async function removeLabels(github, context, config, issueNum, issueLog, ...labelsToRemove) {
  for (let label of labelsToRemove) {
    if (config.dryRun) {
      issueLog.info(`  DEBUG: Would remove '${label}'`);
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
      issueLog.info(`  '${label}' label has been removed`);
    } catch (err) {
      if (err.status !== 404) {
        issueLog.info(`  WARN: failed to remove '${label}': ${err}`);
      }
    }
  }
}

module.exports = { addLabels, removeLabels }