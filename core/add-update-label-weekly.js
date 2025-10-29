// Import modules
const { logger } = require('../shared/format-log-messages');
const queryIssueInfo = require('../shared/query-issue-info');
const findLinkedIssue = require('../shared/find-linked-issue');
const getIssueTimeline = require('../shared/get-issue-timeline');
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

  // Set global cutoff time vars, adding/subtracting 10 mins to avoid edge cases
  updatedCutoffTime = new Date();
  updatedCutoffTime.setDate(updatedCutoffTime.getDate() - updatedByDays);
  
  toUpdateCutoffTime = new Date();
  toUpdateCutoffTime.setDate(toUpdateCutoffTime.getDate() - commentByDays);
  toUpdateCutoffTime.setMinutes(toUpdateCutoffTime.getMinutes() - 10);
  
  inactiveCutoffTime = new Date();
  inactiveCutoffTime.setDate(inactiveCutoffTime.getDate() - inactiveByDays);
  
  upperLimitCutoffTime = new Date();
  upperLimitCutoffTime.setDate(upperLimitCutoffTime.getDate() - upperLimitDays);
  upperLimitCutoffTime.setMinutes(upperLimitCutoffTime.getMinutes() + 10);

  // Retrieve all issue numbers from a repo
  const issueNums = await getIssueNumsFromRepo();

  for await (let issueNum of issueNums) {
    const timeline = await getIssueTimeline(github, context, issueNum);
    const assignees = await getAssignees(issueNum);

    // Add and remove labels as well as post comment if the issue's timeline indicates the issue is inactive, to be updated or up-to-date accordingly
    const responseObject = await isTimelineOutdated(timeline, issueNum, assignees);

    if (responseObject.result === true && responseObject.labels === labels.statusInactive1) {   // 7-day outdated: add to be updated label, remove others
      await removeLabels(issueNum, labels.statusUpdated, labels.statusInactive2);
      await addLabels(issueNum, responseObject.labels);
      await postComment(issueNum, assignees, labels.statusInactive1);
    } else if (responseObject.result === true && responseObject.labels === labels.statusInactive2) {   // 14-day outdated: add inactive label, remove others
      await removeLabels(issueNum, labels.statusInactive1, labels.statusUpdated);
      await addLabels(issueNum, responseObject.labels);
      await postComment(issueNum, assignees, labels.statusInactive2);
    } else if (responseObject.result === false && responseObject.labels === labels.statusUpdated) {   // Updated within 3 days: retain up-to-date label if there is one
      await removeLabels(issueNum, labels.statusInactive1, labels.statusInactive2);
    } else if (responseObject.result === false && responseObject.labels === '') {   // Updated between 3 and 7 days, or recently assigned, or fixed by a PR by assignee, remove all three update-related labels
      await removeLabels(issueNum, labels.statusInactive1, labels.statusInactive2, labels.statusUpdated);
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
 * @param {String} assignees    - a list of the issue's assignee's username
 * @returns true if timeline indicates the issue is outdated/inactive, false if not; also returns appropriate labels that should be retained or added to the issue
 */
function isTimelineOutdated(timeline, issueNum, assignees) { // assignees is an arrays of `login`'s
  let lastAssignedTimestamp = null;
  let lastCommentTimestamp = null;
  let commentsToBeMinimized = [];

  for (let i = timeline.length - 1; i >= 0; i--) {
    let eventObj = timeline[i];
    let eventType = eventObj.event;
    // isLinkedIssue checks if the 'body'(comment) of the event mentions fixes/resolves/closes this current issue
    let isOpenLinkedPullRequest = eventType === 'cross-referenced' && isLinkedIssue(eventObj, issueNum) && eventObj.source.issue.state === 'open';

    // if cross-referenced and fixed/resolved/closed by assignee and the pull
    // request is open, remove all update-related labels
    // Once a PR is opened, we remove labels because we focus on the PR not the issue.
    if (isOpenLinkedPullRequest && assignees.includes(eventObj.actor.login)) {
      logger.info(`Issue #${issueNum}: Assignee fixes/resolves/closes issue with an open pull request, remove all update-related labels`);
      return { result: false, labels: '' };  // remove all three labels
    }

    // If the event is a linked PR and the PR is closed, it will continue through the
    // rest of the conditions to receive the appropriate label.
    else if(
      eventType === 'cross-referenced' && 
      eventObj.source?.issue?.pull_request &&
      eventObj.source.issue.state === 'closed'
    ) {
      logger.info(`Issue #${issueNum}: Linked pull request has been closed.`);
    }

    let eventTimestamp = eventObj.updated_at || eventObj.created_at;

    // update the lastCommentTimestamp if this is the last (most recent) comment by an assignee
    if (!lastCommentTimestamp && eventType === 'commented' && isCommentByAssignees(eventObj, assignees)) {
      lastCommentTimestamp = eventTimestamp;
    }

    // update the lastAssignedTimestamp if this is the last (most recent) time an assignee was assigned to the issue
    else if (!lastAssignedTimestamp && eventType === 'assigned' && assignees.includes(eventObj.assignee.login)) {
      lastAssignedTimestamp = eventTimestamp;
    }

    // If this event is more than 7 days old but less than the upperLimitCutoffTime AND this event is a comment by the GitHub Actions Bot, then hide the comment as outdated.
    if (isMomentRecent(eventObj.created_at, upperLimitCutoffTime) && !isMomentRecent(eventObj.created_at, toUpdateCutoffTime) && eventType === 'commented' && isCommentByBot(eventObj)) { 
      logger.info(`Comment ${eventObj.node_id} is outdated (i.e. > 7 days old) and will be minimized.`);
      commentsToBeMinimized.push(eventObj.node_id); // retain node id so its associated comment can be minimized later
    }
  }

  minimizeComments(commentsToBeMinimized);

  if (lastCommentTimestamp && isMomentRecent(lastCommentTimestamp, updatedCutoffTime)) { // if commented by assignee within 3 days
    logger.info(`Issue #${issueNum}: Commented by assignee within 3 days, retain '${labels.statusUpdated}' label`);
    return { result: false, labels: labels.statusUpdated } // retain (don't add) updated label, remove the other two
  }

  if (lastAssignedTimestamp && isMomentRecent(lastAssignedTimestamp, updatedCutoffTime)) { // if an assignee was assigned within 3 days
    logger.info(`Issue #${issueNum}: Assigned to assignee within 3 days, no update-related labels should be used`);
    return { result: false, labels: '' } // remove all three labels
  }

  if ((lastCommentTimestamp && isMomentRecent(lastCommentTimestamp, toUpdateCutoffTime)) || (lastAssignedTimestamp && isMomentRecent(lastAssignedTimestamp, toUpdateCutoffTime))) { // if updated within 7 days
    if ((lastCommentTimestamp && isMomentRecent(lastCommentTimestamp, toUpdateCutoffTime))) {
      logger.info(`Issue #${issueNum}: Commented by assignee between 3 and 7 days, no update-related labels should be used; timestamp: ${lastCommentTimestamp}`)
    } else if (lastAssignedTimestamp && isMomentRecent(lastAssignedTimestamp, toUpdateCutoffTime)) {
      logger.info(`Issue #${issueNum}: Assigned between 3 and 7 days, no update-related labels should be used; timestamp: ${lastAssignedTimestamp}`)
    }
    return { result: false, labels: '' } // remove all three labels
  }

  if ((lastCommentTimestamp && isMomentRecent(lastCommentTimestamp, inactiveCutoffTime)) || (lastAssignedTimestamp && isMomentRecent(lastAssignedTimestamp, inactiveCutoffTime))) { // if last comment was between 7-14 days, or no comment but an assginee was assigned during this period, issue is outdated and add needs update label
    if ((lastCommentTimestamp && isMomentRecent(lastCommentTimestamp, inactiveCutoffTime))) {
      logger.info(`Issue #${issueNum}: Commented by assignee between 7 and 14 days, use '${labels.statusInactive1}' label; timestamp: ${lastCommentTimestamp}`)
    } else if (lastAssignedTimestamp && isMomentRecent(lastAssignedTimestamp, inactiveCutoffTime)) {
      logger.info(`Issue #${issueNum}: Assigned between 7 and 14 days, use '${labels.statusInactive1}' label; timestamp: ${lastAssignedTimestamp}`)
    }
    return { result: true, labels: labels.statusInactive1 } // outdated, add needs update label
  }

  // If no comment or assigning found within 14 days, issue is outdated and add inactive label
  logger.info(`Issue #${issueNum}: No update within 14 days, use '${labels.statusInactive2}' label`)
  return { result: true, labels: labels.statusInactive2 }
}

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

async function postComment(issueNum, assignees, labelString) {
  try {
    const assigneeString = createAssigneeString(assignees);
    const instructions = formatComment(assigneeString, labelString);

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
    logger.info(`Update request comment has been posted to issue #${issueNum}`);
  } catch (err) {
    logger.error(`Function failed to post comment to issue #${issueNum}. Error: ${err?.stack || err}`);

  }
}

/***********************
*** HELPER FUNCTIONS ***
***********************/
function isMomentRecent(dateString, cutoffTime) {
  const dateStringObj = new Date(dateString);
  if (dateStringObj >= cutoffTime) {
    return true;
  } else {
    return false;
  }
}

function isLinkedIssue(data, issueNum) {
  return findLinkedIssue(data.source.issue.body) == issueNum
}

function isCommentByAssignees(data, assignees) {
  return assignees.includes(data.actor.login);
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
    logger.error(`Function failed to get assignees from issue #${issueNum}. Please refer to the error below: \n `, err);
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
function formatComment(assignees, labelString) {
  const options = {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: config.timezone || 'America/Los_Angeles',
  };
  const cutoffTimeString = updatedCutoffTime.toLocaleString('en-US', options);
  
  let completedInstructions = config.commentTemplate
    .replace(/\$\{assignees\}/g, assignees)
    .replace(/\$\{label\}/g, labelString)
    .replace(/\$\{statusUpdated\}/g, labels.statusUpdated || 'Status: Updated')
    .replace(/\$\{questionsStatus\}/g, projectBoard.questionsStatus || 'Questions / In Review')
    .replace(/\$\{statusHelpWanted\}/g, labels.statusHelpWanted || 'Status: Help Wanted')
    .replace(/\$\{teamSlackChannel\}/g, teamSlackChannel || '#hfla-site')
    .replace(/\$\{cutoffTime\}/g, cutoffTimeString);

  return completedInstructions;
}

function isCommentByBot(data) {
  // Use bot list from config, default to 'github-actions[bot]'
  const botLogins = config.bots || ['github-actions[bot]'];
  
  // NOTE: this should not apply if Skills Issues omitted from the scans
  // If the comment includes the MARKER, return false so it is not minimized
  let MARKER = '<!-- Skills Issue Activity Record -->'; 
  if (data.body && data.body.includes(MARKER)) {
    logger.info(`Found "Skills Issue Activity Record" - do not minimize`);
    return false; 
  }

  return botLogins.includes(data.actor.login);
}

// asynchronously minimize all the comments that are outdated (> 1 week old)
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