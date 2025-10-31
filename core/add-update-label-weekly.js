// Import modules
const { logger } = require('../shared/format-log-messages');
const queryIssueInfo = require('../shared/query-issue-info');
const findLinkedIssue = require('../shared/find-linked-issue');
const getIssueTimeline = require('../shared/get-issue-timeline');
const { addLabels, removeLabels } = require('../shared/manage-issue-labels');
const minimizeIssueComment = require('../shared/hide-issue-comment');

// Global variables
var github;
var context;
var labels;
var config;

// Time cutoff variables (set in main function based on config)
var updatedCutoffTime;
var toUpdateCutoffTime;
var inactiveCutoffTime;
var upperLimitCutoffTime;



/**
 * The main function, which retrieves issues from a specific column in a specific project, before examining
 * the timeline of each issue for outdatedness. An update to an issue is either 1.) a comment by the assignee,
 * or 2.) assigning an assignee to the issue. If the last update was not between 7 to 14 days ago, apply the
 * appropriate label and request an update. However, if the assignee has submitted a PR that will fix the issue
 * regardless of when, all update-related labels should be removed.
 * @param {Object} github     - GitHub object from actions/github-script
 * @param {Object} context    - context object from actions/github-script
 * @param {Object} labels     - Resolved label mappings (label keys to label names)
 * @param {Object} config     - Configuration object
 */
async function main({ github: g, context: c, labels: l, config: cfg }) {
  github = g;
  context = c;
  labels = l;
  config = cfg;

  // Calculate cutoff times from config settings
  const updatedByDays = config.timeframes.updatedByDays;
  const commentByDays = config.timeframes.commentByDays;
  const inactiveByDays = config.timeframes.inactiveByDays;
  const upperLimitDays = config.timeframes.upperLimitDays;

  // Set global cutoff time vars from config settings, adding/subtracting 10 mins to avoid edge cases
  const msPerMinute = 60 * 1000;
  updatedCutoffTime = new Date(Date.now() - updatedByDays * 24 * 60 * msPerMinute);
  toUpdateCutoffTime = new Date(Date.now() - (commentByDays * 24 * 60 + 10) * msPerMinute);
  inactiveCutoffTime = new Date(Date.now() - inactiveByDays * 24 * 60 * msPerMinute);
  upperLimitCutoffTime = new Date(Date.now() - (upperLimitDays * 24 * 60 - 10) * msPerMinute);

  // Retrieve all issue numbers from a repo
  const issueNums = await getIssueNumsFromRepo();

  for (let issueNum of issueNums) {
    const timeline = await getIssueTimeline(github, context, issueNum);
    const assignees = await getAssignees(issueNum);

    // Add and remove labels as well as post comment if the issue's timeline indicates the issue is inactive, to be updated or up-to-date accordingly
    const responseObject = await isTimelineOutdated(timeline, issueNum, assignees);

    if (responseObject.result === true && responseObject.labels === labels.statusInactive1) {
      await removeLabels(github, context, config, issueNum, labels.statusUpdated, labels.statusInactive2);
      await addLabels(github, context, config, issueNum, responseObject.labels);
      await postComment(issueNum, assignees, labels.statusInactive1, responseObject.cutoff);
    } else if (responseObject.result === true && responseObject.labels === labels.statusInactive2) {
      await removeLabels(github, context, config, issueNum, labels.statusInactive1, labels.statusUpdated);
      await addLabels(github, context, config, issueNum, responseObject.labels);
      await postComment(issueNum, assignees, labels.statusInactive2, responseObject.cutoff);
    } else if (responseObject.result === false && responseObject.labels === labels.statusUpdated) {
      await removeLabels(github, context, config, issueNum, labels.statusInactive1, labels.statusInactive2);
    } else if (responseObject.result === false && responseObject.labels === '') {
      await removeLabels(github, context, config, issueNum, labels.statusInactive1, labels.statusInactive2, labels.statusUpdated);
    }
  }
}

/**
 * Finds issue numbers for all open & assigned issues, excluding issues with an 'ignored' label
 * and returning issue numbers only if their status matches the target status from config
 *
 * @returns {Promise<Array>} issueNums     - an array of open, assigned, and statused issue numbers
 */
