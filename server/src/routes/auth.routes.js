import { Router } from 'express';
import passport from '../config/passport.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { googleCallback, getMe, logout } from '../controllers/auth.controller.js';

const router = Router();

// Kicks off the Google OAuth flow.
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

// Google redirects here after consent.
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${env.clientUrl}/?auth=failed` }),
  googleCallback
);

router.get('/me', requireAuth, getMe);
router.post('/logout', logout);

export default router;
