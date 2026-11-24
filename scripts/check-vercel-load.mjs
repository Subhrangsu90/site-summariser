// Loads the Vercel Function entry the way Vercel's runtime does: without
// Node's require()-of-ES-module support (run with --no-experimental-require-module).
// Catches dependencies that work locally on Node 24 but crash on Vercel with
// ERR_REQUIRE_ESM (e.g. jsdom 27+ pulls in ESM-only @exodus/bytes from CommonJS).
// Run after `npm run build`: npm run check:vercel
try {
  const { default: handler } = await import('../api/index.mjs');
  if (typeof handler !== 'function') throw new Error('api/index.mjs has no default export handler');
  console.log('OK: the Vercel function entry loads without require() of ES modules.');
  process.exit(0);
} catch (err) {
  console.error('FAILED: the Vercel function entry does not load.\n', err);
  process.exit(1);
}
