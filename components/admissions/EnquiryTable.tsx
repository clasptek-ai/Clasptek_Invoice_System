/**
 * components/admissions/EnquiryTable.tsx — Phase 3 & 9G
 * Responsive table of enquiries and leads with full data management controls:
 * - Row selection & indeterminate select-all
 * - Search & Filter integration
 * - Quick Action Buttons: View, Follow Up, Generate Invoice, Edit, Safe Delete
 * - Fully responsive desktop/tablet table and mobile card stack
 */

'use client';

import React, { useRef, useEffect } from 'react';
import type { Enquiry } from '@/types/admissions';
import { StatusBadge } from './StatusBadge';
import { SortableHeader } from '@/components/tables/SortableHeader';

interface EnquiryTableProps {
  enquiries: Enquiry[];
  onSelect: (enquiry: Enquiry) => void;
  onFollowUp?: (enquiry: Enquiry) => void;
  onGenerateInvoice?: (enquiry: Enquiry) => void;
  onEditEnquiry?: (enquiry: Enquiry) => void;
  onDeleteEnquiry?: (enquiry: Enquiry) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
  isAllSelected?: boolean;
  isLoading?: boolean;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
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

function formatNaira(amount: number): string {
  return '₦' + Math.max(0, amount).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getBillingBadgeStyle(status?: string): { bg: string; text: string; border: string; label: string } {
  switch (status) {
    case 'PAID':
      return { bg: '#DEF7EC', text: '#03543F', border: '#84E1BC', label: 'Paid in Full' };
    case 'PARTIALLY_PAID':
      return { bg: '#FEF08A', text: '#854D0E', border: '#FACC15', label: 'Partially Paid' };
    case 'OVERDUE':
      return { bg: '#FDE8E8', text: '#9B1C1C', border: '#F8B4B4', label: 'Overdue' };
    case 'INVOICED':
      return { bg: '#E1EFFE', text: '#1E429F', border: '#A4CAFE', label: 'Invoiced' };
    case 'INVOICE_REQUESTED':
      return { bg: '#F3E8FF', text: '#6B21A8', border: '#D8B4FE', label: 'Invoice Requested' };
    case 'NOT_INVOICED':
    default:
      return { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1', label: 'Not Invoiced' };
  }
}

export function EnquiryTable({
  enquiries,
  onSelect,
  onFollowUp,
  onGenerateInvoice,
  onEditEnquiry,
  onDeleteEnquiry,
  canEdit = true,
  canDelete = true,
  selectedIds = new Set(),
  onToggleSelect,
  onToggleSelectAll,
  isAllSelected = false,
  isLoading = false,
  sortField,
  sortOrder,
  onSort,
}: EnquiryTableProps) {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      const selectedCount = enquiries.filter((e) => selectedIds.has(e.id)).length;
      const isIndeterminate = selectedCount > 0 && selectedCount < enquiries.length;
      headerCheckboxRef.current.indeterminate = isIndeterminate;
    }
  }, [selectedIds, enquiries]);

  if (isLoading) {
    return (
      <div className="cp-loading-state" style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid #E2E8F0', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: '8px', fontSize: '13px' }}>Loading enquiries...</p>
      </div>
    );
  }

