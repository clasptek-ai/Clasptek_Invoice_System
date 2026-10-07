'use client';

/**
 * components/cohorts/AddCohortModal.tsx
 * Internal Cohort Creation Modal.
 * Replaces obsolete public /apply link with an internal, authoritative academic workflow.
 */

import React, { useState, useEffect } from 'react';
import type { Cohort, Programme, CohortStatus, DeliveryMode } from '@/types/academics';

interface FacilitatorOption {
  id: string;
  fullName?: string;
  name?: string;
  employeeId?: string;
  jobTitle?: string;
}

interface AddCohortModalProps {
  isOpen: boolean;
  programmes: Programme[];
  facilitators?: FacilitatorOption[];
  onClose: () => void;
  onCohortCreated: (newCohort: Cohort) => void;
}

export function AddCohortModal({
  isOpen,
  programmes,
  facilitators = [],
  onClose,
  onCohortCreated,
}: AddCohortModalProps) {
  const [programmeId, setProgrammeId] = useState<string>('');
  const [cohortCode, setCohortCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [capacity, setCapacity] = useState<number>(25);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('IN_PERSON');
  const [leadFacilitatorId, setLeadFacilitatorId] = useState<string>('');
  const [status, setStatus] = useState<CohortStatus>('PLANNING');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize or reset form fields
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setIsSubmitting(false);

      const firstProg = programmes[0];
      const initialProgId = firstProg?.id || '';
      setProgrammeId(initialProgId);

      const now = new Date();
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const monthStr = monthNames[now.getMonth()];
      const yearShort = String(now.getFullYear()).slice(-2);
      const yearFull = now.getFullYear();

      const progCode = firstProg?.code || 'PROG';
      const progName = firstProg?.name || 'Academic Course';

      setCohortCode(`${progCode}-${monthStr}${yearShort}`);
      setName(`${progName} — ${monthStr} ${yearFull}`);

      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      setStartDate(`${yyyy}-${mm}-${dd}`);

      const future = new Date(now);
      future.setMonth(future.getMonth() + 3);
      const fYyyy = future.getFullYear();
      const fMm = String(future.getMonth() + 1).padStart(2, '0');
      const fDd = String(future.getDate()).padStart(2, '0');
      setEndDate(`${fYyyy}-${fMm}-${fDd}`);

      setCapacity(25);
      setDeliveryMode('IN_PERSON');
      setLeadFacilitatorId('');
      setStatus('PLANNING');
    }
  }, [isOpen, programmes]);

  if (!isOpen) return null;

  const handleProgrammeChange = (newProgId: string) => {
    setProgrammeId(newProgId);
    const prog = programmes.find((p) => p.id === newProgId);
    if (prog) {
      const now = new Date(startDate || Date.now());
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const monthStr = monthNames[now.getMonth()];
      const yearShort = String(now.getFullYear()).slice(-2);
      const yearFull = now.getFullYear();

      setCohortCode(`${prog.code || 'PROG'}-${monthStr}${yearShort}`);
      setName(`${prog.name || 'Programme'} — ${monthStr} ${yearFull}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!programmeId) {
      setErrorMessage('Please select a programme.');
      return;
    }
    if (!cohortCode.trim()) {
      setErrorMessage('Cohort code is required.');
      return;
    }
    if (!name.trim()) {
      setErrorMessage('Cohort name is required.');
      return;
    }
    if (!startDate) {
      setErrorMessage('Start date is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/admissions/cohorts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programme_id: programmeId,
          cohort_code: cohortCode.trim().toUpperCase(),
          name: name.trim(),
          start_date: startDate,
          end_date: endDate || null,
          capacity: Number(capacity) || 25,
          delivery_mode: deliveryMode,
          lead_facilitator_id: leadFacilitatorId || null,
          status,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create cohort record.');
      }

      onCohortCreated(data.cohort);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create cohort.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="cp-modal-overlay" style={{ zIndex: 1000 }} onClick={onClose}>
      <div
        className="cp-modal"
        style={{ maxWidth: '640px', width: '95%', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cp-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>
              📅 Create Training Cohort
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Schedule a new academic intake cohort with seat capacity and facilitator assignment.
            </div>
          </div>
          <button
            type="button"
            className="cp-btn ghost sm"
            onClick={onClose}
            aria-label="Close modal"
            style={{ fontSize: '18px', padding: '4px 8px' }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="cp-modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {errorMessage && (
              <div role="alert" className="cp-alert error" style={{ margin: 0, fontSize: '13px' }}>
                {errorMessage}
              </div>
            )}

            {/* Programme Selection */}
            <div>
              <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
                Academic Programme <span style={{ color: 'var(--danger, #DC2626)' }}>*</span>
              </label>
              <select
                className="cp-input"
                value={programmeId}
                onChange={(e) => handleProgrammeChange(e.target.value)}
                required
                style={{ width: '100%', fontSize: '13.5px' }}
              >
                <option value="" disabled>Select Programme...</option>
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code || 'Code N/A'})
                  </option>
                ))}
              </select>
            </div>

            {/* Cohort Code & Name */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
                  Cohort Code <span style={{ color: 'var(--danger, #DC2626)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="cp-input"
                  value={cohortCode}
                  onChange={(e) => setCohortCode(e.target.value.toUpperCase())}
                  placeholder="e.g. GVD-OCT26"
                  required
                  style={{ width: '100%', fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
                  Cohort Title / Name <span style={{ color: 'var(--danger, #DC2626)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="cp-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Grammar & Vocabulary Development — Oct-26"
                  required
                  style={{ width: '100%', fontWeight: 600 }}
                />
              </div>
            </div>

            {/* Dates: Start Date & End Date */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
                  Start Date <span style={{ color: 'var(--danger, #DC2626)' }}>*</span>
                </label>
                <input
                  type="date"
                  className="cp-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
                  End Date
                </label>
                <input
                  type="date"
                  className="cp-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {/* Delivery Mode & Capacity */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
                  Delivery Mode
                </label>
                <select
                  className="cp-input"
                  value={deliveryMode}
                  onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)}
                  style={{ width: '100%' }}
                >
                  <option value="IN_PERSON">In-Person (Campus / Lab)</option>
                  <option value="ONLINE">Online (Virtual Classrooms)</option>
                  <option value="HYBRID">Hybrid (In-Person &amp; Online)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
                  Capacity (Seats)
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="cp-input"
                  value={capacity}
                  onChange={(e) => setCapacity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  required
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
                  Initial Status
                </label>
                <select
                  className="cp-input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CohortStatus)}
                  style={{ width: '100%' }}
                >
                  <option value="PLANNING">Planning</option>
                  <option value="UPCOMING">Upcoming</option>
                  <option value="IN_PROGRESS">In Progress</option>
                </select>
              </div>
            </div>

            {/* Lead Facilitator */}
            <div>
              <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
                Lead Facilitator (Optional)
              </label>
              <select
                className="cp-input"
                value={leadFacilitatorId}
                onChange={(e) => setLeadFacilitatorId(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">Unassigned / TBD</option>
                {facilitators.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.fullName || f.name || f.employeeId || 'Facilitator'} {f.jobTitle ? `(${f.jobTitle})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="cp-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
            <button
              type="button"
              className="cp-btn secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cp-btn primary"
              id="btnSubmitAddCohort"
              disabled={isSubmitting}
              style={{ fontWeight: 700 }}
            >
              {isSubmitting ? 'Creating Cohort...' : 'Create Cohort'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
