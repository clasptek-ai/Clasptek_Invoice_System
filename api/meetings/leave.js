/**
 * CLASPTEK ENTERPRISE PLATFORM — MEETING LEAVE ENDPOINT
 * Route: POST /api/meetings/leave
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const {
      meetingId,
      participantSessionId,
      participantId,
      joinedAt,
      leftAt = new Date().toISOString()
    } = body;

    let durationSeconds = 0;
    if (joinedAt) {
      const joinMs = new Date(joinedAt).getTime();
      const leaveMs = new Date(leftAt).getTime();
      durationSeconds = Math.max(0, Math.round((leaveMs - joinMs) / 1000));
    }

    return res.status(200).json({
      success: true,
      meetingId,
      participantSessionId,
      participantId,
      leftAt,
      durationSeconds
    });

  } catch (err) {
    console.error('[API /api/meetings/leave Error]', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
