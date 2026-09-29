/**
 * app/programmes/ProgrammesPageClient.tsx — Phase 4
 * Client Component for Clasptek Academic Programmes.
 * Matches legacy index.html lines 26051–26109.
 */

'use client';

import React from 'react';
import type { Programme } from '@/types/academics';
import { ProgrammeTable } from '@/components/programmes/ProgrammeTable';

interface ProgrammesPageClientProps {
  initialProgrammes: Programme[];
}

export function ProgrammesPageClient({ initialProgrammes }: ProgrammesPageClientProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="cp-card" style={{ marginBottom: '24px' }}>
        <div className="cp-card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div
              className="cp-section-title"
              style={{
                fontSize: '18px',
                fontWeight: 800,
                color: '#0F172A',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span aria-hidden="true">🎓</span> Clasptek Academic Programmes
            </div>
            <div
              className="cp-section-desc"
              style={{ fontSize: '13px', color: 'var(--text-muted, #64748B)', marginTop: '3px' }}
            >
              Official curriculum programs, tuition structures, and training catalog.
            </div>
          </div>
          <div>
            <a
              href="/apply"
              className="cp-btn sm primary"
              id="btnAddProgBtn"
              style={{ fontWeight: 700, textDecoration: 'none' }}
            >
              + Add New Programme
            </a>
          </div>
        </div>

        {/* Programmes Catalogue Table */}
        <ProgrammeTable programmes={initialProgrammes} />
      </div>
    </div>
  );
}
