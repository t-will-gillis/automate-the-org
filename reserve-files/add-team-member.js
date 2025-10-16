/**
 * Function to return list of current team members
 * @param {Object} github      - GitHub object from actions/github-script
 * @param {Object} context     - context object from actions/github-script
 * @param {String} teamSlug    - teamSlug to check for member
 * @param {String} username    - member to check for team membership
 */
async function addTeamMember(github, context, teamSlug, username) {
  let isMember = false;

  try {
    // https://docs.github.com/en/rest/teams/members?apiVersion=2022-11-28#get-team-membership-for-a-user
    await github.request('GET /orgs/{org}/teams/{team_slug}/memberships/{username}', {
      org: context.repo.owner,
      team_slug: teamSlug,
      username,
    });
    isMember = true;
    console.log(`Member ${username} already on ${teamSlug} team`);
  } catch (error) {
    // If response status is not 404, need to add member to baseTeam
    if (error.status != 404) throw error;
  }

  if (!isMember) {
    // https://docs.github.com/en/rest/teams/members?apiVersion=2022-11-28#add-or-update-team-membership-for-a-user
    await github.request('PUT /orgs/{org}/teams/{team_slug}/memberships/{username}', {
      org: context.repo.owner,
      team_slug: teamSlug,
      username: username,
      role: 'member',
    });
    console.log(`Member ${username} added to ${teamSlug} team`);
    return true;
  }
  return false;
}

module.exports = addTeamMember;
