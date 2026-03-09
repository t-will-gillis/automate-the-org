// find-similar-identifiers.js
// Optimized fuzzy matcher for Node 20+ (CommonJS)

const fs = require('fs');

const MAX_SUGGESTIONS = 3;
const SIMILARITY_THRESHOLD = 0.3;
const SYNONYMS = {
  docs: ["documentation", "doc"],
  bug: ["defect", "bug"],
  feature: ["enhancement", "feat"],
  update: ["updated", "upgrade", "status: updated"]
};

/**
 * Find similar identifiers based on normalized string similarity, substring
 * matches, and taxonomy-aware boosts. Works for both labels and status columns.
 * @param {string} needle      - Identifier to match (e.g. "status: updated")
 * @param {string[]} haystack  - Pool of existing identifiers to search
 * @param {number} limit       - Max number of suggestions to return
 * @returns {string[]}         - Matching identifiers sorted by relevance
 */
function findSimilarIdentifiers(needle, haystack, limit = MAX_SUGGESTIONS) {
  const needleNorm = normalize(needle);
  const { prefix: needlePrefix } = splitPrefix(needle);

  // Expand synonyms for needle
  const synonymList = (SYNONYMS[needleNorm] || []).map(normalize);
  const candidates = [needleNorm, ...synonymList];

  // Precompute normalized haystack once
  const normHaystack = haystack.map(id => {
    const norm = normalize(id);
    const { prefix, value } = splitPrefix(id);
    return { id, norm, prefix, value };
  });

  const scored = normHaystack.map(entry => {
    let score = 0;

    // Score against needle and its synonyms
    for (const candidate of candidates) {
      const baseScore = similarityScore(candidate, entry.norm);
      if (baseScore > score) score = baseScore;

      // Substring boost
      if (entry.norm.includes(candidate) || candidate.includes(entry.norm)) {
        score += 0.3;
      }

      // Taxonomy value boost, e.g. "status: updated" vs "update"
      if (entry.value && (entry.value.includes(candidate) || candidate.includes(entry.value))) {
        score += 0.25;
      }

      // Taxonomy prefix boost, e.g. "STATUS: done" vs "status"
      if (needlePrefix && entry.prefix === needlePrefix) {
        score += 0.15;
      }
    }

    return { id: entry.id, score };
  });

  return scored
    .filter(x => x.score > SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.id);
}

// **************************************************************************
// * Helper functions                                                       *
// **************************************************************************
function normalize(str) {
  return str
    .replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
    .replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, "")
    .replace(/[_\-:]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitPrefix(label) {
  const idx = label.indexOf(":");
  if (idx === -1) return { prefix: null, value: label };
  return {
    prefix: normalize(label.slice(0, idx)),
    value: normalize(label.slice(idx + 1))
  };
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = temp;
    }
  }
  return dp[b.length];
}

function similarityScore(a, b) {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - (dist / maxLen);
}

// **************************************************************************
// * Main execution                                                         *
// **************************************************************************

// Labels and status columns expected by the workflow config
// required and statusCols are {configKey: defaultValue} objects; others are arrays
const required   = JSON.parse(process.env.REQUIRED_LABELS);
const filtering  = JSON.parse(process.env.FILTERING_LABELS);
const modifying  = JSON.parse(process.env.MODIFYING_LABELS   || "[]");
const statusCols = JSON.parse(process.env.CONFIG_STATUS_COLS || "{}");

// Identifiers that exist in the destination repo
const repoLabels     = JSON.parse(process.env.REPO_LABELS);
const projStatusCols = JSON.parse(process.env.PROJ_STATUS_COLS || "[]");

// Match required labels against repo labels
// Result: { configKey: { configValue, suggestions } }
const requiredSuggestions = {};
Object.entries(required).forEach(([key, value]) => {
  requiredSuggestions[key] = {
    configValue: value,
    suggestions: findSimilarIdentifiers(value, repoLabels),
  };
});

