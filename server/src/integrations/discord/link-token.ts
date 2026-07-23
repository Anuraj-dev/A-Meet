import { createHmac } from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env.js';

// Single-purpose token for the Discord account-linking flow. It is deliberately
// NOT interchangeable with the auth cookie JWT:
//   - it is signed with a key DERIVED from JWT_SECRET (not the secret itself),
//     so an auth JWT fails verification here and a link token fails requireAuth's
//     verification — no shared-secret cross-use is possible;
//   - it carries a `typ` claim we assert on, defence-in-depth on top of the key;
//   - it binds exactly one Discord ID and is short-lived.
const LINK_TOKEN_TYPE = 'discord-link';

// Deterministic per-deployment key, distinct from JWT_SECRET. Rotating
// JWT_SECRET rotates this too, which is the desired behaviour.
const linkTokenSecret = createHmac('sha256', env.jwtSecret).update('discord-link-token-v1').digest('hex');

/** Mint a short-lived token bound to `discordId`. */
export function mintLinkToken(discordId: string): string {
  return jwt.sign(
    { typ: LINK_TOKEN_TYPE, discordId },
    linkTokenSecret,
    { expiresIn: env.discord.linkTokenTtl } as SignOptions,
  );
}

/**
 * Verify a link token and return the Discord ID it was minted for. Throws if the
 * token is expired, tampered, signed with the wrong key (e.g. an auth JWT), or
 * missing the link-token type claim.
 */
export function verifyLinkToken(token: string): string {
  const payload = jwt.verify(token, linkTokenSecret) as { typ?: string; discordId?: string };
  if (payload.typ !== LINK_TOKEN_TYPE || !payload.discordId) {
    throw new Error('Not a Discord link token');
  }
  return payload.discordId;
}
