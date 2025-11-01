const { logger } = require('./format-log-messages');

/**
 * Posts a comment to the specified issue
 * @param {Object} github   - the octokit instance
 * @param {Object} context  - the GitHub action context
 * @param {Number} issueNum - the issue number where the comment should be posted
 * @param {String} comment  - the comment to be posted
 */
async function postIssueComment(github, context, issueNum, comment) {
  try {
    // https://docs.github.com/en/rest/issues/comments?apiVersion=2022-11-28#create-an-issue-comment
    await github.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issueNum,
      body: comment,
    });
    logger.info(`Comment has been posted to issue #${issueNum}`);
    return true;
  } catch (err) {
    logger.error(`Failed to post comment to issue #${issueNum}. Please refer to the error below: \n `, err);
    throw new Error(err);
  }
}

module.exports = postIssueComment;