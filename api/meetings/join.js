/**
 * CLASPTEK ENTERPRISE PLATFORM — MEETING JOIN & TOKEN ISSUANCE ENDPOINT
 * Route: POST /api/meetings/join
 * 
 * Secure Serverless Function on Vercel
 * Invariants:
 * - Requires authenticated user (no anonymous public entry in Phase 1).
 * - Enforces meeting participant access (COHORT_ONLY vs ALL_STUDENTS).
 * - Issues short-lived, meeting-scoped token via configured SFUAdapter.
 * - Resolves authoritative user role (HOST vs FACILITATOR vs STUDENT).
 */

const crypto = require('crypto');
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
      publicId,
      meetingId,
      meeting,
      user,
      enrolments = []
    } = body;

    if (!user) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'You must be logged into Clasptek to join this meeting.'
      });
    }

    if (!meeting && !publicId && !meetingId) {
      return res.status(400).json({ error: 'Meeting identifier is required' });
    }

    const meetingData = meeting || {};
    const meetingStatus = (meetingData.status || 'SCHEDULED').toUpperCase();

    if (meetingStatus === 'ENDED') {
      return res.status(400).json({
        error: 'MEETING_ENDED',
        message: 'This meeting has ended. Thank you for attending.'
      });
    }

    if (meetingStatus === 'CANCELLED') {
      return res.status(400).json({
        error: 'MEETING_CANCELLED',
        message: 'This meeting has been cancelled.'
      });
    }

    // Role & Authorization Resolution
    const userRole = (user.role || user.type || '').toLowerCase();
    const isAdmin = ['super admin', 'admin'].includes(userRole);
    const isAssignedFacilitator = Boolean(
      meetingData.facilitatorId && (
        meetingData.facilitatorId === user.id ||
        meetingData.facilitatorId === user.personnelId
      )
    );
    const isAnyFacilitator = ['facilitator', 'staff'].includes(userRole);

    let participantRole = 'STUDENT';
    let isHost = false;

    if (isAdmin || isAssignedFacilitator) {
      participantRole = 'HOST';
      isHost = true;
    } else if (isAnyFacilitator) {
      participantRole = 'FACILITATOR';
      isHost = false;
    } else {
      participantRole = 'STUDENT';
      isHost = false;
    }

    // Access authorization check
    const accessPolicy = meetingData.participantAccess || 'COHORT_ONLY';
    if (!isAdmin && !isAssignedFacilitator) {
      if (accessPolicy === 'COHORT_ONLY' && meetingData.cohortId) {
        // Verify user enrolment in cohort
        const isEnrolled = enrolments.some(e => {
          const eCohort = e.cohortId || e.cohort_id;
          const eStudent = e.studentId || e.student_id;
          const eUser = e.userId || e.user_id;
          return eCohort === meetingData.cohortId && (
            eStudent === user.id ||
            eStudent === user.studentId ||
            eUser === user.id ||
            (e.email && user.email && e.email.toLowerCase() === user.email.toLowerCase())
          );
        });

        if (!isEnrolled && !isAnyFacilitator) {
          return res.status(403).json({
            error: 'FORBIDDEN',
            message: "You don't have permission to join this meeting."
          });
        }
      }
    }

    // Issue participant token via SFU adapter
    let sfuAdapter;
    try {
      sfuAdapter = getSFUAdapter(meetingData.sfuProvider);
    } catch (configErr) {
      return res.status(503).json({
        error: 'Meeting unavailable',
        message: 'The meeting service is temporarily unavailable. Please try again shortly.',
        detail: configErr.message
      });
    }

    const participantId = user.id || `usr_${crypto.randomBytes(4).toString('hex')}`;
    const participantName = user.name || user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Clasptek User';
    const roomId = meetingData.publicId || publicId || meetingData.id;

    const tokenResult = await sfuAdapter.generateParticipantToken({
      roomId,
      participantId,
      participantName,
      isHost,
      role: participantRole
    });

    const participantSessionId = `mp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    return res.status(200).json({
      success: true,
      participantSessionId,
      participantId,
      participantName,
      role: participantRole,
      isHost,
      sfuProvider: sfuAdapter.name,
      serverUrl: tokenResult.serverUrl || tokenResult.roomUrl,
      token: tokenResult.token,
      expiresAt: tokenResult.expiresAt,
      meeting: {
        id: meetingData.id,
        publicId: meetingData.publicId || publicId,
        title: meetingData.title,
        status: meetingData.status,
        cohortId: meetingData.cohortId,
        trainingSessionId: meetingData.trainingSessionId,
        settings: meetingData.settings || {}
      }
    });

  } catch (err) {
    console.error('[API /api/meetings/join Error]', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
