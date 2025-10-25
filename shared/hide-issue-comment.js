const { logger } = require('./format-log-messages');

/**
 * Minimize issue comment as OUTDATED given the comment's node Id
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
  } catch (err) {
    logger.error(`Error minimizing comment with nodeId ${nodeId}:`, err);
    throw new Error(err);
  }
}

module.exports = minimizeIssueComment;
