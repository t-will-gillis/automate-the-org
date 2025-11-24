// Import modules
const { logger } = require('./format-log-messages');

/**
 * Function that returns the number of a linked issue (if exists)
 * @param {String} text       - the text to search for keywords
 * @returns {Number|false}    - issueNumber, or false
 */
function findLinkedIssue(text) {

  // Create RegEx for capturing KEYWORD #ISSUE-NUMBER syntax (i.e. resolves #1234)
  const KEYWORDS = ['close', 'closes', 'closed', 'fix', 'fixes', 'fixed', 'resolve', 'resolves', 'resolved'];

  // Build regex pattern: (close|closes|...) #1234
  const pattern = `(?:^|\\s)(?:${KEYWORDS.join('|')}) #(\\d+)(?=\\s|$)`;
  const re = new RegExp(pattern, 'gi');

  try {
    const matches = [...text.matchAll(re)];
    if (matches.length === 1) {
      return parseInt(matches[0][1], 10);
    }
  } catch (err) {
    logger.error('Regex error in findLinkedIssue:', err);
  }

  return false;
}

module.exports = findLinkedIssue;
