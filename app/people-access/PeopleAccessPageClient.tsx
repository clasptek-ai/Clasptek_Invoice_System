'use client';

/**
 * app/people-access/PeopleAccessPageClient.tsx
 * Client Component for People & Access / Staff Management
 * Phase 9B: Administration & Governance Module Migration
 */

import React, { useState, useMemo } from 'react';
import { AdminPersonnel, AdminUser, UserSecurityActivityItem } from '../../lib/admin/personnel-queries';
import { UserRole, USER_ROLES } from '@/types/auth';
import { downloadSafeCsv } from '@/lib/utils/csv';
import { usePagination } from '@/lib/hooks/usePagination';
import { Pagination } from '@/components/tables/Pagination';
import { TableSelectionBar } from '@/components/tables/TableSelectionBar';
import { RecordLifecycleModal } from '@/components/tables/RecordLifecycleModal';
import { SortableHeader } from '@/components/tables/SortableHeader';

// Standard 18x18 SVG Icons (no emojis per Clasptek design system)
const SvgShield = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const SvgKey = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 2l-2 2m-1.5 1.5L14 9a5 5 0 1 0 2 2l3.5-3.5m1.5-1.5L22 7l-2 2"/>
  </svg>
);

const SvgUsers = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const SvgDownload = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const SvgUserPlus = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
  </svg>
);

const SvgRotateCcw = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
  </svg>
);

const SvgSlash = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
  </svg>
);

const SvgCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const SvgActivity = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

