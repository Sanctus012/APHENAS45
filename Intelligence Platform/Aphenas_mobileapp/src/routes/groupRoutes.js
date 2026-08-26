import express from 'express';
import { listConversationsForUser } from '../messaging/models/messageModel.js';
import { requireSession } from '../middlewares/requireSession.js';

const router = express.Router();
router.use(requireSession);

router.get('/:userId', async (req, res) => {
  try {
    const groups = await listConversationsForUser(req.user.id, 'GROUP');
    return res.json({ success: true, groups });
  } catch (error) {
    console.error('Unable to load groups:', error);
    const status = Number(error.statusCode) || 500;
    return res.status(status).json({
      success: false,
      message: status === 500 ? 'Unable to load groups' : error.message,
    });
  }
});

export default router;
