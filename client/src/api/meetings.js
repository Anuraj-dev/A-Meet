import api from './axios';

// Thin wrappers around the shared axios instance for scheduled-meeting CRUD.
// Each resolves to the response payload (or throws on a non-2xx, like axios).

// Reserve a meeting for later. `payload` = { title, scheduledFor, description }.
export async function scheduleMeeting(payload) {
  const { data } = await api.post('/rooms/scheduled', payload);
  return data; // { roomId, title, description, scheduledFor, createdAt }
}

// The signed-in user's upcoming scheduled meetings, soonest first.
export async function getMyMeetings() {
  const { data } = await api.get('/rooms/mine');
  return data.meetings ?? [];
}

// Edit a scheduled meeting. `patch` may include any of title/scheduledFor/description.
export async function updateMeeting(roomId, patch) {
  const { data } = await api.patch(`/rooms/scheduled/${encodeURIComponent(roomId)}`, patch);
  return data;
}

// Cancel a scheduled meeting (soft-cancel on the server).
export async function cancelMeeting(roomId) {
  await api.delete(`/rooms/scheduled/${encodeURIComponent(roomId)}`);
}
