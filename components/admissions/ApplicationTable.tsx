/**
 * components/admissions/ApplicationTable.tsx — Phase 3 & 9G
 * Accessible, responsive data table for CRM Intake Applications.
 * Uses genuine .cp-table-wrap and .cp-table styling.
 */

'use client';

import type { IntakeApplication } from '@/types/admissions';
import { StatusBadge } from '@/components/admissions/StatusBadge';
import { APPLICATION_SOURCE_LABELS } from '@/types/admissions';

interface ApplicationTableProps {
  applications: IntakeApplication[];
  totalCount: number;
  currentPage: number;
  pageSize?: number;
  selectedId?: string | null;
  onSelect: (application: IntakeApplication) => void;
  onPageChange: (page: number) => void;
}

const MODE_LABELS: Record<string, string> = {
  IN_PERSON: 'In-person',
  ONLINE: 'Online',
  HYBRID: 'Hybrid',
};

export function ApplicationTable({
  applications,
  totalCount,
  currentPage,
  pageSize = 25,
  selectedId,
  onSelect,
  onPageChange,
}: ApplicationTableProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const fromRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const toRecord = Math.min(currentPage * pageSize, totalCount);

  if (applications.length === 0) {
    return (
      <div className="cp-empty-state">
        <div className="cp-empty-icon" aria-hidden="true">📋</div>
        <div className="cp-empty-title">No applications found</div>
        <div className="cp-empty-desc">
          No intake applications match your current search or filter criteria. Try adjusting or clearing your filters.
        </div>
      </div>
    );
  }

  return (
    <div className="cp-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="cp-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
        <table className="cp-table">
          <thead>
            <tr>
              <th scope="col">Application #</th>
              <th scope="col">Applicant</th>
              <th scope="col">Programme</th>
              <th scope="col">Source</th>
              <th scope="col">Status</th>
              <th scope="col">Submitted</th>
              <th scope="col" style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((app) => {
              const isSelected = selectedId === app.id;
              const sourceLabel = APPLICATION_SOURCE_LABELS[app.source] ?? app.source;
              const formattedDate = app.submitted_at
                ? new Date(app.submitted_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—';

              return (
                <tr
                  key={app.id}
                  onClick={() => onSelect(app)}
                  style={{
                    cursor: 'pointer',
                    background: isSelected ? 'var(--surface-1)' : undefined,
                  }}
                >
                  {/* Application Number */}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, fontSize: '12px', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: '4px' }}>
                      {app.application_number}
                    </span>
                  </td>

                  {/* Applicant Details */}
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {app.first_name} {app.last_name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
                      {app.email && <span>{app.email}</span>}
                      {app.phone && <span>• {app.phone}</span>}
                    </div>
                  </td>

                  {/* Programme */}
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>
                      {app.programme_name || 'General Application'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {MODE_LABELS[app.delivery_mode] || app.delivery_mode}
                      {app.preferred_schedule ? ` • ${app.preferred_schedule}` : ''}
                    </div>
                  </td>

                  {/* Source */}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="cp-pill neutral">
                      {sourceLabel}
                    </span>
                  </td>

                  {/* Status */}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <StatusBadge status={app.status} />
                  </td>

                  {/* Submitted Date */}
                  <td style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formattedDate}
                  </td>

                  {/* Action */}
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(app);
                      }}
                      className="cp-btn sm secondary"
                      style={{ padding: '3px 8px', fontSize: '11px' }}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div style={{ padding: '12px 16px', background: 'var(--surface-1)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
        <div>
          Showing <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{fromRecord}</span> to{' '}
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{toRecord}</span> of{' '}
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{totalCount}</span> applications
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="cp-btn sm secondary"
            >
              Previous
            </button>
            <span style={{ padding: '0 4px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              className="cp-btn sm secondary"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
