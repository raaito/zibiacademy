import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

const ExaminerFlow = () => {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState('assessments'); // 'assessments', 'questions', 'grading'
  
  // Data
  const [cohorts, setCohorts] = useState([]);
  const [assessments, setAssessments] = useState([]);
  
  // Create Assessment State
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [semester, setSemester] = useState('First');
  const [duration, setDuration] = useState(60);
  const [startTime, setStartTime] = useState('');

  // Questions State
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [qType, setQType] = useState('mcq');
  const [questionText, setQuestionText] = useState('');
  const [points, setPoints] = useState(5);
  const [options, setOptions] = useState("Option A, Option B, Option C, Option D"); // Comma separated for simplicity MVP
  const [correctAnswer, setCorrectAnswer] = useState('Option A');

  // Grading State
  const [scripts, setScripts] = useState([]);
  const [activeScript, setActiveScript] = useState(null);

  useEffect(() => {
    if (user) {
      fetchCohorts();
      fetchAssessments();
    }
  }, [user]);

  const fetchCohorts = async () => {
    const { data } = await supabase.from('academic_years').select('*').order('created_at', { ascending: false });
    if (data) {
      setCohorts(data);
      if (data.length > 0) setCohortId(data[0].id);
    }
  };

  const fetchAssessments = async () => {
    const { data } = await supabase.from('assessments').select('*').eq('created_by', user.id).order('created_at', { ascending: false });
    if (data) setAssessments(data);
  };

  const handleCreateAssessment = async (e) => {
    e.preventDefault();
    if (!cohortId) return toast.error('Select an academic cycle');
    
    // Convert local datetime to UTC ISO string
    let parsedStartTime = new Date(startTime).toISOString();

    const { data, error } = await supabase.from('assessments').insert({
      course_name: courseName,
      course_code: courseCode,
      cohort_id: cohortId,
      semester: semester,
      duration_minutes: duration,
      start_time: parsedStartTime,
      is_open: false,
      created_by: user.id
    }).select().single();

    if (error) toast.error(error.message);
    if (data) {
      toast.success('Assessment created successfully');
      setAssessments([data, ...assessments]);
      setCourseName('');
      setCourseCode('');
    }
  };

  const toggleAssessmentStatus = async (id, currentStatus) => {
    const { error } = await supabase.from('assessments').update({ is_open: !currentStatus }).eq('id', id);
    if (error) return toast.error(error.message);
    setAssessments(assessments.map(a => a.id === id ? { ...a, is_open: !currentStatus } : a));
    toast.success(`Assessment is now ${!currentStatus ? 'Open' : 'Closed'}`);
  };

  const fetchQuestions = async (assessmentId) => {
    const { data } = await supabase.from('questions').select('*').eq('assessment_id', assessmentId).order('sequence_number', { ascending: true });
    if (data) setQuestions(data);
  };

  const handleAssessmentSelectForQuestions = (e) => {
    const aid = e.target.value;
    setSelectedAssessmentId(aid);
    if (aid) fetchQuestions(aid);
    else setQuestions([]);
  };

  const handleAssessmentSelectForGrading = async (e) => {
    const aid = e.target.value;
    setSelectedAssessmentId(aid);
    setActiveScript(null);
    if (aid) {
      const { data } = await supabase.from('candidate_scripts')
        .select('*, profiles(full_name, matriculation_number)')
        .eq('assessment_id', aid);
      if (data) setScripts(data);
    } else {
      setScripts([]);
    }
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    if (!selectedAssessmentId) return toast.error('Select an assessment first');

    const newSeq = questions.length + 1;
    let payload = {
      assessment_id: selectedAssessmentId,
      q_type: qType,
      question_text: questionText,
      points: Number(points),
      sequence_number: newSeq
    };

    if (qType === 'mcq') {
      payload.options = options.split(',').map(o => o.trim());
      payload.correct_answer = correctAnswer.trim();
    }

    const { data, error } = await supabase.from('questions').insert(payload).select().single();
    if (error) toast.error(error.message);
    if (data) {
      toast.success('Question added');
      setQuestions([...questions, data]);
      setQuestionText('');
    }
  };

  // Simplified grading save
  const saveTheoryGrade = async (scriptId, newScore) => {
    // In a real app, this would be per question, but our schema just has `manual_theory_score` for the whole script.
    await supabase.from('candidate_scripts').update({ manual_theory_score: Number(newScore), is_graded: true }).eq('id', scriptId);
    setScripts(scripts.map(s => s.id === scriptId ? { ...s, manual_theory_score: Number(newScore), is_graded: true } : s));
  };

  return (
    <main className="login-wrapper" style={{ alignItems: 'flex-start', paddingTop: '4rem' }}>
      <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%', padding: '2rem' }}>
        <header style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.5rem' }}>
          <h2 style={{ color: 'var(--text-ivory)', fontFamily: 'var(--font-heading)' }}>Examiner Portal</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Orchestrate assessments, questions, and evaluations.</p>
        </header>

        <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem', overflowX: 'auto' }}>
          {['assessments', 'questions', 'grading'].map(tab => (
            <span 
              key={tab}
              className={activeTab === tab ? 'active-link' : ''} 
              onClick={() => { setActiveTab(tab); setSelectedAssessmentId(''); setActiveScript(null); }}
              style={{ cursor: 'pointer', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: activeTab === tab ? 'var(--text-ivory)' : 'var(--text-muted)' }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </span>
          ))}
        </div>
        
        {/* ASSESSMENTS TAB */}
        {activeTab === 'assessments' && (
          <div>
            <h3 style={{ color: 'var(--text-ivory)', marginBottom: '1rem' }}>Create Assessment</h3>
            <form onSubmit={handleCreateAssessment} style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr', marginBottom: '3rem' }}>
              <div className="input-group">
                <label>Course Name</label>
                <input type="text" value={courseName} onChange={e=>setCourseName(e.target.value)} required />
              </div>
              <div className="input-group">
                <label>Course Code</label>
                <input type="text" value={courseCode} onChange={e=>setCourseCode(e.target.value)} required />
              </div>
              <div className="input-group">
                <label>Academic Cycle</label>
                <select value={cohortId} onChange={e=>setCohortId(e.target.value)} style={{ padding: '0.8rem', background: 'var(--bg-surface-solid)', border: '1px solid var(--border-focus)', color: 'var(--text-ivory)', width: '100%' }}>
                  {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Semester</label>
                <select value={semester} onChange={e=>setSemester(e.target.value)} style={{ padding: '0.8rem', background: 'var(--bg-surface-solid)', border: '1px solid var(--border-focus)', color: 'var(--text-ivory)', width: '100%' }}>
                  <option value="First">First</option>
                  <option value="Second">Second</option>
                </select>
              </div>
              <div className="input-group">
                <label>Duration (Minutes)</label>
                <input type="number" value={duration} onChange={e=>setDuration(e.target.value)} required min={1} />
              </div>
              <div className="input-group">
                <label>Start Time</label>
                <input type="datetime-local" value={startTime} onChange={e=>setStartTime(e.target.value)} required />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="submit" className="btn-premium primary" style={{ width: '100%' }}>Create Assessment</button>
              </div>
            </form>

            <h3 style={{ color: 'var(--text-ivory)', marginBottom: '1rem' }}>Your Assessments</h3>
            <div className="admin-table-container">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'var(--text-body)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Course</th>
                    <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Duration</th>
                    <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Status</th>
                    <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '1rem' }}>{a.course_code} - {a.course_name} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({a.semester})</span></td>
                      <td style={{ padding: '1rem' }}>{a.duration_minutes}m</td>
                      <td style={{ padding: '1rem' }}>{a.is_open ? 'Open' : 'Closed'}</td>
                      <td style={{ padding: '1rem' }}>
                        <button onClick={() => toggleAssessmentStatus(a.id, a.is_open)} className="btn-premium" style={{ padding: '0.4rem 0.8rem' }}>
                          {a.is_open ? 'Close Exam' : 'Open Exam'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {assessments.length === 0 && <tr><td colSpan="4" style={{ padding: '1rem', textAlign: 'center' }}>No assessments found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* QUESTIONS TAB */}
        {activeTab === 'questions' && (
          <div>
            <div className="input-group" style={{ marginBottom: '2rem' }}>
              <label>Select Assessment</label>
              <select value={selectedAssessmentId} onChange={handleAssessmentSelectForQuestions} style={{ padding: '0.8rem', background: 'var(--bg-surface-solid)', border: '1px solid var(--border-focus)', color: 'var(--text-ivory)', width: '100%' }}>
                <option value="">- Please select -</option>
                {assessments.map(a => <option key={a.id} value={a.id}>{a.course_code}</option>)}
              </select>
            </div>

            {selectedAssessmentId && (
              <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: 'minmax(300px, 1fr) 2fr' }}>
                <div style={{ background: 'var(--bg-surface-hover)', padding: '1.5rem', borderRadius: '4px' }}>
                  <h4 style={{ color: 'var(--accent-gold)', marginBottom: '1rem' }}>Add Question</h4>
                  <form onSubmit={handleAddQuestion} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <select value={qType} onChange={e=>setQType(e.target.value)} style={{ padding: '0.5rem', background: 'var(--bg-surface-solid)', color: 'var(--text-ivory)' }}>
                      <option value="mcq">Multiple Choice</option>
                      <option value="theory">Theory / Essay</option>
                    </select>
                    
                    <textarea placeholder="Question Text" required value={questionText} onChange={e=>setQuestionText(e.target.value)} rows={4} style={{ background: 'var(--bg-surface-solid)', padding: '0.5rem', color: 'var(--text-ivory)', outline: 'none', border: '1px solid var(--border-subtle)' }}></textarea>
                    
                    <input type="number" placeholder="Points" value={points} onChange={e=>setPoints(e.target.value)} required style={{ background: 'var(--bg-surface-solid)', padding: '0.5rem', color: 'var(--text-ivory)' }} />
                    
                    {qType === 'mcq' && (
                      <>
                        <input type="text" placeholder="Options (comma separated)" value={options} onChange={e=>setOptions(e.target.value)} required style={{ background: 'var(--bg-surface-solid)', padding: '0.5rem', color: 'var(--text-ivory)' }} />
                        <input type="text" placeholder="Exact Correct Option" value={correctAnswer} onChange={e=>setCorrectAnswer(e.target.value)} required style={{ background: 'var(--bg-surface-solid)', padding: '0.5rem', color: 'var(--text-ivory)' }} />
                      </>
                    )}
                    
                    <button type="submit" className="btn-premium primary">Save Question</button>
                  </form>
                </div>
                
                <div>
                  <h4 style={{ color: 'var(--text-ivory)', marginBottom: '1rem' }}>Question Bank</h4>
                  {questions.map((q, i) => (
                    <div key={q.id} style={{ background: 'var(--bg-surface-solid)', padding: '1rem', marginBottom: '1rem', borderLeft: '3px solid var(--accent-gold)' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Q{i+1}. {q.q_type.toUpperCase()} ({q.points} Pts)</div>
                      <div style={{ color: 'var(--text-ivory)', margin: '0.5rem 0' }}>{q.question_text}</div>
                      {q.q_type === 'mcq' && (
                        <div style={{ fontSize: '0.85rem', color: '#aaa' }}>
                          Options: {q.options.join(' | ')}<br />
                          <span style={{ color: '#00ff88' }}>Ans: {q.correct_answer}</span>
                        </div>
                      )}
                    </div>
                  ))}
                  {questions.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No questions added yet.</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* GRADING TAB */}
        {activeTab === 'grading' && (
          <div>
            <div className="input-group" style={{ marginBottom: '2rem' }}>
              <label>Select Assessment to Grade</label>
              <select value={selectedAssessmentId} onChange={handleAssessmentSelectForGrading} style={{ padding: '0.8rem', background: 'var(--bg-surface-solid)', border: '1px solid var(--border-focus)', color: 'var(--text-ivory)', width: '100%' }}>
                <option value="">- Please select -</option>
                {assessments.map(a => <option key={a.id} value={a.id}>{a.course_code}</option>)}
              </select>
            </div>

            {selectedAssessmentId && !activeScript && (
              <div className="admin-table-container">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'var(--text-body)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Candidate</th>
                      <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Status</th>
                      <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>MCQ Score</th>
                      <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Theory Score</th>
                      <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scripts.map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '1rem' }}>{s.profiles?.full_name} ({s.profiles?.matriculation_number})</td>
                        <td style={{ padding: '1rem' }}>{s.is_graded ? 'Graded' : 'Pending Review'}</td>
                        <td style={{ padding: '1rem' }}>{s.auto_mcq_score}</td>
                        <td style={{ padding: '1rem' }}>{s.manual_theory_score}</td>
                        <td style={{ padding: '1rem' }}>
                          <button onClick={() => setActiveScript(s)} className="btn-premium" style={{ padding: '0.4rem 0.8rem' }}>Review Script</button>
                        </td>
                      </tr>
                    ))}
                    {scripts.length === 0 && <tr><td colSpan="5" style={{ padding: '1rem', textAlign: 'center' }}>No submissions yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {activeScript && (
              <div style={{ background: 'var(--bg-surface-solid)', padding: '2rem', borderRadius: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                  <h3 style={{ color: 'var(--accent-gold)' }}>Script Review: {activeScript.profiles?.full_name}</h3>
                  <button onClick={() => setActiveScript(null)} className="btn-premium secondary" style={{ padding: '0.4rem 0.8rem' }}>Back to List</button>
                </div>
                
                {/* Because our answers payload is a JSON blob, we just render it out simply for MVP */}
                <div style={{ marginBottom: '2rem' }}>
                  <h4 style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Candidate Answers Payload</h4>
                  <pre style={{ background: 'var(--bg-obsidian)', padding: '1rem', color: 'var(--text-ivory)', overflowX: 'auto' }}>
                    {JSON.stringify(activeScript.answers, null, 2)}
                  </pre>
                </div>

                <div style={{ borderTop: '1px dashed var(--border-subtle)', paddingTop: '2rem', display: 'flex', alignItems: 'center', gap: '2rem' }}>
                  <div>
                    <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Auto MCQ Score</label>
                    <div style={{ fontSize: '1.5rem', color: 'var(--text-ivory)' }}>{activeScript.auto_mcq_score} Pts</div>
                  </div>
                  <div>
                    <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Manual Theory Score</label>
                    <input 
                      type="number" 
                      defaultValue={activeScript.manual_theory_score} 
                      onChange={(e) => activeScript.draft_score = e.target.value}
                      style={{ background: 'var(--bg-obsidian)', border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)', padding: '0.5rem', fontSize: '1.2rem', width: '100px', textAlign: 'center' }} 
                    />
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <button 
                      onClick={() => saveTheoryGrade(activeScript.id, activeScript.draft_score || activeScript.manual_theory_score)} 
                      className="btn-premium primary"
                    >
                      Save Grade
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
};

export default ExaminerFlow;
