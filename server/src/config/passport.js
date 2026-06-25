import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from './env.js';
import { User } from '../models/User.js';

// The google-oauth20 verify callback: upsert a User from the Google profile,
// then hand the resulting doc to Passport. Exported so it can be unit-tested
// directly — the strategy below is only registered when OAuth credentials are
// configured, so the seam would otherwise be untestable in CI.
export async function googleVerify(accessToken, refreshToken, profile, done) {
  try {
    const user = await User.findOneAndUpdate(
      { googleId: profile.id },
      {
        googleId: profile.id,
        name: profile.displayName,
        email: profile.emails?.[0]?.value || '',
        avatar: profile.photos?.[0]?.value || '',
      },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    );
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}

// Only register the Google strategy if credentials are present, so the server
// can still boot for early dev before OAuth is configured.
if (env.google.clientId && env.google.clientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.google.clientId,
        clientSecret: env.google.clientSecret,
        callbackURL: `${env.serverUrl}/api/auth/google/callback`,
      },
      googleVerify
    )
  );
}

export default passport;
