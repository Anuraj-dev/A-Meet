import mongoose from 'mongoose';

// Maps a Discord user to an A-Meet account. Created when a user completes the
// `/meet link` flow; the bot's `/meet create` looks the caller's Discord ID up
// here to find whose meeting to host. One mapping per Discord ID — re-linking
// upserts on `discordId`, so switching A-Meet accounts overwrites in place.
const discordLinkSchema = new mongoose.Schema(
  {
    discordId: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  // Only createdAt is meaningful; the mapping is replaced wholesale on re-link.
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const DiscordLink = mongoose.model('DiscordLink', discordLinkSchema);
