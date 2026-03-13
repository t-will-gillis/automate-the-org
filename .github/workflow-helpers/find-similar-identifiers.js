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
 *
 * Returns:
 *   prefill    — top match only if it is an exact match after normalization
 *                (i.e. differs from needle only in case or punctuation); else null
 *   suggestions — all matches above SIMILARITY_THRESHOLD, sorted by relevance
 *
 * @param {string} needle      - Identifier to match (e.g. "status: updated")
 * @param {string[]} haystack  - Pool of existing identifiers to search
 * @param {number} limit       - Max number of suggestions to return
 * @returns {{ prefill: string|null, suggestions: string[] }}
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

  const suggestions = scored
    .filter(x => x.score > SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.id);

  // Pre-fill only when the top match is exact after normalization
  // (differs from needle only in case or punctuation — no fuzzy tolerance)
  const prefill = (suggestions[0] && normalize(suggestions[0]) === needleNorm)
    ? suggestions[0]
    : null;

  // Remove prefill from suggestions so "best" and "others" are mutually exclusive
  const others = prefill ? suggestions.filter(s => s !== prefill) : suggestions;

  return { prefill, suggestions: others };
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

// Mutable pools — claimed prefills are removed to prevent duplicate assignments
let availableLabels = [...repoLabels];
let availableStatusCols = [...projStatusCols];

// Match required labels against repo labels
// Result: { configKey: { configValue, prefill, suggestions } }
const requiredSuggestions = {};
Object.entries(required).forEach(([key, value]) => {
  const { prefill, suggestions } = findSimilarIdentifiers(value, availableLabels);
  requiredSuggestions[key] = { configValue: value, prefill, suggestions };
  if (prefill) availableLabels = availableLabels.filter(l => l !== prefill);
});

// Match filtering labels against repo labels
// Result: { defaultValue: { prefill, suggestions } }
const filteringSuggestions = {};
filtering.forEach(label => {
  const result = findSimilarIdentifiers(label, availableLabels);
  filteringSuggestions[label] = result;
  if (result.prefill) availableLabels = availableLabels.filter(l => l !== result.prefill);
});

// Match modifying labels against repo labels (optional — may be empty)
// Result: { defaultValue: { prefill, suggestions } }
const modifyingSuggestions = {};
modifying.forEach(label => {
  const result = findSimilarIdentifiers(label, availableLabels);
  modifyingSuggestions[label] = result;
  if (result.prefill) availableLabels = availableLabels.filter(l => l !== result.prefill);
});

// Match config status columns against the repo's actual project board columns
// Result: { configKey: { configValue, prefill, suggestions } }
const statusColSuggestions = {};
Object.entries(statusCols).forEach(([key, value]) => {
  const { prefill, suggestions } = findSimilarIdentifiers(value, availableStatusCols);
  statusColSuggestions[key] = { configValue: value, prefill, suggestions };
  if (prefill) availableStatusCols = availableStatusCols.filter(c => c !== prefill);
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
md.push(`The following tables list workflow variables, such as labels and Project Board status-columns, that must be configured before using the workflow. The "Default value" is from this PR's configuration file. The "Suggested value" is the closest match to the default that the automation found in your repo, and the "Other suggestions" column. These suggestions are meant to help you fill in the config file with `);
md.push(`identifiers that already exist in your repo. Where possible, the config file attached to this PR has been pre-filled`);
md.push(`with the closest match for each identifier.`);
md.push(``);
md.push(`Please review the "Suggested value" and **_update the config file_** attached before approving this PR.`);;
md.push('');

md.push('### Required label(s)');
md.push('');
md.push('| Placeholder | Default value | Suggested value | Other suggestions |');
md.push('|:---:|:---:|:---:|:---|');
Object.entries(requiredSuggestions).forEach(([key, { configValue, prefill, suggestions }]) => {
  const best   = prefill ? `\`${prefill}\`` : '_no match found_';
  const others = suggestions.map(s => `\`${s}\``).join(', ') || '—';
  md.push(`| \`${key}\` | \`${configValue}\` | ${best} | ${others} |`);
});
md.push('');

md.push('### Filtering label(s)');
md.push('');
md.push('| Placeholder | Default value | Suggested value | Other suggestions |');
md.push('|:---:|:---:|:---:|:---|');
Object.entries(filteringSuggestions).forEach(([label, { prefill, suggestions }]) => {
  const best   = prefill ? `\`${prefill}\`` : '_no match found_';
  const others = suggestions.map(s => `\`${s}\``).join(', ') || '—';
  md.push(`| - | \`${label}\` | ${best} | ${others} |`);
});
md.push('');

if (modifying.length > 0) {
  md.push('### Modifying label(s)');
  md.push('');
  md.push('| Placeholder | Default value | Suggested value | Other suggestions |');
  md.push('|:---:|:---:|:---:|:---|');
  Object.entries(modifyingSuggestions).forEach(([label, { prefill, suggestions }]) => {
    const best   = prefill ? `\`${prefill}\`` : '_no match found_';
    const others = suggestions.map(s => `\`${s}\``).join(', ') || '—';
    md.push(`| - | \`${label}\` | ${best} | ${others} |`);
  });
  md.push('');
}

if (Object.keys(statusCols).length > 0) {
  md.push('### Project Board status-columns');
  md.push('');
  md.push('| Placeholder | Default value | Suggested value |');
  md.push('|:---:|:---:|:---|');
  Object.entries(statusColSuggestions).forEach(([key, { configValue }]) => {
    const best   = 'NOTE: Review your project\'s actual status-columns & update config file manually';
    md.push(`| \`${key}\` | \`${configValue}\` | ${best} |`);
  });
  md.push('');
}

fs.writeFileSync('pr-comment.md', md.join('\n'));

// Console output for visibility in all run modes
console.log(JSON.stringify(allSuggestions, null, 2));
