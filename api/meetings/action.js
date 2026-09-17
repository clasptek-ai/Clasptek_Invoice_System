/**
 * CLASPTEK ENTERPRISE PLATFORM — CONSOLIDATED MEETING OPERATIONAL ACTIONS
 * File: api/meetings/action.js
 * 
 * Endpoints Dispatched:
 * 1. POST /api/meetings/action (action: MUTE_PARTICIPANT, REMOVE_PARTICIPANT, END_MEETING)
 * 2. POST /api/meetings/leave (action: 'leave')
 * 3. GET /api/meetings/status (action: 'status')
 * 4. POST /api/meetings/chat (action: 'chat')
 * 
 * Invariants:
 * - Host actions remain strictly gated to Host / Facilitator / Admin
 * - SFUAdapter loaded from api/_lib/sfu-adapter
 * - Exact response structures preserved for backwards compatibility
 */

const crypto = require('crypto');
const { getSFUAdapter } = require('../_lib/sfu-adapter');

function sendJson(res, statusCode, data) {
  if (typeof res.status === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(data));
}

async function parseRequestBody(req) {
  if (req.body !== undefined && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.length > 0) {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return new Promise(resolve => {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch (_) { resolve({}); }
    });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') return res.status(200).end();
    res.statusCode = 200;
    return res.end();
  }

  const reqUrl = new URL(req.url, 'http://localhost');
  const pathname = reqUrl.pathname;
  let actionParam = reqUrl.searchParams.get('action');

  let body = {};
  if (req.method === 'POST') {
    body = await parseRequestBody(req).catch(() => ({}));
  }

  try {
    // ---------------------------------------------------------
    // SUB-HANDLER: STATUS (GET /api/meetings/status)
    // ---------------------------------------------------------
    if (req.method === 'GET' || actionParam === 'status' || pathname.includes('status')) {
      const publicId = reqUrl.searchParams.get('publicId') || req.query?.publicId || body.publicId;
      const meetingId = reqUrl.searchParams.get('meetingId') || req.query?.meetingId || body.meetingId;
      const roomId = publicId || meetingId;

      if (!roomId) {
        return sendJson(res, 400, { error: 'Meeting publicId is required' });
      }

      let sfuStatus = 'UNKNOWN';
      let participants = [];
      try {
        const sfuAdapter = getSFUAdapter();
        const [roomStatus, participantsResult] = await Promise.all([
          sfuAdapter.getRoomStatus({ roomId }).catch(() => ({ status: 'UNKNOWN' })),
          sfuAdapter.getParticipants({ roomId }).catch(() => ({ participants: [] }))
        ]);
        sfuStatus = roomStatus.status;
        participants = participantsResult.participants || [];
      } catch (_) {}

      return sendJson(res, 200, {
        success: true,
        roomId,
        sfuStatus,
        participants
      });
    }

    // ---------------------------------------------------------
    // SUB-HANDLER: LEAVE (POST /api/meetings/leave)
    // ---------------------------------------------------------
    if (actionParam === 'leave' || pathname.includes('leave') || body.action === 'leave') {
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

      return sendJson(res, 200, {
        success: true,
        meetingId,
        participantSessionId,
        participantId,
        leftAt,
        durationSeconds
      });
    }

    // ---------------------------------------------------------
    // SUB-HANDLER: CHAT (POST /api/meetings/chat)
    // ---------------------------------------------------------
    if (actionParam === 'chat' || pathname.includes('chat') || body.action === 'chat') {
      const { meetingId, user, message } = body;
      if (!meetingId) return sendJson(res, 400, { error: 'meetingId is required' });
      if (!message || !message.trim()) return sendJson(res, 400, { error: 'message cannot be empty' });

      const msgRecord = {
        id: `msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        meetingId,
        userId: user ? user.id : null,
        senderName: user ? (user.name || user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim()) : 'Participant',
        senderRole: user ? (user.role || 'STUDENT') : 'STUDENT',
        message: message.trim(),
        createdAt: new Date().toISOString()
      };

      return sendJson(res, 201, { success: true, message: msgRecord });
    }

    // ---------------------------------------------------------
    // SUB-HANDLER: HOST ACTIONS (MUTE_PARTICIPANT, REMOVE_PARTICIPANT, END_MEETING)
    // ---------------------------------------------------------
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
      return sendJson(res, 401, { error: 'UNAUTHORIZED: Authentication required' });
    }

    const userRole = (user.role || user.type || '').toLowerCase();
    const isAdmin = ['super admin', 'admin'].includes(userRole);
    const isAssignedFacilitator = Boolean(
      meeting && meeting.facilitatorId && (
        meeting.facilitatorId === user.id ||
        meeting.facilitatorId === user.personnelId
      )
    );

    if (!isAdmin && !isAssignedFacilitator) {
      return sendJson(res, 403, {
        error: 'FORBIDDEN',
        message: 'Only the meeting host or an administrator can perform this action.'
      });
    }

    const sfuAdapter = getSFUAdapter(meeting?.sfuProvider);
    const roomId = publicId || meeting?.publicId || meetingId;

    switch (action) {
      case 'MUTE_PARTICIPANT': {
        if (!participantId) return sendJson(res, 400, { error: 'participantId is required' });
        const result = await sfuAdapter.muteParticipant({ roomId, participantId, trackType });
        return sendJson(res, 200, { success: true, action, result });
      }

      case 'REMOVE_PARTICIPANT': {
        if (!participantId) return sendJson(res, 400, { error: 'participantId is required' });
        const result = await sfuAdapter.removeParticipant({ roomId, participantId });
        return sendJson(res, 200, { success: true, action, result });
      }

      case 'END_MEETING': {
        const result = await sfuAdapter.endRoom({ roomId });
        return sendJson(res, 200, {
          success: true,
          action: 'END_MEETING',
          meetingStatus: 'ENDED',
          endedAt: new Date().toISOString(),
          result
        });
      }

      default:
        return sendJson(res, 400, { error: `Unknown action: '${action || actionParam || pathname}'` });
    }

  } catch (err) {
    console.error('[API /api/meetings/action Error]', err);
    return sendJson(res, 500, { error: 'Internal server error', message: err.message });
  }
};