async function getIssueNumsFromRepo() {

  // Exclude issues with any of the 'ignored' labels
  const labelsToExclude = config.labels.ignored.map(key => labels[key]).filter(Boolean);
  
  let issueNums = [];
  let pageNum = 1;
  let result = [];

  while (true) {
    // https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28#list-repository-issues
    const issueData = await github.request('GET /repos/{owner}/{repo}/issues', {
      owner: context.repo.owner,
      repo: context.repo.repo,
      assignee: '*',
      per_page: 100,
      page: pageNum,
    });
    
    if (!issueData.data.length) {
      break;
    } else {
      result = result.concat(issueData.data);
      pageNum++;
    }
  }
  
  for (let { number, labels: issueLabels, pull_request } of result) {
    if (!number) continue;

    // Exclude any pull requests that were found
    if (pull_request != undefined) continue;
  
    // Exclude any issues that have excluded labels
    const issueLabelNames = issueLabels.map((label) => label.name);
    if (issueLabelNames.some((item) => labelsToExclude.includes(item))) continue;

    // For remaining issues, check if status === target status from config
    const { statusName } = await queryIssueInfo(github, context, number);
    if (statusName === config.projectBoard.targetStatus) {
      issueNums.push(number);
    }
  }
  return issueNums;
}



/**
 * Assesses whether the timeline is outdated.
 * @param {Array} timeline      - a list of events in the timeline of an issue, retrieved from the issues API
 * @param {Number} issueNum     - the issue's number
 * @param {String} assignees    - a list of the issue's assignee's username (array of `login`'s)
 * @returns true if timeline indicates the issue is outdated/inactive, false if not; also returns appropriate labels that should be retained or added to the issue
 */
function isTimelineOutdated(timeline, issueNum, assignees) {
  let lastAssignedTimestamp = null;
  let lastCommentTimestamp = null;
  let commentsToBeMinimized = [];

  for (let i = timeline.length - 1; i >= 0; i--) {
    let eventObj = timeline[i];
    let eventType = eventObj.event;

    // If cross-referenced and fixed/resolved/closed by assignee and the pull request is open, remove all 
    // update-related labels. (Once a PR is opened, remove all labels because we focus on the PR, not the issue.)
    // If the linked PR is closed, continue through the rest of the conditions to receive the appropriate label.
    if (eventType === 'cross-referenced' && isLinkedIssue(eventObj, issueNum)) {
      const issueState = eventObj.source?.issue?.state;
      const isPR = eventObj.source?.issue?.pull_request;
   
      if (issueState === 'open' && assignees.includes(eventObj.actor.login)) {
        logger.info(`Issue #${issueNum}: Assignee fixes/resolves/closes issue with an open pull request, remove all update-related labels`);
        return { result: false, labels: '' };
      }
      if (issueState === 'closed' && isPR ) {
        logger.info(`Issue #${issueNum}: Linked pull request has been closed, continue with checks`);
      }
    }

    const eventTimestamp = eventObj.updated_at || eventObj.created_at;

    // Update for the most recent 'lastCommentTimestamp' or 'lastAssignedTimestamp' 
    if (!lastCommentTimestamp && eventType === 'commented' && assignees.includes(eventObj.actor.login)) {
      lastCommentTimestamp = eventTimestamp;
    } else if (!lastAssignedTimestamp && eventType === 'assigned' && assignees.includes(eventObj.assignee.login)) {
      lastAssignedTimestamp = eventTimestamp;
    }

    // If this event is older than 'toUpdateCutoffTime', less than the 'upperLimitCutoffTime', AND this event is a comment by the GitHub Actions Bot, then add comment's 'node_id' to list of outdated comments to minimize later.
    if (
      isMomentRecent(eventObj.created_at, upperLimitCutoffTime) &&
      !isMomentRecent(eventObj.created_at, toUpdateCutoffTime) &&
      eventType === 'commented' &&
      isCommentByBot(eventObj)
    ) { 
      logger.info(`Issue #${issueNum}: Comment ${eventObj.node_id} is from a previous run and will be minimized.`);
      commentsToBeMinimized.push(eventObj.node_id);
    }
  }

  // Minimize previous bot comments
  minimizeComments(commentsToBeMinimized);


  // Determine the latest activity timestamp and activity type
  const [ lastActivityTimestamp, lastActivityType ] =
    lastCommentTimestamp > lastAssignedTimestamp
    ? [lastCommentTimestamp, 'Assignee\'s last comment']
    : [lastAssignedTimestamp, 'Assignee\'s assignment'];

  // If 'lastActivityTimestamp' more recent than 'updatedCutoffTime', keep updated label and remove others
  if (isMomentRecent(lastActivityTimestamp, updatedCutoffTime)) {
    logger.info(`Issue #${issueNum}: ${lastActivityType} sooner than ${updatedByDays} days ago, retain '${labels.statusUpdated}' label if exists `);
    return { result: false, labels: labels.statusUpdated, cutoff: updatedCutoffTime }
  }

  // If 'lastActivityTimestamp' more recent than 'toUpdateCutoffTime', remove all labels
  if (isMomentRecent(lastActivityTimestamp, updatedCutoffTime)) {
    logger.info(`Issue #${issueNum}: ${lastActivityType} between ${updatedByDays} and ${commentByDays} days ago, no update-related labels`)
    return { result: false, labels: '', cutoff: updatedCutoffTime} 
  }

  // If 'lastActivityTimestamp' not yet older than the 'inactiveCutoffTime', issue needs update label
  if (isMomentRecent(lastActivityTimestamp, inactiveCutoffTime)) { 
    logger.info(`Issue #${issueNum}: ${lastActivityType} between ${commentByDays} and ${inactiveByDays} days ago, use '${labels.statusInactive1}' label`)
    return { result: true, labels: labels.statusInactive1, cutoff: toUpdateCutoffTime }
  }

  // If 'lastActivityTimestamp' is older than the 'inactiveCutoffTime', issue is outdated and needs inactive label
  logger.info(`Issue #${issueNum}: ${lastActivityType} older than ${inactiveByDays} days ago, use '${labels.statusInactive2}' label`)
  return { result: true, labels: labels.statusInactive2, cutoff: inactiveCutoffTime }
}



