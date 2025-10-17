import core from '@actions/core';
import github from '@actions/github';
import resolveConfigs from '../shared/resolve-configs';
import resolveLabels from '../shared/resolve-labels';
import addUpdateLabelWeekly from '../core/add-update-label-weekly';
import yaml from 'js-yaml';

/**
 * Main entry to run Add Update Label Weekly action
 * 
 */
async function run() {
  try {
    console.log(`=`.repeat(60));
    console.log(`"Add Update Label Weekly" Starting...`);
    console.log(`=`.repeat(60));

    // Get action inputs
    const token = core.getInput('github-token', { required: true });
    const dryRunInput = core.getInput('dry-run') || 'false';
    const dryRun = dryRunInput.toLowerCase() === 'true';
    if (dryRun) {
      console.log(`⚠️ Running in Dry-Run mode: No comments will be posted or issues updated.`);
    }

    // Initialize octokit client
    const octokit = github.getOctokit(token);
    const context = github.context;

    // Get config values
    const projectRepoPath = process.env.GITHUB_WORKSPACE;
    const configPath = core.getInput('config-path') || '.github/maintenance-actions/add-update-label-config.yml';
    const defaults = getDefaultConfigs();

    // Resolve final configuration
    console.log(`▶️ Resolving Configurations...`);
    const config = resolveConfigs({          // If there is an error, try `resolveConfigs.resolve({ })`
      projectRepoPath,
      configPath,
      defaults,
      overrides: { dryRun },
      requiredFields: [
        'timeframes.updatedByDays',
        'timeframes.commentByDays',
        'timeframes.inactiveByDays',
        'timeframes.upperLimitDays',
        'projectBoard.targetStatus',
        'commentTemplate',
      ],
    });
    console.log(``);

    // Resolve label keys to label names
    console.log(`▶️ Resolving Labels...`);
    const labels = await resolveLabels({
      projectRepoPath,
      labelDirectoryPath: config.labelDirectoryPath,
      requiredLabelKeys: config.labels.required,
      ignoredLabelKeys: config.labels.ignored,
    });
    console.log(``);

    // Run main workflow function
    console.log(`▶️ Running "Add Update Label Weekly" Workflow...`);
    await addUpdateLabelWeekly({
      github: octokit,
      context,
      config,
      labels,
    });
    console.log(``);
    console.log(`=`.repeat(60));
    console.log(`"Add Update Label Weekly" - Completed Successfully`);
    console.log(`=`.repeat(60));

  } catch (error) {
    console.error(``);
    console.error(`=`.repeat(60));
    console.error(`"Add Update Label Weekly" - Failed`);
    console.error(`=`.repeat(60));
    console.error(`Error details: ${error.message}`);
    if (error.stack) {
      console.error(`Stack trace: ${error.stack}`);
    }
    core.setFailed(error.message);
  }
}




/**
 * Get default configuration values for the workflow
 * @returns {Object} - Default configuration object
 */
function getDefaultConfigs() {
  return {
    timeframes: {
      updatedByDays: 3,      // Issues updated within this many days are considered current
      commentByDays: 7,      // Issues not updated for this many days are prompted for an update
      inactiveByDays: 14,    // Issues not updated for this many days are marked as inactive
      upperLimitDays: 35,    // Bot comments older than this are not checked (to reduce API calls)
    },

    projectBoardStatuses: {
      targetStatuses: [       // Project board status-columns to monitor
        'In progress (actively working)',
      ],
    },

    labels: {
      required: [],
      ignored: [],
    },

    bots: [
      'github-actions[bot]',
      'HackforLA[bot]',
    ],

    slackChannel: '#hfla-site',

    timezone: 'America/Los_Angeles',

    commentTemplate: getDefaultCommentTemplate(),

    labelDirectoryPath: '.github/maintenance-actions/_data/label-directory.yml',

    dryRun: false,
  };
}



/**
 * Returns the default comment template
 * @returns {string} - Default comment template
 */
function getDefaultCommentTemplate() {
  return `Hello \${assignees}!
  
Please add an update comment using the below template (even if you have a pull request). Afterwards, remove the \`\${label}\` label and add the \`\${statusUpdated}\` label.

1. Progress: "What is the current status of your issue? What have you completed and what is left to do?"
2. Blockers: "Explain any difficulties or errors encountered."
3. Availability: "How much time will you have this week to work on this issue?"
4. ETA: "When do you expect this issue to be completed?"
5. Pictures (optional): "Add any pictures of the visual changes made to the site so far."

If you need help, be sure to either: 1) place your issue in the "Questions/ In Review" status column of the Project Board and ask for help at your next meeting; 2) put a \`\${statusHelpWanted}\` label on your issue and pull request; or 3) put up a request for assistance on the \${slackChannel} channel. Please note that including your questions in the issue comments- along with screenshots, if applicable- will help us to help you. [Here](https://github.com/hackforla/website/issues/1619#issuecomment-897315561) and [here](https://github.com/hackforla/website/issues/1908#issuecomment-877908152) are examples of well-formed questions.

<sub>You are receiving this comment because your last comment was before \${cutoffTime}.</sub>

Thanks for being part of HfLA!`;
}

// Run the action
run();