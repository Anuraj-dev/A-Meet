import api from './axios';
import type {
  MeetingsResponse,
  ScheduledMeetingDto,
  ScheduleMeetingRequest,
  UpdateScheduledMeetingRequest,
} from '@a-meet/contracts';

// Thin wrappers around the shared axios instance for scheduled-meeting CRUD.
// Each resolves to the response payload (or throws on a non-2xx, like axios).

// Reserve a meeting for later. `payload` = { title, scheduledFor, description }.
export async function scheduleMeeting(payload: ScheduleMeetingRequest): Promise<ScheduledMeetingDto> {
  const { data } = await api.post<ScheduledMeetingDto>('/rooms/scheduled', payload);
  return data; // { roomId, title, description, scheduledFor, createdAt }
}

// The signed-in user's upcoming scheduled meetings, soonest first.
export async function getMyMeetings(): Promise<ScheduledMeetingDto[]> {
  const { data } = await api.get<MeetingsResponse>('/rooms/mine');
  return data.meetings ?? [];
}

// Edit a scheduled meeting. `patch` may include any of title/scheduledFor/description.
export async function updateMeeting(
  roomId: string,
  patch: UpdateScheduledMeetingRequest,
): Promise<ScheduledMeetingDto> {
  const { data } = await api.patch<ScheduledMeetingDto>(
    `/rooms/scheduled/${encodeURIComponent(roomId)}`,
    patch,
  );
  return data;
}

// Cancel a scheduled meeting (soft-cancel on the server).
export async function cancelMeeting(roomId: string): Promise<void> {
  await api.delete(`/rooms/scheduled/${encodeURIComponent(roomId)}`);
}