  if (enquiries.length === 0) {
    return (
      <div className="cp-empty-state">
        <div className="cp-empty-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted, #94A3B8)' }}>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
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
      <div className="cp-table-wrap cp-table-desktop" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="cp-table">
          <thead>
            <tr>
              {onToggleSelect && (
                <th style={{ width: '42px', textAlign: 'center', padding: '8px' }}>
                  <input
                    type="checkbox"
                    ref={headerCheckboxRef}
                    checked={isAllSelected}
                    onChange={onToggleSelectAll}
                    aria-label="Select all visible enquiries"
                    style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                  />
                </th>
              )}
              {onSort ? (
                <SortableHeader
                  label="Prospect"
                  field="student_name"
                  currentSort={sortField}
                  currentOrder={sortOrder}
                  onSort={onSort}
                />
              ) : (
                <th scope="col">Prospect</th>
              )}
              <th scope="col">Interested Programme</th>
              <th scope="col">Phone</th>
              {onSort ? (
                <SortableHeader
                  label="Source"
                  field="source"
                  currentSort={sortField}
                  currentOrder={sortOrder}
                  onSort={onSort}
                  className="cp-col-secondary"
                />
              ) : (
                <th scope="col" className="cp-col-secondary">Source</th>
              )}
              {onSort ? (
                <SortableHeader
                  label="Status"
                  field="status"
                  currentSort={sortField}
                  currentOrder={sortOrder}
                  onSort={onSort}
                />
              ) : (
                <th scope="col">Status</th>
              )}
              <th scope="col">Billing Status</th>
              <th scope="col" style={{ textAlign: 'right' }}>Balance Due</th>
              {onSort ? (
                <SortableHeader
                  label="Last Follow-up"
                  field="date"
                  currentSort={sortField}
                  currentOrder={sortOrder}
                  onSort={onSort}
                  className="cp-col-tertiary"
                />
              ) : (
                <th scope="col" className="cp-col-tertiary">Last Follow-up</th>
              )}
              <th scope="col" style={{ textAlign: 'center', minWidth: '180px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {enquiries.map((enquiry) => {
              const isSelected = selectedIds.has(enquiry.id);
              const wa = formatWhatsApp(enquiry.phone);
              const fin = enquiry.financials;
              const billing = getBillingBadgeStyle(fin?.billingStatus);

              return (
                <tr
                  key={enquiry.id}
                  style={{
                    backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.05)' : undefined,
                    cursor: 'pointer',
                  }}
                  onClick={() => onSelect(enquiry)}
                >
                  {/* Row Checkbox */}
                  {onToggleSelect && (
                    <td
                      style={{ textAlign: 'center', width: '42px', padding: '8px' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(enquiry.id)}
                        aria-label={`Select ${enquiry.student_name}`}
                        style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                      />
                    </td>
                  )}

                  {/* Prospect */}
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
                      {enquiry.student_name}
                    </div>
                    {enquiry.email && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748B)' }}>
                        {enquiry.email}
                      </div>
                    )}
                  </td>

                  {/* Interested Programme */}
                  <td style={{ fontSize: '12px', fontWeight: 600 }}>
                    {enquiry.programme_name ?? (
                      <span style={{ color: '#94A3B8', fontWeight: 400 }}>Not selected</span>
                    )}
                  </td>

                  {/* Phone */}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                        {enquiry.phone ?? '—'}
                      </span>
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ textDecoration: 'none', color: '#16A34A', display: 'inline-flex', alignItems: 'center' }}
                          aria-label={`WhatsApp ${enquiry.student_name}`}
                          title="Chat on WhatsApp"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </td>

                  {/* Source */}
                  <td className="cp-col-secondary" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {enquiry.source || '—'}
                  </td>

                  {/* Status */}
                  <td>
                    <StatusBadge status={enquiry.status} />
                  </td>

                  {/* Billing Status */}
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: billing.bg,
                        color: billing.text,
                        border: `1px solid ${billing.border}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {billing.label}
                    </span>
                  </td>

                  {/* Balance Due */}
                  <td
                    style={{
                      textAlign: 'right',
                      fontWeight: 700,
                      fontSize: '12.5px',
                      color: (fin?.balanceDue || 0) > 0 ? 'var(--accent, #C1272D)' : '#059669',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatNaira(fin?.balanceDue || 0)}
                  </td>

                  {/* Last Follow-up */}
                  <td className="cp-col-tertiary" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {formatDate(enquiry.updated_at)}
                  </td>

                  {/* Actions */}
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
                      <button
                        type="button"
                        className="cp-btn sm secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(enquiry);
                        }}
                        style={{ padding: '3px 7px', fontSize: '11px', fontWeight: 600 }}
                        title="View prospect snapshot"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="cp-btn sm secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onFollowUp) onFollowUp(enquiry);
                          else onSelect(enquiry);
                        }}
                        style={{ padding: '3px 7px', fontSize: '11px', fontWeight: 600, color: 'var(--primary, #0284C7)' }}
                        title="Log admissions follow-up"
                      >
                        Follow Up
                      </button>
                      <button
                        type="button"
                        className="cp-btn sm accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onGenerateInvoice) onGenerateInvoice(enquiry);
                        }}
                        style={{ padding: '3px 7px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}
                        title="Generate tuition invoice"
                      >
                        Invoice
                      </button>
                      {canEdit && onEditEnquiry && (
                        <button
                          type="button"
                          className="cp-btn sm secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditEnquiry(enquiry);
                          }}
                          style={{ padding: '3px 6px', fontSize: '11px' }}
                          title="Edit Enquiry"
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && onDeleteEnquiry && (
                        <button
                          type="button"
                          className="cp-btn sm secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteEnquiry(enquiry);
                          }}
                          style={{ padding: '3px 6px', fontSize: '11px', color: '#DC2626' }}
                          title="Delete Enquiry"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Stack */}
      <div className="cp-cards-mobile" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {enquiries.map((enquiry) => {
          const isSelected = selectedIds.has(enquiry.id);
          const wa = formatWhatsApp(enquiry.phone);
          const fin = enquiry.financials;
          const billing = getBillingBadgeStyle(fin?.billingStatus);

          return (
            <div
              key={enquiry.id}
              className="cp-card"
              style={{
                padding: '14px',
                cursor: 'pointer',
                border: isSelected ? '1px solid #3B82F6' : undefined,
                backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.03)' : undefined,
              }}
              onClick={() => onSelect(enquiry)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(enquiry)}
              aria-label={`View enquiry for ${enquiry.student_name}`}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {onToggleSelect && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleSelect(enquiry.id);
                      }}
                      aria-label={`Select ${enquiry.student_name}`}
                      style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                    />
                  )}
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary, #0F172A)', margin: 0 }}>
                      {enquiry.student_name}
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted, #64748B)', margin: '2px 0 0 0' }}>
                      {enquiry.programme_name ?? 'No programme selected'}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <StatusBadge status={enquiry.status} />
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '8px',
                      backgroundColor: billing.bg,
                      color: billing.text,
                      border: `1px solid ${billing.border}`,
                    }}
                  >
                    {billing.label}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted, #64748B)', marginBottom: '8px' }}>
                <span>Balance: <strong style={{ color: (fin?.balanceDue || 0) > 0 ? 'var(--accent, #C1272D)' : '#059669' }}>{formatNaira(fin?.balanceDue || 0)}</strong></span>
                <span>{enquiry.source || 'Direct'}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none', color: '#16A34A', display: 'inline-flex' }} aria-label="WhatsApp">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    </a>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatDate(enquiry.updated_at)}</span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(enquiry);
                    }}
                    style={{ padding: '3px 8px', fontSize: '11px' }}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onFollowUp) onFollowUp(enquiry);
                      else onSelect(enquiry);
                    }}
                    style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--primary, #0284C7)' }}
                    title="Contact prospect and log follow-up"
                  >
                    Follow Up
                  </button>
                  <button
                    type="button"
                    className="cp-btn sm accent"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onGenerateInvoice) onGenerateInvoice(enquiry);
                    }}
                    style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 700 }}
                  >
                    Invoice
                  </button>
                  {canDelete && onDeleteEnquiry && (
                    <button
                      type="button"
                      className="cp-btn sm secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteEnquiry(enquiry);
                      }}
                      style={{ padding: '3px 6px', fontSize: '11px', color: '#DC2626' }}
                    >
                      Delete
                    </button>
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
