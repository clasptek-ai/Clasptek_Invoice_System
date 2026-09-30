/**
 * components/admissions/GenerateInvoiceModal.tsx — Admissions ↔ Finance Invoice Workflow
 *
 * UNIFIED SOURCE-OF-TRUTH INVOICE WORKFLOW:
 * Uses the canonical CreateProfessionalTuitionInvoiceModal (7 sections):
 * 1. Customer (Pre-filled from prospect record, linkable to customer profiles)
 * 2. Training / Programme (Pre-filled with interested programme & delivery mode)
 * 3. Payment Account (Authoritative Settings / DB selector, defaults to Sterling Bank 0098457631)
 * 4. Invoice Line Items (Repeater with Qty, Unit Price, Discount, Calculated Total)
 * 5. Notes & Comments (Customer-facing notes + internal comments)
 * 6. Terms (Standard Terms & Conditions)
 * 7. Actions (Cancel, Preview Canonical Invoice, Issue Official Invoice)
 *
 * Submits directly to the canonical POST /api/finance/invoices with enquiryId
 */

'use client';

import React from 'react';
import type { Enquiry, ProgrammeOption } from '@/types/admissions';
import type { Invoice, Customer } from '@/types/finance';
import type { FinanceSettingsData, PaymentAccountData } from '@/types/settings';
import { CreateProfessionalTuitionInvoiceModal } from '@/components/finance/CreateProfessionalTuitionInvoiceModal';

export interface GenerateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  enquiry: Enquiry | null;
  programmes: ProgrammeOption[];
  customers?: Customer[];
  paymentAccounts?: PaymentAccountData[] | null;
  financeSettings?: FinanceSettingsData | null;
  onInvoiceCreated: (invoice: Invoice) => void;
}

export function GenerateInvoiceModal({
  isOpen,
  onClose,
  enquiry,
  programmes,
  customers = [],
  paymentAccounts,
  financeSettings,
  onInvoiceCreated,
}: GenerateInvoiceModalProps) {
  // Adapt ProgrammeOption to the modal's expected format, ensuring fallback programmes are available
  const availableProgrammes =
    programmes && programmes.length > 0
      ? programmes
      : [
          { id: 'prog_1789416837946_hnnbx', name: 'Digital Marketing', code: 'CLP-DIM', tuition_fee: 180000, status: 'active' },
          { id: 'prog_1788900434260_uujj7', name: 'Cybersecurity', code: 'CLP-CYB', tuition_fee: 450000, status: 'active' },
          { id: 'prog_data_analysis_01', name: 'Data Analysis', code: 'CLP-DAN', tuition_fee: 400000, status: 'active' },
        ];

  const mappedProgrammes = availableProgrammes.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    tuitionFee: p.tuition_fee ? Number(p.tuition_fee) : 150000,
    price: p.tuition_fee ? Number(p.tuition_fee) : 150000,
  }));

  return (
    <CreateProfessionalTuitionInvoiceModal
      isOpen={isOpen}
      onClose={onClose}
      enquiry={enquiry}
      programmes={mappedProgrammes}
      customers={customers}
      paymentAccounts={paymentAccounts || undefined}
      financeSettings={financeSettings}
      onInvoiceCreated={onInvoiceCreated}
    />
  );
}