const SvgCopy = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

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
    createLoginAccount: true,
    loginRole: 'Staff' as UserRole,
  });

  // Account creation modal state (Users tab / Standalone user creation)
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({
    mode: 'new' as 'new' | 'link',
    personnelId: '',
    fullName: '',
    email: '',
    phone: '',
    employeeType: 'staff' as 'staff' | 'facilitator',
    department: 'Administration',
    jobTitle: 'Operations Officer',
    role: 'Staff' as UserRole,
    bankName: 'GTBank',
    accountName: '',
    accountNumber: '',
    basicPay: 250000,
    facilitatorRate: 0,
    compensationType: 'salaried',
    notes: '',
  });

  // Governance action modal states
  const [resetPasswordModalUser, setResetPasswordModalUser] = useState<AdminUser | null>(null);
  const [resetPasswordReason, setResetPasswordReason] = useState('');
  const [suspendModalUser, setSuspendModalUser] = useState<AdminUser | null>(null);
  const [revokeModalUser, setRevokeModalUser] = useState<AdminUser | null>(null);
  const [revokeAccessModalUser, setRevokeAccessModalUser] = useState<AdminUser | null>(null);
  const [revokeAccessReason, setRevokeAccessReason] = useState('');
  const [activityModalUser, setActivityModalUser] = useState<AdminUser | null>(null);
  const [activityList, setActivityList] = useState<UserSecurityActivityItem[]>([]);
  const [isActivityLoading, setIsActivityLoading] = useState(false);

  // Credential presentation modal (Displaying invitation / reset links without secret leakage)
  const [credentialModal, setCredentialModal] = useState<{
    isOpen: boolean;
    title: string;
    fullName: string;
    email: string;
    role?: string;
    link: string;
    token: string;
    actionType: 'invite' | 'reset';
  } | null>(null);

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
      createLoginAccount: true,
      loginRole: type === 'facilitator' ? 'Facilitator' : 'Staff',
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
      createLoginAccount: false,
      loginRole: p.employeeType === 'facilitator' ? 'Facilitator' : 'Staff',
    });
    setIsAddModalOpen(true);
  };

  const handleSavePersonnel = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingPersonnel) {
        // Edit existing personnel record
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
        setIsAddModalOpen(false);
      } else {
        // Create new personnel record
        if (formData.createLoginAccount) {
          // Cohesive account creation & personnel provisioning
          const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fullName: formData.fullName,
              email: formData.email,
              phone: formData.phone,
              employeeType: addType,
              department: formData.department,
              jobTitle: formData.jobTitle,
              role: formData.loginRole,
              bankName: formData.bankName,
              accountName: formData.accountName,
              accountNumber: formData.accountNumber,
              basicPay: Number(formData.basicPay),
              facilitatorRate: Number(formData.facilitatorRate),
              compensationType: formData.compensationType,
              notes: formData.notes,
            }),
          });
          const result = await res.json();
          if (!result.success) throw new Error(result.error);

          // Refresh personnel and user lists
          const pRes = await fetch('/api/admin/personnel');
          const pData = await pRes.json();
          if (pData.success) setPersonnelList(pData.data);

          const uRes = await fetch('/api/admin/users');
          const uData = await uRes.json();
          if (uData.success) setUserList(uData.data);

          setIsAddModalOpen(false);
          notify('success', `Personnel & Portal Account provisioned for ${formData.fullName}`);

          const link = `${window.location.origin}/login?invite=${result.data.inviteToken}`;
          setCredentialModal({
            isOpen: true,
            title: 'Account Provisioned & Invitation Ready',
            fullName: formData.fullName,
            email: formData.email,
            role: formData.loginRole,
            token: result.data.inviteToken,
            link,
            actionType: 'invite',
          });
        } else {
          // Standard personnel-only record creation
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
          setIsAddModalOpen(false);
        }
      }
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

  // Open User Account Creation Modal
  const openCreateUserModal = (targetPersonnelId?: string) => {
    if (targetPersonnelId) {
      const p = personnelList.find((item) => item.id === targetPersonnelId);
      if (p) {
        setCreateUserForm({
          mode: 'link',
          personnelId: p.id,
          fullName: p.fullName,
          email: p.email,
          phone: p.phone || '',
          employeeType: p.employeeType,
          department: p.department,
          jobTitle: p.jobTitle,
          role: p.employeeType === 'facilitator' ? 'Facilitator' : 'Staff',
          bankName: p.bankName || 'GTBank',
          accountName: p.accountName || p.fullName,
          accountNumber: p.accountNumber || '',
          basicPay: p.basicPay || 0,
          facilitatorRate: p.facilitatorRate || 0,
          compensationType: p.compensationType || 'salaried',
          notes: p.notes || '',
        });
        setIsCreateUserModalOpen(true);
        return;
      }
    }

    setCreateUserForm({
      mode: 'new',
      personnelId: '',
      fullName: '',
      email: '',
      phone: '',
      employeeType: 'staff',
      department: 'Administration',
      jobTitle: 'Operations Officer',
      role: 'Staff',
      bankName: 'GTBank',
      accountName: '',
      accountNumber: '',
      basicPay: 250000,
      facilitatorRate: 0,
      compensationType: 'salaried',
      notes: '',
    });
    setIsCreateUserModalOpen(true);
  };

  const handleCreateLogin = (p: AdminPersonnel) => {
    openCreateUserModal(p.id);
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: createUserForm.fullName,
          email: createUserForm.email,
          phone: createUserForm.phone,
          role: createUserForm.role,
          employeeType: createUserForm.employeeType,
          department: createUserForm.department,
          jobTitle: createUserForm.jobTitle,
          personnelId: createUserForm.mode === 'link' ? createUserForm.personnelId : undefined,
          bankName: createUserForm.bankName,
          accountName: createUserForm.accountName,
          accountNumber: createUserForm.accountNumber,
          basicPay: Number(createUserForm.basicPay),
          facilitatorRate: Number(createUserForm.facilitatorRate),
          compensationType: createUserForm.compensationType,
          notes: createUserForm.notes,
        }),
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      // Refresh both users and personnel lists
      const uRes = await fetch('/api/admin/users');
      const uData = await uRes.json();
      if (uData.success) setUserList(uData.data);

      const pRes = await fetch('/api/admin/personnel');
      const pData = await pRes.json();
      if (pData.success) setPersonnelList(pData.data);

      setIsCreateUserModalOpen(false);
      notify('success', `Created login account for ${createUserForm.fullName} (${createUserForm.email})`);

      const inviteLink = `${window.location.origin}/login?invite=${result.data.inviteToken}`;
      setCredentialModal({
        isOpen: true,
        title: 'User Account Created & Invitation Ready',
        fullName: createUserForm.fullName,
        email: createUserForm.email,
        role: createUserForm.role,
        token: result.data.inviteToken,
        link: inviteLink,
        actionType: 'invite',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create user account';
      notify('error', msg);
    } finally {
      setIsSubmitting(false);
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

  const handleConfirmResetPassword = async () => {
    if (!resetPasswordModalUser) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset-password',
          userId: resetPasswordModalUser.id,
          reason: resetPasswordReason.trim() || 'Admin-initiated password reset',
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      setCredentialModal({
        isOpen: true,
        title: 'Password Recovery Request Submitted',
        fullName: resetPasswordModalUser.name,
        email: resetPasswordModalUser.email,
        role: resetPasswordModalUser.role,
        token: '',
        link: '',
        actionType: 'reset',
      });

      notify('success', `Password recovery request accepted for ${resetPasswordModalUser.email}`);
      setResetPasswordModalUser(null);
      setResetPasswordReason('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset password';
      notify('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendInvite = async (u: AdminUser) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resend-invite',
          userId: u.id,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      const inviteLink = `${window.location.origin}/login?invite=${result.inviteToken}`;
      setCredentialModal({
        isOpen: true,
        title: 'Invitation Link Regenerated',
        fullName: u.name,
        email: u.email,
        role: u.role,
        token: result.inviteToken,
        link: inviteLink,
        actionType: 'invite',
      });

      notify('success', `Fresh invitation link generated for ${u.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend invite';
      notify('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSuspendUser = async () => {
    if (!suspendModalUser) return;
    setIsSubmitting(true);
    const nextStatus = suspendModalUser.status === 'suspended' ? 'active' : 'suspended';
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle-status',
          userId: suspendModalUser.id,
          status: nextStatus,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      setUserList((prev) =>
        prev.map((item) => (item.id === suspendModalUser.id ? { ...item, status: nextStatus } : item))
      );
      notify('success', `User ${suspendModalUser.name} set to ${nextStatus}`);
      setSuspendModalUser(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update user status';
      notify('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmRevokeSession = async () => {
    if (!revokeModalUser) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revoke-sessions',
          userId: revokeModalUser.id,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      notify('success', `All active sessions revoked for ${revokeModalUser.name}`);
      setRevokeModalUser(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke sessions';
      notify('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmRevokeAccess = async () => {
    if (!revokeAccessModalUser) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revoke-access',
          userId: revokeAccessModalUser.id,
          reason: revokeAccessReason.trim() || 'Permanent access revocation',
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      setUserList((prev) =>
        prev.map((item) => (item.id === revokeAccessModalUser.id ? { ...item, status: 'suspended' } : item))
      );
      notify('success', `Access permanently revoked for ${revokeAccessModalUser.name}`);
      setRevokeAccessModalUser(null);
      setRevokeAccessReason('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke access';
      notify('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenActivity = async (u: AdminUser) => {
    setActivityModalUser(u);
    setIsActivityLoading(true);
    try {
      const res = await fetch(`/api/admin/users?action=activity&userId=${encodeURIComponent(u.id)}`);
      const result = await res.json();
      if (result.success) {
        setActivityList(result.data || []);
      } else {
        setActivityList([]);
      }
    } catch {
      setActivityList([]);
    } finally {
      setIsActivityLoading(false);
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
              <SvgShield />
              <span>People &amp; Access / Staff Management</span>
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
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <SvgKey />
            <span>Users ({userList.length})</span>
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
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <SvgUsers />
            <span>Personnel ({personnelList.length})</span>
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
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <SvgShield />
            <span>Access &amp; Security</span>
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
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {canManage && (
                  <button
                    className="cp-btn sm primary"
                    onClick={() => openCreateUserModal()}
                    style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <SvgUserPlus />
                    <span>+ Create User Account</span>
                  </button>
                )}
                <button
                  className="cp-btn sm secondary"
                  onClick={() => handleExportUsers(false)}
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <SvgDownload />
                  <span>Export Users CSV</span>
                </button>
              </div>
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
                    style={{ fontSize: '12px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <SvgDownload />
                    <span>Export Selected Users</span>
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
                                background: u.status === 'active' ? '#DEF7EC' : u.status === 'invited' ? '#FEF3C7' : '#FDE8E8',
                                color: u.status === 'active' ? '#03543F' : u.status === 'invited' ? '#92400E' : '#9B1C1C',
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
                                  onClick={() => setResetPasswordModalUser(u)}
                                  title="Initiate confidential administrative password reset"
                                  style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface-2)' }}
                                >
                                  Reset Pwd
                                </button>
                                {u.status === 'invited' && (
                                  <button
                                    className="cp-btn sm secondary"
                                    onClick={() => handleResendInvite(u)}
                                    title="Resend activation invite link"
                                    style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer', border: '1px solid var(--border)', background: '#FEF3C7', color: '#92400E' }}
                                  >
                                    Resend
                                  </button>
                                )}
                                <button
                                  className="cp-btn sm secondary"
                                  disabled={isCurrentUser(u.id)}
                                  title={isCurrentUser(u.id) ? 'Cannot suspend own account' : undefined}
                                  onClick={() => setSuspendModalUser(u)}
                                  style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: isCurrentUser(u.id) ? 'not-allowed' : 'pointer', border: '1px solid var(--border)', background: isSusp ? '#DEF7EC' : 'var(--surface-2)', opacity: isCurrentUser(u.id) ? 0.5 : 1 }}
                                >
                                  {isSusp ? 'Reactivate' : 'Suspend'}
                                </button>
                                <button
                                  className="cp-btn sm secondary"
                                  disabled={isCurrentUser(u.id)}
                                  title={isCurrentUser(u.id) ? 'Cannot revoke own active sessions' : undefined}
                                  onClick={() => setRevokeModalUser(u)}
                                  style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: isCurrentUser(u.id) ? 'not-allowed' : 'pointer', border: '1px solid var(--border)', background: 'var(--surface-2)', opacity: isCurrentUser(u.id) ? 0.5 : 1 }}
                                >
                                  Revoke Sessions
                                </button>
                                <button
                                  className="cp-btn sm secondary"
                                  disabled={isCurrentUser(u.id)}
                                  title={isCurrentUser(u.id) ? 'Cannot revoke own access' : undefined}
                                  onClick={() => setRevokeAccessModalUser(u)}
                                  style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: isCurrentUser(u.id) ? 'not-allowed' : 'pointer', border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', opacity: isCurrentUser(u.id) ? 0.5 : 1 }}
                                >
                                  Revoke Access
                                </button>
                                <button
                                  className="cp-btn sm secondary"
                                  onClick={() => handleOpenActivity(u)}
                                  title="View user governance audit activity"
                                  style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface-2)' }}
                                >
                                  Activity
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
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <SvgDownload />
                <span>Export Personnel CSV</span>
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
                    style={{ fontSize: '12px', padding: '4px 10px', color: '#DC2626', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <SvgSlash />
                    <span>Deactivate Selected</span>
                  </button>
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={() => handleBulkDeactivatePersonnel('active')}
                    style={{ fontSize: '12px', padding: '4px 10px', color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <SvgCheck />
                    <span>Activate Selected</span>
                  </button>
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={() => handleExportPersonnel(true)}
                    style={{ fontSize: '12px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <SvgDownload />
                    <span>Export Selected</span>
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
        <div role="dialog" aria-modal="true" aria-labelledby="modal-add-personnel-title" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 id="modal-add-personnel-title" style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800, color: 'var(--primary)' }}>
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

              {/* Account Provisioning Option for New Personnel */}
              {!editingPersonnel && isSuperAdmin && (
                <div style={{ background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px', marginTop: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>
                    <input
                      type="checkbox"
                      checked={formData.createLoginAccount}
                      onChange={(e) => setFormData({ ...formData, createLoginAccount: e.target.checked })}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <span>Provision portal login account &amp; assign initial role</span>
                  </label>

                  {formData.createLoginAccount && (
                    <div style={{ marginTop: '10px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Initial Platform Role</label>
                      <select
                        value={formData.loginRole}
                        onChange={(e) => setFormData({ ...formData, loginRole: e.target.value as UserRole })}
                        style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                      >
                        {USER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        An invitation activation link will be generated immediately upon creation.
                      </div>
                    </div>
                  )}
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
                  {isSubmitting ? 'Saving...' : editingPersonnel ? 'Update Personnel' : formData.createLoginAccount ? 'Create Personnel & Portal Account' : 'Create Personnel Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create User Account (Standalone or Link Existing Personnel) */}
      {isCreateUserModalOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="modal-create-user-title" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 id="modal-create-user-title" style={{ margin: '0 0 14px 0', fontSize: '16px', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SvgUserPlus />
              <span>Create Portal Login Account</span>
            </h3>

            {/* Mode Selector */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <button
                type="button"
                onClick={() => setCreateUserForm({ ...createUserForm, mode: 'new', personnelId: '' })}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  borderRadius: '4px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: createUserForm.mode === 'new' ? 'var(--primary)' : 'var(--surface-2)',
                  color: createUserForm.mode === 'new' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                New Staff / Facilitator
              </button>
              <button
                type="button"
                onClick={() => setCreateUserForm({ ...createUserForm, mode: 'link' })}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  borderRadius: '4px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: createUserForm.mode === 'link' ? 'var(--primary)' : 'var(--surface-2)',
                  color: createUserForm.mode === 'link' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                Link to Existing Personnel
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {createUserForm.mode === 'link' && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Select Personnel Record *</label>
                  <select
                    required
                    value={createUserForm.personnelId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      const pers = personnelList.find((p) => p.id === pid);
                      if (pers) {
                        setCreateUserForm({
                          ...createUserForm,
                          personnelId: pers.id,
                          fullName: pers.fullName,
                          email: pers.email,
                          phone: pers.phone || '',
                          department: pers.department,
                          jobTitle: pers.jobTitle,
                          employeeType: pers.employeeType,
                          role: pers.employeeType === 'facilitator' ? 'Facilitator' : 'Staff',
                        });
                      } else {
                        setCreateUserForm({ ...createUserForm, personnelId: pid });
                      }
                    }}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  >
                    <option value="">— Select an unlinked personnel record —</option>
                    {personnelList
                      .filter((p) => !p.userId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.employeeId} &middot; {p.fullName} ({p.email}) &middot; {p.employeeType.toUpperCase()}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Full Name *</label>
                <input
                  type="text"
                  required
                  value={createUserForm.fullName}
                  onChange={(e) => setCreateUserForm({ ...createUserForm, fullName: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Official Work Email *</label>
                  <input
                    type="email"
                    required
                    value={createUserForm.email}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Initial Platform Role *</label>
                  <select
                    value={createUserForm.role}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, role: e.target.value as UserRole })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  >
                    {USER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Personnel Classification</label>
                  <select
                    value={createUserForm.employeeType}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, employeeType: e.target.value as 'staff' | 'facilitator' })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  >
                    <option value="staff">Staff Member</option>
                    <option value="facilitator">Facilitator</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Phone Number</label>
                  <input
                    type="text"
                    value={createUserForm.phone}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, phone: e.target.value })}
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
                    value={createUserForm.department}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, department: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Job Title / Designation *</label>
                  <input
                    type="text"
                    required
                    value={createUserForm.jobTitle}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, jobTitle: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateUserModalOpen(false)}
                  style={{ padding: '8px 14px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700 }}
                >
                  {isSubmitting ? 'Creating...' : 'Provision User Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Change User Role */}
      {roleModalUser && (
        <div role="dialog" aria-modal="true" aria-labelledby="modal-role-title" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '420px', padding: '20px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 id="modal-role-title" style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 800, color: 'var(--primary)' }}>
              Change Role: {roleModalUser.name}
            </h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Select authoritative platform role for <strong>{roleModalUser.email}</strong>.
            </p>

            {isCurrentUser(roleModalUser.id) && (
              <div style={{ padding: '8px 12px', background: '#FEF3C7', color: '#92400E', borderRadius: '4px', fontSize: '11.5px', marginBottom: '12px' }}>
                Notice: Super Admins cannot demote their own account.
              </div>
            )}

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
                disabled={isSubmitting || (isCurrentUser(roleModalUser.id) && selectedRole !== 'Super Admin')}
                style={{ padding: '7px 14px', borderRadius: '4px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
              >
                {isSubmitting ? 'Updating...' : 'Confirm Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Administrative Password Reset */}
      {resetPasswordModalUser && (
        <div role="dialog" aria-modal="true" aria-labelledby="modal-reset-title" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '440px', padding: '22px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 id="modal-reset-title" style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SvgRotateCcw />
              <span>Initiate Password Reset</span>
            </h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
              Initiate a confidential administrative password reset for <strong>{resetPasswordModalUser.name}</strong> (<code>{resetPasswordModalUser.email}</code>).
            </p>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '6px', padding: '10px 12px', fontSize: '11.5px', color: '#1E40AF', marginBottom: '14px' }}>
              Under Clasptek security policy, passwords are never stored, displayed or logged in plaintext. A secure, single-use reset token and link will be generated for the user.
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Administrative Reason (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Employee requested password recovery"
                value={resetPasswordReason}
                onChange={(e) => setResetPasswordReason(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12.5px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setResetPasswordModalUser(null);
                  setResetPasswordReason('');
                }}
                style={{ padding: '7px 12px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmResetPassword}
                disabled={isSubmitting}
                style={{ padding: '7px 16px', borderRadius: '4px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
              >
                {isSubmitting ? 'Generating...' : 'Initiate Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Suspend / Unsuspend Confirmation */}
      {suspendModalUser && (
        <div role="dialog" aria-modal="true" aria-labelledby="modal-suspend-title" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '420px', padding: '20px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 id="modal-suspend-title" style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 800, color: suspendModalUser.status === 'suspended' ? '#059669' : '#DC2626' }}>
              {suspendModalUser.status === 'suspended' ? 'Reactivate User Account' : 'Suspend User Account'}
            </h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
              {suspendModalUser.status === 'suspended'
                ? `Restore portal login access for ${suspendModalUser.name} (${suspendModalUser.email})?`
                : `Suspend portal login access for ${suspendModalUser.name} (${suspendModalUser.email})? The user will be blocked from logging in, while all historical records remain preserved.`}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setSuspendModalUser(null)}
                style={{ padding: '7px 12px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSuspendUser}
                disabled={isSubmitting}
                style={{
                  padding: '7px 16px',
                  borderRadius: '4px',
                  border: 'none',
                  background: suspendModalUser.status === 'suspended' ? '#059669' : '#DC2626',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                {isSubmitting ? 'Updating...' : suspendModalUser.status === 'suspended' ? 'Confirm Reactivation' : 'Confirm Suspension'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Revoke Active Sessions Confirmation */}
      {revokeModalUser && (
        <div role="dialog" aria-modal="true" aria-labelledby="modal-revoke-title" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '420px', padding: '20px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 id="modal-revoke-title" style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 800, color: '#DC2626' }}>
              Revoke Active Sessions
            </h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
              Immediately invalidate all active browser and mobile sessions for <strong>{revokeModalUser.name}</strong> (<code>{revokeModalUser.email}</code>)?
              The user will be required to re-authenticate.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setRevokeModalUser(null)}
                style={{ padding: '7px 12px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRevokeSession}
                disabled={isSubmitting}
                style={{ padding: '7px 16px', borderRadius: '4px', border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
              >
                {isSubmitting ? 'Revoking...' : 'Revoke All Sessions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Permanently Revoke Access Confirmation (Fix 4) */}
      {revokeAccessModalUser && (
        <div role="dialog" aria-modal="true" aria-labelledby="modal-revoke-access-title" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '440px', padding: '22px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 id="modal-revoke-access-title" style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 800, color: '#B91C1C' }}>
              Permanently Revoke Access
            </h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '12px' }}>
              Permanently revoke portal access and deactivate all credentials for <strong>{revokeAccessModalUser.name}</strong> (<code>{revokeAccessModalUser.email}</code>)?
            </p>
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', padding: '10px 12px', marginBottom: '14px', fontSize: '11.5px', color: '#991B1B', lineHeight: 1.5 }}>
              <strong>Permanent Access Revocation:</strong> This terminates all active sessions, suspends portal login access, deactivates the linked personnel record, and prevents password recovery or invitation reactivation.
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                Reason for Revocation:
              </label>
              <input
                type="text"
                value={revokeAccessReason}
                onChange={(e) => setRevokeAccessReason(e.target.value)}
                placeholder="e.g. Employment offboarding, contractor contract ended"
                style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12px' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => { setRevokeAccessModalUser(null); setRevokeAccessReason(''); }}
                style={{ padding: '7px 12px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRevokeAccess}
                disabled={isSubmitting}
                style={{ padding: '7px 16px', borderRadius: '4px', border: 'none', background: '#B91C1C', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
              >
                {isSubmitting ? 'Revoking Access...' : 'Revoke Access Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: User Security Activity Log Viewer */}
      {activityModalUser && (
        <div role="dialog" aria-modal="true" aria-labelledby="modal-activity-title" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '640px', maxHeight: '85vh', overflowY: 'auto', padding: '22px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 id="modal-activity-title" style={{ margin: '0 0 2px 0', fontSize: '15px', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <SvgActivity />
                  <span>Security &amp; Governance Activity</span>
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Audit history for <strong>{activityModalUser.name}</strong> ({activityModalUser.email})
                </div>
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setActivityModalUser(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {isActivityLoading ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                Loading activity audit trail...
              </div>
            ) : activityList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                No recorded governance actions found for this user account.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {activityList.map((log) => (
                  <div key={log.id} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface-1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span className="cp-pill" style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 6px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: '4px' }}>
                        {log.action}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '2px' }}>
                      {log.reason || 'Standard administrative action'}
                    </div>
                    <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Actor: <strong>{log.actorRole}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setActivityModalUser(null)}
                style={{ padding: '7px 14px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Credential Presentation (Invitation / Password Reset Link) */}
      {credentialModal && credentialModal.isOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="modal-credential-title" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '520px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 id="modal-credential-title" style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: 800, color: '#03543F', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SvgCheck />
              <span>{credentialModal.title}</span>
            </h3>

            {credentialModal.actionType === 'reset' ? (
              <div>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
                  A secure password recovery request has been accepted by the authentication provider for <strong>{credentialModal.fullName}</strong> (<code>{credentialModal.email}</code>).
                </p>
                <div style={{ background: '#FAFBFD', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px' }}>
                  <strong>Zero-Exposure Security Standard:</strong> Password recovery links are delivered exclusively to the verified recipient inbox. No tokens or temporary credentials are shown to administrators.
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
                  The secure single-use access link for <strong>{credentialModal.fullName}</strong> (<code>{credentialModal.email}</code>) has been generated.
                </p>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                    Account Activation / Invitation Link:
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      readOnly
                      value={credentialModal.link}
                      style={{ flex: 1, padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace', background: '#F8FAFC' }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(credentialModal.link);
                        notify('success', 'Link copied to clipboard!');
                      }}
                      style={{ padding: '8px 12px', borderRadius: '4px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <SvgCopy />
                      <span>Copy</span>
                    </button>
                  </div>
                </div>

                <div style={{ background: '#FAFBFD', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong>Confidentiality Notice:</strong> Share this link securely with the user. Under platform security policies, passwords and tokens are never emailed in plaintext or retained unencrypted.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setCredentialModal(null)}
                style={{ padding: '7px 16px', borderRadius: '4px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
              >
                Done
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
