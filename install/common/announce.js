// install/common/announce.js — shared progress output helper.
//
// All adapters use this instead of defining their own announce function.
// Writes to stderr so it doesn't interfere with stdout piping.

/**
 * Print a progress message to stderr.
 * @param {string} msg - Message to print (will have newline appended)
 */
export function announce(msg) {
  process.stderr.write(msg + '\n');
}