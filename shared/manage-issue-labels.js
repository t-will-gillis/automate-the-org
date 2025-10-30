/**
 * Removes labels from a specified issue
 * @param {Number} issueNum    - an issue's number
 * @param {Array} labels       - an array containing the labels to remove (captures the rest of the parameters)
 */
async function removeLabels(issueNum, ...labelsToRemove) {
  for (let label of labelsToRemove) {
    if (config.dryRun) {
      logger.debug(`Would remove '${label}' from issue #${issueNum}`);
      continue;
    }
    try {
      // https://docs.github.com/en/rest/issues/labels?apiVersion=2022-11-28#remove-a-label-from-an-issue
      await github.request('DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}', {
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issueNum,
        name: label,
      });
      logger.info(`'${label}' label has been removed`);
    } catch (err) {
      if (!err.status === 404) {
        logger.error(`Function failed to remove label. Please refer to the error below: \n `, err);
      }
    }
  }
}

/**
 * Adds labels to a specified issue
 * @param {Number} issueNum   -an issue's number
 * @param {Array} labels      -an array containing the labels to add (captures the rest of the parameters)
 */
async function addLabels(issueNum, ...labelsToAdd) {
  if (config.dryRun) {
    logger.debug(`Would add '${labelsToAdd}' to issue #${issueNum}`);
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
    logger.info(`'${labelsToAdd}' label has been added`);
    // If an error is found, the rest of the script does not stop.
  } catch (err) {
    logger.error(`Function failed to add labels. Please refer to the error below: \n `, err);
  }
}