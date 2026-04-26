import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const CandidateDirectory = () => {
  const [candidates, setCandidates] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [ {data: usersData}, {data: cohortsData} ] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'candidate').order('full_name', { ascending: true }),
      supabase.from('academic_years').select('*')
    ]);
    
    if (usersData) setCandidates(usersData);
    if (cohortsData) setCohorts(cohortsData);
    setLoading(false);
  };

  const getCohortName = (cohortId) => {
    const c = cohorts.find(x => x.id === cohortId);
    return c ? c.name : 'Unassigned';
  };

  // Group candidates by cohort
  const groupedCandidates = candidates.reduce((acc, candidate) => {
    const cName = getCohortName(candidate.cohort_id);
    if (!acc[cName]) acc[cName] = [];
    acc[cName].push(candidate);
    return acc;
  }, {});

  return (
    <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '2rem', marginBottom: '2rem' }}>
        <h2 style={{ color: 'var(--text-ivory)', fontFamily: 'var(--font-heading)' }}>Candidate Directory</h2>
        <p style={{ color: 'var(--text-muted)' }}>Overview of all registered candidates across academic cycles.</p>
      </header>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Loading directory...</div>
      ) : (
        <div>
          {Object.keys(groupedCandidates).length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', background: 'var(--bg-surface-solid)' }}>No candidates found.</div>
          ) : (
            Object.keys(groupedCandidates).map(cohortName => (
              <div key={cohortName} style={{ marginBottom: '3rem' }}>
                <h3 style={{ color: 'var(--accent-gold)', marginBottom: '1rem', borderBottom: '1px dashed var(--border-subtle)', paddingBottom: '0.5rem' }}>
                  {cohortName}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                  {groupedCandidates[cohortName].map(c => (
                    <Link to={`/candidates/${c.id}`} key={c.id} style={{ textDecoration: 'none' }}>
                      <div className="glass-panel" style={{ padding: '1.5rem', cursor: 'pointer', transition: 'transform 0.2s, border-color 0.2s', border: '1px solid var(--border-subtle)' }} 
                           onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent-gold)'}
                           onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}>
                        <h4 style={{ color: 'var(--text-ivory)', marginBottom: '0.5rem' }}>{c.full_name}</h4>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span>Matriculation: <strong style={{ color: '#aaa' }}>{c.matriculation_number || 'N/A'}</strong></span>
                          <span>Semester: <strong style={{ color: '#aaa' }}>{c.semester || 'First'}</strong></span>
                          <span>Email: {c.email}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const CandidateDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cohortName, setCohortName] = useState('');

  useEffect(() => {
    fetchCandidateData();
  }, [id]);

  const fetchCandidateData = async () => {
    setLoading(true);
    
    // 1. Fetch Profile
    const { data: profileData } = await supabase.from('profiles').select('*, academic_years(name)').eq('id', id).single();
    if (!profileData) {
      setLoading(false);
      return;
    }
    setCandidate(profileData);
    setCohortName(profileData.academic_years?.name || 'Unassigned');

    if (profileData.cohort_id) {
      // 2. Fetch all assessments for this cohort
      const { data: assessmentsData } = await supabase.from('assessments')
        .select('*')
        .eq('cohort_id', profileData.cohort_id)
        .order('semester', { ascending: true })
        .order('created_at', { ascending: false });
        
      if (assessmentsData) setAssessments(assessmentsData);

      // 3. Fetch candidate's submitted scripts
      const { data: scriptsData } = await supabase.from('candidate_scripts')
        .select('*')
        .eq('candidate_id', id);
        
      if (scriptsData) setScripts(scriptsData);
    }
    
    setLoading(false);
  };

  if (loading) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '4rem' }}>Loading candidate data...</div>;
  if (!candidate) return <div style={{ color: '#ff4d4f', textAlign: 'center', padding: '4rem' }}>Candidate not found.</div>;

  return (
    <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
      <div style={{ marginBottom: '2rem' }}>
        <button onClick={() => navigate('/candidates')} className="btn-premium secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
          ← Back to Directory
        </button>
      </div>

      <header style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '2rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ color: 'var(--text-ivory)', fontFamily: 'var(--font-heading)' }}>{candidate.full_name}</h2>
          <p style={{ color: 'var(--text-muted)' }}>Matriculation: {candidate.matriculation_number || 'N/A'}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Academic Cycle: <strong style={{ color: 'var(--text-ivory)' }}>{cohortName}</strong></span>
          <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Program Type: <strong style={{ color: 'var(--text-ivory)' }}>{candidate.program_type === 'stretch' ? 'Continuous (Stretch)' : 'Multi-Semester'}</strong></span>
          {candidate.program_type !== 'stretch' && (
            <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Current Semester: <strong style={{ color: 'var(--text-ivory)' }}>{candidate.semester || 'First'}</strong></span>
          )}
        </div>
      </header>

      <h3 style={{ color: 'var(--accent-gold)', marginBottom: '1rem' }}>Candidate Profile</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', background: 'var(--bg-surface-solid)', padding: '1.5rem', borderRadius: '4px', marginBottom: '3rem', border: '1px solid var(--border-subtle)' }}>
        {candidate.avatar_url && (
          <div style={{ gridColumn: '1 / -1', marginBottom: '0.5rem' }}>
            <img src={candidate.avatar_url} alt="Candidate Avatar" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '4px', border: '2px solid var(--accent-gold)' }} />
          </div>
        )}
        <div><strong style={{ color: 'var(--text-muted)' }}>Email:</strong><br/>{candidate.email}</div>
        <div><strong style={{ color: 'var(--text-muted)' }}>Telephone:</strong><br/>{candidate.telephone || 'N/A'}</div>
        <div><strong style={{ color: 'var(--text-muted)' }}>Date of Birth:</strong><br/>{candidate.date_of_birth || 'N/A'}</div>
        <div><strong style={{ color: 'var(--text-muted)' }}>Occupation:</strong><br/>{candidate.occupation || 'N/A'}</div>
        <div><strong style={{ color: 'var(--text-muted)' }}>Highest Qualification:</strong><br/>{candidate.highest_qualification || 'N/A'}</div>
        <div><strong style={{ color: 'var(--text-muted)' }}>Church Attended:</strong><br/>{candidate.church_attended || 'N/A'}</div>
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Address:</strong><br/>{candidate.address || 'N/A'}</div>
        
        <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem' }}></div>
        
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Programme Applied For:</strong><br/>{candidate.programme_applied || 'N/A'}</div>
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Course of Selection:</strong><br/>{candidate.course_of_selection || 'N/A'}</div>
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Reason for Application:</strong><br/>{candidate.reason_for_application || 'N/A'}</div>
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Sponsorship Details:</strong><br/>{candidate.sponsorship_details || 'N/A'}</div>
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Two Referees:</strong><br/>{candidate.two_referees || 'N/A'}</div>
        
        <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem' }}></div>
        
        <div><strong style={{ color: 'var(--text-muted)' }}>Holy Ghost Baptism:</strong><br/>{candidate.holy_ghost_baptism || 'N/A'}</div>
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Water Baptism:</strong><br/>{candidate.water_baptism_desc || 'N/A'}</div>
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Research Interest:</strong><br/>{candidate.research_interest || 'N/A'}</div>
      </div>

      <h3 style={{ color: 'var(--accent-gold)', marginBottom: '1rem' }}>Academic Record</h3>
      
      {(() => {
        const renderTable = (list, title) => (
          <div style={{ marginBottom: '2rem' }}>
            {title && <h4 style={{ color: 'var(--text-ivory)', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>{title}</h4>}
            <div className="admin-table-container">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'var(--text-body)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Course</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Semester</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', textAlign: 'center' }}>MCQ Score</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', textAlign: 'center' }}>Theory Score</th>
                    <th style={{ padding: '1rem', color: 'var(--accent-gold)', textAlign: 'right' }}>Total Score</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(assessment => {
                    const script = scripts.find(s => s.assessment_id === assessment.id);
                    return (
                      <tr key={assessment.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '1rem', color: 'var(--text-ivory)' }}>{assessment.course_code} - {assessment.course_name}</td>
                        <td style={{ padding: '1rem' }}>{assessment.semester}</td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>{script ? script.auto_mcq_score : <span style={{ color: 'var(--border-focus)' }}>N/A</span>}</td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>{script ? (script.is_graded ? script.manual_theory_score : 'Pending') : <span style={{ color: 'var(--border-focus)' }}>N/A</span>}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: script && script.is_graded ? '#00ff88' : 'var(--text-ivory)' }}>
                          {script ? (script.is_graded ? (script.auto_mcq_score + script.manual_theory_score) : 'N/A') : <span style={{ color: 'var(--border-focus)' }}>N/A</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {list.length === 0 && (
                    <tr><td colSpan="5" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No courses found in this category.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );

        if (candidate.program_type === 'stretch') {
          return renderTable(assessments, null);
        } else {
          const firstSem = assessments.filter(a => a.semester === 'First');
          const secondSem = assessments.filter(a => a.semester === 'Second');
          return (
            <>
              {renderTable(firstSem, 'First Semester')}
              {renderTable(secondSem, 'Second Semester')}
            </>
          );
        }
      })()}
    </div>
  );
};

const AdminCandidatesFlow = () => {
  return (
    <main className="login-wrapper" style={{ alignItems: 'flex-start', paddingTop: '4rem' }}>
      <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%', padding: '2rem' }}>
        <Routes>
          <Route path="/" element={<CandidateDirectory />} />
          <Route path="/:id" element={<CandidateDetail />} />
        </Routes>
      </div>
    </main>
  );
};

export default AdminCandidatesFlow;