// Match filtering labels against repo labels
// Result: { defaultValue: suggestions[] }
const filteringSuggestions = {};
filtering.forEach(label => {
  filteringSuggestions[label] = findSimilarIdentifiers(label, repoLabels);
});

// Match modifying labels against repo labels (optional — may be empty)
// Result: { defaultValue: suggestions[] }
const modifyingSuggestions = {};
modifying.forEach(label => {
  modifyingSuggestions[label] = findSimilarIdentifiers(label, repoLabels);
});

// Match config status columns against the repo's actual project board columns
// Result: { configKey: { configValue, suggestions } }
const statusColSuggestions = {};
Object.entries(statusCols).forEach(([key, value]) => {
  statusColSuggestions[key] = {
    configValue: value,
    suggestions: findSimilarIdentifiers(value, projStatusCols),
  };
});

// **************************************************************************
// * Output                                                                 *
// **************************************************************************

const allSuggestions = {
  required:   requiredSuggestions,
  filtering:  filteringSuggestions,
  ...(modifying.length > 0             && { modifying:  modifyingSuggestions }),
  ...(Object.keys(statusCols).length > 0 && { statusCols: statusColSuggestions }),
};

// Write structured data for the bash apply step
fs.writeFileSync('suggestions.json', JSON.stringify(allSuggestions, null, 2));

// Build PR comment markdown
const templateFile = process.env.TEMPLATE_FILE || 'the workflow';
const md = [];

md.push('## Label & Project Board Suggestions');
md.push('');
md.push(`The following suggestions were generated for the **${templateFile}** workflow.`);
md.push('The config file has been pre-filled with the best match for each identifier.');
md.push('Please review and update if needed before approving this PR.');
md.push('');

md.push('### Required labels');
md.push('');
md.push('| Config key | Default value | Pre-filled with | Other suggestions |');
md.push('|---|---|---|---|');
Object.entries(requiredSuggestions).forEach(([key, { configValue, suggestions }]) => {
  const best   = suggestions[0] ? `\`${suggestions[0]}\`` : '_no match — default kept_';
  const others = suggestions.slice(1).map(s => `\`${s}\``).join(', ') || '—';
  md.push(`| \`${key}\` | \`${configValue}\` | ${best} | ${others} |`);
});
md.push('');

md.push('### Filtering labels');
md.push('');
md.push('| Default value | Suggestions |');
md.push('|---|---|');
Object.entries(filteringSuggestions).forEach(([label, suggestions]) => {
  const matches = suggestions.length > 0 ? suggestions.map(s => `\`${s}\``).join(', ') : '_no match_';
  md.push(`| \`${label}\` | ${matches} |`);
});
md.push('');

if (modifying.length > 0) {
  md.push('### Modifying labels');
  md.push('');
  md.push('| Default value | Suggestions |');
  md.push('|---|---|');
  Object.entries(modifyingSuggestions).forEach(([label, suggestions]) => {
    const matches = suggestions.length > 0 ? suggestions.map(s => `\`${s}\``).join(', ') : '_no match_';
    md.push(`| \`${label}\` | ${matches} |`);
  });
  md.push('');
}

if (Object.keys(statusCols).length > 0) {
  md.push('### Project board status columns');
  md.push('');
  md.push('| Config key | Default value | Pre-filled with | Other suggestions |');
  md.push('|---|---|---|---|');
  Object.entries(statusColSuggestions).forEach(([key, { configValue, suggestions }]) => {
    const best   = suggestions[0] ? `\`${suggestions[0]}\`` : '_no match — default kept_';
    const others = suggestions.slice(1).map(s => `\`${s}\``).join(', ') || '—';
    md.push(`| \`${key}\` | \`${configValue}\` | ${best} | ${others} |`);
  });
  md.push('');
}

fs.writeFileSync('pr-comment.md', md.join('\n'));

// Console output for visibility in all run modes
console.log(JSON.stringify(allSuggestions, null, 2));