/**
 * What `buffer/index` resolves to in the bundle. `msedge-tts` requires that subpath rather than
 * `buffer` so a browser bundler picks up the polyfill; on Node the polyfill *is* the built-in,
 * and shipping a second copy of Buffer to a serverless function would be silly.
 *
 * CommonJS on purpose: the caller is CommonJS, and re-exporting a builtin through ESM leaves the
 * bundler emitting a namespace it never defines — a bundle that only fails when it is imported.
 */
module.exports = require('node:buffer');
