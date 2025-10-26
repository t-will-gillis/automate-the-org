// Logger utility: namespaced, color-coded console output GitHub Actions logs
// format-log-messages.js

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

const DEBUG = true;
  // process.env.DRY-RUN === "true" || process.env.DRY-RUN === "1" || 
  // process.env.DEBUG === "true" || process.env.DEBUG === "1";

const logger = {
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
  error: (msg) => {
    console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`);
    console.log(`::error::${msg}`);
  },

  // Diagnostic detail; for dry-run/debug or verbose mode
  debug: (msg) => {
    if (DEBUG) {
      // console.log(`${colors.magenta}[DEBUG]${colors.reset} ${msg}`);
      console.log(`${colors.gray}[DEBUG]${colors.reset} ${msg}`);
    }
  },

  // Standard log without flag
  log: (msg) => {
    console.log(msg);
  }

};

module.exports = { logger };