// Import modules
const { logger } = require('./format-log-messages');

/**
 * Minimize issue comment as OUTDATED given the comment's node Id
 * @param {Object} github - the octokit instance
 * @param {String} nodeId - node Id of comment to be marked as 'OUTDATED'
 * 
 */
async function minimizeIssueComment(github, nodeId) {

  const mutation = `mutation($nodeId: ID!) {
    minimizeComment(input: {classifier: OUTDATED, subjectId: $nodeId}) {
      clientMutationId
      minimizedComment {
        isMinimized
        minimizedReason
      }
    }
  }`;

  const variables = {
    nodeId: nodeId,
  };

  try {
    await github.graphql(mutation, variables);
  } catch (error) {
    logger.error(`Error minimizing comment with nodeId ${nodeId}:`, error);
    throw new Error(error);
  }
}

module.exports = minimizeIssueComment;
