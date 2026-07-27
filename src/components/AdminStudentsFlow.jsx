import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';

const StudentDirectory = () => {
  const [students, setStudents] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [studentPage, setStudentPage] = useState(0);
  const [studentCount, setStudentCount] = useState(0);
  const PAGE_SIZE = 100;
  const [exportConfig, setExportConfig] = useState({
    personal: true,
    academic: true,
    background: false,
    scores: false
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!loading) fetchStudentsPage(studentPage);
  }, [studentPage]);

  const fetchStudentsPage = async (page) => {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'candidate')
      .order('full_name', { ascending: true })
      .range(from, to);
    if (data) setStudents(data);
  };

  const fetchData = async () => {
    setLoading(true);
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'candidate');
    if (count !== null) setStudentCount(count);

    const { data: cohortsData } = await supabase.from('academic_years').select('*');
    if (cohortsData) setCohorts(cohortsData);

    await fetchStudentsPage(0);
    setLoading(false);
  };

  const getCohortName = (cohortId) => {
    const c = cohorts.find(x => x.id === cohortId);
    return c ? c.name : 'Unassigned';
  };

  const groupedStudents = students.reduce((acc, s) => {
    const cName = getCohortName(s.cohort_id);
    if (!acc[cName]) acc[cName] = [];
    acc[cName].push(s);
    return acc;
  }, {});

  const executeExportCSV = async () => {
    const toastId = toast.loading("Loading all student data for export...");

    const { data: allStudentsData } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'candidate')
      .order('full_name', { ascending: true });

    if (!allStudentsData || allStudentsData.length === 0) {
      toast.error("No students to export.", { id: toastId });
      return;
    }

    toast.loading("Generating custom report...", { id: toastId });
    setShowExportModal(false);

    try {
      let studentScoresMap = {};
      let allCourseNames = new Set();

      if (exportConfig.scores) {
        const [ { data: scripts }, { data: assessments } ] = await Promise.all([
          supabase.from('candidate_scripts').select('*'),
          supabase.from('assessments').select('id, course_name')
        ]);

        if (scripts && assessments) {
          const courseMap = assessments.reduce((acc, a) => { acc[a.id] = a.course_name; return acc; }, {});
          
          scripts.forEach(script => {
            const courseName = courseMap[script.assessment_id] || 'Unknown Course';
            allCourseNames.add(courseName);
            
            if (!studentScoresMap[script.candidate_id]) studentScoresMap[script.candidate_id] = {};
            const totalScore = script.is_graded ? (script.auto_mcq_score + script.manual_theory_score) : 'Pending';
            studentScoresMap[script.candidate_id][courseName] = totalScore;
          });
        }
      }

      let headers = [];
      if (exportConfig.personal) headers.push('Full Name', 'Email', 'Telephone', 'Address');
      if (exportConfig.academic) headers.push('Matriculation', 'Program Type', 'Semester', 'Cohort', 'Registration Form');
      if (exportConfig.background) headers.push('Occupation', 'Church Attended', 'Highest Qualification');
      
      const courseHeaders = Array.from(allCourseNames).map(name => `${name} (Score)`);
      if (exportConfig.scores) headers = headers.concat(courseHeaders);

      const rows = allStudentsData.map(c => {
        let row = [];
        if (exportConfig.personal) row.push(`"${c.full_name || ''}"`, `"${c.email || ''}"`, `"${c.telephone || ''}"`, `"${c.address || ''}"`);
        if (exportConfig.academic) row.push(`"${c.matriculation_number || ''}"`, `"${c.program_type || ''}"`, `"${c.semester || ''}"`, `"${getCohortName(c.cohort_id)}"`, `"${c.registration_type || 'general'}"`);
        if (exportConfig.background) row.push(`"${c.occupation || ''}"`, `"${c.church_attended || ''}"`, `"${c.highest_qualification || ''}"`);
        
        if (exportConfig.scores) {
          const userScores = studentScoresMap[c.id] || {};
          courseHeaders.forEach(ch => {
            const courseName = ch.replace(' (Score)', '');
            row.push(`"${userScores[courseName] !== undefined ? userScores[courseName] : 'N/A'}"`);
          });
        }
        return row;
      });

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `zibi_students_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success("Student directory exported successfully!", { id: toastId });
    } catch (err) {
      toast.error("Failed to generate export: " + err.message, { id: toastId });
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '2rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ color: 'var(--text-ivory)', fontFamily: 'var(--font-heading)' }}>Student Directory</h2>
          <p style={{ color: 'var(--text-muted)' }}>Overview of all registered students across academic cycles.</p>
        </div>
        <button className="btn-premium primary" onClick={() => setShowExportModal(true)}>
          Export Custom Report
        </button>
      </header>

      {showExportModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel" style={{ padding: '2rem', width: '100%', maxWidth: '500px', animation: 'fadeIn 0.3s' }}>
            <h3 style={{ color: 'var(--accent-gold)', marginBottom: '1rem', fontFamily: 'var(--font-heading)' }}>Export Data Selection</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>Select the data points you wish to include in the generated CSV report.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', color: 'var(--text-ivory)' }}>
                <input type="checkbox" checked={exportConfig.personal} onChange={(e) => setExportConfig({...exportConfig, personal: e.target.checked})} style={{ width: 'auto' }} />
                <span>Basic Contact Info (Name, Email, Phone, Address)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', color: 'var(--text-ivory)' }}>
                <input type="checkbox" checked={exportConfig.academic} onChange={(e) => setExportConfig({...exportConfig, academic: e.target.checked})} style={{ width: 'auto' }} />
                <span>Academic Status (Matriculation, Cohort, Semester)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', color: 'var(--text-ivory)' }}>
                <input type="checkbox" checked={exportConfig.background} onChange={(e) => setExportConfig({...exportConfig, background: e.target.checked})} style={{ width: 'auto' }} />
                <span>Background Info (Occupation, Church, Highest Qual.)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', color: 'var(--accent-gold)', padding: '1rem', background: 'var(--bg-obsidian)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <input type="checkbox" checked={exportConfig.scores} onChange={(e) => setExportConfig({...exportConfig, scores: e.target.checked})} style={{ width: 'auto' }} />
                <span style={{ flex: 1 }}>
                  <strong style={{ display: 'block' }}>Include Course Scores</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Warning: Export may take longer to generate as it fetches all scripts.</span>
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="btn-premium" onClick={() => setShowExportModal(false)} style={{ flex: 1 }}>Cancel</button>
              <button className="btn-premium primary" onClick={executeExportCSV} style={{ flex: 1 }}>Generate File</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Loading directory...</div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Showing {students.length} of {studentCount} students
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                className="btn-premium"
                disabled={studentPage === 0}
                onClick={() => setStudentPage(p => p - 1)}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', opacity: studentPage === 0 ? 0.5 : 1 }}
              >Previous</button>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Page {studentPage + 1} of {Math.max(1, Math.ceil(studentCount / PAGE_SIZE))}</span>
              <button
                className="btn-premium"
                disabled={(studentPage + 1) * PAGE_SIZE >= studentCount}
                onClick={() => setStudentPage(p => p + 1)}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', opacity: (studentPage + 1) * PAGE_SIZE >= studentCount ? 0.5 : 1 }}
              >Next</button>
            </div>
          </div>
          {Object.keys(groupedStudents).length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', background: 'var(--bg-surface-solid)' }}>No students found.</div>
          ) : (
            Object.keys(groupedStudents).map(cohortName => (
              <div key={cohortName} style={{ marginBottom: '3rem' }}>
                <h3 style={{ color: 'var(--accent-gold)', marginBottom: '1rem', borderBottom: '1px dashed var(--border-subtle)', paddingBottom: '0.5rem' }}>
                  {cohortName}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                  {groupedStudents[cohortName].map(s => (
                    <Link to={`/students/${s.id}`} key={s.id} style={{ textDecoration: 'none' }}>
                      <div className="glass-panel" style={{ padding: '1.5rem', cursor: 'pointer', transition: 'transform 0.2s, border-color 0.2s', border: '1px solid var(--border-subtle)' }} 
                           onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent-gold)'}
                           onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}>
                        <h4 style={{ color: 'var(--text-ivory)', marginBottom: '0.5rem' }}>{s.full_name}</h4>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span>Matriculation: <strong style={{ color: '#aaa' }}>{s.matriculation_number || 'N/A'}</strong></span>
                          <span>Semester: <strong style={{ color: '#aaa' }}>{s.semester || 'First'}</strong></span>
                          <span>Email: {s.email}</span>
                          <span style={{ marginTop: '0.5rem' }}>
                            Status: <span style={{ 
                              color: s.is_active ? '#00cc66' : '#ffaa33', 
                              fontWeight: 'bold',
                              fontSize: '0.75rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: s.is_active ? 'rgba(0,204,102,0.1)' : 'rgba(255,170,51,0.1)',
                              border: `1px solid ${s.is_active ? '#00cc66' : '#ffaa33'}`
                            }}>
                              {s.is_active ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                          </span>
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

const StudentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cohortName, setCohortName] = useState('');
  const [assessmentTotals, setAssessmentTotals] = useState({});

  useEffect(() => {
    fetchStudentData();
  }, [id]);

  const fetchStudentData = async () => {
    setLoading(true);
    
    const { data: profileData } = await supabase.from('profiles').select('*, academic_years(name)').eq('id', id).single();
    if (!profileData) {
      setLoading(false);
      return;
    }
    setStudent(profileData);
    setCohortName(profileData.academic_years?.name || 'Unassigned');

    if (profileData.cohort_id) {
      const { data: assessmentsData } = await supabase.from('assessments')
        .select('*')
        .eq('cohort_id', profileData.cohort_id)
        .order('semester', { ascending: true })
        .order('created_at', { ascending: false });
        
      if (assessmentsData) {
        setAssessments(assessmentsData);
        const ids = assessmentsData.map(a => a.id);
        const { data: totals } = await supabase
          .from('questions')
          .select('assessment_id, points')
          .in('assessment_id', ids);
        if (totals) {
          const map = {};
          totals.forEach(q => { map[q.assessment_id] = (map[q.assessment_id] || 0) + q.points; });
          setAssessmentTotals(map);
        }
      }

      const { data: scriptsData } = await supabase.from('candidate_scripts')
        .select('*')
        .eq('candidate_id', id);
        
      if (scriptsData) setScripts(scriptsData);
    }
    
    setLoading(false);
  };

  const toggleActivation = async () => {
    const newStatus = !student.is_active;
    const { error } = await supabase.from('profiles').update({ is_active: newStatus }).eq('id', id);
    if (error) {
      toast.error(error.message);
    } else {
      setStudent({ ...student, is_active: newStatus });
      toast.success(`Account ${newStatus ? 'activated' : 'deactivated'} successfully.`);
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm("Are you sure you want to delete this student's account? This will remove their profile and all related data. This action cannot be undone.")) return;
    
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Account deleted successfully.");
      navigate('/students');
    }
  };

  if (loading) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '4rem' }}>Loading student data...</div>;
  if (!student) return <div style={{ color: '#ff4d4f', textAlign: 'center', padding: '4rem' }}>Student not found.</div>;

  return (
    <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
      <div style={{ marginBottom: '2rem' }}>
        <button onClick={() => navigate('/students')} className="btn-premium secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
          ← Back to Directory
        </button>
      </div>

      <header style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '2rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ color: 'var(--text-ivory)', fontFamily: 'var(--font-heading)' }}>{student.full_name}</h2>
          <p style={{ color: 'var(--text-muted)' }}>Matriculation: {student.matriculation_number || 'N/A'}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Academic Cycle: <strong style={{ color: 'var(--text-ivory)' }}>{cohortName}</strong></span>
          <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Program Type: <strong style={{ color: 'var(--text-ivory)' }}>{student.program_type === 'stretch' ? 'Continuous (Stretch)' : 'Multi-Semester'}</strong></span>
          {student.program_type !== 'stretch' && (
            <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Current Semester: <strong style={{ color: 'var(--text-ivory)' }}>{student.semester || 'First'}</strong></span>
          )}
        </div>
      </header>

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Account Status:</span>
          <span style={{ 
            color: student.is_active ? '#00cc66' : '#ffaa33', 
            fontWeight: 'bold',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '0.8rem',
            background: student.is_active ? 'rgba(0,204,102,0.1)' : 'rgba(255,170,51,0.1)',
            border: `1px solid ${student.is_active ? '#00cc66' : '#ffaa33'}`
          }}>
            {student.is_active ? 'ACTIVE' : 'INACTIVE'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={toggleActivation} 
            className={`btn-premium ${student.is_active ? 'secondary' : 'primary'}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            {student.is_active ? 'Deactivate Account' : 'Activate Account'}
          </button>
          <button 
            onClick={deleteAccount} 
            className="btn-premium"
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: '#ff4d4f', borderColor: '#ff4d4f' }}
          >
            Delete Account
          </button>
        </div>
      </div>

      <h3 style={{ color: 'var(--accent-gold)', marginBottom: '1rem' }}>Student Profile</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', background: 'var(--bg-surface-solid)', padding: '1.5rem', borderRadius: '4px', marginBottom: '3rem', border: '1px solid var(--border-subtle)' }}>
        {student.avatar_url && (
          <div style={{ gridColumn: '1 / -1', marginBottom: '0.5rem' }}>
            <img src={student.avatar_url} alt="Student Avatar" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '4px', border: '2px solid var(--accent-gold)' }} />
          </div>
        )}
        <div><strong style={{ color: 'var(--text-muted)' }}>Email:</strong><br/>{student.email}</div>
        <div><strong style={{ color: 'var(--text-muted)' }}>Telephone:</strong><br/>{student.telephone || 'N/A'}</div>
        <div><strong style={{ color: 'var(--text-muted)' }}>Date of Birth:</strong><br/>{student.date_of_birth || 'N/A'}</div>
        <div><strong style={{ color: 'var(--text-muted)' }}>Occupation:</strong><br/>{student.occupation || 'N/A'}</div>
        <div><strong style={{ color: 'var(--text-muted)' }}>Highest Qualification:</strong><br/>{student.highest_qualification || 'N/A'}</div>
        <div><strong style={{ color: 'var(--text-muted)' }}>Church Attended:</strong><br/>{student.church_attended || 'N/A'}</div>
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Address:</strong><br/>{student.address || 'N/A'}</div>
        
        <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem' }}></div>
        
        <div style={{ gridColumn: '1 / -1' }}>
          <strong style={{ color: 'var(--text-muted)' }}>Registration Form Used:</strong><br/>
          <span style={{ color: 'var(--accent-gold)' }}>
            {student.registration_type === 'supernatural' ? 'School of Supernatural (Feb 2026 Session)' : 
             student.registration_type === 'theology' ? 'ZIBI - Theology Course - 2025' : 
             'ZIBI Application Form (General)'}
          </span>
        </div>
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Programme Applied For:</strong><br/>{student.programme_applied || 'N/A'}</div>
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Course of Selection:</strong><br/>{student.course_of_selection || 'N/A'}</div>
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Reason for Application:</strong><br/>{student.reason_for_application || 'N/A'}</div>
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Sponsorship Details:</strong><br/>{student.sponsorship_details || 'N/A'}</div>
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Two Referees:</strong><br/>{student.two_referees || 'N/A'}</div>
        
        <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem' }}></div>
        
        <div><strong style={{ color: 'var(--text-muted)' }}>Holy Ghost Baptism:</strong><br/>{student.holy_ghost_baptism || 'N/A'}</div>
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Water Baptism:</strong><br/>{student.water_baptism_desc || 'N/A'}</div>
        <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-muted)' }}>Research Interest:</strong><br/>{student.research_interest || 'N/A'}</div>
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
                          {script ? (script.is_graded ? `${script.auto_mcq_score + script.manual_theory_score} / ${assessmentTotals[assessment.id] || '?'}` : 'N/A') : <span style={{ color: 'var(--border-focus)' }}>N/A</span>}
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

        if (student.program_type === 'stretch') {
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

const AdminStudentsFlow = () => {
  return (
    <main className="login-wrapper" style={{ alignItems: 'flex-start', paddingTop: '4rem' }}>
      <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%', padding: '2rem' }}>
        <Routes>
          <Route path="/" element={<StudentDirectory />} />
          <Route path="/:id" element={<StudentDetail />} />
        </Routes>
      </div>
    </main>
  );
};

export default AdminStudentsFlow;
