import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { roomIdParamSchema } from '../validation/room.schema.js';
import { createRoom, getRoom } from '../controllers/room.controller.js';

const router = Router();

router.post('/', requireAuth, createRoom);
router.get('/:roomId', requireAuth, validate(roomIdParamSchema, 'params'), getRoom);

export default router;
