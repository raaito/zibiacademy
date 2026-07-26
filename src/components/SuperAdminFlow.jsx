import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

const PAGE_SIZE = 10;

const SuperAdminFlow = () => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('candidates');
  
  const [cohorts, setCohorts] = useState([]);
  const [staffCodes, setStaffCodes] = useState([]);
  const [loadingDb, setLoadingDb] = useState(true);

  const [candidates, setCandidates] = useState([]);
  const [candidatePage, setCandidatePage] = useState(0);
  const [candidateCount, setCandidateCount] = useState(0);

  const [staff, setStaff] = useState([]);
  const [staffPage, setStaffPage] = useState(0);
  const [staffCount, setStaffCount] = useState(0);

  const [newCohortName, setNewCohortName] = useState('');
  const [newStaffCode, setNewStaffCode] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!loadingDb) {
      if (activeTab === 'candidates') fetchCandidatesPage(candidatePage);
      if (activeTab === 'staff') fetchStaffPage(staffPage);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!loadingDb && activeTab === 'candidates') fetchCandidatesPage(candidatePage);
  }, [candidatePage]);

  useEffect(() => {
    if (!loadingDb && activeTab === 'staff') fetchStaffPage(staffPage);
  }, [staffPage]);

  const fetchCandidatesPage = async (page) => {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'candidate')
      .order('created_at', { ascending: false })
      .range(from, to);
    if (data) setCandidates(data);
  };

  const fetchStaffPage = async (page) => {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['examiner', 'superadmin'])
      .order('created_at', { ascending: false })
      .range(from, to);
    if (data) setStaff(data);
  };

  const fetchData = async () => {
    setLoadingDb(true);

    const [{ count: candCount }, { count: stCount }] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'candidate'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['examiner', 'superadmin'])
    ]);
    if (candCount !== null) setCandidateCount(candCount);
    if (stCount !== null) setStaffCount(stCount);

    const [{ data: cohortsData }, { data: codesData }] = await Promise.all([
      supabase.from('academic_years').select('*').order('created_at', { ascending: false }),
      supabase.from('valid_staff_codes').select('*').order('created_at', { ascending: false })
    ]);

    if (cohortsData) setCohorts(cohortsData);
    if (codesData) setStaffCodes(codesData);

    await fetchCandidatesPage(0);
    await fetchStaffPage(0);
    setLoadingDb(false);
  };

  const handleCreateCohort = async (e) => {
    e.preventDefault();
    if (!newCohortName.trim()) return;
    const { data, error } = await supabase.from('academic_years').insert({
      name: newCohortName,
      is_active: true
    }).select().single();

    if (!error && data) {
      setCohorts([data, ...cohorts]);
      setNewCohortName('');
      toast.success('Academic Cycle Created Successfully!');
    } else if (error) {
      toast.error('Error: ' + error.message);
    }
  };

  const updateUser = async (userId, updates) => {
    setCandidates(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
    setStaff(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
    await supabase.from('profiles').update(updates).eq('id', userId);
  };

  const toggleUserStatus = async (userId, currentStatus) => {
    await updateUser(userId, { is_active: !currentStatus });
    toast.success(`User ${!currentStatus ? 'activated' : 'deactivated'} successfully.`);
  };

  const handleToggleCohortState = async (cohortId, currentState) => {
    setCohorts(cohorts.map(c => c.id === cohortId ? { ...c, is_active: !currentState } : c));
    await supabase.from('academic_years').update({ is_active: !currentState }).eq('id', cohortId);
  };

  const deleteUser = async (userId) => {
    if (userId === profile.id) {
      toast.error('You cannot delete your own account.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;

    setCandidates(prev => prev.filter(u => u.id !== userId));
    setStaff(prev => prev.filter(u => u.id !== userId));
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) {
      toast.error(error.message);
      fetchData();
    } else {
      toast.success('User deleted successfully.');
    }
  };

  const handleCreateStaffCode = async (e) => {
    e.preventDefault();
    if (!newStaffCode.trim()) return;
    const { data, error } = await supabase.from('valid_staff_codes').insert({
      code: newStaffCode.trim().toUpperCase(),
      is_used: false
    }).select().single();

    if (!error && data) {
      setStaffCodes([data, ...staffCodes]);
      setNewStaffCode('');
      toast.success('Staff Verification Code Generated!');
    } else if (error) {
      toast.error('Error: ' + error.message);
    }
  };

  const deleteStaffCode = async (code) => {
    setStaffCodes(staffCodes.filter(c => c.code !== code));
    await supabase.from('valid_staff_codes').delete().eq('code', code);
    toast.success('Code removed.');
  };

  const Pagination = ({ page, setPage, count }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Showing {Math.min(PAGE_SIZE, count - page * PAGE_SIZE)} of {count} records
      </span>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button
          className="btn-premium"
          disabled={page === 0}
          onClick={() => setPage(p => p - 1)}
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', opacity: page === 0 ? 0.5 : 1 }}
        >Previous</button>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Page {page + 1} of {Math.max(1, Math.ceil(count / PAGE_SIZE))}</span>
        <button
          className="btn-premium"
          disabled={(page + 1) * PAGE_SIZE >= count}
          onClick={() => setPage(p => p + 1)}
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', opacity: (page + 1) * PAGE_SIZE >= count ? 0.5 : 1 }}
        >Next</button>
      </div>
    </div>
  );

  const UserTable = ({ users, roleFilter }) => (
    <div>
      <Pagination
        page={roleFilter === 'candidate' ? candidatePage : staffPage}
        setPage={roleFilter === 'candidate' ? setCandidatePage : setStaffPage}
        count={roleFilter === 'candidate' ? candidateCount : staffCount}
      />
      <div className="admin-table-container" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'var(--text-body)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Name / Email</th>
              <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Matric / Staff Code</th>
              <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Role</th>
              {roleFilter === 'candidate' && (
                <>
                  <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Cohort</th>
                  <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Semester</th>
                  <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Academic Track</th>
                </>
              )}
              <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Status</th>
              <th style={{ padding: '1rem', color: 'var(--accent-gold)', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '1rem' }}>
                  <span style={{ display: 'block', color: 'var(--text-ivory)' }}>{u.full_name}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.email}</span>
                </td>
                <td style={{ padding: '1rem' }}>
                  {u.role === 'candidate' ? (u.matriculation_number || 'N/A') : (u.staff_code || 'N/A')}
                </td>
                <td style={{ padding: '1rem' }}>
                  <select
                    value={u.role}
                    onChange={(e) => updateUser(u.id, { role: e.target.value })}
                    style={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--border-subtle)', color: 'var(--text-ivory)', padding: '0.4rem', borderRadius: '4px', outline: 'none' }}
                  >
                    <option value="candidate">Candidate</option>
                    <option value="examiner">Examiner</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </td>
                {roleFilter === 'candidate' && (
                  <>
                    <td style={{ padding: '1rem' }}>
                      <select
                        value={u.cohort_id || 'unassigned'}
                        onChange={(e) => updateUser(u.id, { cohort_id: e.target.value === 'unassigned' ? null : e.target.value })}
                        style={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--border-subtle)', color: 'var(--text-ivory)', padding: '0.4rem', borderRadius: '4px', outline: 'none' }}
                      >
                        <option value="unassigned">- Unassigned -</option>
                        {cohorts.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <select
                        value={u.semester || 'First'}
                        onChange={(e) => updateUser(u.id, { semester: e.target.value })}
                        style={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--border-subtle)', color: 'var(--text-ivory)', padding: '0.4rem', borderRadius: '4px', outline: 'none' }}
                      >
                        <option value="First">First</option>
                        <option value="Second">Second</option>
                      </select>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <select
                        value={u.program_type || 'multi-semester'}
                        onChange={(e) => updateUser(u.id, { program_type: e.target.value })}
                        style={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--border-subtle)', color: 'var(--text-ivory)', padding: '0.4rem', borderRadius: '4px', outline: 'none' }}
                      >
                        <option value="multi-semester">Standard (Multi-Semester)</option>
                        <option value="stretch">Intensive (Stretch)</option>
                      </select>
                    </td>
                  </>
                )}
                <td style={{ padding: '1rem' }}>
                  <button
                    onClick={() => toggleUserStatus(u.id, u.is_active)}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${u.is_active ? '#00cc66' : '#ffaa33'}`,
                      color: u.is_active ? '#00cc66' : '#ffaa33',
                      padding: '0.3rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      width: '80px'
                    }}
                  >
                    {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </button>
                </td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <button
                    onClick={() => deleteUser(u.id)}
                    style={{ background: 'transparent', border: '1px solid rgba(255,77,79,0.3)', color: '#ff4d4f', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={roleFilter === 'candidate' ? 8 : 4} style={{ textAlign: 'center', padding: '1rem' }}>No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <main className="login-wrapper" style={{ alignItems: 'flex-start', paddingTop: '4rem' }}>
      <div className="glass-panel responsive-panel" style={{ maxWidth: '1000px', width: '100%' }}>

        <header className="responsive-header" style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
          <div>
            <h2 style={{ color: 'var(--text-ivory)', fontFamily: 'var(--font-heading)' }}>Super Admin Console</h2>
            <p style={{ color: 'var(--text-muted)' }}>Manage identities, roles, and academic cycles.</p>
          </div>
          <div className="responsive-tabs" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {[
              { key: 'candidates', label: 'Candidates' },
              { key: 'staff', label: 'Staff (Lecturers/Admin)' },
              { key: 'cohorts', label: 'Academic Cycles' },
              { key: 'staff_codes', label: 'Staff Codes' }
            ].map(tab => (
              <button
                key={tab.key}
                className={`btn-premium ${activeTab === tab.key ? 'primary' : 'secondary'}`}
                onClick={() => setActiveTab(tab.key)}
                style={{ padding: '0.6rem 1rem', flex: '1 1 auto', minWidth: '120px' }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {loadingDb ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Loading records...</div>
        ) : (
          <>
            {activeTab === 'candidates' && <UserTable users={candidates} roleFilter="candidate" />}

            {activeTab === 'staff' && <UserTable users={staff} roleFilter="staff" />}

            {activeTab === 'cohorts' && (
              <div>
                <form onSubmit={handleCreateCohort} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                  <input
                    type="text"
                    placeholder="e.g. 2026/2027"
                    value={newCohortName}
                    onChange={(e) => setNewCohortName(e.target.value)}
                    style={{ flex: 1, padding: '0.75rem', background: 'var(--bg-surface-solid)', border: '1px solid var(--border-focus)', color: 'var(--text-ivory)', borderRadius: '4px', outline: 'none' }}
                  />
                  <button type="submit" className="btn-premium primary">Create Cycle</button>
                </form>

                <div className="admin-table-container">
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'var(--text-body)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Academic Cycle Name</th>
                        <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Status</th>
                        <th style={{ padding: '1rem', color: 'var(--accent-gold)', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cohorts.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '1rem', color: 'var(--text-ivory)' }}>{c.name}</td>
                          <td style={{ padding: '1rem' }}>
                            <span style={{
                              padding: '0.2rem 0.5rem',
                              borderRadius: '12px',
                              fontSize: '0.8rem',
                              background: c.is_active ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 77, 79, 0.1)',
                              color: c.is_active ? '#00ff88' : '#ff4d4f'
                            }}>
                              {c.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <button
                              onClick={() => handleToggleCohortState(c.id, c.is_active)}
                              className="btn-premium"
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', opacity: 0.8 }}
                            >
                              {c.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {cohorts.length === 0 && (
                        <tr><td colSpan="3" style={{ textAlign: 'center', padding: '1rem' }}>No academic cycles found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'staff_codes' && (
              <div>
                <form onSubmit={handleCreateStaffCode} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                  <input
                    type="text"
                    placeholder="Enter Unique Staff Code (e.g. ZA-ADMIN-2026)"
                    value={newStaffCode}
                    onChange={(e) => setNewStaffCode(e.target.value)}
                    style={{ flex: 1, padding: '0.75rem', background: 'var(--bg-surface-solid)', border: '1px solid var(--border-focus)', color: 'var(--text-ivory)', borderRadius: '4px', outline: 'none' }}
                  />
                  <button type="submit" className="btn-premium primary">Authorize Code</button>
                </form>

                <div className="admin-table-container">
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'var(--text-body)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Authorized Code</th>
                        <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Status</th>
                        <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Created At</th>
                        <th style={{ padding: '1rem', color: 'var(--accent-gold)', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffCodes.map(c => (
                        <tr key={c.code} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '1rem', color: 'var(--text-ivory)', fontFamily: 'monospace', letterSpacing: '1px' }}>{c.code}</td>
                          <td style={{ padding: '1rem' }}>
                            <span style={{
                              padding: '0.2rem 0.5rem',
                              borderRadius: '12px',
                              fontSize: '0.8rem',
                              background: c.is_used ? 'rgba(255, 77, 79, 0.1)' : 'rgba(0, 255, 136, 0.1)',
                              color: c.is_used ? '#ff4d4f' : '#00ff88'
                            }}>
                              {c.is_used ? 'Used / Redeemed' : 'Valid / Pending'}
                            </span>
                          </td>
                          <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {new Date(c.created_at).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <button
                              onClick={() => deleteStaffCode(c.code)}
                              className="btn-premium"
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: '#ff4d4f', borderColor: 'rgba(255,77,79,0.3)' }}
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      ))}
                      {staffCodes.length === 0 && (
                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '1rem' }}>No staff codes generated yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
};

export default SuperAdminFlow;
