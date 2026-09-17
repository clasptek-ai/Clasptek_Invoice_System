/**
 * CLASPTEK ENTERPRISE PLATFORM — MEETING STATUS ENDPOINT
 * Route: GET /api/meetings/status?publicId=...
 */

const { getSFUAdapter } = require('./sfu-adapter');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { publicId, meetingId } = req.query || {};
    const roomId = publicId || meetingId;

    if (!roomId) {
      return res.status(400).json({ error: 'Meeting publicId is required' });
    }

    const sfuAdapter = getSFUAdapter();
    const [roomStatus, participantsResult] = await Promise.all([
      sfuAdapter.getRoomStatus({ roomId }).catch(() => ({ status: 'UNKNOWN' })),
      sfuAdapter.getParticipants({ roomId }).catch(() => ({ participants: [] }))
    ]);

    return res.status(200).json({
      success: true,
      roomId,
      sfuStatus: roomStatus.status,
      participants: participantsResult.participants || []
    });

  } catch (err) {
    console.error('[API /api/meetings/status Error]', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
