import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

const SuperAdminFlow = () => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('users'); // 'users', 'cohorts'
  
  // Data states
  const [users, setUsers] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [loadingDb, setLoadingDb] = useState(true);

  // New cohort state
  const [newCohortName, setNewCohortName] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoadingDb(true);
    const [ {data: usersData}, {data: cohortsData} ] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('academic_years').select('*').order('created_at', { ascending: false })
    ]);
    
    if (usersData) setUsers(usersData);
    if (cohortsData) setCohorts(cohortsData);
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
    } else if (error) {
      alert("Error: " + error.message);
    }
  };

  const updateUserRole = async (userId, newRole) => {
    // Optimistic update
    setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
  };

  const updateUserCohort = async (userId, newCohortId) => {
    const val = newCohortId === "unassigned" ? null : newCohortId;
    setUsers(users.map(u => u.id === userId ? { ...u, cohort_id: val } : u));
    await supabase.from('profiles').update({ cohort_id: val }).eq('id', userId);
  };

  const updateUserSemester = async (userId, newSemester) => {
    setUsers(users.map(u => u.id === userId ? { ...u, semester: newSemester } : u));
    await supabase.from('profiles').update({ semester: newSemester }).eq('id', userId);
  };

  const updateUserProgramType = async (userId, newProgramType) => {
    setUsers(users.map(u => u.id === userId ? { ...u, program_type: newProgramType } : u));
    await supabase.from('profiles').update({ program_type: newProgramType }).eq('id', userId);
  };

  const handleToggleCohortState = async (cohortId, currentState) => {
    setCohorts(cohorts.map(c => c.id === cohortId ? { ...c, is_active: !currentState } : c));
    await supabase.from('academic_years').update({ is_active: !currentState }).eq('id', cohortId);
  };

  return (
    <main className="login-wrapper" style={{ alignItems: 'flex-start', paddingTop: '4rem' }}>
      <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%', padding: '2rem' }}>
        
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
          <div>
            <h2 style={{ color: 'var(--text-ivory)', fontFamily: 'var(--font-heading)' }}>Super Admin Console</h2>
            <p style={{ color: 'var(--text-muted)' }}>Manage identities, roles, and academic cycles.</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              className={`btn-premium ${activeTab === 'users' ? 'primary' : 'secondary'}`}
              onClick={() => setActiveTab('users')}
              style={{ padding: '0.5rem 1rem' }}
            >
              Identity Matrix
            </button>
            <button 
              className={`btn-premium ${activeTab === 'cohorts' ? 'primary' : 'secondary'}`}
              onClick={() => setActiveTab('cohorts')}
              style={{ padding: '0.5rem 1rem' }}
            >
              Academic Cycles
            </button>
          </div>
        </header>

        {loadingDb ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Loading records...</div>
        ) : (
          <>
            {activeTab === 'users' && (
              <div className="admin-table-container" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'var(--text-body)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Name / Email</th>
                      <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Matriculation</th>
                      <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Role</th>
                      <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Cohort</th>
                      <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Semester</th>
                      <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Program Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '1rem' }}>
                          <span style={{ display: 'block', color: 'var(--text-ivory)' }}>{u.full_name}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.email}</span>
                        </td>
                        <td style={{ padding: '1rem' }}>{u.matriculation_number || 'N/A'}</td>
                        <td style={{ padding: '1rem' }}>
                          <select 
                            value={u.role}
                            onChange={(e) => updateUserRole(u.id, e.target.value)}
                            style={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--border-subtle)', color: 'var(--text-ivory)', padding: '0.4rem', borderRadius: '4px', outline: 'none' }}
                          >
                            <option value="candidate">Candidate</option>
                            <option value="examiner">Examiner</option>
                            <option value="superadmin">Superadmin</option>
                          </select>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <select 
                            value={u.cohort_id || 'unassigned'}
                            onChange={(e) => updateUserCohort(u.id, e.target.value)}
                            style={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--border-subtle)', color: 'var(--text-ivory)', padding: '0.4rem', borderRadius: '4px', outline: 'none' }}
                            disabled={u.role !== 'candidate'}
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
                            onChange={(e) => updateUserSemester(u.id, e.target.value)}
                            style={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--border-subtle)', color: 'var(--text-ivory)', padding: '0.4rem', borderRadius: '4px', outline: 'none' }}
                            disabled={u.role !== 'candidate'}
                          >
                            <option value="First">First</option>
                            <option value="Second">Second</option>
                          </select>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <select 
                            value={u.program_type || 'multi-semester'}
                            onChange={(e) => updateUserProgramType(u.id, e.target.value)}
                            style={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--border-subtle)', color: 'var(--text-ivory)', padding: '0.4rem', borderRadius: '4px', outline: 'none' }}
                            disabled={u.role !== 'candidate'}
                          >
                            <option value="multi-semester">Multi-Semester</option>
                            <option value="stretch">Stretch</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr><td colSpan="4" style={{ textAlign: 'center', padding: '1rem' }}>No users found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

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
          </>
        )}
      </div>
    </main>
  );
};

export default SuperAdminFlow;
