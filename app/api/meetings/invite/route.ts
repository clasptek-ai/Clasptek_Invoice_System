/**
 * app/api/meetings/invite/route.ts — Clasptek Meetings LiveKit Only
 * Route handler for Meeting Invitation Dispatch.
 * Dispatches email invitations through the configured email service with delivery feedback.
 * Strictly preserves tenant isolation and returns fallback instructions if no server mailer is configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getMeetingById } from '@/lib/meetings/queries';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthoritativeSession();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
    }

    const tenantId = session.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Authoritative tenant could not be resolved.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { meetingId, publicId, recipients, message } = body;

    const identifier = publicId || meetingId;
    if (!identifier) {
      return NextResponse.json({ error: 'Meeting identifier is required' }, { status: 400 });
    }

    const meetingRes = await getMeetingById(identifier);
    if (!meetingRes.data) {
      return NextResponse.json({ error: 'MEETING_NOT_FOUND', message: 'Meeting not found' }, { status: 404 });
    }

    const meeting = meetingRes.data;

    // Cross-tenant protection
    if (meeting.tenantId !== tenantId) {
      return NextResponse.json({ error: 'MEETING_NOT_FOUND', message: 'Meeting not found' }, { status: 404 });
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: 'At least one recipient email is required' }, { status: 400 });
    }

    const cleanRecipients = recipients
      .map((r: string) => String(r).trim().toLowerCase())
      .filter((r: string) => r.includes('@'));

    if (cleanRecipients.length === 0) {
      return NextResponse.json({ error: 'No valid recipient email addresses provided' }, { status: 400 });
    }

    // LiveKit-only: legacy google_meet rows are never invited to an external provider link.
    if (meeting.sfuProvider === 'google_meet') {
      return NextResponse.json(
        {
          error: 'PROVIDER_UNSUPPORTED',
          message: 'This meeting was created on a retired video provider and cannot be shared. Clasptek video meetings use LiveKit exclusively.',
        },
        { status: 400 }
      );
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://app.clasptek.org';
    const meetUrl = `${origin}/meet/${meeting.publicId}`;
    const platformName = 'Clasptek LiveKit Classroom';

    const subject = `Invitation: ${meeting.title} — ${platformName}`;
    const inviteBody =
      message ||
      `You have been invited to join ${meeting.title}.\n\nPlatform: ${platformName}\nJoin link: ${meetUrl}`;

    // Check if an email dispatch provider API key is configured (e.g. RESEND_API_KEY)
    const resendKey = process.env.RESEND_API_KEY;

    if (resendKey) {
      // Send via Resend
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Clasptek Classroom <no-reply@clasptek.org>',
          to: cleanRecipients,
          subject,
          text: inviteBody,
        }),
      });

      if (resendRes.ok) {
        return NextResponse.json({
          success: true,
          configured: true,
          deliveredCount: cleanRecipients.length,
          feedback: `Email invitation dispatched to ${cleanRecipients.length} recipient(s).`,
        });
      }
    }

    // Server mailer not configured: return friendly feedback with mailto fallback
    const mailtoUrl = `mailto:${cleanRecipients.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(inviteBody)}`;

    return NextResponse.json({
      success: false,
      configured: false,
      fallbackMailto: mailtoUrl,
      message: 'Server email provider is not configured. Default email client has been prepared via mailto.',
      recipients: cleanRecipients,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
