/**
 * CLASPTEK ENTERPRISE PLATFORM — MEETING CHAT ENDPOINT
 * Route: POST /api/meetings/chat
 */

const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const {
        meetingId,
        user,
        message
      } = body;

      if (!meetingId) return res.status(400).json({ error: 'meetingId is required' });
      if (!message || !message.trim()) return res.status(400).json({ error: 'message cannot be empty' });

      const msgRecord = {
        id: `msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        meetingId,
        userId: user ? user.id : null,
        senderName: user ? (user.name || user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim()) : 'Participant',
        senderRole: user ? (user.role || 'STUDENT') : 'STUDENT',
        message: message.trim(),
        createdAt: new Date().toISOString()
      };

      return res.status(201).json({ success: true, message: msgRecord });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[API /api/meetings/chat Error]', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
