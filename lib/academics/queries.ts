/**
 * lib/academics/queries.ts — Phase 4
 * Server-side Data Access Layer for Programmes, Cohorts, and Enrolments.
 * Enforces multi-tenant RLS through createServerClient().
 */

import { createServerClient } from '@/lib/supabase/server';
import type {
  Programme,
  Cohort,
  Enrolment,
  EnrolmentFilters,
  CohortFilters,
  CapacitySummary,
} from '@/types/academics';

const PAGE_SIZE = 25;

// ─── Programmes ─────────────────────────────────────────────────────────────

export async function getProgrammes(): Promise<{ data: Programme[]; error: string | null }> {
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('programmes')
      .select('*')
      .order('name', { ascending: true })
      .order('code', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('[getProgrammes]', error.message);
      return { data: [], error: error.message };
    }
    return { data: (data ?? []) as Programme[], error: null };
  } catch (err: unknown) {
    return { data: [], error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Cohorts ────────────────────────────────────────────────────────────────

export async function getCohorts(
  filters: CohortFilters = {}
): Promise<{ data: Cohort[]; error: string | null }> {
  try {
    const supabase = await createServerClient();

    let query = supabase
      .from('cohorts')
      .select('*, programmes!fk_cohorts_programme_tenant(name), personnel(full_name)')
      .order('start_date', { ascending: false })
      .order('cohort_code', { ascending: false })
      .order('id', { ascending: false });

    if (filters.programmeId && filters.programmeId !== 'ALL') {
      query = query.eq('programme_id', filters.programmeId);
    }

    if (filters.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status);
    }

    const { data: cohorts, error } = await query;

    if (error) {
      console.error('[getCohorts]', error.message);
      return { data: [], error: error.message };
    }

    if (!cohorts || cohorts.length === 0) {
      return { data: [], error: null };
    }

    // Fetch active enrolment counts per cohort
    const cohortIds = cohorts.map((c) => c.id);
    const { data: enrolments } = await supabase
      .from('enrolments')
      .select('cohort_id, status')
      .in('cohort_id', cohortIds)
      .not('status', 'in', '("CANCELLED","WITHDRAWN")');

    const countsByCohort: Record<string, number> = {};
    (enrolments ?? []).forEach((e) => {
      if (e.cohort_id) {
        countsByCohort[e.cohort_id] = (countsByCohort[e.cohort_id] || 0) + 1;
      }
    });

    type RawCohort = Cohort & {
      programmes?: { name?: string };
      personnel?: { full_name?: string };
    };

    const enrichedCohorts: Cohort[] = (cohorts as RawCohort[])
      .map((c) => {
        const enrolled = countsByCohort[c.id] || 0;
        const cap = Number(c.capacity || 25);
        const isFull = enrolled >= cap;
        const pct = cap > 0 ? Math.round((enrolled / cap) * 100) : 0;

        let matchesSearch = true;
        if (filters.search?.trim()) {
          const q = filters.search.trim().toLowerCase();
          const code = (c.cohort_code || '').toLowerCase();
          const name = (c.name || '').toLowerCase();
          const progName = (c.programmes?.name || '').toLowerCase();
          const facName = (c.personnel?.full_name || '').toLowerCase();
          matchesSearch =
            code.includes(q) || name.includes(q) || progName.includes(q) || facName.includes(q);
        }

        return {
          ...c,
          programme_name: c.programmes?.name || 'Not specified',
          lead_facilitator_name: c.personnel?.full_name || undefined,
          enrolled_count: enrolled,
          is_full: isFull,
          percentage_full: pct,
          _matchesSearch: matchesSearch,
        };
      })
      .filter((c) => c._matchesSearch)
      .map(({ _matchesSearch, ...rest }) => rest as Cohort);

    return { data: enrichedCohorts, error: null };
  } catch (err: unknown) {
    return { data: [], error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Enrolments ─────────────────────────────────────────────────────────────

export async function getEnrolments(
  filters: EnrolmentFilters = {}
): Promise<{ data: Enrolment[]; count: number; error: string | null }> {
  try {
    const supabase = await createServerClient();
    const {
      page = 1,
      pageSize = PAGE_SIZE,
      search = '',
      sortBy = 'enrolment_date',
      sortOrder = 'desc',
    } = filters;

    // Validated sort allowlist mapping UI sort keys to database columns
    const ENROLMENT_SORT_ALLOWLIST: Record<string, string> = {
      enrolment_date: 'enrolment_date',
      date: 'enrolment_date',
      registration_date: 'enrolment_date',
      enrolment_number: 'enrolment_number',
      student_name: 'student_name',
      name: 'student_name',
      status: 'status',
      agreed_tuition_fee: 'agreed_tuition_fee',
      tuition_fee: 'agreed_tuition_fee',
      completion_attendance_pct: 'completion_attendance_pct',
      attendance: 'completion_attendance_pct',
      completion_status: 'completion_status',
      completion: 'completion_status',
      created_at: 'created_at',
    };

    const validatedSortField = ENROLMENT_SORT_ALLOWLIST[sortBy] || 'enrolment_date';
    const isAsc = sortOrder === 'asc';

    let query = supabase
      .from('enrolments')
      .select('*, programmes!fk_enrolments_programme_tenant(name), cohorts!fk_enrolments_cohort_tenant(cohort_code, name)', { count: 'exact' });

    // Server-side ordering based on validated allowlist BEFORE range()
    switch (validatedSortField) {
      case 'enrolment_number':
        query = query
          .order('enrolment_number', { ascending: isAsc })
          .order('id', { ascending: false });
        break;
      case 'student_name':
        query = query
          .order('student_name', { ascending: isAsc })
          .order('enrolment_number', { ascending: false })
          .order('id', { ascending: false });
        break;
      case 'agreed_tuition_fee':
        query = query
          .order('agreed_tuition_fee', { ascending: isAsc })
          .order('enrolment_date', { ascending: false })
          .order('enrolment_number', { ascending: false })
          .order('id', { ascending: false });
        break;
      case 'completion_attendance_pct':
        query = query
          .order('completion_attendance_pct', { ascending: isAsc, nullsFirst: false })
          .order('enrolment_date', { ascending: false })
          .order('enrolment_number', { ascending: false })
          .order('id', { ascending: false });
        break;
      case 'completion_status':
        query = query
          .order('completion_status', { ascending: isAsc })
          .order('enrolment_date', { ascending: false })
          .order('enrolment_number', { ascending: false })
          .order('id', { ascending: false });
        break;
      case 'status':
        query = query
          .order('status', { ascending: isAsc })
          .order('enrolment_date', { ascending: false })
          .order('enrolment_number', { ascending: false })
          .order('id', { ascending: false });
        break;
      case 'created_at':
        query = query
          .order('created_at', { ascending: isAsc })
          .order('enrolment_number', { ascending: false })
          .order('id', { ascending: false });
        break;
      case 'enrolment_date':
      default:
        // Authoritative enrolment date DESC (newest enrolments first)
        query = query
          .order('enrolment_date', { ascending: isAsc })
          .order('enrolment_number', { ascending: false })
          .order('id', { ascending: false });
        break;
    }

    if (filters.cohortId && filters.cohortId !== 'ALL') {
      query = query.eq('cohort_id', filters.cohortId);
    }

    if (filters.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status);
    }

    if (search.trim()) {
      const q = search.trim();
      query = query.or(
        `enrolment_number.ilike.%${q}%,student_name.ilike.%${q}%,student_email.ilike.%${q}%,student_phone.ilike.%${q}%`
      );
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: enrolments, count, error } = await query;

    if (error) {
      console.error('[getEnrolments]', error.message);
      return { data: [], count: 0, error: error.message };
    }

    type RawEnrolment = Enrolment & {
      programmes?: { name?: string };
      cohorts?: { cohort_code?: string; name?: string };
    };

    const enriched: Enrolment[] = (enrolments as RawEnrolment[]).map((e) => ({
      ...e,
      programme_name: e.programmes?.name || 'Not specified',
      cohort_name: e.cohorts ? `${e.cohorts.cohort_code || ''} - ${e.cohorts.name || ''}`.trim() : (e.cohort || '—'),
    }));

    return { data: enriched, count: count ?? 0, error: null };
  } catch (err: unknown) {
    return { data: [], count: 0, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function getCohortCapacitySummary(
  cohortId: string
): Promise<CapacitySummary | null> {
  try {
    const supabase = await createServerClient();
    const { data: cohort, error: cErr } = await supabase
      .from('cohorts')
      .select('capacity')
      .eq('id', cohortId)
      .single();

    if (cErr || !cohort) return null;

    const { count } = await supabase
      .from('enrolments')
      .select('*', { count: 'exact', head: true })
      .eq('cohort_id', cohortId)
      .not('status', 'in', '("CANCELLED","WITHDRAWN")');

    const enrolledCount = count ?? 0;
    const cap = Number(cohort.capacity || 25);
    const isFull = enrolledCount >= cap;
    const percentageFull = cap > 0 ? Math.round((enrolledCount / cap) * 100) : 0;

    return {
      enrolledCount,
      capacity: cap,
      isFull,
      percentageFull,
    };
  } catch {
    return null;
  }
}
