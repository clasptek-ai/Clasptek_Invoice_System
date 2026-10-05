/**
 * app/attendance/page.tsx — Phase 5
 * Server Component: Attendance Register & Delivery Tracking
 */

import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import {
  getTrainingCohorts,
  getTrainingSessions,
  getCohortEnrolmentsWithStudents,
  getAttendance,
} from '@/lib/training/queries';
import { AttendancePageClient } from './AttendancePageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Attendance Register & Delivery Tracking — Clasptek Portal',
  description: 'Authoritative student session check-ins, percentage tracking, and audited attendance corrections.',
};

interface PageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function AttendancePage({ searchParams }: PageProps) {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/attendance');
  }

  const allowedRoles = ['Super Admin', 'Finance Manager', 'Facilitator'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const cohortsRes = await getTrainingCohorts();
  const cohorts = cohortsRes.data || [];

  const selectedCohortId = params.cohortId || (cohorts.length > 0 ? cohorts[0].id : '');

  // Fetch sessions, enrolments, and attendance for selected cohort
  const [sessionsRes, enrolmentsRes, attendanceRes] = await Promise.all([
    selectedCohortId ? getTrainingSessions(selectedCohortId) : Promise.resolve({ data: [] }),
    selectedCohortId ? getCohortEnrolmentsWithStudents(selectedCohortId) : Promise.resolve({ data: [] }),
    selectedCohortId ? getAttendance(undefined, selectedCohortId) : Promise.resolve({ data: [] }),
  ]);

  const sessions = sessionsRes.data || [];
  const selectedSessionId = params.sessionId || (sessions.length > 0 ? sessions[0].id : '');

  return (
    <AttendancePageClient
      cohorts={cohorts}
      selectedCohortId={selectedCohortId}
      sessions={sessions}
      selectedSessionId={selectedSessionId}
      enrolments={enrolmentsRes.data || []}
      allAttendance={attendanceRes.data || []}
    />
  );
}
