import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

const StudentFlow = () => {
  const { user, profile } = useAuth();
  const [examState, setExamState] = useState('dashboard'); // dashboard, taking_exam, finished
  const [assessments, setAssessments] = useState([]);
  const [takenScripts, setTakenScripts] = useState([]);

  // Active Exam States
  const [activeExam, setActiveExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (user && profile && examState === 'dashboard') {
      fetchAssessments();
    }
  }, [user, profile, examState]);

  const fetchAssessments = async () => {
    if (!profile.cohort_id) return;
    const { data } = await supabase.from('assessments')
      .select('*')
      .eq('cohort_id', profile.cohort_id)
      .order('semester', { ascending: true })
      .order('created_at', { ascending: false });

    if (data) {
      setAssessments(data);
      const { data: scripts } = await supabase.from('candidate_scripts').select('*').eq('candidate_id', user.id);
      if (scripts) setTakenScripts(scripts);
    }
  };

  const startExam = async (exam) => {
    setActiveExam(exam);
    setTimeLeft(exam.duration_minutes * 60);

    // Fetch questions
    const { data } = await supabase.from('questions')
      .select('*')
      .eq('assessment_id', exam.id)
      .order('sequence_number', { ascending: true });

    if (data) setQuestions(data);
    setExamState('taking_exam');
  };

  const logInfraction = async (type, details) => {
    if (!activeExam || !user) return;
    await supabase.from('infraction_logs').insert({
      candidate_id: user.id,
      assessment_id: activeExam.id,
      infraction_type: type,
      details: details
    });
  };

  // Anti-Cheat Engine Log
  useEffect(() => {
    if (examState !== 'taking_exam') return;

    const handleVisibility = () => {
      if (document.hidden) logInfraction('visibilitychange', 'App Switched / Tab Hidden');
    };

    const handleBlur = () => {
      logInfraction('blur', 'Browser window lost focus');
    };

    const preventCopyPaste = (e) => {
      e.preventDefault();
      logInfraction('copy_paste', `Clipboard action attempted: ${e.type}`);
    };

    const preventContextMenu = (e) => {
      e.preventDefault();
      logInfraction('contextmenu', 'Context menu blocked');
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("copy", preventCopyPaste);
    document.addEventListener("paste", preventCopyPaste);
    document.addEventListener("cut", preventCopyPaste);
    document.addEventListener("contextmenu", preventContextMenu);

    // Anti-selection
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("copy", preventCopyPaste);
      document.removeEventListener("paste", preventCopyPaste);
      document.removeEventListener("cut", preventCopyPaste);
      document.removeEventListener("contextmenu", preventContextMenu);
      document.body.style.userSelect = 'auto';
      document.body.style.webkitUserSelect = 'auto';
    };
  }, [examState, activeExam]);

  // Timer
  useEffect(() => {
    if (examState !== 'taking_exam' || timeLeft <= 0) {
      if (examState === 'taking_exam' && timeLeft <= 0) {
        submitExam(); // Auto submit
      }
      return;
    }
    const interval = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [examState, timeLeft]);

  const submitExam = async () => {
    if (!activeExam || !user) return;

    // Calculate auto MCQ score
    let mcqScore = 0;
    questions.forEach(q => {
      if (q.q_type === 'mcq' && answers[q.id] === q.correct_answer) {
        mcqScore += q.points;
      }
    });

    await supabase.from('candidate_scripts').insert({
      candidate_id: user.id,
      assessment_id: activeExam.id,
      answers: answers,
      auto_mcq_score: mcqScore,
      is_graded: false
    });

    setExamState('finished');
  };

  const handleAnswerChange = (qId, val) => {
    setAnswers({ ...answers, [qId]: val });
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <main className="login-wrapper" style={{ alignItems: 'flex-start', paddingTop: '4rem' }}>
      <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%', padding: '2rem' }}>

        {examState === 'dashboard' && (
          <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <header style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '2rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
              <div>
                <h2 style={{ color: 'var(--text-ivory)', fontFamily: 'var(--font-heading)' }}>Candidate Dashboard</h2>
                <p style={{ color: 'var(--text-muted)' }}>Welcome, {profile?.full_name} ({profile?.matriculation_number})</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Program Type: <strong style={{ color: 'var(--text-ivory)' }}>{profile?.program_type === 'stretch' ? 'Continuous (Stretch)' : 'Multi-Semester'}</strong></span>
                {profile?.program_type !== 'stretch' && (
                  <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Current Semester: <strong style={{ color: 'var(--text-ivory)' }}>{profile?.semester || 'First'}</strong></span>
                )}
              </div>
            </header>

            {(() => {
              const renderCourseList = (list, title) => (
                <div style={{ marginBottom: '2rem' }}>
                  {title && <h3 style={{ color: 'var(--text-ivory)', marginBottom: '1rem', fontFamily: 'var(--font-heading)', borderBottom: '1px dashed var(--border-subtle)', paddingBottom: '0.5rem' }}>{title}</h3>}
                  {list.length === 0 ? (
                    <div style={{ background: 'var(--bg-surface-solid)', padding: '2rem', borderRadius: '4px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No assessments available in this category.
                    </div>
                  ) : (
                    <div>
                      {list.map(exam => {
                        const script = takenScripts.find(s => s.assessment_id === exam.id);
                        return (
                          <div key={exam.id} style={{ background: 'var(--bg-surface-solid)', padding: '1.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-focus)', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div>
                              <h4 style={{ color: 'var(--accent-gold)', marginBottom: '0.25rem' }}>{exam.course_name} ({exam.course_code})</h4>
                              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Duration: {exam.duration_minutes} Minutes</p>
                            </div>
                            <div style={{ flex: '1 1 auto', maxWidth: '300px', textAlign: 'right' }}>
                              {script ? (
                                <div style={{ background: 'rgba(0, 255, 136, 0.1)', border: '1px solid #00ff88', color: '#00ff88', padding: '0.75rem', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold' }}>
                                  {script.is_graded ? `Total Score: ${script.auto_mcq_score + script.manual_theory_score}` : 'Pending Grading'}
                                </div>
                              ) : exam.is_open ? (
                                <button className="btn-premium primary" style={{ width: '100%' }} onClick={() => startExam(exam)}>Commence Exam</button>
                              ) : (
                                <div style={{ background: 'rgba(255, 77, 79, 0.1)', border: '1px solid #ff4d4f', color: '#ff4d4f', padding: '0.75rem', borderRadius: '4px', textAlign: 'center' }}>
                                  Closed / Upcoming
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );

              if (profile?.program_type === 'stretch') {
                return renderCourseList(assessments, 'All Enrolled Courses');
              } else {
                return (
                  <>
                    {renderCourseList(assessments.filter(a => a.semester === 'First'), 'First Semester')}
                    {renderCourseList(assessments.filter(a => a.semester === 'Second'), 'Second Semester')}
                  </>
                );
              }
            })()}
          </div>
        )}

        {examState === 'taking_exam' && activeExam && (
          <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
              <div>
                <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-heading)', marginBottom: '0.25rem' }}>{activeExam.course_name} ({activeExam.course_code})</h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Proctoring Engine: <span style={{ color: '#4ade80' }}>Active & Recording</span></span>
              </div>
              <div style={{ textAlign: 'right', minWidth: '120px' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Time Remaining</span>
                <span style={{ fontSize: '2rem', fontFamily: 'var(--font-heading)', color: timeLeft < 300 ? '#ef4444' : 'var(--text-ivory)' }}>{formatTime(timeLeft)}</span>
              </div>
            </div>

            {questions.length > 0 ? (
              <div style={{ display: 'flex', gap: '2rem', flexDirection: 'column' }}>
                {/* Question Navigation */}
                <div style={{ width: '100%', flexShrink: 0, overflowX: 'auto' }}>
                  <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '0.5rem', paddingBottom: '0.5rem' }}>
                    {questions.map((q, idx) => {
                      const isAns = answers[q.id] !== undefined && answers[q.id] !== '';
                      return (
                        <div
                          key={q.id}
                          onClick={() => setCurrentQuestionIndex(idx)}
                          style={{
                            width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            background: currentQuestionIndex === idx ? 'var(--accent-gold)' : (isAns ? 'var(--bg-surface-hover)' : 'var(--bg-surface-solid)'),
                            color: currentQuestionIndex === idx ? 'var(--bg-obsidian)' : (isAns ? 'var(--accent-gold)' : 'var(--text-ivory)'),
                            border: `1px solid ${isAns ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                            borderRadius: '4px', cursor: 'pointer', fontWeight: currentQuestionIndex === idx ? 'bold' : 'normal',
                            transition: 'all 0.2s'
                          }}>
                          {idx + 1}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Active Question */}
                <div style={{ flex: 1, background: 'var(--bg-surface-solid)', padding: '1.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  {questions[currentQuestionIndex] && (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h4 style={{ color: 'var(--accent-gold)' }}>Question {currentQuestionIndex + 1} ({questions[currentQuestionIndex].q_type.toUpperCase()})</h4>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{questions[currentQuestionIndex].points} Points</span>
                      </div>
                      <p style={{ color: 'var(--text-ivory)', marginBottom: '1.5rem', lineHeight: '1.6', fontSize: '1.05rem' }}>
                        {questions[currentQuestionIndex].question_text}
                      </p>

                      {questions[currentQuestionIndex].q_type === 'theory' ? (
                        <textarea
                          placeholder="Type your answer here."
                          value={answers[questions[currentQuestionIndex].id] || ''}
                          onChange={(e) => handleAnswerChange(questions[currentQuestionIndex].id, e.target.value)}
                          style={{ width: '100%', minHeight: '200px', background: 'var(--bg-obsidian)', border: '1px solid var(--border-subtle)', color: 'var(--text-ivory)', padding: '1rem', borderRadius: '4px', fontFamily: 'var(--font-body)', fontSize: '0.95rem', resize: 'vertical', outline: 'none' }}
                          onFocus={(e) => e.target.style.borderColor = 'var(--border-focus)'}
                          onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                          {questions[currentQuestionIndex].options?.map((opt, i) => (
                            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-obsidian)', padding: '1rem', borderRadius: '4px', border: answers[questions[currentQuestionIndex].id] === opt ? '1px solid var(--accent-gold)' : '1px solid var(--border-subtle)', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name={`q-${questions[currentQuestionIndex].id}`}
                                value={opt}
                                checked={answers[questions[currentQuestionIndex].id] === opt}
                                onChange={(e) => handleAnswerChange(questions[currentQuestionIndex].id, e.target.value)}
                                style={{ accentColor: 'var(--accent-gold)' }}
                              />
                              <span style={{ color: 'var(--text-ivory)', flex: 1 }}>{opt}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', marginTop: '2rem' }}>
                        <button
                          className="btn-premium"
                          disabled={currentQuestionIndex === 0}
                          onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                          style={{ flex: '1 1 auto', textAlign: 'center', opacity: currentQuestionIndex === 0 ? 0.5 : 1 }}
                        >
                          Previous
                        </button>
                        <button
                          className="btn-premium primary"
                          disabled={currentQuestionIndex === questions.length - 1}
                          onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                          style={{ flex: '1 1 auto', textAlign: 'center', opacity: currentQuestionIndex === questions.length - 1 ? 0.5 : 1 }}
                        >
                          Next Question
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No questions available for this assessment yet.</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '3rem', padding: '0 1rem' }}>
              <button
                className="btn-premium"
                style={{ borderColor: '#ef4444', color: '#ef4444', width: '100%', maxWidth: '300px' }}
                onClick={() => {
                  if (window.confirm("Are you sure you want to submit? You cannot return to this exam.")) {
                    submitExam();
                  }
                }}
              >
                Submit Final Exam
              </button>
            </div>
          </div>
        )}

        {examState === 'finished' && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', animation: 'fadeIn 0.5s ease-out' }}>
            <h2 style={{ color: 'var(--accent-gold)', fontSize: '2rem', marginBottom: '1rem', fontFamily: 'var(--font-heading)' }}>Assessment Concluded</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.95rem' }}>Your encrypted script has been securely transmitted to the grading matrix.</p>

            <button className="btn-premium primary" style={{ width: '100%', maxWidth: '400px' }} onClick={() => { setExamState('dashboard'); setAnswers({}); setActiveExam(null); }}>Return to Dashboard</button>
          </div>
        )}

      </div>
    </main>
  );
};

export default StudentFlow;
