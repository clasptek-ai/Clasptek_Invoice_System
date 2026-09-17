/**
 * CLASPTEK ENTERPRISE PLATFORM — MEETING HOST ACTIONS ENDPOINT
 * Route: POST /api/meetings/action
 * 
 * Privileged Operations:
 * - MUTE_PARTICIPANT: Mutes a specific participant's microphone.
 * - REMOVE_PARTICIPANT: Ejects a participant from the meeting room.
 * - END_MEETING: Terminates the meeting for all participants and finalizes attendance.
 * 
 * Invariants:
 * - Server-side authorization: caller MUST be Host, assigned Facilitator, or Admin.
 * - Synchronizes meeting state on the SFU provider via SFUAdapter.
 */

const { getSFUAdapter } = require('./sfu-adapter');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const {
      action,
      meetingId,
      publicId,
      participantId,
      trackType = 'audio',
      user,
      meeting
    } = body;

    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED: Authentication required' });
    }

    const userRole = (user.role || user.type || '').toLowerCase();
    const isAdmin = ['super admin', 'admin'].includes(userRole);
    const isAssignedFacilitator = Boolean(
      meeting && meeting.facilitatorId && (
        meeting.facilitatorId === user.id ||
        meeting.facilitatorId === user.personnelId
      )
    );

    // Privileged action gate: Host/Admin only
    if (!isAdmin && !isAssignedFacilitator) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only the meeting host or an administrator can perform this action.'
      });
    }

    const sfuAdapter = getSFUAdapter(meeting?.sfuProvider);
    const roomId = publicId || meeting?.publicId || meetingId;

    switch (action) {
      case 'MUTE_PARTICIPANT': {
        if (!participantId) return res.status(400).json({ error: 'participantId is required' });
        const result = await sfuAdapter.muteParticipant({ roomId, participantId, trackType });
        return res.status(200).json({ success: true, action, result });
      }

      case 'REMOVE_PARTICIPANT': {
        if (!participantId) return res.status(400).json({ error: 'participantId is required' });
        const result = await sfuAdapter.removeParticipant({ roomId, participantId });
        return res.status(200).json({ success: true, action, result });
      }

      case 'END_MEETING': {
        const result = await sfuAdapter.endRoom({ roomId });
        return res.status(200).json({
          success: true,
          action: 'END_MEETING',
          meetingStatus: 'ENDED',
          endedAt: new Date().toISOString(),
          result
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: '${action}'` });
    }

  } catch (err) {
    console.error('[API /api/meetings/action Error]', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
