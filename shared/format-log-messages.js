// Logger utility: namespaced, color-coded console output for GitHub Actions

const colors = {
  reset: "\x1b[0m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

let dryRun = false;

const logger = {
  // Set dry-run mode
  setDryRun: (value) => {
    dryRun = value;
  },

  // High-level step; start of a new logical phase
  step: (msg) => console.log(`${colors.blue}[STEP]${colors.reset} ${msg}`),

  // Normal informational & general progress messages
  info: (msg) => console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`),

  // Success or completion message
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),

  // Non-fatal warning, annotated in GitHub Actions logs
  warn: (msg) => {
    console.warn(`${colors.yellow}[WARN]${colors.reset} ${msg}`);
    console.log(`::warning::${msg}`);
  },

  // Errors: annotated in GitHub Actions logs
  error: (msg, err = "") => {
    const details = err instanceof Error ? err.stack : err;
    console.error(`${colors.red}[ERROR]${colors.reset} ${msg}${err ? `, ${err}` : ""}`);
    console.log(`::error::${msg}${details ? `, ${details}` : ""}`);
  },

  // Diagnostic detail; for dry-run/debug or verbose mode
  debug: (msg) => {
    if (dryRun) {
      console.log(`${colors.magenta}[DEBUG]${colors.reset} ${msg}`);
      // console.log(`${colors.gray}[DEBUG]${colors.reset} ${msg}`);
    }
  },

  // Standard log without flag
  log: (msg) => {
    console.log(msg);
  }

};

module.exports = { logger };