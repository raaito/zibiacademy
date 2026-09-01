import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

const cipherKey = (uid) => uid.replace(/-/g, '').substring(0, 32);

const encrypt = (text, key) => {
  const data = new TextEncoder().encode(text);
  const k = new TextEncoder().encode(key);
  const enc = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) enc[i] = data[i] ^ k[i % k.length];
  return btoa(String.fromCharCode(...enc));
};

const decrypt = (encoded, key) => {
  const enc = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const k = new TextEncoder().encode(key);
  const dec = new Uint8Array(enc.length);
  for (let i = 0; i < enc.length; i++) dec[i] = enc[i] ^ k[i % k.length];
  return new TextDecoder().decode(dec);
};

const StudentFlow = () => {
  const { user, profile } = useAuth();
  const [examState, setExamState] = useState('dashboard'); // dashboard, taking_exam, finished
  const [assessments, setAssessments] = useState([]);
  const [takenScripts, setTakenScripts] = useState([]);
  const [totalScoresMap, setTotalScoresMap] = useState({});
  const [confirmExam, setConfirmExam] = useState(null); // exam object awaiting confirmation, or null

  // Active Exam States
  const [activeExam, setActiveExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);

  // Blended Exam Category States
  const [isBlended, setIsBlended] = useState(false);
  const [categorySequence, setCategorySequence] = useState(['mcq', 'true_false', 'short_essay']);
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0);
  const [completedCategories, setCompletedCategories] = useState([]);
  const [categoryTimeLeft, setCategoryTimeLeft] = useState(0);
  let categoryStartRef = React.useRef(null);

  // Device / Proctoring metadata captured at exam start
  const [deviceInfo, setDeviceInfo] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [locationCoords, setLocationCoords] = useState(null);

  let examStartRef = React.useRef(null);

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
      .eq('is_hidden', false)
      .order('semester', { ascending: true })
      .order('created_at', { ascending: false });

    if (data) {
      setAssessments(data);
      const ids = data.map(a => a.id);

      const map = {};
      const { data: totals } = await supabase
        .from('questions')
        .select('assessment_id, points')
        .in('assessment_id', ids);
      if (totals) {
        totals.forEach(q => { map[q.assessment_id] = (map[q.assessment_id] || 0) + q.points; });
      }

      const { data: scripts } = await supabase.from('candidate_scripts').select('*').eq('candidate_id', user.id);
      if (scripts) {
        scripts.forEach(s => {
          if (s.total_possible_score > 0) map[s.assessment_id] = s.total_possible_score;
        });
        setTakenScripts(scripts);
      }

      setTotalScoresMap(map);
    }
  };

  const saveDraft = () => {
    if (!activeExam || examState !== 'taking_exam') return;
    const draftKey = `zibi_exam_draft_${activeExam.id}`;
    const draftData = {
      answers,
      timeLeft,
      activeCategoryIndex,
      completedCategories,
      categoryTimeLeft,
      savedAt: Date.now()
    };
    const key = cipherKey(user?.id || '');
    localStorage.setItem(draftKey, encrypt(JSON.stringify(draftData), key));
  };

  const captureDeviceInfo = () => {
    const ua = navigator.userAgent;
    const platform = navigator.platform || 'unknown';
    const screen = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    const lang = navigator.language || 'unknown';
    setDeviceInfo(`UA: ${ua} | Platform: ${platform} | Screen: ${screen} | Lang: ${lang}`);

    fetch('https://api.ipify.org?format=json')
      .then(r => r.json())
      .then(d => { if (d.ip) setIpAddress(d.ip); })
      .catch(() => {});

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLocationCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { timeout: 5000 }
      );
    }
  };

  const startExam = async (exam) => {
    setActiveExam(exam);
    captureDeviceInfo();

    const blended = exam.is_blended || exam.question_type === 'blended';
    setIsBlended(blended);

    // Fetch questions
    const { data } = await supabase.from('questions')
      .select('*')
      .eq('assessment_id', exam.id)
      .order('sequence_number', { ascending: true });

    if (data) setQuestions(data);

    const defaultSeq = ['mcq', 'true_false', 'short_essay'];
    setCategorySequence(defaultSeq);
    const catDurs = exam.category_durations || {};

    // Auto-Save: Check for existing draft in local storage
    const draftKey = `zibi_exam_draft_${exam.id}`;
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const key = cipherKey(user?.id || '');
        const parsed = JSON.parse(decrypt(savedDraft, key));
        setAnswers(parsed.answers || {});
        setCompletedCategories(parsed.completedCategories || []);

        const catIdx = parsed.activeCategoryIndex || 0;
        setActiveCategoryIndex(catIdx);

        const elapsed = (Date.now() - (parsed.savedAt || Date.now())) / 1000;

        if (blended) {
          const currentCatKey = defaultSeq[catIdx] || 'mcq';
          const secDurSec = (catDurs[currentCatKey] || 10) * 60;
          const remainingCat = Math.max(0, Math.floor((parsed.categoryTimeLeft || secDurSec) - elapsed));
          categoryStartRef.current = Date.now() - (secDurSec - remainingCat) * 1000;
          setCategoryTimeLeft(remainingCat);
        } else {
          const remaining = Math.max(0, Math.floor((parsed.timeLeft || exam.duration_minutes * 60) - elapsed));
          examStartRef.current = Date.now() - ((exam.duration_minutes * 60) - remaining) * 1000;
          setTimeLeft(remaining);
        }

        toast.success('Recovered your previous exam section and answers.');
      } catch (err) {
        console.error('Failed to parse draft', err);
        setAnswers({});
        setCompletedCategories([]);
        setActiveCategoryIndex(0);
        if (blended) {
          categoryStartRef.current = Date.now();
          setCategoryTimeLeft((catDurs.mcq || 10) * 60);
        } else {
          examStartRef.current = Date.now();
          setTimeLeft(exam.duration_minutes * 60);
        }
      }
    } else {
      setAnswers({});
      setCompletedCategories([]);
      setActiveCategoryIndex(0);
      if (blended) {
        categoryStartRef.current = Date.now();
        setCategoryTimeLeft((catDurs.mcq || 10) * 60);
      } else {
        examStartRef.current = Date.now();
        setTimeLeft(exam.duration_minutes * 60);
      }
    }

    setCurrentQuestionIndex(0);
    setExamState('taking_exam');
  };

  // Auto-Save: Sync to local storage every time answers or timer change
  useEffect(() => {
    saveDraft();
  }, [answers, examState, activeExam, activeCategoryIndex, completedCategories]);

  // Also save draft on beforeunload (tab close / navigation)
  useEffect(() => {
    if (examState !== 'taking_exam') return;
    const handleBeforeUnloadDraft = () => saveDraft();
    window.addEventListener('beforeunload', handleBeforeUnloadDraft);
    return () => window.removeEventListener('beforeunload', handleBeforeUnloadDraft);
  }, [examState, answers, activeExam, timeLeft, activeCategoryIndex, categoryTimeLeft]);

  const infractionQueue = React.useRef([]);
  const infractionRetrying = React.useRef(false);

  const processInfractionQueue = async () => {
    if (infractionRetrying.current || infractionQueue.current.length === 0) return;
    infractionRetrying.current = true;
    const item = infractionQueue.current[0];
    const { error } = await supabase.from('infraction_logs').insert(item);
    if (!error) {
      infractionQueue.current.shift();
    }
    infractionRetrying.current = false;
    if (infractionQueue.current.length > 0) processInfractionQueue();
  };

  const logInfraction = async (type, details) => {
    if (!activeExam || !user) return;
    const qNum = currentQuestionIndex + 1;
    const totalQs = questions.length;
    const timeRemaining = formatTime(isBlended ? categoryTimeLeft : timeLeft);
    const enriched = `[Q${qNum}/${totalQs} | ${timeRemaining} remaining] ${details}`;
    const payload = {
      candidate_id: user.id,
      assessment_id: activeExam.id,
      infraction_type: type,
      details: enriched
    };
    const { error } = await supabase.from('infraction_logs').insert(payload);
    if (error) {
      infractionQueue.current.push(payload);
      processInfractionQueue();
    }
  };

  // Inactivity timeout: auto-submit after 5 minutes of no mouse/keyboard activity
  let idleTimer = React.useRef(null);
  const IDLE_TIMEOUT = 5 * 60;

  const resetIdleTimer = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      logInfraction('inactivity', `Auto-submitted after ${IDLE_TIMEOUT}s of inactivity`);
      submitExam(true);
    }, IDLE_TIMEOUT * 1000);
  };

  // Anti-Cheat Engine Log
  useEffect(() => {
    if (examState !== 'taking_exam') return;

    let hiddenSince = null;

    const handleVisibility = () => {
      if (document.hidden) {
        hiddenSince = Date.now();
        logInfraction('visibilitychange', 'Tab hidden / app switched');
      } else if (hiddenSince) {
        const durationSec = Math.round((Date.now() - hiddenSince) / 1000);
        logInfraction('visibilitychange', `Tab returned after ${durationSec}s away`);
        hiddenSince = null;
      }
    };

    const handleBlur = () => {
      logInfraction('blur', 'Window lost focus');
    };

    const handleFocus = () => {
      logInfraction('blur', 'Window regained focus');
    };

    const preventCopyPaste = (e) => {
      e.preventDefault();
      logInfraction('copy_paste', `Clipboard action attempted: ${e.type}`);
    };

    const preventContextMenu = (e) => {
      e.preventDefault();
      logInfraction('contextmenu', 'Context menu blocked');
    };

    // Fullscreen enforcement
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        logInfraction('fullscreen', 'Exited fullscreen mode');
      }
    };

    // Accidental Exit Prevention
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'You have an exam in progress. Are you sure you want to leave?';
    };

    resetIdleTimer();
    const activityEvents = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    activityEvents.forEach(ev => document.addEventListener(ev, resetIdleTimer));

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("copy", preventCopyPaste);
    document.addEventListener("paste", preventCopyPaste);
    document.addEventListener("cut", preventCopyPaste);
    document.addEventListener("contextmenu", preventContextMenu);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Anti-selection
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    return () => {
      activityEvents.forEach(ev => document.removeEventListener(ev, resetIdleTimer));
      if (idleTimer.current) clearTimeout(idleTimer.current);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("copy", preventCopyPaste);
      document.removeEventListener("paste", preventCopyPaste);
      document.removeEventListener("cut", preventCopyPaste);
      document.removeEventListener("contextmenu", preventContextMenu);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.body.style.userSelect = 'auto';
      document.body.style.webkitUserSelect = 'auto';
    };
  }, [examState, activeExam, currentQuestionIndex, questions.length, timeLeft, categoryTimeLeft, isBlended]);

  const advanceCategoryOrSubmit = (isManual = false) => {
    const currentCatKey = categorySequence[activeCategoryIndex];
    const newCompleted = [...completedCategories, currentCatKey];
    setCompletedCategories(newCompleted);

    const nextIndex = activeCategoryIndex + 1;
    if (nextIndex < categorySequence.length) {
      const nextCatKey = categorySequence[nextIndex];
      const catDurs = activeExam?.category_durations || {};
      const nextDurSec = (catDurs[nextCatKey] || 10) * 60;

      setActiveCategoryIndex(nextIndex);
      categoryStartRef.current = Date.now();
      setCategoryTimeLeft(nextDurSec);
      setCurrentQuestionIndex(0);

      const catNames = { mcq: 'Multiple Choice (MCQ)', true_false: 'True or False', short_essay: 'Short Essay' };
      if (isManual) {
        toast.success(`Category locked! Advanced to Section ${nextIndex + 1}: ${catNames[nextCatKey]}`);
      } else {
        toast.success(`⏰ Time expired for ${catNames[currentCatKey]}! Auto-saved and advanced to Section ${nextIndex + 1}: ${catNames[nextCatKey]}`);
      }
    } else {
      toast.success('⏰ Final section timer completed! Auto-submitting assessment...');
      submitExam(true);
    }
  };

  // Timer (epoch-based to prevent drift)
  useEffect(() => {
    if (examState !== 'taking_exam') return;

    if (isBlended) {
      const tickCategory = () => {
        if (!categoryStartRef.current) return;
        const catDurs = activeExam?.category_durations || {};
        const currentCatKey = categorySequence[activeCategoryIndex] || 'mcq';
        const sectionDurSec = (catDurs[currentCatKey] || 10) * 60;
        const elapsed = Math.floor((Date.now() - categoryStartRef.current) / 1000);
        const remaining = Math.max(0, sectionDurSec - elapsed);
        setCategoryTimeLeft(remaining);

        if (remaining <= 0) {
          advanceCategoryOrSubmit(false);
        }
      };

      tickCategory();
      const interval = setInterval(tickCategory, 1000);
      return () => clearInterval(interval);
    } else {
      const tick = () => {
        if (!examStartRef.current) return;
        const elapsed = Math.floor((Date.now() - examStartRef.current) / 1000);
        const remaining = Math.max(0, (activeExam?.duration_minutes || 0) * 60 - elapsed);
        setTimeLeft(remaining);
        if (remaining <= 0) submitExam(true);
      };
      tick();
      const interval = setInterval(tick, 1000);
      return () => clearInterval(interval);
    }
  }, [examState, isBlended, activeCategoryIndex]);

  const submitExam = async (isAutoSubmit = false) => {
    if (!activeExam || !user) return;

    const { data: freshExam } = await supabase.from('assessments').select('is_open').eq('id', activeExam.id).single();
    if (freshExam && !freshExam.is_open) {
      if (!isAutoSubmit) toast.error('This assessment has been closed by the examiner. Your answers could not be submitted.');
      setExamState('finished');
      return;
    }

    if (!isAutoSubmit) {
      const unanswered = questions.filter(q => !answers[q.id] || String(answers[q.id]).trim() === '');
      if (unanswered.length > 0 && !window.confirm(`You have ${unanswered.length} unanswered question(s). Submit anyway?`)) {
        return;
      }
    }

    let mcqScore = 0;
    let totalPossible = 0;
    let hasEssay = false;
    const questionScores = {};

    questions.forEach(q => {
      totalPossible += q.points;
      if (q.q_type === 'mcq' || q.q_type === 'true_false') {
        const studentAns = String(answers[q.id] || '').trim().toLowerCase();
        const correctAns = String(q.correct_answer || '').trim().toLowerCase();
        const isCorrect = studentAns === correctAns;
        const pts = isCorrect ? q.points : 0;
        questionScores[q.id] = pts;
        mcqScore += pts;
      } else if (q.q_type === 'short_essay' || q.q_type === 'theory') {
        hasEssay = true;
      }
    });

    const { error } = await supabase.from('candidate_scripts').insert({
      candidate_id: user.id,
      assessment_id: activeExam.id,
      answers: answers,
      auto_mcq_score: mcqScore,
      total_possible_score: totalPossible,
      question_scores: questionScores,
      is_graded: !hasEssay,
      device_info: deviceInfo,
      ip_address: ipAddress,
      location_lat: locationCoords !== null ? locationCoords.lat : null,
      location_lng: locationCoords !== null ? locationCoords.lng : null
    });

    if (error) {
      toast.error('Failed to submit: ' + error.message);
      return;
    }

    // Clear auto-save cache upon successful submission
    const draftKey = `zibi_exam_draft_${activeExam.id}`;
    localStorage.removeItem(draftKey);

    toast.success('Assessment submitted successfully!');
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
      <div className="glass-panel responsive-panel" style={{ maxWidth: '1000px', width: '100%' }}>

        {examState === 'dashboard' && (
          <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <header style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '2rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
              <div>
                <h2 style={{ color: 'var(--text-ivory)', fontFamily: 'var(--font-heading)' }}>Student Dashboard</h2>
                <p style={{ color: 'var(--text-muted)' }}>Welcome, {profile?.full_name} ({profile?.matriculation_number})</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Academic Track: <strong style={{ color: 'var(--text-ivory)' }}>{profile?.program_type === 'stretch' ? 'Intensive (Stretch)' : 'Standard (Multi-Semester)'}</strong></span>
                {profile?.program_type !== 'stretch' && (
                  <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Current Semester: <strong style={{ color: 'var(--text-ivory)' }}>{profile?.semester || 'First'}</strong></span>
                )}
              </div>
            </header>

            {/* ⚠️ Anti-Cheating Integrity Alert — Dashboard */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(220,38,38,0.18) 0%, rgba(153,27,27,0.12) 100%)',
              border: '2px solid #dc2626',
              borderRadius: '8px',
              padding: '1.25rem 1.5rem',
              marginBottom: '2rem',
              display: 'flex',
              gap: '1rem',
              alignItems: 'flex-start',
              boxShadow: '0 0 24px rgba(220,38,38,0.25), inset 0 1px 0 rgba(255,255,255,0.05)',
              animation: 'fadeIn 0.4s ease-out'
            }}>
              <span style={{ fontSize: '2rem', flexShrink: 0, lineHeight: 1 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <strong style={{
                  color: '#fca5a5',
                  fontSize: '0.95rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  display: 'block',
                  marginBottom: '0.4rem'
                }}>
                  Academic Integrity Notice — Zero Tolerance Policy
                </strong>
                <p style={{ color: '#fee2e2', fontSize: '0.88rem', margin: 0, lineHeight: '1.6' }}>
                  <strong style={{ color: '#f87171' }}>ANY student caught cheating, engaging in malpractice, or violating examination rules
                  will have their exam IMMEDIATELY CANCELLED</strong> and their score permanently set to{' '}
                  <strong style={{ color: '#ff4d4f', fontSize: '1rem' }}>ZERO (0)</strong>.
                  {/* All exam sessions are actively proctored with screen monitoring, device tracking, and behaviour analysis. */}
                  This institution maintains a strict zero-tolerance policy on academic dishonesty.
                </p>
              </div>
            </div>

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
                        const totalPossible = script ? (script.total_possible_score || totalScoresMap[exam.id] || 0) : (totalScoresMap[exam.id] || 0);
                        return (
                          <div key={exam.id} style={{ background: 'var(--bg-surface-solid)', padding: '1.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-focus)', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <h4 style={{ color: 'var(--accent-gold)', marginBottom: '0.25rem' }}>{exam.course_name} ({exam.course_code})</h4>
                              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Duration: {exam.duration_minutes} Minutes</p>
                              {exam.instructions && (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem', fontStyle: 'italic', opacity: 0.8 }}>
                                  {exam.instructions}
                                </p>
                              )}
                            </div>
                            <div style={{ flex: '1 1 auto', maxWidth: '300px', textAlign: 'right' }}>
                              {script ? (
                                <div style={{ background: 'rgba(0, 255, 136, 0.1)', border: '1px solid #00ff88', color: '#00ff88', padding: '0.75rem', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold' }}>
                                  {script.is_graded ? `Total Score: ${script.auto_mcq_score + script.manual_theory_score} / ${totalPossible}` : 'Pending Grading'}
                                </div>
                              ) : exam.is_open ? (
                                <button className="btn-premium primary" style={{ width: '100%' }} onClick={() => setConfirmExam(exam)}>Commence Exam</button>
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

          {/* ── Exam Confirmation Modal ── */}
          {confirmExam && (
            <div
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.75)',
                backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 9999,
                animation: 'fadeIn 0.2s ease',
              }}
              onClick={(e) => { if (e.target === e.currentTarget) setConfirmExam(null); }}
            >
              <div
                style={{
                  background: 'var(--bg-surface-solid)',
                  border: '1px solid var(--border-focus)',
                  borderRadius: 'var(--radius-md, 12px)',
                  padding: '2rem',
                  maxWidth: '440px',
                  width: '90%',
                  boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                  animation: 'slideUp 0.25s ease',
                }}
              >
                {/* Icon */}
                <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '56px', height: '56px', borderRadius: '50%',
                    background: 'rgba(255, 195, 0, 0.12)',
                    border: '2px solid var(--accent-gold, #ffc300)',
                    fontSize: '1.75rem',
                  }}>📋</div>
                </div>

                {/* Title */}
                <h3 style={{
                  color: 'var(--text-primary, #fff)',
                  textAlign: 'center',
                  marginBottom: '0.5rem',
                  fontSize: '1.2rem',
                  fontWeight: 700,
                }}>Start This Exam?</h3>

                {/* Exam info */}
                <div style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                  padding: '1rem',
                  margin: '1rem 0 1.5rem',
                  textAlign: 'center',
                }}>
                  <p style={{ color: 'var(--accent-gold, #ffc300)', fontWeight: 700, fontSize: '1rem', margin: 0 }}>
                    {confirmExam.course_name}
                  </p>
                  <p style={{ color: 'var(--text-muted, #aaa)', fontSize: '0.85rem', margin: '0.3rem 0 0' }}>
                    {confirmExam.course_code} &nbsp;·&nbsp; {confirmExam.duration_minutes} minutes
                  </p>
                </div>

                <p style={{ color: 'var(--text-muted, #bbb)', fontSize: '0.88rem', textAlign: 'center', marginBottom: '1.75rem', lineHeight: 1.6 }}>
                  Once you begin, the countdown timer will start immediately and <strong style={{ color: 'var(--text-primary, #fff)' }}>cannot be paused</strong>. Make sure you are ready before proceeding.
                </p>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => setConfirmExam(null)}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'transparent',
                      color: 'var(--text-muted, #aaa)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted, #aaa)'; }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-premium primary"
                    onClick={() => { setConfirmExam(null); startExam(confirmExam); }}
                    style={{ flex: 1, padding: '0.75rem', fontSize: '0.9rem' }}
                  >
                    ✅ Confirm &amp; Begin
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
        )}

        {examState === 'taking_exam' && activeExam && (
          <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-heading)', margin: 0 }}>{activeExam.course_name} ({activeExam.course_code})</h3>
                  {isBlended && (
                    <span style={{ background: 'rgba(212,175,55,0.2)', color: 'var(--accent-gold)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                      Blended Exam
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Proctoring Engine: <span style={{ color: '#4ade80' }}>Active &amp; Recording</span></span>
                {activeExam.instructions && (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(197,160,89,0.08)', border: '1px solid var(--border-focus)', borderRadius: '4px', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                    <strong style={{ color: 'var(--accent-gold)' }}>Instructions:</strong> {activeExam.instructions}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', minWidth: '150px', background: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                  {isBlended ? 'Active Section Timer' : 'Total Time Remaining'}
                </span>
                <span style={{ fontSize: '2rem', fontFamily: 'var(--font-heading)', color: (isBlended ? categoryTimeLeft : timeLeft) < 180 ? '#ef4444' : 'var(--text-ivory)' }}>
                  {formatTime(isBlended ? categoryTimeLeft : timeLeft)}
                </span>
              </div>
            </div>

            {/* ── Blended Category Progress Bar ── */}
            {isBlended && (
              <div style={{ marginBottom: '2rem', background: 'var(--bg-surface-solid)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-focus)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>
                  Exam Section Progress &amp; Timing
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  {[
                    { key: 'mcq', label: 'Section 1: MCQ', duration: activeExam.category_durations?.mcq || 0 },
                    { key: 'true_false', label: 'Section 2: True or False', duration: activeExam.category_durations?.true_false || 0 },
                    { key: 'short_essay', label: 'Section 3: Short Essay', duration: activeExam.category_durations?.short_essay || 0 }
                  ].map((cat, idx) => {
                    const isDone = completedCategories.includes(cat.key);
                    const isActive = activeCategoryIndex === idx;
                    const isUpcoming = !isDone && !isActive;

                    return (
                      <div
                        key={cat.key}
                        style={{
                          padding: '0.75rem 1rem',
                          borderRadius: '6px',
                          border: isActive ? '2px solid var(--accent-gold)' : (isDone ? '1px solid #10b981' : '1px solid var(--border-subtle)'),
                          background: isActive ? 'rgba(212,175,55,0.12)' : (isDone ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)'),
                          color: isActive ? 'var(--accent-gold)' : (isDone ? '#34d399' : 'var(--text-muted)'),
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', fontWeight: 'bold' }}>
                          <span>{cat.label}</span>
                          <span style={{ fontSize: '0.7rem' }}>
                            {isDone ? '🔒 Locked' : (isActive ? '⚡ Active' : '⏳ Upcoming')}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                          Time Limit: {cat.duration} Minutes
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(() => {
              // Filter questions by active category if blended exam
              const activeCatKey = isBlended ? categorySequence[activeCategoryIndex] : null;
              const displayQuestions = isBlended ? questions.filter(q => {
                if (activeCatKey === 'mcq') return q.q_type === 'mcq';
                if (activeCatKey === 'true_false') return q.q_type === 'true_false';
                if (activeCatKey === 'short_essay') return q.q_type === 'short_essay' || q.q_type === 'theory';
                return true;
              }) : questions;

              if (displayQuestions.length === 0) {
                return (
                  <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--bg-surface-solid)', borderRadius: '8px', border: '1px solid var(--border-subtle)', marginBottom: '2rem' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginBottom: '1.5rem' }}>
                      No questions currently assigned to this category section.
                    </p>
                    {isBlended && (
                      <button
                        className="btn-premium primary"
                        onClick={() => advanceCategoryOrSubmit(true)}
                      >
                        Proceed to Next Category Section &rarr;
                      </button>
                    )}
                  </div>
                );
              }

              const safeIndex = Math.min(currentQuestionIndex, displayQuestions.length - 1);
              const activeQ = displayQuestions[safeIndex];

              return (
                <div style={{ display: 'flex', gap: '2rem', flexDirection: 'column' }}>
                  {/* Question Navigation Numbers */}
                  <div style={{ width: '100%', flexShrink: 0, overflowX: 'auto' }}>
                    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '0.5rem', paddingBottom: '0.5rem' }}>
                      {displayQuestions.map((q, idx) => {
                        const isAns = answers[q.id] !== undefined && String(answers[q.id]).trim() !== '';
                        return (
                          <div
                            key={q.id}
                            onClick={() => setCurrentQuestionIndex(idx)}
                            style={{
                              width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              background: safeIndex === idx ? 'var(--accent-gold)' : (isAns ? 'var(--bg-surface-hover)' : 'var(--bg-surface-solid)'),
                              color: safeIndex === idx ? 'var(--bg-obsidian)' : (isAns ? 'var(--accent-gold)' : 'var(--text-ivory)'),
                              border: `1px solid ${isAns ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                              borderRadius: '4px', cursor: 'pointer', fontWeight: safeIndex === idx ? 'bold' : 'normal',
                              transition: 'all 0.2s'
                            }}>
                            {idx + 1}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active Question Panel */}
                  <div style={{ flex: 1, background: 'var(--bg-surface-solid)', padding: '1.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    {activeQ && (
                      <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                          <h4 style={{ color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>Question {safeIndex + 1} of {displayQuestions.length}</span>
                            <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-ivory)' }}>
                              {activeQ.q_type === 'mcq' ? 'Multiple Choice' : (activeQ.q_type === 'true_false' ? 'True or False' : 'Short Essay')}
                            </span>
                          </h4>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{activeQ.points} Points</span>
                        </div>
                        
                        <p style={{ color: 'var(--text-ivory)', marginBottom: '1.5rem', lineHeight: '1.6', fontSize: '1.05rem' }}>
                          {activeQ.question_text}
                        </p>

                        {/* Short Essay / Theory input */}
                        {(activeQ.q_type === 'short_essay' || activeQ.q_type === 'theory') && (
                          <div>
                            <textarea
                              placeholder="Write your short essay response here..."
                              value={answers[activeQ.id] || ''}
                              onChange={(e) => handleAnswerChange(activeQ.id, e.target.value)}
                              style={{ width: '100%', minHeight: '220px', background: 'var(--bg-obsidian)', border: '1px solid var(--border-subtle)', color: 'var(--text-ivory)', padding: '1rem', borderRadius: '4px', fontFamily: 'var(--font-body)', fontSize: '0.95rem', resize: 'vertical', outline: 'none' }}
                              onFocus={(e) => e.target.style.borderColor = 'var(--border-focus)'}
                              onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              <span>Word count: {(answers[activeQ.id] || '').trim().split(/\s+/).filter(Boolean).length} words</span>
                              <span style={{ color: '#4ade80' }}>⚡ Draft auto-saved</span>
                            </div>
                          </div>
                        )}

                        {/* True / False distinct option buttons */}
                        {activeQ.q_type === 'true_false' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                            {['True', 'False'].map(optVal => {
                              const selected = answers[activeQ.id] === optVal;
                              return (
                                <button
                                  key={optVal}
                                  type="button"
                                  onClick={() => handleAnswerChange(activeQ.id, optVal)}
                                  style={{
                                    padding: '1.25rem',
                                    borderRadius: '8px',
                                    fontSize: '1.1rem',
                                    fontWeight: 'bold',
                                    background: selected ? 'var(--accent-gold)' : 'var(--bg-obsidian)',
                                    color: selected ? 'var(--bg-obsidian)' : 'var(--text-ivory)',
                                    border: selected ? '2px solid var(--accent-gold)' : '1px solid var(--border-subtle)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justify: 'center',
                                    gap: '0.5rem'
                                  }}
                                >
                                  {optVal === 'True' ? '👍 True' : '👎 False'}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Standard MCQ Options */}
                        {activeQ.q_type === 'mcq' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            {activeQ.options?.map((opt, i) => (
                              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-obsidian)', padding: '1rem', borderRadius: '4px', border: answers[activeQ.id] === opt ? '1px solid var(--accent-gold)' : '1px solid var(--border-subtle)', cursor: 'pointer' }}>
                                <input
                                  type="radio"
                                  name={`q-${activeQ.id}`}
                                  value={opt}
                                  checked={answers[activeQ.id] === opt}
                                  onChange={(e) => handleAnswerChange(activeQ.id, e.target.value)}
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
                            disabled={safeIndex === 0}
                            onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                            style={{ flex: '1 1 auto', textAlign: 'center', opacity: safeIndex === 0 ? 0.5 : 1 }}
                          >
                            Previous
                          </button>
                          {safeIndex < displayQuestions.length - 1 && (
                            <button
                              className="btn-premium primary"
                              onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                              style={{ flex: '1 1 auto', textAlign: 'center' }}
                            >
                              Next Question
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── Section Transition & Final Submission Controls ── */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2.5rem', padding: '0 1rem' }}>
              {isBlended && activeCategoryIndex < categorySequence.length - 1 ? (
                <button
                  className="btn-premium primary"
                  style={{ width: '100%', maxWidth: '380px', padding: '0.85rem' }}
                  onClick={() => {
                    const catNames = { mcq: 'Multiple Choice (MCQ)', true_false: 'True or False', short_essay: 'Short Essay' };
                    const curName = catNames[categorySequence[activeCategoryIndex]];
                    const nextName = catNames[categorySequence[activeCategoryIndex + 1]];
                    if (window.confirm(`Lock ${curName} section and proceed to ${nextName}? You will not be able to return to this section once locked.`)) {
                      advanceCategoryOrSubmit(true);
                    }
                  }}
                >
                  🔒 Complete Section &amp; Proceed to Next Category &rarr;
                </button>
              ) : (
                <button
                  className="btn-premium"
                  style={{ borderColor: '#ef4444', color: '#ef4444', width: '100%', maxWidth: '320px', padding: '0.85rem' }}
                  onClick={() => {
                    if (window.confirm("Are you sure you want to submit your final assessment? You cannot return to this exam once submitted.")) {
                      submitExam();
                    }
                  }}
                >
                  🏁 Submit Final Assessment
                </button>
              )}
            </div>
          </div>
        )}

        {examState === 'finished' && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', animation: 'fadeIn 0.5s ease-out' }}>
            <h2 style={{ color: 'var(--accent-gold)', fontSize: '2rem', marginBottom: '1rem', fontFamily: 'var(--font-heading)' }}>Assessment Concluded</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.95rem' }}>Your encrypted script has been securely saved and submitted to the evaluation matrix.</p>

            <button className="btn-premium primary" style={{ width: '100%', maxWidth: '400px' }} onClick={() => { setExamState('dashboard'); setAnswers({}); setActiveExam(null); }}>Return to Dashboard</button>
          </div>
        )}

      </div>
    </main>
  );
};

export default StudentFlow;
