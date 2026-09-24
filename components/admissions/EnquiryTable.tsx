/**
 * components/admissions/EnquiryTable.tsx — Phase 3 & 9G
 * Responsive table of enquiries.
 * Uses genuine .cp-table-wrap and .cp-table styling.
 */

'use client';

import type { Enquiry } from '@/types/admissions';
import { StatusBadge } from './StatusBadge';

interface EnquiryTableProps {
  enquiries: Enquiry[];
  onSelect: (enquiry: Enquiry) => void;
  isLoading?: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatWhatsApp(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    return `https://wa.me/234${digits.slice(1)}`;
  }
  if (digits.startsWith('234')) {
    return `https://wa.me/${digits}`;
  }
  return `https://wa.me/${digits}`;
}

export function EnquiryTable({ enquiries, onSelect, isLoading }: EnquiryTableProps) {
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text-muted)' }} aria-live="polite">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="cp-spinner cp-spinner-md" aria-hidden="true" />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Loading enquiries...</span>
        </div>
      </div>
    );
  }

  if (enquiries.length === 0) {
    return (
      <div className="cp-empty-state">
        <div className="cp-empty-icon" aria-hidden="true">📭</div>
        <div className="cp-empty-title">No enquiries found</div>
        <div className="cp-empty-desc">
          Try adjusting your search or filter criteria.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop & Tablet Table */}
      <div className="cp-table-wrap cp-table-desktop">
        <table className="cp-table">
          <thead>
            <tr>
              <th scope="col">Prospect</th>
              <th scope="col">Contact</th>
              <th scope="col">Programme</th>
              <th scope="col">Source</th>
              <th scope="col">Status</th>
              <th scope="col">Date</th>
              <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {enquiries.map((enquiry) => {
              const wa = formatWhatsApp(enquiry.phone);
              return (
                <tr
                  key={enquiry.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelect(enquiry)}
                >
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
                      {enquiry.student_name}
                    </div>
                    {enquiry.notes && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748B)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {enquiry.notes.slice(0, 60)}{enquiry.notes.length > 60 ? '…' : ''}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary, #0F172A)' }}>{enquiry.email ?? '—'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748B)' }}>{enquiry.phone ?? '—'}</div>
                  </td>
                  <td style={{ fontSize: '12px' }}>
                    {enquiry.programme_name ?? '—'}
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--text-muted, #64748B)' }}>
                    {enquiry.source ?? '—'}
                  </td>
                  <td>
                    <StatusBadge status={enquiry.status} />
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--text-muted, #64748B)' }}>
                    {formatDate(enquiry.updated_at)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ textDecoration: 'none', fontSize: '14px' }}
                          aria-label={`WhatsApp ${enquiry.student_name}`}
                          title="WhatsApp"
                        >
                          💬
                        </a>
                      )}
                      {enquiry.email && (
                        <a
                          href={`mailto:${enquiry.email}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ textDecoration: 'none', fontSize: '14px' }}
                          aria-label={`Email ${enquiry.student_name}`}
                          title="Email"
                        >
                          ✉️
                        </a>
                      )}
                      <button
                        type="button"
                        className="cp-btn sm secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(enquiry);
                        }}
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                        aria-label={`Open enquiry for ${enquiry.student_name}`}
                      >
                        View →
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Stack */}
      <div className="cp-cards-mobile">
        {enquiries.map((enquiry) => {
          const wa = formatWhatsApp(enquiry.phone);
          return (
            <div
              key={enquiry.id}
              className="cp-card"
              style={{ padding: '14px', cursor: 'pointer' }}
              onClick={() => onSelect(enquiry)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(enquiry)}
              aria-label={`View enquiry for ${enquiry.student_name}`}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary, #0F172A)', margin: 0 }}>
                    {enquiry.student_name}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted, #64748B)', margin: '2px 0 0 0' }}>
                    {enquiry.programme_name ?? 'No programme'}
                  </p>
                </div>
                <StatusBadge status={enquiry.status} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px', color: 'var(--text-muted, #64748B)', marginBottom: '8px' }}>
                {enquiry.email && <span>{enquiry.email}</span>}
                {enquiry.phone && <span>{enquiry.phone}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748B)' }}>{formatDate(enquiry.updated_at)}</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none', fontSize: '14px' }} aria-label="WhatsApp">💬</a>
                  )}
                  {enquiry.email && (
                    <a href={`mailto:${enquiry.email}`} onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none', fontSize: '14px' }} aria-label="Email">✉️</a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
