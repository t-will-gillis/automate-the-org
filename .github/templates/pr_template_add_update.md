<!--
Add Update Label Weekly
PR Template for destination repo

Source and destination filepaths

```yml
workflow_file:
  src: ../../example-configs/add-update-label-weekly.example.yml
  dest: .github/workflows/add-update-label-weekly.yml

config_files:
  - src: ../../example-configs/add-update-label-weekly-config.example.yml
    dest: github-actions/workflow-configs/add-update-label-weekly-config.yml
  - src: ../../example-configs/add-update-instructions-template.example.md
    dest: github-actions/workflow-configs/templates/add-update-instructions-template.md
```
-->

## Automated Workflow Setup

This PR adds the "Add Update Label Weekly" GitHub Actions workflow to your project.


### Files installed by this PR

- **Workflow file**:
  - `.github/workflows/add-update-label-weekly.yml` 
- **Configuration files**:
  - `github-actions/workflow-configs/add-update-label-weekly-config.yml`
  - `github-actions/workflow-configs/templates/add-update-instructions-template.md`

### What this workflow does

- Monitors open, assigned issues with the default status "In progress (actively working)"
- Checks for recent update comments from assignees
- Posts reminders for devs to provide issue progress updates
- Labels issues that need updates as well as issues that are considered inactive

### Security

- Uses organization-managed, secure GitHub App with just-in-time token
- Starts in dry-run mode (safe testing)  
- No project-specific tokens or secrets needed

### How to use

1. **Review configurations and make changes** to the respective files attached to this PR:
    - `github-actions/workflows/add-update-label-weekly.yml` 
      - Adjust the cron schedule as needed for your project (https://crontab.cronhub.io/). 
      - Current cron is scheduled to run Fridays at 0700 UTC, every week except in July and December.
    - `github-actions/workflow-configs/add-update-label-weekly-config.yml`
      - This workflow is designed for adaptability and includes configuration variables that can be customized to suit the specific conditions of your project. All available variables are listed in the accompanying config.yml file. 
      - Each variable is assigned a default value. Before running the workflow, review each of these variables carefully and update their values to reflect your repository’s actual structure and desired behavior. Configure the values only as indicated. Do not edit the variable keys or change the file formatting, otherwise the workflow may crash or behave unexpectedly.
      - The **Labels and label placeholders used by this workflow** section
        - The `labels:` referenced in this section include two categories of labels, following: 
          - The `required:` section lists label placeholder keys that are essential to the workflow. Each must map- exactly- to an actual label in your project. 
          - The `filtering:` section specifies a list of labels that exclude certain issues from the update checks. When the workflow encounters an issue with any of these labels, it will omit the issue from processing. In other words, an issue that is labeled with one of the 'filtering' labels will be ignored by the workflow. 
          - All label names are shown in "double quotes", and each must map exactly to an existing label in your repo. 
          - See the config.yml for additional instructions.
      - The **Time thresholds (in days)** section
        - The `timeframes:` section defines placeholder keys that represent time thresholds, measured in days. Each issue’s update status is determined by comparing the assignee’s most recent activity timestamp against these defined thresholds. 
        - Default values are provided and **can be used as-is without modifications**. See the config.yml for detailed explanations and, only if needed, for instructions for customizing these values.
      - The **Project Board status-column configuration** section
        - The `projectBoard:` section defines placeholder keys representing Project Board status-column names. Similar to the required labels, each placeholder status-column key must map exactly to a status-column on your Project Board.
        - Change the values as needed for an exact match, and ensure the status-column value is in double quotes.
      - The **Bot configuration** section should not need any edits.
      - The **Bot comment template** section includes the optional variable `teamSlackChannel`: Add your team's Slack Channel (once again in "double quotes") if you want this info on the Bot comment template.  
    - `github-actions/workflow-configs/templates/add-update-instructions-template.md`
      - We recommend keeping this version. If needed, edit using markdown syntax.

3. **Test in dry-run mode**
   - Go to Actions tab → "Add Update Label Weekly"
   - Click "Run workflow" → Keep `dry-run` = true
   - Review logs to see which issues would be flagged and whether this is what you expected.

4. **Live mode**
   - When you have set up the configurations, the automation will run at the next scheduled time.
   - You can also manually trigger with `dry-run` = false if needed. 

---
_Auto-generated by **Rollout Workflow to Project** workflow._
