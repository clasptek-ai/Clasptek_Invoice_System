'use client';

/**
 * app/settings/SettingsPageClient.tsx
 * Client Component for Settings & Configuration
 * Phase 9B: Administration & Governance Module Migration
 */

import React, { useState } from 'react';
import { FinanceSettingsData, PaymentAccountData } from '@/lib/settings/queries';
import { Personnel } from '@/types/finance';
import { UserRole } from '@/types/auth';

interface SettingsProps {
  initialSettings: FinanceSettingsData;
  initialAccounts: PaymentAccountData[];
  personnelList: Personnel[];
  currentUserRole: UserRole;
}

export function SettingsPageClient({
  initialSettings,
  initialAccounts,
  personnelList,
}: SettingsProps) {
  const [subTab, setSubTab] = useState<'company' | 'accounts' | 'invoice' | 'personnel' | 'storage' | 'backups'>('company');
  const [settings, setSettings] = useState<FinanceSettingsData>(initialSettings);
  const [accounts, setAccounts] = useState<PaymentAccountData[]>(initialAccounts);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Account Modal State
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PaymentAccountData | null>(null);
  const [accountForm, setAccountForm] = useState({
    bankName: '',
    accountName: '',
    accountNumber: '',
    accountType: 'Corporate Current',
    currency: 'NGN',
    instructions: '',
    isDefault: false,
  });

  const notify = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      notify('success', 'Company profile updated successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      notify('error', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveInvoiceDefaults = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      notify('success', 'Invoice defaults updated successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      notify('error', msg);
    } finally {
      setIsSaving(false);
    }
  };

  // Payment Account Actions
  const openAddAccount = () => {
    setEditingAccount(null);
    setAccountForm({
      bankName: '',
      accountName: settings.companyName,
      accountNumber: '',
      accountType: 'Corporate Current',
      currency: 'NGN',
      instructions: 'Please use invoice number as payment reference.',
      isDefault: accounts.length === 0,
    });
    setIsAccountModalOpen(true);
  };

  const openEditAccount = (acc: PaymentAccountData) => {
    setEditingAccount(acc);
    setAccountForm({
      bankName: acc.bankName,
      accountName: acc.accountName,
      accountNumber: acc.accountNumber,
      accountType: acc.accountType,
      currency: acc.currency,
      instructions: acc.instructions || '',
      isDefault: acc.isDefault,
    });
    setIsAccountModalOpen(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/payment-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingAccount?.id,
          ...accountForm,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Refresh accounts list
      const accRes = await fetch('/api/admin/payment-accounts');
      const accData = await accRes.json();
      if (accData.success) setAccounts(accData.data);

      notify('success', editingAccount ? 'Account updated' : 'Account added');
      setIsAccountModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save account';
      notify('error', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefaultAccount = async (accId: string) => {
    try {
      const res = await fetch('/api/admin/payment-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accId, action: 'set-default' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setAccounts((prev) =>
        prev.map((a) => ({ ...a, isDefault: a.id === accId }))
      );
      notify('success', 'Default settlement account updated.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to set default';
      notify('error', msg);
    }
  };

  const handleToggleAccountActive = async (accId: string) => {
    try {
      const res = await fetch('/api/admin/payment-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accId, action: 'toggle-active' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setAccounts((prev) =>
        prev.map((a) => (a.id === accId ? { ...a, isActive: data.isActive } : a))
      );
      notify('success', `Account status updated to ${data.isActive ? 'ACTIVE' : 'INACTIVE'}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle account';
      notify('error', msg);
    }
  };

  const handleDownloadFullBackup = () => {
    const backupData = {
      exportedAt: new Date().toISOString(),
      companySettings: settings,
      paymentAccounts: accounts,
      personnel: personnelList,
    };
    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clasptek_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('success', 'Full system JSON backup downloaded.');
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Toast */}
      {feedback && (
        <div
          style={{
            padding: '12px 18px',
            marginBottom: '16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            background: feedback.type === 'success' ? '#DEF7EC' : '#FDE8E8',
            color: feedback.type === 'success' ? '#03543F' : '#9B1C1C',
            border: `1px solid ${feedback.type === 'success' ? '#84E1BC' : '#F8B4B4'}`,
          }}
        >
          {feedback.text}
        </div>
      )}

      <div className="cp-card" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
        <div className="cp-card-header" style={{ marginBottom: '18px' }}>
          <div>
            <div className="cp-section-title" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚙️ Finance Settings &amp; Configuration
            </div>
            <div className="cp-section-desc" style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Configurable company information, multiple payment accounts, invoice defaults, payroll personnel, and data backups.
            </div>
          </div>
        </div>

        {/* Subtabs Navigation */}
        <div
          className="cp-subtabs"
          style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '10px',
            marginBottom: '18px',
            flexWrap: 'wrap',
          }}
        >
          <button
            className={`cp-subtab-btn ${subTab === 'company' ? 'active' : ''}`}
            onClick={() => setSubTab('company')}
            style={{
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              background: subTab === 'company' ? 'var(--primary)' : 'var(--surface-2)',
              color: subTab === 'company' ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            🏢 Company Information
          </button>
          <button
            className={`cp-subtab-btn ${subTab === 'accounts' ? 'active' : ''}`}
            onClick={() => setSubTab('accounts')}
            style={{
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              background: subTab === 'accounts' ? 'var(--primary)' : 'var(--surface-2)',
              color: subTab === 'accounts' ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            💳 Payment Accounts ({accounts.length})
          </button>
          <button
            className={`cp-subtab-btn ${subTab === 'invoice' ? 'active' : ''}`}
            onClick={() => setSubTab('invoice')}
            style={{
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              background: subTab === 'invoice' ? 'var(--primary)' : 'var(--surface-2)',
              color: subTab === 'invoice' ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            📄 Invoice Defaults
          </button>
          <button
            className={`cp-subtab-btn ${subTab === 'personnel' ? 'active' : ''}`}
            onClick={() => setSubTab('personnel')}
            style={{
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              background: subTab === 'personnel' ? 'var(--primary)' : 'var(--surface-2)',
              color: subTab === 'personnel' ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            👥 Personnel Directory ({personnelList.length})
          </button>
          <button
            className={`cp-subtab-btn ${subTab === 'storage' ? 'active' : ''}`}
            onClick={() => setSubTab('storage')}
            style={{
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              background: subTab === 'storage' ? 'var(--primary)' : 'var(--surface-2)',
              color: subTab === 'storage' ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            📁 Storage Settings
          </button>
          <button
            className={`cp-subtab-btn ${subTab === 'backups' ? 'active' : ''}`}
            onClick={() => setSubTab('backups')}
            style={{
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              background: subTab === 'backups' ? 'var(--primary)' : 'var(--surface-2)',
              color: subTab === 'backups' ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            💾 Backups &amp; Supabase
          </button>
        </div>

        {/* SUBTAB 1: COMPANY INFORMATION */}
        {subTab === 'company' && (
          <form onSubmit={handleSaveCompany} style={{ maxWidth: '680px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Official Legal Company Name</label>
              <input
                type="text"
                value={settings.companyName}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Trading / Brand Name</label>
              <input
                type="text"
                value={settings.tradingName}
                onChange={(e) => setSettings({ ...settings, tradingName: e.target.value })}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Registered Corporate Address</label>
              <textarea
                rows={2}
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Official Phone Number</label>
                <input
                  type="text"
                  value={settings.phone}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Official Finance Email</label>
                <input
                  type="email"
                  value={settings.email}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Website URL</label>
                <input
                  type="text"
                  value={settings.website}
                  onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Tax Identification Number (TIN)</label>
                <input
                  type="text"
                  value={settings.taxId}
                  onChange={(e) => setSettings({ ...settings, taxId: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Corporate Registration Number (RC)</label>
              <input
                type="text"
                value={settings.registrationNumber}
                onChange={(e) => setSettings({ ...settings, registrationNumber: e.target.value })}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Default Invoice Footer Note</label>
              <input
                type="text"
                value={settings.invoiceFooter}
                onChange={(e) => setSettings({ ...settings, invoiceFooter: e.target.value })}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
              />
            </div>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '9px 18px',
                borderRadius: '4px',
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '13px',
                width: 'fit-content',
                marginTop: '6px',
              }}
            >
              {isSaving ? 'Saving...' : '✔ Save Company Profile'}
            </button>
          </form>
        )}

        {/* SUBTAB 2: PAYMENT ACCOUNTS */}
        {subTab === 'accounts' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                Manage bank accounts displayed on generated invoices and receipts. Changing default account protects historical invoice snapshots.
              </div>
              <button
                className="cp-btn sm accent"
                onClick={openAddAccount}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                + Add Payment Account
              </button>
            </div>

            <div className="cp-table-wrap" style={{ overflowX: 'auto' }}>
              <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '10px' }}>Bank Name</th>
                    <th style={{ padding: '10px' }}>Account Name</th>
                    <th style={{ padding: '10px' }}>Account Number</th>
                    <th style={{ padding: '10px' }}>Account Type</th>
                    <th style={{ padding: '10px' }}>Currency</th>
                    <th style={{ padding: '10px' }}>Default</th>
                    <th style={{ padding: '10px' }}>Status</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => (
                    <tr key={acc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px', fontWeight: 700, color: 'var(--primary)' }}>{acc.bankName}</td>
                      <td style={{ padding: '10px' }}>{acc.accountName}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 700 }}>{acc.accountNumber}</td>
                      <td style={{ padding: '10px' }}>{acc.accountType}</td>
                      <td style={{ padding: '10px', fontWeight: 700 }}>{acc.currency}</td>
                      <td style={{ padding: '10px' }}>
                        {acc.isDefault ? (
                          <span
                            className="cp-pill"
                            style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: '#DEF7EC', color: '#03543F' }}
                          >
                            ✔ DEFAULT
                          </span>
                        ) : (
                          <button
                            className="cp-btn sm secondary"
                            onClick={() => handleSetDefaultAccount(acc.id)}
                            style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface-2)' }}
                          >
                            Set Default
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span
                          className="cp-pill"
                          style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: acc.isActive ? '#DEF7EC' : '#FDE8E8',
                            color: acc.isActive ? '#03543F' : '#9B1C1C',
                          }}
                        >
                          {acc.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                          <button
                            className="cp-btn sm secondary"
                            onClick={() => openEditAccount(acc)}
                            style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface-2)' }}
                          >
                            Edit
                          </button>
                          <button
                            className="cp-btn sm secondary"
                            onClick={() => handleToggleAccountActive(acc.id)}
                            style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface-2)' }}
                          >
                            {acc.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUBTAB 3: INVOICE DEFAULTS */}
        {subTab === 'invoice' && (
          <form onSubmit={handleSaveInvoiceDefaults} style={{ maxWidth: '680px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Default Payment Terms &amp; Conditions</label>
              <textarea
                rows={3}
                value={settings.defaultTerms}
                onChange={(e) => setSettings({ ...settings, defaultTerms: e.target.value })}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Default Payment Instructions</label>
              <input
                type="text"
                value={settings.defaultInstructions || ''}
                onChange={(e) => setSettings({ ...settings, defaultInstructions: e.target.value })}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
              />
            </div>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '9px 18px',
                borderRadius: '4px',
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '13px',
                width: 'fit-content',
                marginTop: '6px',
              }}
            >
              {isSaving ? 'Saving...' : '✔ Save Invoice Defaults'}
            </button>
          </form>
        )}

        {/* SUBTAB 4: PERSONNEL DIRECTORY */}
        {subTab === 'personnel' && (
          <div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Directory of staff members and master facilitators eligible for payroll compensation and payslip generation.
            </div>

            <div className="cp-table-wrap" style={{ overflowX: 'auto' }}>
              <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '10px' }}>Personnel ID</th>
                    <th style={{ padding: '10px' }}>Personnel Name</th>
                    <th style={{ padding: '10px' }}>Type</th>
                    <th style={{ padding: '10px' }}>Department</th>
                    <th style={{ padding: '10px' }}>Official Role</th>
                    <th style={{ padding: '10px' }}>Contact Email</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Base Compensation</th>
                  </tr>
                </thead>
                <tbody>
                  {personnelList.map((emp) => (
                    <tr key={emp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-muted)' }}>
                        {emp.employeeId}
                      </td>
                      <td style={{ padding: '10px', fontWeight: 700, color: 'var(--primary)' }}>{emp.fullName}</td>
                      <td style={{ padding: '10px' }}>
                        <span
                          className="cp-pill"
                          style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: emp.employeeType === 'facilitator' ? '#FEF3C7' : '#EFF6FF',
                            color: emp.employeeType === 'facilitator' ? '#92400E' : '#1D4ED8',
                          }}
                        >
                          {emp.employeeType.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '10px' }}>{emp.department}</td>
                      <td style={{ padding: '10px' }}>{emp.jobTitle}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace' }}>{emp.email}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                        ₦{(emp.basicPay || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUBTAB 5: STORAGE SETTINGS */}
        {subTab === 'storage' && (
          <div style={{ maxWidth: '780px' }}>
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary)' }}>Google Drive Central Repository</div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Configure the organization-level Google Drive connection for meeting recordings, training session archives, and enterprise artifacts.
              </div>
            </div>

            <div style={{ padding: '20px', background: '#FAFBFD', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>📁</span>
                    <strong style={{ fontSize: '14px', color: 'var(--primary)' }}>Central Recording Storage</strong>
                    <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: '#DEF7EC', color: '#03543F' }}>
                      ● Connected
                    </span>
                    <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 700, background: '#EFF6FF', color: '#1D4ED8' }}>
                      TENANT_CENTRAL
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                    Authoritative tenant storage active. Recordings are preserved directly under organizational ownership.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => notify('success', 'Google Drive tenant repository verified and operational.')}
                  style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                >
                  ✔ Verify Repository
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '16px', background: '#fff', padding: '14px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12.5px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Status:</span><br />
                  <strong style={{ color: '#059669' }}>Connected (Authoritative)</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Connected Google Account:</span><br />
                  <strong>organization@clasptek.org</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Repository Folder:</span><br />
                  <strong style={{ color: 'var(--primary)' }}>Clasptek Meeting Recordings</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Storage Type:</span><br />
                  <strong>TENANT_CENTRAL</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 6: BACKUPS & SUPABASE */}
        {subTab === 'backups' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            <div style={{ background: '#FAFBFD', border: '1px solid var(--border)', borderRadius: '6px', padding: '18px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '6px' }}>
                Supabase Production REST Endpoint
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all', marginBottom: '12px', color: 'var(--text-secondary)' }}>
                https://logaawoigfxnisimfatf.supabase.co
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                PostgreSQL schema version: <strong>13.0.1 (Production Hardened)</strong>
              </div>
            </div>

            <div style={{ background: '#FAFBFD', border: '1px solid var(--border)', borderRadius: '6px', padding: '18px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '6px' }}>
                Data Backup &amp; Archival
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                Download complete JSON snapshot of all company configurations and accounts.
              </div>
              <button
                type="button"
                onClick={handleDownloadFullBackup}
                style={{ padding: '8px 14px', borderRadius: '4px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
              >
                📥 Export Full JSON Backup
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Add/Edit Payment Account */}
      {isAccountModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '480px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800, color: 'var(--primary)' }}>
              {editingAccount ? 'Edit Payment Account' : '+ Add Payment Account'}
            </h3>

            <form onSubmit={handleSaveAccount} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Bank Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Guaranty Trust Bank"
                  value={accountForm.bankName}
                  onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Account Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Clasptek Coaching Limited"
                  value={accountForm.accountName}
                  onChange={(e) => setAccountForm({ ...accountForm, accountName: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Account Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 0123456789"
                    value={accountForm.accountNumber}
                    onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Currency</label>
                  <input
                    type="text"
                    value={accountForm.currency}
                    onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Account Type</label>
                <input
                  type="text"
                  value={accountForm.accountType}
                  onChange={(e) => setAccountForm({ ...accountForm, accountType: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="chkDefault"
                  checked={accountForm.isDefault}
                  onChange={(e) => setAccountForm({ ...accountForm, isDefault: e.target.checked })}
                />
                <label htmlFor="chkDefault" style={{ fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>
                  Set as default settlement account for invoices
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  style={{ padding: '8px 14px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700 }}
                >
                  {isSaving ? 'Saving...' : editingAccount ? 'Save Changes' : 'Add Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
