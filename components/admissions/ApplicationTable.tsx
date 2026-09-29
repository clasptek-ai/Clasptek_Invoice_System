/**
 * components/admissions/ApplicationTable.tsx — Phase 3 & 9G
 * Accessible, responsive data table for CRM Intake Applications.
 * Uses genuine .cp-table-wrap and .cp-table styling.
 */

'use client';

import type { IntakeApplication } from '@/types/admissions';
import { StatusBadge } from '@/components/admissions/StatusBadge';
import { APPLICATION_SOURCE_LABELS } from '@/types/admissions';
import { Pagination } from '@/components/tables/Pagination';

interface ApplicationTableProps {
  applications: IntakeApplication[];
  totalCount: number;
  currentPage: number;
  pageSize?: number;
  selectedId?: string | null;
  onSelect: (application: IntakeApplication) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
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
  onPageSizeChange,
}: ApplicationTableProps) {
  if (applications.length === 0) {
    return (
      <div className="cp-empty-state">
        <div className="cp-empty-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted, #94A3B8)' }}>
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            <path d="M9 14l2 2 4-4" />
          </svg>
        </div>
        <div className="cp-empty-title">No applications found</div>
        <div className="cp-empty-desc">
          No intake applications match your current search or filter criteria. Try adjusting or clearing your filters.
        </div>
      </div>
    );
  }

  return (
    <div className="cp-card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Desktop & Tablet Table */}
      <div className="cp-table-wrap cp-table-desktop" style={{ border: 'none', borderRadius: 0 }}>
        <table className="cp-table">
          <thead>
            <tr>
              <th scope="col">Application #</th>
              <th scope="col">Applicant</th>
              <th scope="col">Programme</th>
              <th scope="col" className="cp-col-secondary">Source</th>
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
                  <td className="cp-col-secondary" style={{ whiteSpace: 'nowrap' }}>
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

      {/* Mobile Card Stack */}
      <div className="cp-cards-mobile" style={{ padding: '12px' }}>
        {applications.map((app) => {
          const isSelected = selectedId === app.id;
          const formattedDate = app.submitted_at
            ? new Date(app.submitted_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : '—';

          return (
            <div
              key={app.id}
              className="cp-mobile-record-card"
              style={{
                cursor: 'pointer',
                borderColor: isSelected ? 'var(--primary)' : undefined,
              }}
              onClick={() => onSelect(app)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(app)}
              aria-label={`View application for ${app.first_name} ${app.last_name}`}
            >
              <div className="cp-mobile-record-header">
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {app.first_name} {app.last_name}
                  </h4>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {app.email || app.phone || 'No contact'}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontWeight: 700,
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {app.application_number}
                </span>
              </div>

              <div className="cp-mobile-record-grid">
                <div className="cp-mobile-record-field">
                  <span className="cp-mobile-record-label">Programme</span>
                  <span className="cp-mobile-record-value">{app.programme_name || 'General Application'}</span>
                </div>
                <div className="cp-mobile-record-field">
                  <span className="cp-mobile-record-label">Status</span>
                  <div>
                    <StatusBadge status={app.status} />
                  </div>
                </div>
                <div className="cp-mobile-record-field">
                  <span className="cp-mobile-record-label">Submitted</span>
                  <span className="cp-mobile-record-value" style={{ fontWeight: 400 }}>{formattedDate}</span>
                </div>
                <div className="cp-mobile-record-field">
                  <span className="cp-mobile-record-label">Delivery</span>
                  <span className="cp-mobile-record-value" style={{ fontWeight: 400 }}>
                    {MODE_LABELS[app.delivery_mode] || app.delivery_mode}
                  </span>
                </div>
              </div>

              <div className="cp-mobile-record-actions">
                <button
                  type="button"
                  className="cp-btn sm secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(app);
                  }}
                  style={{ padding: '4px 12px', fontSize: '11.5px', fontWeight: 600 }}
                >
                  Review Application
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Standard Pagination Footer */}
      <Pagination
        currentPage={currentPage}
        pageSize={pageSize}
        totalRecords={totalCount}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        entityLabel="applications"
      />
    </div>
  );
}
