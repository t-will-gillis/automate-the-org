// Import modules
const { logger } = require('./format-log-messages');

/**
 * Default returns the current date and time in Los Angeles time (PST/PDT)
 * formatted as a string.
 *
 * The output format is: `YYYY/MM/DD HH:MM TZ`, where `TZ` is either
 * PST or PDT depending on daylight saving time.
 *
 * @param {String} datetime                         - The date and time string from the event
 * @param {String} [timezone='America/Los_Angeles'] - Optional IANA timezone string
 * @returns {String}                                - Formatted date and time string for timezone
 */
function setLocalTime(datetime, timezone = 'America/Los_Angeles') {
  // Validate timezone input
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch (e) {
    logger.warn(`Invalid timezone specified: '${timezone}', defaulting to 'America/Los_Angeles'`);
    timezone = 'America/Los_Angeles';
  }

  // Create notification time string in PST/PDT
  return new Date(datetime).toLocaleString("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}



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

module.exports = { setLocalTime, getIssueTimeline };
