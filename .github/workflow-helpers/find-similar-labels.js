// find-similar-labels.js
// Zero-dependency, optimized fuzzy label matcher for Node 20+ (CommonJS)

const MAX_SUGGESTIONS = 3;
const SIMILARITY_THRESHOLD = 0.3;
const SYNONYMS = {
  docs: ["documentation", "doc"],
  bug: ["defect", "bug"],
  feature: ["enhancement", "feat"],
  update: ["updated", "upgrade", "status: updated"]
};

/**
 * Find similar labels based on normalized string similarity, substring matches,
 * and taxonomy-aware boosts.
 * @param {string} workflowLabel  - Single label to match (e.g. "docs")
 * @param {string[]} repoLabels   - List of existing labels in the repo
 * @param {number} limit          - Max number of suggestions to return
 * @returns {string[]}            - List of similar labels sorted by relevance
 */
function findSimilarLabels(workflowLabel, repoLabels, limit = MAX_SUGGESTIONS) {
  const reqNorm = normalize(workflowLabel);
  const { prefix: reqPrefix } = splitPrefix(workflowLabel);

  // Expand synonyms for required label
  const synonymList = (SYNONYMS[reqNorm] || []).map(normalize);
  const reqCandidates = [reqNorm, ...synonymList];

  // Precompute normalized labels once
  const normLabels = repoLabels.map(label => {
    const norm = normalize(label);
    const { prefix, value } = splitPrefix(label);
    return { label, norm, prefix, value };
  });

  const scored = normLabels.map(entry => {
    let score = 0;

    // Compare against required and synonyms
    for (const candidate of reqCandidates) {
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
      if (reqPrefix && entry.prefix === reqPrefix) {
        score += 0.15;
      }
    }

    return { label: entry.label, score };
  });

  return scored
    .filter(x => x.score > SIMILARITY_THRESHOLD) 
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.label);
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

const required = ["status: updated","status: to update!","status: 2 weeks inactive","status: help wanted"];
const filtering = ["draft","er","epic","dependency","complexity: prework",""];

// Parse from environment variable
const repoLabels = JSON.parse(process.env.REPO_LABELS);

// Iterate through each label and find suggestions
const reqSuggestions = {};
required.forEach(label => {
  reqSuggestions[label] = findSimilarLabels(label, repoLabels);
});

const filteringSuggestions = {};
filtering.forEach(label => {
  filteringSuggestions[label] = findSimilarLabels(label, repoLabels);
});

console.log("Required label suggestions:");
console.log(JSON.stringify(reqSuggestions, null, 2));

console.log("\nFiltering label suggestions:");
console.log(JSON.stringify(filteringSuggestions, null, 2));