import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

const ExaminerFlow = () => {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState('assessments');
  
  const [cohorts, setCohorts] = useState([]);
  const [assessments, setAssessments] = useState([]);
  
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [semester, setSemester] = useState('First');
  const [duration, setDuration] = useState(60);
  const [startTime, setStartTime] = useState('');
  const [instructions, setInstructions] = useState('');
  const [questionType, setQuestionType] = useState('mcq');
  const [editingAssessment, setEditingAssessment] = useState(null);

  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [qType, setQType] = useState('mcq');
  const [questionText, setQuestionText] = useState('');
  const [points, setPoints] = useState(5);
  const [options, setOptions] = useState('Option A, Option B, Option C, Option D');
  const [correctAnswer, setCorrectAnswer] = useState('Option A');
  const [editingQuestion, setEditingQuestion] = useState(null);

  const [scripts, setScripts] = useState([]);
  const [activeScript, setActiveScript] = useState(null);
  const [gradingQuestions, setGradingQuestions] = useState([]);
  const [gradingQuestionsLoading, setGradingQuestionsLoading] = useState(false);
  const [scriptInfractions, setScriptInfractions] = useState([]);

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

  const resetAssessmentForm = () => {
    setCourseName('');
    setCourseCode('');
    setDuration(60);
    setStartTime('');
    setInstructions('');
    setQuestionType('mcq');
    setSemester('First');
    if (cohorts.length > 0) setCohortId(cohorts[0].id);
    setEditingAssessment(null);
  };

  const handleCreateAssessment = async (e) => {
    e.preventDefault();
    if (!cohortId) return toast.error('Select an academic cycle');
    
    let parsedStartTime = new Date(startTime).toISOString();

    if (editingAssessment) {
      const { error } = await supabase.from('assessments').update({
        course_name: courseName,
        course_code: courseCode,
        cohort_id: cohortId,
        semester: semester,
        duration_minutes: duration,
        start_time: parsedStartTime,
        instructions: instructions,
        question_type: questionType
      }).eq('id', editingAssessment.id);

      if (error) return toast.error(error.message);
      toast.success('Assessment updated successfully');
      setAssessments(assessments.map(a => a.id === editingAssessment.id ? {
        ...a,
        course_name: courseName,
        course_code: courseCode,
        cohort_id: cohortId,
        semester: semester,
        duration_minutes: duration,
        start_time: parsedStartTime,
        instructions: instructions,
        question_type: questionType
      } : a));
      resetAssessmentForm();
    } else {
      const { data, error } = await supabase.from('assessments').insert({
        course_name: courseName,
        course_code: courseCode,
        cohort_id: cohortId,
        semester: semester,
        duration_minutes: duration,
        start_time: parsedStartTime,
        instructions: instructions,
        question_type: questionType,
        is_open: false,
        created_by: user.id
      }).select().single();

      if (error) return toast.error(error.message);
      toast.success('Assessment created successfully');
      setAssessments([data, ...assessments]);
      resetAssessmentForm();
    }
  };

  const startEditAssessment = (assessment) => {
    setEditingAssessment(assessment);
    setCourseName(assessment.course_name);
    setCourseCode(assessment.course_code);
    setCohortId(assessment.cohort_id);
    setSemester(assessment.semester);
    setDuration(assessment.duration_minutes);
    setStartTime(new Date(assessment.start_time).toISOString().slice(0, 16));
    setInstructions(assessment.instructions || '');
    setQuestionType(assessment.question_type || 'mcq');
  };

  const deleteAssessment = async (id) => {
    if (!window.confirm('Delete this assessment, all its questions, and candidate submissions? This cannot be undone.')) return;
    await supabase.from('infraction_logs').delete().eq('assessment_id', id);
    const { error: scriptsErr } = await supabase.from('candidate_scripts').delete().eq('assessment_id', id);
    if (scriptsErr) return toast.error('Failed to clear submissions: ' + scriptsErr.message);
    await supabase.from('questions').delete().eq('assessment_id', id);
    const { error } = await supabase.from('assessments').delete().eq('id', id);
    if (error) return toast.error(error.message);
    setAssessments(assessments.filter(a => a.id !== id));
    toast.success('Assessment deleted');
  };

  const fetchGradingQuestions = async (assessmentId) => {
    if (!assessmentId) return;
    setGradingQuestionsLoading(true);
    const { data } = await supabase.from('questions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('sequence_number', { ascending: true });
    if (data) setGradingQuestions(data);
    setGradingQuestionsLoading(false);
  };

  const fetchInfractions = async (candidateId, assessmentId) => {
    const { data } = await supabase.from('infraction_logs')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('assessment_id', assessmentId)
      .order('logged_at', { ascending: true });
    if (data) setScriptInfractions(data);
  };

  const [snapshotModal, setSnapshotModal] = useState(null);
  const [disqualifying, setDisqualifying] = useState(false);

  const disqualifyCandidate = async (script) => {
    if (!window.confirm(`Disqualify ${script.profiles?.full_name || 'this candidate'} and set score to 0? This action cannot be undone.`)) return;
    setDisqualifying(true);
    const { error } = await supabase.from('candidate_scripts').update({
      auto_mcq_score: 0,
      manual_theory_score: 0,
      is_graded: true,
      device_info: (script.device_info || '') + ' | DISQUALIFIED: Exam cancelled due to confirmed malpractice.'
    }).eq('id', script.id);
    setDisqualifying(false);
    if (error) return toast.error('Failed to disqualify: ' + error.message);
    toast.success('Candidate disqualified. Score set to 0.');
    setActiveScript(null);
    if (selectedAssessmentId) fetchScripts(selectedAssessmentId);
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
    setEditingQuestion(null);
    resetQuestionForm();
    if (aid) {
      const assessment = assessments.find(a => a.id === aid);
      if (assessment) setQType(assessment.question_type || 'mcq');
      fetchQuestions(aid);
    } else setQuestions([]);
  };

  const handleAssessmentSelectForGrading = async (e) => {
    const aid = e.target.value;
    setSelectedAssessmentId(aid);
    setActiveScript(null);
    if (aid) {
      const { data: scriptsData } = await supabase.from('candidate_scripts')
        .select('*, profiles(full_name, matriculation_number)')
        .eq('assessment_id', aid);
      if (scriptsData) setScripts(scriptsData);
      fetchGradingQuestions(aid);
    } else {
      setScripts([]);
      setGradingQuestions([]);
    }
  };

  const resetQuestionForm = () => {
    setQuestionText('');
    setPoints(5);
    setOptions('Option A, Option B, Option C, Option D');
    setCorrectAnswer('Option A');
    setEditingQuestion(null);
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    if (!selectedAssessmentId) return toast.error('Select an assessment first');

    const selectedAssessment = assessments.find(a => a.id === selectedAssessmentId);
    const effectiveQType = selectedAssessment?.question_type || 'mcq';

    if (editingQuestion) {
      let payload = {
        q_type: effectiveQType,
        question_text: questionText,
        points: Number(points),
      };

      if (effectiveQType === 'mcq') {
        const optsArray = typeof options === 'string'
          ? options.split(',').map(o => o.trim()).filter(Boolean)
          : (Array.isArray(options) ? options : []);
        payload.options = optsArray;
        payload.correct_answer = correctAnswer.trim();
      } else {
        payload.options = null;
        payload.correct_answer = null;
      }

      const { data, error } = await supabase
        .from('questions')
        .update(payload)
        .eq('id', editingQuestion.id)
        .select();

      if (error) return toast.error(error.message);
      if (!data || data.length === 0) {
        return toast.error('Failed to update question in database. Please check permissions or verify row exists.');
      }

      toast.success('Question updated successfully');
      await fetchQuestions(selectedAssessmentId);
      resetQuestionForm();
    } else {
      const newSeq = questions.length + 1;
      let payload = {
        assessment_id: selectedAssessmentId,
        q_type: effectiveQType,
        question_text: questionText,
        points: Number(points),
        sequence_number: newSeq
      };

      if (effectiveQType === 'mcq') {
        const optsArray = typeof options === 'string'
          ? options.split(',').map(o => o.trim()).filter(Boolean)
          : (Array.isArray(options) ? options : []);
        payload.options = optsArray;
        payload.correct_answer = correctAnswer.trim();
      }

      const { data, error } = await supabase.from('questions').insert(payload).select().single();
      if (error) return toast.error(error.message);
      toast.success('Question added');
      setQuestions([...questions, data]);
      setQuestionText('');
    }
  };

  const startEditQuestion = (question) => {
    setEditingQuestion(question);
    setQType(question.q_type);
    setQuestionText(question.question_text);
    setPoints(question.points);
    if (question.q_type === 'mcq') {
      const formattedOptions = Array.isArray(question.options)
        ? question.options.join(', ')
        : (question.options || '');
      setOptions(formattedOptions);
      setCorrectAnswer(question.correct_answer || '');
    } else {
      setOptions('Option A, Option B, Option C, Option D');
      setCorrectAnswer('Option A');
    }
  };

  const deleteQuestion = async (id) => {
    if (!window.confirm('Delete this question? This cannot be undone.')) return;
    const { error } = await supabase.from('questions').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Question deleted');
    if (editingQuestion?.id === id) resetQuestionForm();
    fetchQuestions(selectedAssessmentId);
  };

  const saveTheoryGrade = async (scriptId, newScore) => {
    await supabase.from('candidate_scripts').update({ manual_theory_score: Number(newScore), is_graded: true }).eq('id', scriptId);
    setScripts(scripts.map(s => s.id === scriptId ? { ...s, manual_theory_score: Number(newScore), is_graded: true } : s));
  };

  const saveQuestionScores = async (scriptId, questionScores) => {
    const theoryTotal = Object.values(questionScores).reduce((sum, s) => sum + Number(s), 0);
    await supabase.from('candidate_scripts').update({
      question_scores: questionScores,
      manual_theory_score: theoryTotal,
      is_graded: true
    }).eq('id', scriptId);
    setScripts(scripts.map(s => s.id === scriptId ? { ...s, question_scores: questionScores, manual_theory_score: theoryTotal, is_graded: true } : s));
    toast.success('Scores saved');
  };

  return (
    <main className="login-wrapper" style={{ alignItems: 'flex-start', paddingTop: '4rem' }}>
      <div className="glass-panel responsive-panel" style={{ maxWidth: '1000px', width: '100%' }}>
        <header style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.5rem' }}>
          <h2 style={{ color: 'var(--text-ivory)', fontFamily: 'var(--font-heading)' }}>Examiner Portal</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Orchestrate assessments, questions, and evaluations.</p>
        </header>

        <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem', overflowX: 'auto' }}>
          {['assessments', 'questions', 'grading'].map(tab => (
            <span
              key={tab}
              className={activeTab === tab ? 'active-link' : ''}
              onClick={() => { setActiveTab(tab); setSelectedAssessmentId(''); setActiveScript(null); resetQuestionForm(); setEditingAssessment(null); resetAssessmentForm(); }}
              style={{ cursor: 'pointer', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: activeTab === tab ? 'var(--text-ivory)' : 'var(--text-muted)' }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </span>
          ))}
        </div>
        
        {activeTab === 'assessments' && (
          <div>
            <h3 style={{ color: 'var(--text-ivory)', marginBottom: '1rem' }}>
              {editingAssessment ? 'Edit Assessment' : 'Create Assessment'}
            </h3>
            <form onSubmit={handleCreateAssessment} className="responsive-grid" style={{ marginBottom: '3rem' }}>
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
                <label>Question Type</label>
                <select value={questionType} onChange={e=>setQuestionType(e.target.value)} style={{ padding: '0.8rem', background: 'var(--bg-surface-solid)', border: '1px solid var(--border-focus)', color: 'var(--text-ivory)', width: '100%' }}>
                  <option value="mcq">Multiple Choice (MCQ)</option>
                  <option value="theory">Theory / Essay</option>
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
              <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                <label>Instructions for Candidates</label>
                <textarea
                  value={instructions}
                  onChange={e=>setInstructions(e.target.value)}
                  rows={4}
                  placeholder="e.g. Answer all questions. Each theory question must be at least 200 words. No electronic devices allowed."
                  style={{ width: '100%', background: 'var(--bg-surface-solid)', padding: '0.5rem', color: 'var(--text-ivory)', outline: 'none', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-body)', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
                <button type="submit" className="btn-premium primary" style={{ flex: 1 }}>
                  {editingAssessment ? 'Update Assessment' : 'Create Assessment'}
                </button>
                {editingAssessment && (
                  <button type="button" className="btn-premium secondary" onClick={resetAssessmentForm} style={{ flex: 1 }}>
                    Cancel
                  </button>
                )}
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
                    <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '1rem' }}>{a.course_code} - {a.course_name} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({a.semester})</span></td>
                      <td style={{ padding: '1rem' }}>{a.duration_minutes}m</td>
                      <td style={{ padding: '1rem' }}>{a.is_open ? 'Open' : 'Closed'}</td>
                      <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button onClick={() => toggleAssessmentStatus(a.id, a.is_open)} className="btn-premium" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                          {a.is_open ? 'Close' : 'Open'}
                        </button>
                        <button onClick={() => startEditAssessment(a)} className="btn-premium secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                          Edit
                        </button>
                        <button onClick={() => deleteAssessment(a.id)} className="btn-premium" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: '#ff4d4f', borderColor: 'rgba(255,77,79,0.3)' }}>
                          Delete
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
              <div className="responsive-split-grid">
                <div style={{ background: 'var(--bg-surface-hover)', padding: '1.5rem', borderRadius: '4px' }}>
                  <h4 style={{ color: 'var(--accent-gold)', marginBottom: '1rem' }}>
                    {editingQuestion ? 'Edit Question' : 'Add Question'}
                  </h4>
                  <form onSubmit={handleAddQuestion} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {(() => {
                      const selectedAssessment = assessments.find(a => a.id === selectedAssessmentId);
                      const lockedType = selectedAssessment?.question_type;
                      return (
                        <div style={{ padding: '0.5rem', background: 'var(--bg-surface-solid)', color: 'var(--text-ivory)', borderRadius: '4px', fontSize: '0.9rem', textAlign: 'center', border: '1px solid var(--border-focus)' }}>
                          Question Type: <strong style={{ color: 'var(--accent-gold)' }}>{lockedType === 'mcq' ? 'Multiple Choice' : 'Theory / Essay'}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>(set by assessment)</span>
                        </div>
                      );
                    })()}
                    
                    <textarea placeholder="Question Text" required value={questionText} onChange={e=>setQuestionText(e.target.value)} rows={4} style={{ background: 'var(--bg-surface-solid)', padding: '0.5rem', color: 'var(--text-ivory)', outline: 'none', border: '1px solid var(--border-subtle)' }}></textarea>
                    
                    <input type="number" placeholder="Points" value={points} onChange={e=>setPoints(e.target.value)} required style={{ background: 'var(--bg-surface-solid)', padding: '0.5rem', color: 'var(--text-ivory)' }} />
                    
                    {qType === 'mcq' && (
                      <>
                        <input type="text" placeholder="Options (comma separated)" value={options} onChange={e=>setOptions(e.target.value)} required style={{ background: 'var(--bg-surface-solid)', padding: '0.5rem', color: 'var(--text-ivory)' }} />
                        <input type="text" placeholder="Exact Correct Option" value={correctAnswer} onChange={e=>setCorrectAnswer(e.target.value)} required style={{ background: 'var(--bg-surface-solid)', padding: '0.5rem', color: 'var(--text-ivory)' }} />
                      </>
                    )}
                    
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="submit" className="btn-premium primary" style={{ flex: 1 }}>
                        {editingQuestion ? 'Update Question' : 'Save Question'}
                      </button>
                      {editingQuestion && (
                        <button type="button" className="btn-premium secondary" onClick={resetQuestionForm} style={{ flex: 1 }}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                </div>
                
                <div>
                  <h4 style={{ color: 'var(--text-ivory)', marginBottom: '1rem' }}>Question Bank</h4>
                  {questions.map((q, i) => (
                    <div key={q.id} style={{ background: 'var(--bg-surface-solid)', padding: '1rem', marginBottom: '1rem', borderLeft: '3px solid var(--accent-gold)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Q{i+1}. {q.q_type.toUpperCase()} ({q.points} Pts)</div>
                          <div style={{ color: 'var(--text-ivory)', margin: '0.5rem 0' }}>{q.question_text}</div>
                          {q.q_type === 'mcq' && (
                            <div style={{ fontSize: '0.85rem', color: '#aaa' }}>
                              Options: {Array.isArray(q.options) ? q.options.join(' | ') : (q.options || '')}<br />
                              <span style={{ color: '#00ff88' }}>Ans: {q.correct_answer}</span>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, marginLeft: '1rem' }}>
                          <button onClick={() => startEditQuestion(q)} className="btn-premium secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>Edit</button>
                          <button onClick={() => deleteQuestion(q.id)} className="btn-premium" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#ff4d4f', borderColor: 'rgba(255,77,79,0.3)' }}>Del</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {questions.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No questions added yet.</p>}
                </div>
              </div>
            )}
          </div>
        )}

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
                      <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Student</th>
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
                          <button onClick={() => { setActiveScript(s); setScriptInfractions([]); fetchInfractions(s.candidate_id, selectedAssessmentId); if (gradingQuestions.length === 0) fetchGradingQuestions(selectedAssessmentId); }} className="btn-premium" style={{ padding: '0.4rem 0.8rem' }}>Review Script</button>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3 style={{ color: 'var(--accent-gold)' }}>Script Review: {activeScript.profiles?.full_name}</h3>
                  <button onClick={() => setActiveScript(null)} className="btn-premium secondary" style={{ padding: '0.4rem 0.8rem' }}>Back to List</button>
                </div>

                {(activeScript.device_info || activeScript.ip_address) && (
                  <div style={{ marginBottom: '2rem', padding: '0.75rem', background: 'var(--bg-obsidian)', borderRadius: '4px', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                      {activeScript.ip_address && (
                        <span><span style={{ color: 'var(--text-muted)' }}>IP:</span> <span style={{ color: 'var(--text-ivory)' }}>{activeScript.ip_address}</span></span>
                      )}
                      {activeScript.location_lat && activeScript.location_lng && (
                        <span>
                          <span style={{ color: 'var(--text-muted)' }}>Location:</span>
                          <span style={{ color: 'var(--text-ivory)' }}>
                            {activeScript.location_lat.toFixed(4)}, {activeScript.location_lng.toFixed(4)}
                            <a href={`https://www.google.com/maps?q=${activeScript.location_lat},${activeScript.location_lng}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-gold)', marginLeft: '0.5rem', fontSize: '0.75rem' }}>Map</a>
                          </span>
                        </span>
                      )}
                    </div>
                    {activeScript.device_info && (
                      <div style={{ marginTop: '0.4rem', wordBreak: 'break-word' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Device:</span>
                        <span style={{ color: 'var(--text-ivory)', marginLeft: '0.5rem' }}>{activeScript.device_info}</span>
                      </div>
                    )}
                  </div>
                )}
                
                <div style={{ marginBottom: '2rem' }}>
                  <h4 style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Student Answers</h4>
                  {gradingQuestions.map((q, idx) => {
                    const answer = activeScript.answers[q.id];
                    const isMcq = q.q_type === 'mcq';
                    const isCorrect = isMcq && answer === q.correct_answer;
                    const currentScore = activeScript.question_scores?.[q.id];
                    return (
                      <div key={q.id} style={{ background: 'var(--bg-obsidian)', padding: '1rem', marginBottom: '1rem', borderLeft: '3px solid var(--accent-gold)', borderRadius: '4px' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                          Q{idx + 1}. {q.q_type.toUpperCase()} ({q.points} Pts)
                        </div>
                        <div style={{ color: 'var(--text-ivory)', marginBottom: '0.75rem', lineHeight: '1.5' }}>
                          {q.question_text}
                        </div>
                        {answer !== undefined && answer !== '' ? (
                          <div style={{
                            background: isMcq ? (isCorrect ? 'rgba(0,255,136,0.08)' : 'rgba(255,77,79,0.08)') : 'rgba(255,255,255,0.03)',
                            padding: '0.75rem',
                            borderRadius: '4px',
                            border: `1px solid ${isMcq ? (isCorrect ? '#00cc66' : '#ff4d4f') : 'var(--border-subtle)'}`
                          }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Candidate's Answer:</div>
                            <div style={{ color: 'var(--text-ivory)', whiteSpace: 'pre-wrap' }}>{answer}</div>
                            {isMcq && (
                              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: isCorrect ? '#00cc66' : '#ffaa33' }}>
                                {isCorrect ? '✓ Correct (+{q.points} pts)' : `✗ Incorrect (Correct answer: ${q.correct_answer})`}
                              </div>
                            )}
                            {!isMcq && (
                              <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Score (out of {q.points}):</label>
                                <input
                                  type="number"
                                  defaultValue={currentScore !== undefined ? currentScore : ''}
                                  min={0}
                                  max={q.points}
                                  onChange={(e) => {
                                    if (!activeScript.draftScores) activeScript.draftScores = {};
                                    activeScript.draftScores[q.id] = e.target.value;
                                  }}
                                  style={{ background: 'var(--bg-obsidian)', border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)', padding: '0.3rem', fontSize: '1rem', width: '70px', textAlign: 'center' }}
                                  placeholder="--"
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ color: '#ff4d4f', fontStyle: 'italic' }}>No answer provided</div>
                        )}
                      </div>
                    );
                  })}
                  {gradingQuestionsLoading && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Loading questions...</div>
                  )}
                  {!gradingQuestionsLoading && gradingQuestions.length === 0 && (
                    <pre style={{ background: 'var(--bg-obsidian)', padding: '1rem', color: 'var(--text-ivory)', overflowX: 'auto' }}>
                      {JSON.stringify(activeScript.answers, null, 2)}
                    </pre>
                  )}
                </div>

                {/* Snapshot Viewer Modal */}
                {snapshotModal && (
                  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setSnapshotModal(null)}>
                    <div style={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--accent-gold)', borderRadius: '8px', maxWidth: '900px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <div>
                          <h4 style={{ color: '#ff4d4f', margin: 0 }}>📸 Screen Capture Evidence</h4>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
                            {snapshotModal.type} · {new Date(snapshotModal.logged_at).toLocaleString()}
                          </p>
                        </div>
                        <button onClick={() => setSnapshotModal(null)} style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', borderRadius: '4px', padding: '0.3rem 0.7rem', cursor: 'pointer' }}>✕ Close</button>
                      </div>
                      <img
                        src={snapshotModal.snapshot}
                        alt="Screen capture at time of infraction"
                        style={{ width: '100%', borderRadius: '4px', border: '1px solid var(--border-subtle)', maxHeight: '70vh', objectFit: 'contain', background: '#000' }}
                      />
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.75rem', lineHeight: '1.4' }}>
                        <strong style={{ color: 'var(--text-ivory)' }}>Details:</strong> {snapshotModal.details?.split('\n[SNAPSHOT]')[0]}
                      </p>
                    </div>
                  </div>
                )}

                {scriptInfractions.length > 0 && (
                  <div style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <h4 style={{ color: '#ff4d4f', margin: 0 }}>🔍 Proctoring Evidence Log ({scriptInfractions.length} infractions)</h4>
                      <button
                        onClick={() => disqualifyCandidate(activeScript)}
                        disabled={disqualifying}
                        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '4px', padding: '0.4rem 1rem', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.82rem', opacity: disqualifying ? 0.6 : 1 }}
                      >
                        {disqualifying ? 'Disqualifying...' : '🚫 Disqualify Candidate (Score 0)'}
                      </button>
                    </div>

                    {/* Screen Snapshot Thumbnail Strip */}
                    {(() => {
                      const withSnapshots = scriptInfractions.filter(inf => inf.details?.includes('[SNAPSHOT]:'));
                      if (withSnapshots.length === 0) return null;
                      return (
                        <div style={{ marginBottom: '1rem' }}>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📸 {withSnapshots.length} Screen Capture(s) — Click to Inspect</p>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {withSnapshots.map((inf, idx) => {
                              const snapshotData = inf.details?.split('\n[SNAPSHOT]: ')[1];
                              return (
                                <div
                                  key={inf.id}
                                  onClick={() => setSnapshotModal({ ...inf, snapshot: snapshotData })}
                                  style={{ cursor: 'pointer', border: '2px solid #ef4444', borderRadius: '4px', overflow: 'hidden', width: '120px', height: '70px', position: 'relative', flexShrink: 0, background: '#000' }}
                                  title={`Capture ${idx + 1}: ${inf.infraction_type} at ${new Date(inf.logged_at).toLocaleTimeString()}`}
                                >
                                  <img src={snapshotData} alt={`Capture ${idx+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }} />
                                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.7)', padding: '2px 4px', fontSize: '0.65rem', color: '#fca5a5', textAlign: 'center' }}>
                                    #{idx + 1} · {inf.infraction_type}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    <div style={{ maxHeight: '220px', overflowY: 'auto', background: 'var(--bg-obsidian)', borderRadius: '4px', padding: '0.75rem' }}>
                      {scriptInfractions.map(inf => {
                        const hasSnapshot = inf.details?.includes('[SNAPSHOT]:');
                        const cleanDetails = inf.details?.split('\n[SNAPSHOT]')[0];
                        const snapshotData = hasSnapshot ? inf.details?.split('\n[SNAPSHOT]: ')[1] : null;
                        const typeColor = inf.infraction_type === 'visibilitychange' || inf.infraction_type === 'proctor_disconnected' ? '#ff4d4f' :
                          inf.infraction_type === 'copy_paste' ? '#f97316' : '#ffaa33';
                        return (
                          <div key={inf.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.82rem', alignItems: 'flex-start' }}>
                            <span style={{ color: 'var(--text-muted)', minWidth: '100px', flexShrink: 0 }}>{new Date(inf.logged_at).toLocaleTimeString()}</span>
                            <span style={{ color: typeColor, fontWeight: 'bold', minWidth: '110px', flexShrink: 0 }}>{inf.infraction_type}</span>
                            <span style={{ color: 'var(--text-ivory)', flex: 1 }}>{cleanDetails}</span>
                            {hasSnapshot && snapshotData && (
                              <button
                                onClick={() => setSnapshotModal({ ...inf, snapshot: snapshotData })}
                                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '3px', padding: '0.15rem 0.5rem', cursor: 'pointer', fontSize: '0.72rem', flexShrink: 0 }}
                              >📸 View Screen</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ borderTop: '1px dashed var(--border-subtle)', paddingTop: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Auto MCQ Score</label>
                    <div style={{ fontSize: '1.5rem', color: 'var(--text-ivory)' }}>{activeScript.auto_mcq_score} Pts</div>
                  </div>
                  <div>
                    <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Theory Total</label>
                    <div style={{ fontSize: '1.5rem', color: 'var(--accent-gold)' }}>{activeScript.manual_theory_score} Pts</div>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <button
                      onClick={() => {
                        if (!activeScript.draftScores && !window.confirm('No per-question scores entered. Save anyway?')) return;
                        saveQuestionScores(activeScript.id, activeScript.draftScores || {});
                      }}
                      className="btn-premium primary"
                    >
                      Save All Scores
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