async function postComment(issueNum, assignees, labelString, cutoffTime) {
  try {
    const assigneeString = createAssigneeString(assignees);
    const instructions = formatComment(assigneeString, labelString, cutoffTime);

    if (config.dryRun) {
      logger.debug(`Would post comment to issue #${issueNum}:`);
      logger.debug(instructions);
      return;
    }
    // https://docs.github.com/en/rest/issues/comments?apiVersion=2022-11-28#create-an-issue-comment
    await github.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issueNum,
      body: instructions,
    });
    logger.info(`Issue #${issueNum}: Update request comment has been posted`);
  } catch (err) {
    logger.error(`Issue #${issueNum}: Function failed to post comment ${err?.stack || err}`);

  }
}

/***********************
*** HELPER FUNCTIONS ***
***********************/
function isMomentRecent(dateString, cutoffTime) {
  return new Date(dateString) >= cutoffTime;
}

function isLinkedIssue(data, issueNum) {
  return findLinkedIssue(data.source.issue.body) == issueNum
}

async function getAssignees(issueNum) {
  try {
    const results = await github.rest.issues.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issueNum,
    });
    const assigneesData = results.data.assignees;
    const assigneesLogins = filterForAssigneesLogins(assigneesData);
    return assigneesLogins;
  } catch (err) {
    logger.error(`Issue #${issueNum}: Function failed to get assignees. See: \n `, err);
    return null;
  }
}

function filterForAssigneesLogins(data) {
  const logins = [];
  for (let item of data) {
    logins.push(item.login);
  }
  return logins;
}

function createAssigneeString(assignees) {
  const assigneeString = [];
  for (let assignee of assignees) {
    assigneeString.push(`@${assignee}`);
  }
  return assigneeString.join(', ');
}

// Populate default comment template with corresponding values
function formatComment(assignees, labelString, cutoffTime) {
  const options = {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: config.timezone || 'America/Los_Angeles',
  };
  const cutoffTimeString = cutoffTime.toLocaleString('en-US', options);
  
  let completedInstructions = config.commentTemplate
    .replace(/\$\{assignees\}/g, assignees)
    .replace(/\$\{label\}/g, labelString)
    .replace(/\$\{statusUpdated\}/g, labels.statusUpdated || 'Status: Updated')
    .replace(/\$\{questionsStatus\}/g, config.projectBoard.questionsStatus || 'Questions / In Review')
    .replace(/\$\{statusHelpWanted\}/g, labels.statusHelpWanted || 'Status: Help Wanted')
    .replace(/\$\{cutoffTime\}/g, cutoffTimeString);

  return completedInstructions;
}

function isCommentByBot(data) {
  // Use bot list from config, default to 'github-actions[bot]'
  const botLogins = config.bots || ['github-actions[bot]'];
  
  // NOTE: this should not apply if `Complexity: Prework` omitted from the scans
  // If the comment includes the MARKER, return false so it is not minimized
  let MARKER = '<!-- Skills Issue Activity Record -->'; 
  if (data.body && data.body.includes(MARKER)) {
    logger.info(`Found "Skills Issue Activity Record" - do not minimize`);
    return false; 
  }

  return botLogins.includes(data.actor.login);
}

// asynchronously minimize all the comments that are outdated
async function minimizeComments(comment_node_ids) {
  for (const node_id of comment_node_ids) {
    if (config.dryRun) {
      logger.debug(`Would minimize comment ${node_id}`);
      continue;
    }
    await new Promise((resolve) => { setTimeout(resolve, 1000); }); // wait for 1000ms before doing the GraphQL mutation
    await minimizeIssueComment(github, node_id);
  }
}

module.exports = main;