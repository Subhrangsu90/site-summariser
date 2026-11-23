// Vercel Function entry. Static files (the prerendered page, JS, CSS) are served
// by Vercel's CDN from dist/site-summariser/browser; every other request is
// rewritten here (see vercel.json) and handled by the Angular SSR Express app,
// which includes the /api routes. `npm run build` must run first.
import { reqHandler } from '../dist/site-summariser/server/server.mjs';

export default reqHandler;
