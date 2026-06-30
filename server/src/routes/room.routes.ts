import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  roomIdParamSchema,
  scheduleBodySchema,
  scheduleUpdateSchema,
} from '../validation/room.schema.js';
import {
  createRoom,
  createScheduledRoom,
  listMyMeetings,
  updateScheduledRoom,
  cancelScheduledRoom,
  getRoom,
} from '../controllers/room.controller.js';

const router = Router();

router.post('/', requireAuth, createRoom);

// Scheduled meetings. Literal paths are registered BEFORE the `/:roomId` param
// route below so Express doesn't match "scheduled"/"mine" as a room code.
router.post('/scheduled', requireAuth, validate(scheduleBodySchema), createScheduledRoom);
router.get('/mine', requireAuth, listMyMeetings);
router.patch(
  '/scheduled/:roomId',
  requireAuth,
  validate(roomIdParamSchema, 'params'),
  validate(scheduleUpdateSchema),
  updateScheduledRoom
);
router.delete(
  '/scheduled/:roomId',
  requireAuth,
  validate(roomIdParamSchema, 'params'),
  cancelScheduledRoom
);

router.get('/:roomId', requireAuth, validate(roomIdParamSchema, 'params'), getRoom);

export default router;
