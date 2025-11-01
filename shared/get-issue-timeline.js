const { logger } = require('./format-log-messages');

/**
 * Function that returns the timeline of an issue
 * @param {Object} github                 - GitHub object from actions/github-script
 * @param {Object} context                - context object from actions/github-script
 * @param {Number} issueNum               - the issue number
 * @returns {Array<Object>} timelineArray - an array containing the timeline of issue events
 */
async function getIssueTimeline(github, context, issueNum) {

  let timelineArray = [];
  let page = 1;

  while (true) {
    try {
      // https://docs.github.com/en/rest/issues/timeline?apiVersion=2022-11-28#list-timeline-events-for-an-issue
      const results = await github.request('GET /repos/{owner}/{repo}/issues/{issue_number}/timeline', {
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issueNum,
        per_page: 100,
        page: page,
      });

      // If the API call returns an empty array, break out of loop- there is no additional data.
      // Else if data is returned, push it to `timelineArray` and increase the page number (`page`)
      if (!results.data.length) {
        break;
      } else {
        timelineArray.push(...results.data);
        page++;
      }
    } catch (err) {
      logger.error(`Error fetching issue timeline (page ${page}):`, err);
      break;
    }
  }

  return timelineArray;
}

module.exports = getIssueTimeline;
