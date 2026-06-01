import { Router } from 'express';
import passport from '../config/passport.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { googleCallback, getMe, logout } from '../controllers/auth.controller.js';

const router = Router();

// Kicks off the Google OAuth flow. A `returnTo` query (the meeting link a
// ProtectedRoute stashed before bouncing an unauthenticated visitor to the
// home page) is round-tripped through the OAuth `state` param so Google hands
// it back to our callback — letting us land the user back on the invite link
// instead of the home page. (Validated for same-origin in the callback.)
router.get('/google', (req, res, next) => {
  const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : undefined;
  passport.authenticate('google', { scope: ['profile', 'email'], session: false, state: returnTo })(req, res, next);
});

// Google redirects here after consent.
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${env.clientUrl}/?auth=failed` }),
  googleCallback
);

router.get('/me', requireAuth, getMe);
router.post('/logout', logout);

export default router;
