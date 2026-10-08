'use client';

/**
 * app/people-access/PeopleAccessPageClient.tsx
 * Client Component for People & Access / Staff Management
 * Phase 9B: Administration & Governance Module Migration
 */

import React, { useState, useMemo } from 'react';
import { AdminPersonnel, AdminUser } from '@/lib/admin/personnel-queries';
import { UserRole, USER_ROLES } from '@/types/auth';
import { downloadSafeCsv } from '@/lib/utils/csv';
import { usePagination } from '@/lib/hooks/usePagination';
import { Pagination } from '@/components/tables/Pagination';
import { TableSelectionBar } from '@/components/tables/TableSelectionBar';
import { RecordLifecycleModal } from '@/components/tables/RecordLifecycleModal';
import { SortableHeader } from '@/components/tables/SortableHeader';

interface PeopleAccessProps {
  initialPersonnel: AdminPersonnel[];
  initialUsers: AdminUser[];
  currentUserRole: UserRole;
  currentUserId?: string;
}

export function PeopleAccessPageClient({
  initialPersonnel,
  initialUsers,
  currentUserRole,
  currentUserId,
}: PeopleAccessProps) {
  const [subTab, setSubTab] = useState<'users' | 'personnel' | 'security'>('personnel');
  const [personnelList, setPersonnelList] = useState<AdminPersonnel[]>(initialPersonnel);
  const [userList, setUserList] = useState<AdminUser[]>(initialUsers);

  // Self check
  const isCurrentUser = (uid: string) => Boolean(currentUserId && uid === currentUserId);

  // Selection states
  const [selectedPersonnelIds, setSelectedPersonnelIds] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Filters for Personnel
  const [searchPersonnel, setSearchPersonnel] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'staff' | 'facilitator'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'active' | 'suspended' | 'deactivated'>('ALL');

  // Filters for Users
  const [searchUsers, setSearchUsers] = useState('');
  const [filterUserRole, setFilterUserRole] = useState('ALL');

  // Lifecycle modal state
  const [lifecycleModal, setLifecycleModal] = useState<{
    isOpen: boolean;
    target?: AdminPersonnel;
    actionType: 'DELETE' | 'DEACTIVATE';
    dependencies: Array<{ label: string; count: number }>;
    isBlocked?: boolean;
    blockedMessage?: string;
  }>({
    isOpen: false,
    actionType: 'DELETE',
    dependencies: [],
  });

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addType, setAddType] = useState<'staff' | 'facilitator'>('staff');
  const [editingPersonnel, setEditingPersonnel] = useState<AdminPersonnel | null>(null);
  const [roleModalUser, setRoleModalUser] = useState<AdminUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('Staff');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states for Add/Edit Personnel
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    department: '',
    jobTitle: '',
    bankName: 'GTBank',
    accountName: '',
    accountNumber: '',
    basicPay: 0,
    facilitatorRate: 0,
    compensationType: 'salaried',
    notes: '',
  });

  const isSuperAdmin = currentUserRole === 'Super Admin';
  const canManage = currentUserRole === 'Super Admin' || currentUserRole === 'Finance Manager';

  // KPI Calculations
  const staffCount = personnelList.filter((p) => p.employeeType === 'staff' && p.employmentStatus !== 'deactivated').length;
  const facCount = personnelList.filter((p) => p.employeeType === 'facilitator' && p.employmentStatus !== 'deactivated').length;
  const activeUsersCount = userList.filter((u) => u.status === 'active').length;
  const deactCount = personnelList.filter((p) => p.employmentStatus === 'deactivated').length;

  // Filtered Personnel
  const filteredPersonnel = useMemo(() => {
    return personnelList.filter((p) => {
      if (filterType !== 'ALL' && p.employeeType !== filterType) return false;
      if (filterStatus !== 'ALL' && p.employmentStatus !== filterStatus) return false;
      if (searchPersonnel.trim()) {
        const query = searchPersonnel.toLowerCase();
        const matchName = p.fullName.toLowerCase().includes(query);
        const matchEmail = p.email.toLowerCase().includes(query);
        const matchId = (p.employeeId || '').toLowerCase().includes(query);
        const matchDept = (p.department || '').toLowerCase().includes(query);
        const matchTitle = (p.jobTitle || '').toLowerCase().includes(query);
        if (!matchName && !matchEmail && !matchId && !matchDept && !matchTitle) return false;
      }
      return true;
    });
  }, [personnelList, filterType, filterStatus, searchPersonnel]);

  // Personnel Table sorting state
  const [personnelSortField, setPersonnelSortField] = useState<string>('employeeId');
  const [personnelSortOrder, setPersonnelSortOrder] = useState<'asc' | 'desc'>('asc');

  const handlePersonnelSort = (field: string) => {
    setPersonnelSortOrder((prev) => (personnelSortField === field ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
    setPersonnelSortField(field);
  };

  const sortedPersonnel = useMemo(() => {
    const list = [...filteredPersonnel];
    list.sort((a, b) => {
      let cmp = 0;
      if (personnelSortField === 'employeeId') {
        cmp = (a.employeeId || '').localeCompare(b.employeeId || '');
      } else if (personnelSortField === 'fullName') {
        cmp = (a.fullName || '').localeCompare(b.fullName || '');
      } else if (personnelSortField === 'employeeType') {
        cmp = (a.employeeType || '').localeCompare(b.employeeType || '');
      } else if (personnelSortField === 'department') {
        cmp = (a.department || '').localeCompare(b.department || '');
      } else if (personnelSortField === 'jobTitle') {
        cmp = (a.jobTitle || '').localeCompare(b.jobTitle || '');
      } else if (personnelSortField === 'basicPay') {
        const payA = a.employeeType === 'facilitator' ? (a.facilitatorRate || 0) : (a.basicPay || 0);
        const payB = b.employeeType === 'facilitator' ? (b.facilitatorRate || 0) : (b.basicPay || 0);
        cmp = payA - payB;
      } else if (personnelSortField === 'employmentStatus') {
        cmp = (a.employmentStatus || '').localeCompare(b.employmentStatus || '');
      } else {
        cmp = (a.employeeId || '').localeCompare(b.employeeId || '');
      }
      if (cmp !== 0) {
        return personnelSortOrder === 'asc' ? cmp : -cmp;
      }
      return (b.id || '').localeCompare(a.id || '');
    });
    return list;
  }, [filteredPersonnel, personnelSortField, personnelSortOrder]);

  const {
    currentPage: personnelPage,
    pageSize: personnelPageSize,
    paginatedItems: paginatedPersonnel,
    setPage: setPersonnelPage,
    setPageSize: setPersonnelPageSize,
  } = usePagination(sortedPersonnel, {
    initialPageSize: 25,
    resetDeps: [filterType, filterStatus, searchPersonnel, personnelSortField, personnelSortOrder],
  });

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return userList.filter((u) => {
      if (filterUserRole !== 'ALL' && u.role !== filterUserRole) return false;
      if (searchUsers.trim()) {
        const q = searchUsers.toLowerCase();
        const matchName = (u.name || '').toLowerCase().includes(q);
        const matchEmail = (u.email || '').toLowerCase().includes(q);
        const matchPersonnel = (u.personnelName || '').toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchPersonnel) return false;
      }
      return true;
    });
  }, [userList, searchUsers, filterUserRole]);

  const {
    currentPage: usersPage,
    pageSize: usersPageSize,
    paginatedItems: paginatedUsers,
    setPage: setUsersPage,
    setPageSize: setUsersPageSize,
  } = usePagination(filteredUsers, {
    initialPageSize: 25,
    resetDeps: [userList, searchUsers, filterUserRole],
  });

  // Personnel Selection
  const visiblePersonnelIds = useMemo(() => paginatedPersonnel.map((p) => p.id), [paginatedPersonnel]);
  const isAllPersonnelSelected = useMemo(
    () => visiblePersonnelIds.length > 0 && visiblePersonnelIds.every((id) => selectedPersonnelIds.has(id)),
    [visiblePersonnelIds, selectedPersonnelIds]
  );
  const isPersonnelIndeterminate = useMemo(() => {
    const count = visiblePersonnelIds.filter((id) => selectedPersonnelIds.has(id)).length;
    return count > 0 && count < visiblePersonnelIds.length;
  }, [visiblePersonnelIds, selectedPersonnelIds]);

  const handleToggleSelectPersonnel = (id: string) => {
    setSelectedPersonnelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllPersonnel = () => {
    if (isAllPersonnelSelected) {
      setSelectedPersonnelIds((prev) => {
        const next = new Set(prev);
        visiblePersonnelIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedPersonnelIds((prev) => {
        const next = new Set(prev);
        visiblePersonnelIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const handleClearPersonnelSelection = () => {
    setSelectedPersonnelIds(new Set());
  };

  const handleBulkDeactivatePersonnel = async (newStatus: 'active' | 'deactivated') => {
    if (selectedPersonnelIds.size === 0) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/personnel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedPersonnelIds),
          employmentStatus: newStatus,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      setPersonnelList((prev) =>
        prev.map((item) => (selectedPersonnelIds.has(item.id) ? { ...item, employmentStatus: newStatus } : item))
      );
      notify('success', `Updated ${selectedPersonnelIds.size} personnel record(s) to ${newStatus}`);
      handleClearPersonnelSelection();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Bulk status update failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Users Selection
  const visibleUserIds = useMemo(() => paginatedUsers.map((u) => u.id), [paginatedUsers]);
  const isAllUsersSelected = useMemo(
    () => visibleUserIds.length > 0 && visibleUserIds.every((id) => selectedUserIds.has(id)),
    [visibleUserIds, selectedUserIds]
  );
  const isUsersIndeterminate = useMemo(() => {
    const count = visibleUserIds.filter((id) => selectedUserIds.has(id)).length;
    return count > 0 && count < visibleUserIds.length;
  }, [visibleUserIds, selectedUserIds]);

  const handleToggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllUsers = () => {
    if (isAllUsersSelected) {
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        visibleUserIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        visibleUserIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const handleClearUserSelection = () => {
    setSelectedUserIds(new Set());
  };

  // Notifications
  const notify = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  // CSV Exports using certified formula injection defense
  const handleExportUsers = (selectedOnly: boolean = false) => {
    const headers = ['User Name', 'Work Email', 'Assigned Role', 'Account Status', 'Last Login', 'Created At'];
    const sourceList = selectedOnly
      ? filteredUsers.filter((u) => selectedUserIds.has(u.id))
      : filteredUsers;

    const rows = sourceList.map((u) => [
      u.name,
      u.email,
      u.role,
      u.status.toUpperCase(),
      u.lastLoginAt ? u.lastLoginAt.slice(0, 10) : 'Never',
      u.createdAt ? u.createdAt.slice(0, 10) : '',
    ]);
    downloadSafeCsv('User_Accounts', headers, rows);
  };

  const handleExportPersonnel = (selectedOnly: boolean = false) => {
    const headers = [
      'Employee ID',
      'Full Name',
      'Email',
      'Phone',
      'Type',
      'Department',
      'Job Title',
      'Status',
      'Bank',
      'Account Number',
      'Base Compensation',
    ];
    const sourceList = selectedOnly
      ? filteredPersonnel.filter((p) => selectedPersonnelIds.has(p.id))
      : filteredPersonnel;

    const rows = sourceList.map((p) => [
      p.employeeId,
      p.fullName,
      p.email,
      p.phone || '',
      p.employeeType.toUpperCase(),
      p.department,
      p.jobTitle,
      p.employmentStatus.toUpperCase(),
      p.bankName || '',
      p.accountNumber || '',
      p.employeeType === 'facilitator' ? p.facilitatorRate || 0 : p.basicPay || 0,
    ]);
    const exportPrefix = filterType === 'staff' ? 'Staff_Directory' : filterType === 'facilitator' ? 'Facilitator_Directory' : 'Personnel_Directory';
    downloadSafeCsv(exportPrefix, headers, rows);
  };

  // Personnel Handlers
  const openAddModal = (type: 'staff' | 'facilitator') => {
    setAddType(type);
    setFormData({
      fullName: '',
      email: '',
      phone: '',
      department: type === 'facilitator' ? 'Facilitation & Training' : 'Administration',
      jobTitle: type === 'facilitator' ? 'Master Facilitator' : 'Operations Officer',
      bankName: 'GTBank',
      accountName: '',
      accountNumber: '',
      basicPay: type === 'facilitator' ? 0 : 250000,
      facilitatorRate: type === 'facilitator' ? 50000 : 0,
      compensationType: type === 'facilitator' ? 'per_session' : 'salaried',
      notes: '',
    });
    setEditingPersonnel(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (p: AdminPersonnel) => {
    setEditingPersonnel(p);
    setAddType(p.employeeType);
    setFormData({
      fullName: p.fullName,
      email: p.email,
      phone: p.phone || '',
      department: p.department,
      jobTitle: p.jobTitle,
      bankName: p.bankName || 'GTBank',
      accountName: p.accountName || p.fullName,
      accountNumber: p.accountNumber || '',
      basicPay: p.basicPay || 0,
      facilitatorRate: p.facilitatorRate || 0,
      compensationType: p.compensationType || 'salaried',
      notes: p.notes || '',
    });
    setIsAddModalOpen(true);
  };

  const handleSavePersonnel = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingPersonnel) {
        // Edit existing
        const res = await fetch('/api/admin/personnel', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingPersonnel.id,
            ...formData,
          }),
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.error);

        setPersonnelList((prev) =>
          prev.map((item) =>
            item.id === editingPersonnel.id
              ? {
                  ...item,
                  ...formData,
                  basicPay: Number(formData.basicPay),
                  facilitatorRate: Number(formData.facilitatorRate),
                }
              : item
          )
        );
        notify('success', `Updated personnel ${editingPersonnel.employeeId}`);
      } else {
        // Create new
        const res = await fetch('/api/admin/personnel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            employeeType: addType,
          }),
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.error);

        setPersonnelList((prev) => [result.data, ...prev]);
        notify('success', `Successfully created ${addType} with ID ${result.data.employeeId}`);
      }
      setIsAddModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operation failed';
      notify('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTogglePersonnelStatus = async (p: AdminPersonnel, newStatus: 'active' | 'deactivated') => {
    try {
      const res = await fetch('/api/admin/personnel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, employmentStatus: newStatus }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      setPersonnelList((prev) =>
        prev.map((item) => (item.id === p.id ? { ...item, employmentStatus: newStatus } : item))
      );
      notify('success', `${p.fullName} status updated to ${newStatus}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      notify('error', msg);
    }
  };

  const handleOpenDeletePersonnel = async (p: AdminPersonnel) => {
    try {
      const res = await fetch(`/api/admin/personnel?action=check-dependencies&id=${encodeURIComponent(p.id)}`);
      const data = await res.json();
      const payslips = data.payslipCount || 0;
      const reports = data.reportCount || 0;
      const hasDeps = payslips > 0 || reports > 0;

      setLifecycleModal({
        isOpen: true,
        target: p,
        actionType: 'DELETE',
        dependencies: [
          { label: 'Historical Payslips', count: payslips },
          { label: 'Facilitator Delivery Reports', count: reports },
        ],
        isBlocked: hasDeps,
        blockedMessage: hasDeps
          ? `Cannot permanently delete personnel: ${payslips > 0 ? `${payslips} payslip(s) ` : ''}${reports > 0 ? `${reports} facilitator report(s) ` : ''}exist in tenant records. Under financial and academic governance regulations, records with transaction history cannot be deleted. Deactivate this profile instead.`
          : undefined,
      });
    } catch {
      setLifecycleModal({
        isOpen: true,
        target: p,
        actionType: 'DELETE',
        dependencies: [],
      });
    }
  };

  const handleConfirmDeletePersonnel = async () => {
    if (!lifecycleModal.target) return;
    try {
      const res = await fetch(`/api/admin/personnel?id=${encodeURIComponent(lifecycleModal.target.id)}`, {
        method: 'DELETE',
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      setPersonnelList((prev) => prev.filter((item) => item.id !== lifecycleModal.target?.id));
      notify('success', `Personnel ${lifecycleModal.target.employeeId} permanently removed.`);
      setLifecycleModal({ isOpen: false, actionType: 'DELETE', dependencies: [] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      notify('error', msg);
    }
  };

  // User Actions
  const handleCreateLogin = async (p: AdminPersonnel) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'provision-invite',
          personnelId: p.id,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      const inviteLink = `${window.location.origin}/login?invite=${result.inviteToken}`;
      navigator.clipboard?.writeText(inviteLink);
      alert(`Login invitation generated for ${p.fullName} (${p.email})!\n\nInvitation Link:\n${inviteLink}\n\n(Copied to clipboard)`);

      // Refresh users list
      const uRes = await fetch('/api/admin/users');
      const uData = await uRes.json();
      if (uData.success) setUserList(uData.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create login';
      notify('error', msg);
    }
  };

  const handleChangeRoleSubmit = async () => {
    if (!roleModalUser) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change-role',
          userId: roleModalUser.id,
          role: selectedRole,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      setUserList((prev) =>
        prev.map((u) => (u.id === roleModalUser.id ? { ...u, role: selectedRole } : u))
      );
      notify('success', `Role for ${roleModalUser.name} updated to ${selectedRole}`);
      setRoleModalUser(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change role';
      notify('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleUserSuspend = async (u: AdminUser) => {
    const nextStatus = u.status === 'suspended' ? 'active' : 'suspended';
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle-status',
          userId: u.id,
          status: nextStatus,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      setUserList((prev) =>
        prev.map((item) => (item.id === u.id ? { ...item, status: nextStatus } : item))
      );
      notify('success', `User ${u.name} set to ${nextStatus}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update user status';
      notify('error', msg);
    }
  };

  const handleRevokeSession = async (u: AdminUser) => {
    if (!confirm(`Revoke all active portal sessions for ${u.name} (${u.email})?`)) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revoke-sessions',
          userId: u.id,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      notify('success', `All active sessions revoked for ${u.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke sessions';
      notify('error', msg);
    }
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Feedback Toast */}
      {feedbackMsg && (
        <div
          style={{
            padding: '12px 18px',
            marginBottom: '16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            background: feedbackMsg.type === 'success' ? '#DEF7EC' : '#FDE8E8',
            color: feedbackMsg.type === 'success' ? '#03543F' : '#9B1C1C',
            border: `1px solid ${feedbackMsg.type === 'success' ? '#84E1BC' : '#F8B4B4'}`,
          }}
        >
          {feedbackMsg.text}
        </div>
      )}

      {/* Top KPI Grid */}
      <div
        className="cp-kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        <div className="cp-kpi-card" style={{ padding: '14px 18px', background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <div className="cp-kpi-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
            Active Staff
          </div>
          <div className="cp-kpi-val" style={{ fontSize: '24px', fontWeight: 800, color: 'var(--primary)', margin: '4px 0' }}>
            {staffCount}
          </div>
          <div className="cp-kpi-sub" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            Salaried Employees
          </div>
        </div>

        <div className="cp-kpi-card" style={{ padding: '14px 18px', background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <div className="cp-kpi-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
            Active Facilitators
          </div>
          <div className="cp-kpi-val" style={{ fontSize: '24px', fontWeight: 800, color: '#0284C7', margin: '4px 0' }}>
            {facCount}
          </div>
          <div className="cp-kpi-sub" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            Master Instructors
          </div>
        </div>

        <div className="cp-kpi-card" style={{ padding: '14px 18px', background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <div className="cp-kpi-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
            Portal Login Accounts
          </div>
          <div className="cp-kpi-val" style={{ fontSize: '24px', fontWeight: 800, color: '#059669', margin: '4px 0' }}>
            {activeUsersCount}
          </div>
          <div className="cp-kpi-sub" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            Active Credentials
          </div>
        </div>

        <div className="cp-kpi-card" style={{ padding: '14px 18px', background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <div className="cp-kpi-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
            Deactivated Records
          </div>
          <div className="cp-kpi-val" style={{ fontSize: '24px', fontWeight: 800, color: '#64748B', margin: '4px 0' }}>
            {deactCount}
          </div>
          <div className="cp-kpi-sub" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            Preserved Historical Data
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="cp-card" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
        <div className="cp-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div className="cp-section-title" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🛡️ People &amp; Access / Staff Management
            </div>
            <div className="cp-section-desc" style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Manage personnel directories, employee self-service portals, role governance, and non-destructive offboarding.
            </div>
          </div>

          {canManage && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="cp-btn sm primary"
                onClick={() => openAddModal('staff')}
                style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '12.5px' }}
              >
                + Add Staff
              </button>
              <button
                className="cp-btn sm accent"
                onClick={() => openAddModal('facilitator')}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '12.5px' }}
              >
                + Add Facilitator
              </button>
            </div>
          )}
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
          }}
        >
          <button
            className={`cp-subtab-btn ${subTab === 'users' ? 'active' : ''}`}
            onClick={() => setSubTab('users')}
            style={{
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              background: subTab === 'users' ? 'var(--primary)' : 'var(--surface-2)',
              color: subTab === 'users' ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            🔑 Users ({userList.length})
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
            👥 Personnel ({personnelList.length})
          </button>
          <button
            className={`cp-subtab-btn ${subTab === 'security' ? 'active' : ''}`}
            onClick={() => setSubTab('security')}
            style={{
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              background: subTab === 'security' ? 'var(--primary)' : 'var(--surface-2)',
              color: subTab === 'security' ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            🛡️ Access &amp; Security
          </button>
        </div>

        {/* SUBTAB 1: USERS */}
        {subTab === 'users' && (
          <div>
            {/* User Controls and Filters */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', flex: 1, minWidth: '280px' }}>
                <input
                  type="text"
                  placeholder="Search user by name, email, personnel..."
                  value={searchUsers}
                  onChange={(e) => setSearchUsers(e.target.value)}
                  style={{ minWidth: '220px', flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12.5px' }}
                />
                <select
                  value={filterUserRole}
                  onChange={(e) => setFilterUserRole(e.target.value)}
                  style={{ minWidth: '140px', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12.5px' }}
                >
                  <option value="ALL">All Roles ({userList.length})</option>
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="cp-btn sm secondary"
                onClick={() => handleExportUsers(false)}
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                📥 Export Users CSV
              </button>
            </div>

            {/* Users Selection Bar */}
            {selectedUserIds.size > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <TableSelectionBar
                  selectedCount={selectedUserIds.size}
                  totalVisibleCount={visibleUserIds.length}
                  entityLabel="users"
                  onClearSelection={handleClearUserSelection}
                  onSelectAllVisible={handleToggleSelectAllUsers}
                  isAllSelected={isAllUsersSelected}
                >
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={() => handleExportUsers(true)}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    📥 Export Selected Users
                  </button>
                </TableSelectionBar>
              </div>
            )}

            <div className="cp-table-wrap" style={{ overflowX: 'auto' }}>
              <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ width: '40px', padding: '10px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        aria-label="Select all visible users"
                        checked={isAllUsersSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = isUsersIndeterminate;
                        }}
                        onChange={handleToggleSelectAllUsers}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </th>
                    <th style={{ padding: '10px' }}>User Name</th>
                    <th style={{ padding: '10px' }}>Official Work Email</th>
                    <th style={{ padding: '10px' }}>Assigned Role</th>
                    <th style={{ padding: '10px' }}>Account Status</th>
                    <th className="cp-col-secondary" style={{ padding: '10px' }}>Last Login</th>
                    <th className="cp-col-tertiary" style={{ padding: '10px' }}>Personnel Link</th>
                    {isSuperAdmin && <th style={{ padding: '10px', textAlign: 'center' }}>Governance Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={isSuperAdmin ? 8 : 7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        No user accounts match current search criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedUsers.map((u) => {
                      const isDeact = u.status === 'deactivated';
                      const isSusp = u.status === 'suspended';
                      const isSelected = selectedUserIds.has(u.id);
                      return (
                        <tr
                          key={u.id}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            opacity: isDeact ? 0.6 : 1,
                            backgroundColor: isSelected ? 'var(--surface-selected, #eff6ff)' : undefined,
                          }}
                        >
                          <td style={{ width: '40px', padding: '10px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              aria-label={`Select user ${u.name}`}
                              checked={isSelected}
                              onChange={() => handleToggleSelectUser(u.id)}
                              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                          </td>
                          <td style={{ padding: '10px', fontWeight: 700, color: 'var(--primary)' }}>{u.name}</td>
                        <td style={{ padding: '10px', fontFamily: 'monospace' }}>{u.email}</td>
                        <td style={{ padding: '10px' }}>
                          <span
                            className="cp-pill"
                            style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: u.role === 'Super Admin' ? '#EDE9FE' : '#EFF6FF',
                              color: u.role === 'Super Admin' ? '#6D28D9' : '#1D4ED8',
                            }}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span
                            className="cp-pill"
                            style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: u.status === 'active' ? '#DEF7EC' : '#FDE8E8',
                              color: u.status === 'active' ? '#03543F' : '#9B1C1C',
                            }}
                          >
                            {u.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="cp-col-secondary" style={{ padding: '10px', color: 'var(--text-secondary)', fontSize: '11.5px' }}>
                          {u.lastLoginAt ? u.lastLoginAt.slice(0, 10) : 'Never'}
                        </td>
                        <td className="cp-col-tertiary" style={{ padding: '10px', fontSize: '11.5px' }}>
                          {u.personnelName ? (
                            <span>{u.personnelName} ({u.personnelEmployeeId || 'EMP'})</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Standalone Admin</span>
                          )}
                        </td>
                        {isSuperAdmin && (
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', flexWrap: 'wrap' }}>
                              <button
                                className="cp-btn sm secondary"
                                onClick={() => {
                                  setRoleModalUser(u);
                                  setSelectedRole(u.role);
                                }}
                                style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface-2)' }}
                              >
                                Role
                              </button>
                              <button
                                className="cp-btn sm secondary"
                                disabled={isCurrentUser(u.id)}
                                title={isCurrentUser(u.id) ? 'Cannot suspend own account' : undefined}
                                onClick={() => handleToggleUserSuspend(u)}
                                style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: isCurrentUser(u.id) ? 'not-allowed' : 'pointer', border: '1px solid var(--border)', background: isSusp ? '#DEF7EC' : 'var(--surface-2)', opacity: isCurrentUser(u.id) ? 0.5 : 1 }}
                              >
                                {isSusp ? 'Unsuspend' : 'Suspend'}
                              </button>
                              <button
                                className="cp-btn sm secondary"
                                onClick={() => handleRevokeSession(u)}
                                style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface-2)' }}
                              >
                                🔒 Revoke
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>

            {/* Standard Users Pagination */}
            <Pagination
              currentPage={usersPage}
              pageSize={usersPageSize}
              totalRecords={userList.length}
              onPageChange={setUsersPage}
              onPageSizeChange={setUsersPageSize}
              entityLabel="users"
            />
          </div>
        )}

        {/* SUBTAB 2: PERSONNEL */}
        {subTab === 'personnel' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                Directory of all Clasptek staff members and facilitators. Deactivating an employee suspends login while preserving all past payslips and financial records.
              </div>
              <button
                className="cp-btn sm secondary"
                onClick={() => handleExportPersonnel(false)}
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                📥 Export Personnel CSV
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <input
                  type="text"
                  placeholder="Search by name, email, employee ID, role..."
                  value={searchPersonnel}
                  onChange={(e) => setSearchPersonnel(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12.5px' }}
                />
              </div>
              <div style={{ minWidth: '140px' }}>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as 'ALL' | 'staff' | 'facilitator')}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12.5px' }}
                >
                  <option value="ALL">All Types ({personnelList.length})</option>
                  <option value="staff">Staff Only ({personnelList.filter((p) => p.employeeType === 'staff').length})</option>
                  <option value="facilitator">Facilitators Only ({personnelList.filter((p) => p.employeeType === 'facilitator').length})</option>
                </select>
              </div>
              <div style={{ minWidth: '140px' }}>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as 'ALL' | 'active' | 'suspended' | 'deactivated')}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12.5px' }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="deactivated">Deactivated</option>
                </select>
              </div>
            </div>

            {/* Personnel Selection Bar */}
            {selectedPersonnelIds.size > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <TableSelectionBar
                  selectedCount={selectedPersonnelIds.size}
                  totalVisibleCount={visiblePersonnelIds.length}
                  entityLabel="personnel"
                  onClearSelection={handleClearPersonnelSelection}
                  onSelectAllVisible={handleToggleSelectAllPersonnel}
                  isAllSelected={isAllPersonnelSelected}
                >
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={() => handleBulkDeactivatePersonnel('deactivated')}
                    style={{ fontSize: '12px', padding: '4px 10px', color: '#DC2626' }}
                  >
                    🛑 Deactivate Selected
                  </button>
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={() => handleBulkDeactivatePersonnel('active')}
                    style={{ fontSize: '12px', padding: '4px 10px', color: '#059669' }}
                  >
                    ✔ Activate Selected
                  </button>
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={() => handleExportPersonnel(true)}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    📥 Export Selected
                  </button>
                </TableSelectionBar>
              </div>
            )}

            {/* Personnel Table (Desktop & Tablet) */}
            <div className="cp-table-wrap cp-table-desktop" style={{ overflowX: 'auto' }}>
              <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ width: '40px', padding: '10px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        aria-label="Select all visible personnel"
                        checked={isAllPersonnelSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = isPersonnelIndeterminate;
                        }}
                        onChange={handleToggleSelectAllPersonnel}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </th>
                    <SortableHeader
                      label="Personnel ID"
                      field="employeeId"
                      currentSort={personnelSortField}
                      currentOrder={personnelSortOrder}
                      onSort={handlePersonnelSort}
                    />
                    <SortableHeader
                      label="Full Name & Contact"
                      field="fullName"
                      currentSort={personnelSortField}
                      currentOrder={personnelSortOrder}
                      onSort={handlePersonnelSort}
                    />
                    <SortableHeader
                      label="Type"
                      field="employeeType"
                      currentSort={personnelSortField}
                      currentOrder={personnelSortOrder}
                      onSort={handlePersonnelSort}
                    />
                    <SortableHeader
                      label="Department / Subject"
                      field="department"
                      currentSort={personnelSortField}
                      currentOrder={personnelSortOrder}
                      onSort={handlePersonnelSort}
                      className="cp-col-tertiary"
                    />
                    <SortableHeader
                      label="Role / Designation"
                      field="jobTitle"
                      currentSort={personnelSortField}
                      currentOrder={personnelSortOrder}
                      onSort={handlePersonnelSort}
                    />
                    <th className="cp-col-secondary" style={{ padding: '10px' }}>Bank &amp; Account #</th>
                    <SortableHeader
                      label="Base / Fee"
                      field="basicPay"
                      currentSort={personnelSortField}
                      currentOrder={personnelSortOrder}
                      onSort={handlePersonnelSort}
                      align="right"
                      className="cp-col-secondary"
                    />
                    <SortableHeader
                      label="Status"
                      field="employmentStatus"
                      currentSort={personnelSortField}
                      currentOrder={personnelSortOrder}
                      onSort={handlePersonnelSort}
                    />
                    {canManage && <th style={{ padding: '10px', textAlign: 'center' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredPersonnel.length === 0 ? (
                    <tr>
                      <td colSpan={canManage ? 10 : 9} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        No personnel records matching the current filter.
                      </td>
                    </tr>
                  ) : (
                    paginatedPersonnel.map((p) => {
                      const isDeact = p.employmentStatus === 'deactivated';
                      const isSelected = selectedPersonnelIds.has(p.id);
                      return (
                        <tr
                          key={p.id}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            opacity: isDeact ? 0.6 : 1,
                            backgroundColor: isSelected ? 'var(--surface-selected, #eff6ff)' : undefined,
                          }}
                        >
                          <td style={{ width: '40px', padding: '10px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              aria-label={`Select personnel ${p.fullName}`}
                              checked={isSelected}
                              onChange={() => handleToggleSelectPersonnel(p.id)}
                              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                          </td>
                          <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                            {p.employeeId}
                          </td>
                          <td style={{ padding: '10px' }}>
                            <strong>{p.fullName}</strong>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              {p.email} {p.phone ? `· ${p.phone}` : ''}
                            </div>
                          </td>
                          <td style={{ padding: '10px' }}>
                            <span
                              className="cp-pill"
                              style={{
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: p.employeeType === 'facilitator' ? '#FEF3C7' : '#EFF6FF',
                                color: p.employeeType === 'facilitator' ? '#92400E' : '#1D4ED8',
                              }}
                            >
                              {p.employeeType.toUpperCase()}
                            </span>
                          </td>
                          <td className="cp-col-tertiary" style={{ padding: '10px' }}>{p.department}</td>
                          <td style={{ padding: '10px' }}>{p.jobTitle}</td>
                          <td className="cp-col-secondary" style={{ padding: '10px', fontSize: '11.5px' }}>
                            <div style={{ fontWeight: 600 }}>{p.bankName || 'GTBank'}</div>
                            <div style={{ color: 'var(--text-secondary)' }}>{p.accountNumber || '—'}</div>
                          </td>
                          <td className="cp-col-secondary" style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                            {p.employeeType === 'facilitator'
                              ? `₦${(p.facilitatorRate || 0).toLocaleString()}/session`
                              : `₦${(p.basicPay || 0).toLocaleString()}`}
                          </td>
                          <td style={{ padding: '10px' }}>
                            <span
                              className="cp-pill"
                              style={{
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: p.employmentStatus === 'active' ? '#DEF7EC' : '#FDE8E8',
                                color: p.employmentStatus === 'active' ? '#03543F' : '#9B1C1C',
                              }}
                            >
                              {p.employmentStatus.toUpperCase()}
                            </span>
                          </td>
                          {canManage && (
                            <td style={{ padding: '10px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                <button
                                  className="cp-btn sm secondary"
                                  onClick={() => openEditModal(p)}
                                  style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface-2)' }}
                                >
                                  Edit
                                </button>
                                {!p.userId && (
                                  <button
                                    className="cp-btn sm accent"
                                    onClick={() => handleCreateLogin(p)}
                                    style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer', border: 'none', background: 'var(--accent)', color: '#fff' }}
                                  >
                                    Create Login
                                  </button>
                                )}
                                {isDeact ? (
                                  <button
                                    className="cp-btn sm success"
                                    onClick={() => handleTogglePersonnelStatus(p, 'active')}
                                    style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer', border: 'none', background: '#059669', color: '#fff' }}
                                  >
                                    Reactivate
                                  </button>
                                ) : (
                                  <button
                                    className="cp-btn sm danger"
                                    onClick={() => handleTogglePersonnelStatus(p, 'deactivated')}
                                    style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer', border: 'none', background: '#DC2626', color: '#fff' }}
                                  >
                                    Deactivate
                                  </button>
                                )}
                                <button
                                  className="cp-btn sm danger"
                                  onClick={() => handleOpenDeletePersonnel(p)}
                                  style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer', border: '1px solid #DC2626', background: 'none', color: '#DC2626' }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Personnel Mobile Cards */}
            <div className="cp-cards-mobile">
              {paginatedPersonnel.map((p) => {
                const isDeact = p.employmentStatus === 'deactivated';
                return (
                  <div key={p.id} className="cp-mobile-record-card">
                    <div className="cp-mobile-record-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          aria-label={`Select personnel ${p.fullName}`}
                          checked={selectedPersonnelIds.has(p.id)}
                          onChange={() => handleToggleSelectPersonnel(p.id)}
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                            {p.fullName}
                          </div>
                          <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--primary)', fontWeight: 700 }}>
                            {p.employeeId} &middot; {p.jobTitle}
                          </div>
                        </div>
                      </div>
                      <span
                        className="cp-pill"
                        style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: 700,
                          background: p.employmentStatus === 'active' ? '#DEF7EC' : '#FDE8E8',
                          color: p.employmentStatus === 'active' ? '#03543F' : '#9B1C1C',
                        }}
                      >
                        {p.employmentStatus.toUpperCase()}
                      </span>
                    </div>

                    <div className="cp-mobile-record-grid">
                      <div className="cp-mobile-record-field">
                        <span className="cp-mobile-record-label">Type &amp; Dept</span>
                        <span className="cp-mobile-record-value">{p.employeeType.toUpperCase()} &middot; {p.department}</span>
                      </div>
                      <div className="cp-mobile-record-field">
                        <span className="cp-mobile-record-label">Compensation</span>
                        <span className="cp-mobile-record-value" style={{ fontWeight: 700, color: 'var(--primary)' }}>
                          {p.employeeType === 'facilitator'
                            ? `₦${(p.facilitatorRate || 0).toLocaleString()}/sess`
                            : `₦${(p.basicPay || 0).toLocaleString()}`}
                        </span>
                      </div>
                      <div className="cp-mobile-record-field" style={{ gridColumn: 'span 2' }}>
                        <span className="cp-mobile-record-label">Contact</span>
                        <span className="cp-mobile-record-value" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                          {p.email} {p.phone ? `· ${p.phone}` : ''}
                        </span>
                      </div>
                    </div>

                    {canManage && (
                      <div className="cp-mobile-record-actions">
                        <button
                          type="button"
                          className="cp-btn sm secondary"
                          onClick={() => openEditModal(p)}
                          style={{ flex: 1, justifyContent: 'center' }}
                        >
                          Edit Profile
                        </button>
                        {!p.userId && (
                          <button
                            type="button"
                            className="cp-btn sm accent"
                            onClick={() => handleCreateLogin(p)}
                            style={{ flex: 1, justifyContent: 'center' }}
                          >
                            Create Login
                          </button>
                        )}
                        <button
                          type="button"
                          className={`cp-btn sm ${isDeact ? 'success' : 'danger'}`}
                          onClick={() => handleTogglePersonnelStatus(p, isDeact ? 'active' : 'deactivated')}
                          style={{ flex: 1, justifyContent: 'center' }}
                        >
                          {isDeact ? 'Reactivate' : 'Deactivate'}
                        </button>
                        <button
                          type="button"
                          className="cp-btn sm danger"
                          onClick={() => handleOpenDeletePersonnel(p)}
                          style={{ flex: 1, justifyContent: 'center' }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Standard Personnel Pagination */}
            <Pagination
              currentPage={personnelPage}
              pageSize={personnelPageSize}
              totalRecords={filteredPersonnel.length}
              onPageChange={setPersonnelPage}
              onPageSizeChange={setPersonnelPageSize}
              entityLabel="personnel"
            />
          </div>
        )}

        {/* SUBTAB 3: ACCESS & SECURITY */}
        {subTab === 'security' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            <div style={{ background: '#FAFBFD', border: '1px solid var(--border)', borderRadius: '6px', padding: '18px' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary)', marginBottom: '10px' }}>
                Authoritative 5-Tier Role-Based Permissions Matrix
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                <div>• <strong>Super Admin:</strong> Full Governance, User/Role Management, Settings, Period Locking, All Audits.</div>
                <div>• <strong>Finance Manager:</strong> Financial Approvals, Payroll Disbursement, Budgets, Invoices, Reconciliation.</div>
                <div>• <strong>Finance Staff:</strong> Invoicing, Payment Collection, Operational Expenses, Payroll Preparation.</div>
                <div>• <strong>Staff:</strong> My Workspace, Self Profile, Own Payslips &amp; Queries (Strict Data Isolation).</div>
                <div>• <strong>Facilitator:</strong> Facilitator Workspace, Self Profile, Own Payslips (Strict Data Isolation).</div>
              </div>
            </div>

            <div style={{ background: '#FAFBFD', border: '1px solid var(--border)', borderRadius: '6px', padding: '18px' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary)', marginBottom: '10px' }}>
                Active Session &amp; Credential Governance
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                <div>• <strong>Mandatory Authentication:</strong> Unauthenticated users are strictly barred from all internal routes.</div>
                <div>• <strong>Session Revocation:</strong> Administrators can immediately invalidate any user session across devices.</div>
                <div>• <strong>Zero Plaintext Storage:</strong> Passwords and hashes are never displayed, retrieved, or logged.</div>
                <div>• <strong>Forced Password Resets:</strong> First-time logins and administrative resets require immediate confidential updates.</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Add/Edit Personnel */}
      {isAddModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800, color: 'var(--primary)' }}>
              {editingPersonnel ? `Edit Personnel: ${editingPersonnel.employeeId}` : `+ Add New ${addType === 'facilitator' ? 'Facilitator' : 'Staff Member'}`}
            </h3>

            <form onSubmit={handleSavePersonnel} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Email Address *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Phone Number</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Department / Subject *</label>
                  <input
                    type="text"
                    required
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Job Title / Role *</label>
                  <input
                    type="text"
                    required
                    value={formData.jobTitle}
                    onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Bank Name</label>
                  <input
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Account Number</label>
                  <input
                    type="text"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  />
                </div>
              </div>

              {addType === 'facilitator' ? (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Fee Rate Per Session (₦)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.facilitatorRate}
                    onChange={(e) => setFormData({ ...formData, facilitatorRate: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  />
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Monthly Basic Pay (₦)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.basicPay}
                    onChange={(e) => setFormData({ ...formData, basicPay: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{ padding: '8px 14px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700 }}
                >
                  {isSubmitting ? 'Saving...' : editingPersonnel ? 'Update Personnel' : 'Create Personnel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Change User Role */}
      {roleModalUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '420px', padding: '20px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 800, color: 'var(--primary)' }}>
              Change Role: {roleModalUser.name}
            </h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Select authoritative platform role for <strong>{roleModalUser.email}</strong>.
            </p>

            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px', marginBottom: '16px' }}
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setRoleModalUser(null)}
                style={{ padding: '7px 12px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleChangeRoleSubmit}
                disabled={isSubmitting}
                style={{ padding: '7px 14px', borderRadius: '4px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
              >
                {isSubmitting ? 'Updating...' : 'Confirm Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Controlled Lifecycle Deletion & Dependency Verification Modal */}
      {lifecycleModal.isOpen && lifecycleModal.target && (
        <RecordLifecycleModal
          isOpen={lifecycleModal.isOpen}
          onClose={() => setLifecycleModal({ isOpen: false, actionType: 'DELETE', dependencies: [] })}
          onConfirm={handleConfirmDeletePersonnel}
          entityName="Personnel Record"
          recordIdentifier={lifecycleModal.target.fullName}
          actionType="DELETE"
          dependencies={lifecycleModal.dependencies}
          blockedMessage={lifecycleModal.blockedMessage}
          isLoading={isSubmitting}
        />
      )}
    </div>
  );
}
