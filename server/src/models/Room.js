import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // The person who created this meeting. This is deliberately persisted
    // separately from transient room membership, so leaving/rejoining can
    // never remove their administrator privileges.
    //
    // `host` is retained for scheduled-meeting compatibility. Older rooms that
    // predate this field treat `host` as their admin in room-admin.js.
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    active: { type: Boolean, default: true },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Scheduling metadata. Instant meetings leave these at their defaults; a
    // meeting is "scheduled" iff `scheduledFor` is set. The reserved room stays
    // joinable any time (Google Meet behaviour) — `scheduledFor` is display-only.
    title: { type: String, trim: true, maxlength: 200, default: '' },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    scheduledFor: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

export const Room = mongoose.model('Room', roomSchema);
