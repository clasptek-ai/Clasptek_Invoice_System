/**
 * app/api/training/sessions/route.ts — Phase 5
 * Route handler for Training Sessions:
 * - GET: List training sessions (optionally filtered by cohortId)
 * - POST: Create or update training session
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getTrainingSessions, saveTrainingSession } from '@/lib/training/queries';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const cohortId = searchParams.get('cohortId') || undefined;

    const { data, error } = await getTrainingSessions(cohortId);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      id,
      cohortId,
      sessionNumber,
      sessionTitle,
      sessionDate,
      startTime,
      endTime,
      deliveryMode,
      location,
      facilitatorId,
      notes,
    } = body;

    if (!cohortId || !sessionTitle?.trim() || !sessionDate) {
      return NextResponse.json(
        { error: 'Missing required fields: cohortId, sessionTitle, sessionDate' },
        { status: 400 }
      );
    }

    const { data, error } = await saveTrainingSession({
      id,
      cohortId,
      sessionNumber: Number(sessionNumber) || 1,
      sessionTitle: sessionTitle.trim(),
      sessionDate,
      startTime,
      endTime,
      deliveryMode,
      location,
      facilitatorId,
      notes,
    });

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data }, { status: id ? 200 : 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
