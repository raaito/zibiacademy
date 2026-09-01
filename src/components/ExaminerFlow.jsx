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
  const [mcqDuration, setMcqDuration] = useState(20);
  const [tfDuration, setTfDuration] = useState(10);
  const [essayDuration, setEssayDuration] = useState(30);
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

  // Access modal state
  const [accessModal, setAccessModal] = useState(null); // { assessment } | null
  const [allStaff, setAllStaff] = useState([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [selectedAccessIds, setSelectedAccessIds] = useState([]);
  const [savingAccess, setSavingAccess] = useState(false);
  const [forfeitingId, setForfeitingId] = useState(null);
  const [deletingScriptId, setDeletingScriptId] = useState(null);
  const [confirmDeleteScript, setConfirmDeleteScript] = useState(null); // script object awaiting delete confirmation
  const [selectedScriptIds, setSelectedScriptIds] = useState([]);

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
    setMcqDuration(20);
    setTfDuration(10);
    setEssayDuration(30);
    setSemester('First');
    if (cohorts.length > 0) setCohortId(cohorts[0].id);
    setEditingAssessment(null);
  };

  const handleCreateAssessment = async (e) => {
    e.preventDefault();
    if (!cohortId) return toast.error('Select an academic cycle');
    
    let parsedStartTime = new Date(startTime).toISOString();
    const isBlended = questionType === 'blended';
    const totalDuration = isBlended 
      ? (Number(mcqDuration) + Number(tfDuration) + Number(essayDuration)) 
      : Number(duration);
    
    const categoryDurations = isBlended 
      ? { mcq: Number(mcqDuration), true_false: Number(tfDuration), short_essay: Number(essayDuration) }
      : { mcq: 0, true_false: 0, short_essay: 0 };

    let updatePayload = {
      course_name: courseName,
      course_code: courseCode,
      cohort_id: cohortId,
      semester: semester,
      duration_minutes: totalDuration,
      start_time: parsedStartTime,
      instructions: instructions,
      question_type: questionType,
      is_blended: isBlended,
      category_durations: categoryDurations
    };

    if (editingAssessment) {
      let { error } = await supabase.from('assessments').update(updatePayload).eq('id', editingAssessment.id);

      if (error && error.message?.includes('category_durations')) {
        // Fallback for database instances where category_durations column has not been added yet
        if (!isBlended) {
          const fallbackPayload = { ...updatePayload };
          delete fallbackPayload.is_blended;
          delete fallbackPayload.category_durations;
          const retry = await supabase.from('assessments').update(fallbackPayload).eq('id', editingAssessment.id);
          error = retry.error;
        } else {
          return toast.error('Database migration required: Please run the SQL migration query in your Supabase SQL Editor to add the category_durations column.', { duration: 6000 });
        }
      }

      if (error) return toast.error(error.message);
      toast.success('Assessment updated successfully');
      setAssessments(assessments.map(a => a.id === editingAssessment.id ? {
        ...a,
        ...updatePayload
      } : a));
      resetAssessmentForm();
    } else {
      let { data, error } = await supabase.from('assessments').insert({
        ...updatePayload,
        is_open: false,
        created_by: user.id
      }).select().single();

      if (error && error.message?.includes('category_durations')) {
        if (!isBlended) {
          const fallbackPayload = { ...updatePayload };
          delete fallbackPayload.is_blended;
          delete fallbackPayload.category_durations;
          const retry = await supabase.from('assessments').insert({
            ...fallbackPayload,
            is_open: false,
            created_by: user.id
          }).select().single();
          data = retry.data;
          error = retry.error;
        } else {
          return toast.error('Database migration required: Please run the SQL migration query in your Supabase SQL Editor to add the category_durations column.', { duration: 6000 });
        }
      }

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
    
    const catDurs = assessment.category_durations || {};
    setMcqDuration(catDurs.mcq || 20);
    setTfDuration(catDurs.true_false || 10);
    setEssayDuration(catDurs.short_essay || 30);
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

  const toggleAssessmentStatus = async (id, currentStatus) => {
    const { error } = await supabase.from('assessments').update({ is_open: !currentStatus }).eq('id', id);
    if (error) return toast.error(error.message);
    setAssessments(assessments.map(a => a.id === id ? { ...a, is_open: !currentStatus } : a));
    toast.success(`Assessment is now ${!currentStatus ? 'Open' : 'Closed'}`);
  };

  const toggleHideAssessment = async (id, currentHidden) => {
    const { error } = await supabase.from('assessments').update({ is_hidden: !currentHidden }).eq('id', id);
    if (error) return toast.error(error.message);
    setAssessments(assessments.map(a => a.id === id ? { ...a, is_hidden: !currentHidden } : a));
    toast.success(!currentHidden ? 'Assessment hidden from students.' : 'Assessment is now visible to students.');
  };

  const openAccessModal = async (assessment) => {
    setAccessModal(assessment);
    setAccessLoading(true);
    const existing = Array.isArray(assessment.grader_access) ? assessment.grader_access : [];
    setSelectedAccessIds(existing);
    const { data } = await supabase.from('profiles').select('id, full_name, email, role').in('role', ['examiner', 'superadmin']).order('full_name', { ascending: true });
    if (data) setAllStaff(data);
    setAccessLoading(false);
  };

  const saveAccess = async () => {
    if (!accessModal) return;
    setSavingAccess(true);
    const { error } = await supabase.from('assessments').update({ grader_access: selectedAccessIds }).eq('id', accessModal.id);
    setSavingAccess(false);
    if (error) return toast.error('Failed to save access: ' + error.message);
    setAssessments(assessments.map(a => a.id === accessModal.id ? { ...a, grader_access: selectedAccessIds } : a));
    toast.success('Grading access updated successfully.');
    setAccessModal(null);
  };

  const forfeitStudent = async (script) => {
    if (!window.confirm(`Forfeit exam for ${script.profiles?.full_name || 'this student'}? Their score will be set to ZERO and this cannot be undone.`)) return;
    setForfeitingId(script.id);
    const { error } = await supabase.from('candidate_scripts').update({
      auto_mcq_score: 0,
      manual_theory_score: 0,
      question_scores: {},
      is_graded: true,
      device_info: (script.device_info || '') + ' | FORFEIT: Student forfeited this examination. Score set to zero.'
    }).eq('id', script.id);
    setForfeitingId(null);
    if (error) return toast.error('Failed to forfeit: ' + error.message);
    toast.success(`${script.profiles?.full_name || 'Student'} has forfeited. Score set to 0.`);
    setScripts(scripts.map(s => s.id === script.id ? { ...s, auto_mcq_score: 0, manual_theory_score: 0, question_scores: {}, is_graded: true } : s));
  };

  const deleteScript = async (script) => {
    setConfirmDeleteScript(null);
    setDeletingScriptId(script.id);
    // Remove infraction logs first, then the script itself
    await supabase.from('infraction_logs').delete()
      .eq('candidate_id', script.candidate_id)
      .eq('assessment_id', script.assessment_id);
    const { error } = await supabase.from('candidate_scripts').delete().eq('id', script.id);
    setDeletingScriptId(null);
    if (error) return toast.error('Failed to delete record: ' + error.message);
    toast.success(`Exam record for ${script.profiles?.full_name || 'student'} has been deleted.`);
    setScripts(prev => prev.filter(s => s.id !== script.id));
  };

  const fetchScripts = async (assessmentId) => {
    if (!assessmentId) return;
    const { data: scriptsData } = await supabase.from('candidate_scripts')
      .select('*, profiles(full_name, matriculation_number)')
      .eq('assessment_id', assessmentId);
    if (scriptsData) setScripts(scriptsData);
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
    setSelectedScriptIds([]);
    if (aid) {
      await fetchScripts(aid);
      fetchGradingQuestions(aid);
    } else {
      setScripts([]);
      setGradingQuestions([]);
    }
  };

  const toggleSelectAllScripts = () => {
    if (selectedScriptIds.length === scripts.length) {
      setSelectedScriptIds([]);
    } else {
      setSelectedScriptIds(scripts.map(s => s.id));
    }
  };

  const toggleSelectScript = (id) => {
    setSelectedScriptIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const downloadCSV = (filename, csvContent) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportExamRecords = (targetScripts) => {
    if (!targetScripts || targetScripts.length === 0) {
      return toast.error('No student records selected for export.');
    }

    const assessment = assessments.find(a => a.id === selectedAssessmentId);
    const courseCode = assessment?.course_code || 'Assessment';

    const headers = [
      'Student Name',
      'Matriculation Number',
      'Course Code',
      'Course Name',
      'Status',
      'MCQ Score',
      'Theory Score',
      'Total Score',
      'Submitted At'
    ];

    const rows = targetScripts.map(s => {
      const isForfeit = s.device_info?.includes('FORFEIT');
      const status = isForfeit ? 'Forfeited' : (s.is_graded ? 'Graded' : 'Pending Review');
      const totalScore = (s.auto_mcq_score || 0) + (s.manual_theory_score || 0);
      const submittedAt = s.submitted_at ? new Date(s.submitted_at).toLocaleString() : 'N/A';

      return [
        escapeCSV(s.profiles?.full_name || 'N/A'),
        escapeCSV(s.profiles?.matriculation_number || 'N/A'),
        escapeCSV(assessment?.course_code || 'N/A'),
        escapeCSV(assessment?.course_name || 'N/A'),
        escapeCSV(status),
        s.auto_mcq_score || 0,
        s.manual_theory_score || 0,
        totalScore,
        escapeCSV(submittedAt)
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const filename = `Exam_Records_${courseCode}_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSV(filename, csvContent);
    toast.success(`Exported exam records for ${targetScripts.length} student(s).`);
  };

  const exportProctoringRecords = async (targetScripts) => {
    if (!targetScripts || targetScripts.length === 0) {
      return toast.error('No student records selected for proctoring export.');
    }

    const assessment = assessments.find(a => a.id === selectedAssessmentId);
    const courseCode = assessment?.course_code || 'Assessment';
    const candidateIds = targetScripts.map(s => s.candidate_id);

    const toastId = toast.loading('Fetching proctoring logs...');

    const { data: infractions } = await supabase
      .from('infraction_logs')
      .select('*')
      .eq('assessment_id', selectedAssessmentId)
      .in('candidate_id', candidateIds)
      .order('logged_at', { ascending: true });

    toast.dismiss(toastId);

    const infractionMap = {};
    if (infractions) {
      infractions.forEach(inf => {
        if (!infractionMap[inf.candidate_id]) infractionMap[inf.candidate_id] = [];
        infractionMap[inf.candidate_id].push(inf);
      });
    }

    const headers = [
      'Student Name',
      'Matriculation Number',
      'Status',
      'IP Address',
      'Latitude',
      'Longitude',
      'Device Info',
      'Total Infractions',
      'Infraction Details & Timeline',
      'Submitted At'
    ];

    const rows = targetScripts.map(s => {
      const isForfeit = s.device_info?.includes('FORFEIT');
      const status = isForfeit ? 'Forfeited' : (s.is_graded ? 'Graded' : 'Pending Review');
      const logs = infractionMap[s.candidate_id] || [];
      const infractionDetails = logs.map(l =>
        `[${new Date(l.logged_at).toLocaleTimeString()}] ${l.infraction_type}: ${l.details || 'N/A'}`
      ).join(' | ');

      return [
        escapeCSV(s.profiles?.full_name || 'N/A'),
        escapeCSV(s.profiles?.matriculation_number || 'N/A'),
        escapeCSV(status),
        escapeCSV(s.ip_address || 'N/A'),
        s.location_lat || '',
        s.location_lng || '',
        escapeCSV(s.device_info || 'N/A'),
        logs.length,
        escapeCSV(infractionDetails || 'None'),
        escapeCSV(s.submitted_at ? new Date(s.submitted_at).toLocaleString() : 'N/A')
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const filename = `Proctoring_Report_${courseCode}_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSV(filename, csvContent);
    toast.success(`Exported proctoring report for ${targetScripts.length} student(s).`);
  };

  const exportExamPDF = async (targetScripts) => {
    if (!targetScripts || targetScripts.length === 0) {
      return toast.error('No student records selected for PDF export.');
    }

    const assessment = assessments.find(a => a.id === selectedAssessmentId);
    const courseCode = assessment?.course_code || 'Assessment';
    const courseName = assessment?.course_name || '';

    // Ensure questions are loaded
    let qList = gradingQuestions;
    if (!qList || qList.length === 0) {
      const toastId = toast.loading('Fetching assessment questions for PDF...');
      const { data: qData } = await supabase
        .from('questions')
        .select('*')
        .eq('assessment_id', selectedAssessmentId)
        .order('sequence_number', { ascending: true });
      toast.dismiss(toastId);
      if (qData) {
        qList = qData;
        setGradingQuestions(qData);
      }
    }

    // Fetch infractions for target candidates
    const candidateIds = targetScripts.map(s => s.candidate_id);
    const { data: infractions } = await supabase
      .from('infraction_logs')
      .select('*')
      .eq('assessment_id', selectedAssessmentId)
      .in('candidate_id', candidateIds)
      .order('logged_at', { ascending: true });

    const infractionMap = {};
    if (infractions) {
      infractions.forEach(inf => {
        if (!infractionMap[inf.candidate_id]) infractionMap[inf.candidate_id] = [];
        infractionMap[inf.candidate_id].push(inf);
      });
    }

    // Build Printable HTML Document for PDF output
    let pagesHtml = targetScripts.map((s) => {
      const isForfeit = s.device_info?.includes('FORFEIT');
      const statusClass = isForfeit ? 'badge-forfeited' : (s.is_graded ? 'badge-graded' : 'badge-pending');
      const statusText = isForfeit ? 'FORFEITED' : (s.is_graded ? 'GRADED' : 'PENDING REVIEW');
      const totalScore = (s.auto_mcq_score || 0) + (s.manual_theory_score || 0);
      const totalPossible = qList ? qList.reduce((sum, q) => sum + (q.points || 0), 0) : 0;
      const logs = infractionMap[s.candidate_id] || [];
      const submittedAt = s.submitted_at ? new Date(s.submitted_at).toLocaleString() : 'N/A';

      let qaContent = '';
      if (qList && qList.length > 0) {
        qaContent = qList.map((q, qIdx) => {
          const answer = s.answers ? s.answers[q.id] : undefined;
          const isMcq = q.q_type === 'mcq';
          const isCorrect = isMcq && answer === q.correct_answer;
          const qScore = s.question_scores?.[q.id];

          let evalHtml = '';
          if (answer !== undefined && answer !== '') {
            if (isMcq) {
              evalHtml = isCorrect
                ? `<div class="eval-tag eval-correct">✓ Correct (+${q.points} pts)</div>`
                : `<div class="eval-tag eval-incorrect">✗ Incorrect &bull; Correct Answer: ${q.correct_answer}</div>`;
            } else {
              evalHtml = `<div class="eval-tag eval-score">Score Awarded: ${qScore !== undefined ? qScore : 'Pending'} / ${q.points} pts</div>`;
            }
          } else {
            evalHtml = `<div class="eval-tag eval-incorrect">No answer provided (0 pts)</div>`;
          }

          return `
            <div class="qa-box">
              <div class="q-header">Q${qIdx + 1}. ${q.q_type.toUpperCase()} (${q.points} Pts)</div>
              <div class="q-text">${q.question_text}</div>
              <div class="a-box">${answer !== undefined && answer !== '' ? String(answer) : '<em style="color:#94a3b8">Unanswered</em>'}</div>
              ${evalHtml}
            </div>
          `;
        }).join('');
      } else {
        qaContent = `<div class="qa-box"><em style="color:#64748b">Raw Answers: ${JSON.stringify(s.answers || {})}</em></div>`;
      }

      let infractionTableHtml = '';
      if (logs.length > 0) {
        infractionTableHtml = `
          <div class="section-title" style="color:#dc2626">Proctoring &amp; Anti-Cheat Audit Log (${logs.length} Event${logs.length > 1 ? 's' : ''})</div>
          <table class="table-proctor">
            <thead>
              <tr>
                <th>Time</th>
                <th>Infraction Type</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td>${new Date(l.logged_at).toLocaleTimeString()}</td>
                  <td><strong style="color:#dc2626">${l.infraction_type}</strong></td>
                  <td>${l.details || 'N/A'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }

      return `
        <div class="student-page">
          <div class="doc-header">
            <h1>EXAMINATION RECORD &amp; TRANSCRIPT</h1>
            <p><strong>${courseCode} &mdash; ${courseName}</strong> &bull; Generated on ${new Date().toLocaleDateString()}</p>
          </div>

          <div class="meta-card">
            <div class="meta-grid">
              <div class="meta-item">
                <strong>Candidate Name</strong>
                <span>${s.profiles?.full_name || 'N/A'}</span>
              </div>
              <div class="meta-item">
                <strong>Matric Number</strong>
                <span>${s.profiles?.matriculation_number || 'N/A'}</span>
              </div>
              <div class="meta-item">
                <strong>Status</strong>
                <span><span class="badge ${statusClass}">${statusText}</span></span>
              </div>
              <div class="meta-item">
                <strong>Final Score</strong>
                <span>${totalScore} / ${totalPossible} Pts</span>
              </div>
            </div>
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #64748b;">
              Submitted At: <strong>${submittedAt}</strong> &bull; 
              IP Address: <strong>${s.ip_address || 'N/A'}</strong> &bull; 
              Location: <strong>${s.location_lat ? `${s.location_lat.toFixed(4)}, ${s.location_lng.toFixed(4)}` : 'N/A'}</strong> &bull;
              Infractions Recorded: <strong style="color:${logs.length > 0 ? '#dc2626' : '#16a34a'}">${logs.length}</strong>
            </div>
          </div>

          <div class="section-title">Questions &amp; Candidate Answers Breakdown</div>
          ${qaContent}

          ${infractionTableHtml}
        </div>
      `;
    }).join('');

    const fullDoc = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Exam Report - ${courseCode}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          body { font-family: 'Inter', sans-serif; margin: 0; padding: 20px; color: #1e293b; background: #fff; font-size: 13px; line-height: 1.5; }
          @page { size: A4; margin: 15mm; }
          .student-page { page-break-after: always; padding-bottom: 20px; }
          .student-page:last-child { page-break-after: avoid; }
          .doc-header { text-align: center; border-bottom: 2px solid #c5a059; padding-bottom: 12px; margin-bottom: 20px; }
          .doc-header h1 { margin: 0 0 4px 0; color: #0f172a; font-size: 20px; letter-spacing: -0.02em; }
          .doc-header p { margin: 0; color: #64748b; font-size: 12px; }
          .meta-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px; }
          .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
          .meta-item strong { display: block; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
          .meta-item span { color: #0f172a; font-weight: 600; font-size: 14px; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
          .badge-graded { background: #dcfce7; color: #166534; }
          .badge-forfeited { background: #ffedd5; color: #9a3412; }
          .badge-pending { background: #fef9c3; color: #854d0e; }
          .section-title { font-size: 13px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin: 20px 0 12px 0; text-transform: uppercase; letter-spacing: 0.03em; }
          .qa-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 12px; page-break-inside: avoid; background: #fff; }
          .q-header { font-weight: 600; color: #334155; font-size: 11px; margin-bottom: 4px; }
          .q-text { color: #0f172a; font-weight: 600; font-size: 13px; margin-bottom: 8px; }
          .a-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px; font-size: 12px; white-space: pre-wrap; }
          .eval-tag { margin-top: 6px; font-size: 11px; font-weight: 600; }
          .eval-correct { color: #16a34a; }
          .eval-incorrect { color: #dc2626; }
          .eval-score { color: #2563eb; }
          .table-proctor { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
          .table-proctor th, .table-proctor td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
          .table-proctor th { background: #f1f5f9; color: #475569; }
        </style>
      </head>
      <body>
        ${pagesHtml}
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return toast.error('Pop-up blocked. Please allow pop-ups for this site to view/print PDF reports.');
    }
    printWindow.document.write(fullDoc);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 600);
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
    const assessmentType = selectedAssessment?.question_type || 'mcq';
    const effectiveQType = assessmentType === 'blended' ? qType : (editingQuestion?.q_type || assessmentType);

    if (editingQuestion) {
      let payload = {
        question_text: questionText,
        points: Number(points),
        q_type: effectiveQType
      };

      if (effectiveQType === 'mcq') {
        payload.options = typeof options === 'string' ? options.split(',').map(o => o.trim()) : options;
        payload.correct_answer = correctAnswer.trim();
      } else if (effectiveQType === 'true_false') {
        payload.options = ['True', 'False'];
        payload.correct_answer = (correctAnswer || 'True').trim();
      } else {
        payload.options = null;
        payload.correct_answer = null;
      }

      const { data, error } = await supabase.from('questions').update(payload).eq('id', editingQuestion.id).select();
      if (error) return toast.error(error.message);
      
      const updatedItem = (data && data.length > 0) ? data[0] : { ...editingQuestion, ...payload };
      toast.success('Question updated');
      setQuestions(questions.map(q => q.id === editingQuestion.id ? updatedItem : q));
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
        payload.options = typeof options === 'string' ? options.split(',').map(o => o.trim()) : options;
        payload.correct_answer = correctAnswer.trim();
      } else if (effectiveQType === 'true_false') {
        payload.options = ['True', 'False'];
        payload.correct_answer = (correctAnswer || 'True').trim();
      } else {
        payload.options = null;
        payload.correct_answer = null;
      }

      const { data, error } = await supabase.from('questions').insert(payload).select().single();
      if (error) return toast.error(error.message);
      toast.success('Question added');
      setQuestions([...questions, data]);
      resetQuestionForm();
    }
  };

  const startEditQuestion = (question) => {
    setEditingQuestion(question);
    setQType(question.q_type || 'mcq');
    setQuestionText(question.question_text || '');
    setPoints(question.points || 5);
    if (question.q_type === 'mcq') {
      const opts = Array.isArray(question.options)
        ? question.options.join(', ')
        : (typeof question.options === 'string' ? question.options : 'Option A, Option B, Option C, Option D');
      setOptions(opts);
      setCorrectAnswer(question.correct_answer || '');
    } else if (question.q_type === 'true_false') {
      setOptions('True, False');
      setCorrectAnswer(question.correct_answer || 'True');
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
    setQuestions(prev => prev.filter(q => q.id !== id));
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
                <label>Question Format</label>
                <select value={questionType} onChange={e=>setQuestionType(e.target.value)} style={{ padding: '0.8rem', background: 'var(--bg-surface-solid)', border: '1px solid var(--border-focus)', color: 'var(--text-ivory)', width: '100%' }}>
                  <option value="mcq">Multiple Choice (MCQ) Only</option>
                  <option value="theory">Theory / Essay Only</option>
                  <option value="blended">✨ Blended Exam (MCQ + T/F + Short Essay)</option>
                </select>
              </div>

              {questionType === 'blended' ? (
                <div className="input-group" style={{ gridColumn: '1 / -1', background: 'var(--bg-surface-solid)', padding: '1rem', border: '1px border var(--accent-gold)', borderRadius: '6px' }}>
                  <label style={{ color: 'var(--accent-gold)', fontWeight: '600', marginBottom: '0.8rem', display: 'block' }}>
                    ⏱️ Blended Section Durations (Minutes per Category)
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>1. MCQ Time (Mins)</label>
                      <input type="number" value={mcqDuration} onChange={e=>setMcqDuration(Math.max(1, Number(e.target.value)))} min={1} required style={{ width: '100%', padding: '0.6rem', marginTop: '0.3rem' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>2. True / False Time (Mins)</label>
                      <input type="number" value={tfDuration} onChange={e=>setTfDuration(Math.max(1, Number(e.target.value)))} min={1} required style={{ width: '100%', padding: '0.6rem', marginTop: '0.3rem' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>3. Short Essay Time (Mins)</label>
                      <input type="number" value={essayDuration} onChange={e=>setEssayDuration(Math.max(1, Number(e.target.value)))} min={1} required style={{ width: '100%', padding: '0.6rem', marginTop: '0.3rem' }} />
                    </div>
                  </div>
                  <div style={{ marginTop: '0.8rem', fontSize: '0.85rem', color: 'var(--text-ivory)', borderTop: '1px dashed var(--border-subtle)', paddingTop: '0.5rem' }}>
                    Total Exam Duration: <strong style={{ color: 'var(--accent-gold)' }}>{Number(mcqDuration) + Number(tfDuration) + Number(essayDuration)} Minutes</strong> (sum of section timers)
                  </div>
                </div>
              ) : (
                <div className="input-group">
                  <label>Duration (Minutes)</label>
                  <input type="number" value={duration} onChange={e=>setDuration(e.target.value)} required min={1} />
                </div>
              )}

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
                  placeholder="e.g. Answer all questions. Each section has an independent countdown timer."
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
                    <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Type &amp; Duration</th>
                    <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Status</th>
                    <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '1rem' }}>
                        <div><strong>{a.course_code}</strong> - {a.course_name} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({a.semester})</span></div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {a.is_blended || a.question_type === 'blended' ? (
                          <div>
                            <span style={{ background: 'rgba(212, 175, 55, 0.2)', color: 'var(--accent-gold)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>Blended Exam</span>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                              MCQ: {a.category_durations?.mcq || 0}m | T/F: {a.category_durations?.true_false || 0}m | Essay: {a.category_durations?.short_essay || 0}m (Total: {a.duration_minutes}m)
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>{a.question_type === 'mcq' ? 'MCQ Only' : 'Theory Only'}</span>
                            <div style={{ fontSize: '0.8rem', marginTop: '2px' }}>{a.duration_minutes}m</div>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '1rem' }}>{a.is_open ? 'Open' : 'Closed'}</td>
                      <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button onClick={() => toggleAssessmentStatus(a.id, a.is_open)} className="btn-premium" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                          {a.is_open ? 'Close' : 'Open'}
                        </button>
                        <button onClick={() => startEditAssessment(a)} className="btn-premium secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                          Edit
                        </button>
                        <button
                          onClick={() => toggleHideAssessment(a.id, a.is_hidden)}
                          className="btn-premium"
                          title={a.is_hidden ? 'Click to make visible to students' : 'Click to hide from students'}
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: a.is_hidden ? '#f59e0b' : '#a3a3a3', borderColor: a.is_hidden ? 'rgba(245,158,11,0.4)' : 'rgba(163,163,163,0.3)' }}
                        >
                          {a.is_hidden ? '👁 Unhide' : '🙈 Hide'}
                        </button>
                        <button
                          onClick={() => openAccessModal(a)}
                          className="btn-premium"
                          title="Grant grading access to other examiners"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: '#60a5fa', borderColor: 'rgba(96,165,250,0.3)' }}
                        >
                          🔑 Access
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
                {assessments.map(a => <option key={a.id} value={a.id}>{a.course_code} - {a.course_name} ({a.is_blended || a.question_type === 'blended' ? 'Blended' : a.question_type.toUpperCase()})</option>)}
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
                      const isBlended = selectedAssessment?.is_blended || selectedAssessment?.question_type === 'blended';
                      
                      if (isBlended) {
                        return (
                          <div className="input-group">
                            <label style={{ fontSize: '0.85rem', color: 'var(--accent-gold)' }}>Target Category Section</label>
                            <select 
                              value={qType} 
                              onChange={e => {
                                setQType(e.target.value);
                                if (e.target.value === 'true_false') {
                                  setOptions('True, False');
                                  setCorrectAnswer('True');
                                } else if (e.target.value === 'short_essay') {
                                  setOptions('');
                                  setCorrectAnswer('');
                                }
                              }} 
                              style={{ padding: '0.6rem', background: 'var(--bg-surface-solid)', border: '1px solid var(--border-focus)', color: 'var(--text-ivory)', width: '100%' }}
                            >
                              <option value="mcq">Category 1: Multiple Choice (MCQ)</option>
                              <option value="true_false">Category 2: True or False (T/F)</option>
                              <option value="short_essay">Category 3: Short Essay / Theory</option>
                            </select>
                          </div>
                        );
                      }

                      return (
                        <div style={{ padding: '0.5rem', background: 'var(--bg-surface-solid)', color: 'var(--text-ivory)', borderRadius: '4px', fontSize: '0.9rem', textAlign: 'center', border: '1px solid var(--border-focus)' }}>
                          Question Format: <strong style={{ color: 'var(--accent-gold)' }}>{selectedAssessment?.question_type === 'mcq' ? 'Multiple Choice' : 'Theory / Short Essay'}</strong>
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

                    {qType === 'true_false' && (
                      <div className="input-group">
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Correct Answer</label>
                        <select value={correctAnswer} onChange={e=>setCorrectAnswer(e.target.value)} style={{ padding: '0.6rem', background: 'var(--bg-surface-solid)', border: '1px solid var(--border-focus)', color: 'var(--text-ivory)', width: '100%' }}>
                          <option value="True">True</option>
                          <option value="False">False</option>
                        </select>
                      </div>
                    )}

                    {(qType === 'short_essay' || qType === 'theory') && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '4px' }}>
                        ℹ️ Short Essay responses are free-form text input by candidates and will be marked manually by examiners during grading.
                      </div>
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
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span>Q{i+1}. ({q.points} Pts)</span>
                            <span style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--accent-gold)', padding: '1px 6px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                              {q.q_type === 'mcq' ? 'MCQ' : q.q_type === 'true_false' ? 'TRUE/FALSE' : 'SHORT ESSAY'}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-ivory)', margin: '0.5rem 0' }}>{q.question_text}</div>
                          {q.q_type === 'mcq' && (
                            <div style={{ fontSize: '0.85rem', color: '#aaa' }}>
                              Options: {Array.isArray(q.options) ? q.options.join(' | ') : (q.options || '')}<br />
                              <span style={{ color: '#00ff88' }}>Ans: {q.correct_answer}</span>
                            </div>
                          )}
                          {q.q_type === 'true_false' && (
                            <div style={{ fontSize: '0.85rem', color: '#aaa' }}>
                              Options: True | False<br />
                              <span style={{ color: '#00ff88' }}>Ans: {q.correct_answer}</span>
                            </div>
                          )}
                          {(q.q_type === 'short_essay' || q.q_type === 'theory') && (
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', italic: 'true' }}>
                              [Short Essay Response]
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
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem', background: 'var(--bg-surface-solid)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    {selectedScriptIds.length > 0 ? (
                      <span style={{ color: 'var(--accent-gold)', fontWeight: 'bold' }}>✓ {selectedScriptIds.length} student(s) selected</span>
                    ) : (
                      <span>Total Submissions: <strong style={{ color: 'var(--text-ivory)' }}>{scripts.length}</strong></span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => {
                        const target = selectedScriptIds.length > 0 
                          ? scripts.filter(s => selectedScriptIds.includes(s.id))
                          : scripts;
                        exportExamPDF(target);
                      }}
                      disabled={scripts.length === 0}
                      className="btn-premium"
                      title="Export complete exam transcript with questions, answers, and scores as PDF"
                      style={{ fontSize: '0.82rem', padding: '0.45rem 0.9rem', color: '#f43f5e', borderColor: 'rgba(244,63,94,0.4)', opacity: scripts.length === 0 ? 0.5 : 1 }}
                    >
                      📄 Export PDF ({selectedScriptIds.length > 0 ? `${selectedScriptIds.length} Selected` : 'All'})
                    </button>
                    <button
                      onClick={() => {
                        const target = selectedScriptIds.length > 0 
                          ? scripts.filter(s => selectedScriptIds.includes(s.id))
                          : scripts;
                        exportExamRecords(target);
                      }}
                      disabled={scripts.length === 0}
                      className="btn-premium"
                      title="Export exam scores and responses to CSV"
                      style={{ fontSize: '0.82rem', padding: '0.45rem 0.9rem', color: '#60a5fa', borderColor: 'rgba(96,165,250,0.4)', opacity: scripts.length === 0 ? 0.5 : 1 }}
                    >
                      📊 Export CSV ({selectedScriptIds.length > 0 ? `${selectedScriptIds.length} Selected` : 'All'})
                    </button>
                    <button
                      onClick={() => {
                        const target = selectedScriptIds.length > 0 
                          ? scripts.filter(s => selectedScriptIds.includes(s.id))
                          : scripts;
                        exportProctoringRecords(target);
                      }}
                      disabled={scripts.length === 0}
                      className="btn-premium"
                      title="Export proctoring logs, IP, geolocation, and device metadata to CSV"
                      style={{ fontSize: '0.82rem', padding: '0.45rem 0.9rem', color: '#a78bfa', borderColor: 'rgba(167,139,250,0.4)', opacity: scripts.length === 0 ? 0.5 : 1 }}
                    >
                      🛡️ Export Proctoring ({selectedScriptIds.length > 0 ? `${selectedScriptIds.length} Selected` : 'All'})
                    </button>
                  </div>
                </div>

                <div className="admin-table-container">
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'var(--text-body)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <th style={{ padding: '1rem', width: '40px' }}>
                          <input
                            type="checkbox"
                            checked={scripts.length > 0 && selectedScriptIds.length === scripts.length}
                            onChange={toggleSelectAllScripts}
                            title="Select all / Deselect all"
                            style={{ accentColor: 'var(--accent-gold)', width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                        </th>
                        <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Student</th>
                        <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Status</th>
                        <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>MCQ Score</th>
                        <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Theory Score</th>
                        <th style={{ padding: '1rem', color: 'var(--accent-gold)' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scripts.map(s => (
                        <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)', background: selectedScriptIds.includes(s.id) ? 'rgba(197,160,89,0.06)' : 'transparent' }}>
                          <td style={{ padding: '1rem' }}>
                            <input
                              type="checkbox"
                              checked={selectedScriptIds.includes(s.id)}
                              onChange={() => toggleSelectScript(s.id)}
                              style={{ accentColor: 'var(--accent-gold)', width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '1rem' }}>{s.profiles?.full_name} ({s.profiles?.matriculation_number})</td>
                          <td style={{ padding: '1rem' }}>
                            {s.device_info?.includes('FORFEIT') ? (
                              <span style={{ color: '#f97316', fontWeight: 'bold', fontSize: '0.8rem' }}>⛔ Forfeited</span>
                            ) : s.is_graded ? 'Graded' : 'Pending Review'}
                          </td>
                          <td style={{ padding: '1rem' }}>{s.auto_mcq_score}</td>
                          <td style={{ padding: '1rem' }}>{s.manual_theory_score}</td>
                          <td style={{ padding: '1rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button onClick={() => { setActiveScript(s); setScriptInfractions([]); fetchInfractions(s.candidate_id, selectedAssessmentId); if (gradingQuestions.length === 0) fetchGradingQuestions(selectedAssessmentId); }} className="btn-premium" style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}>Review</button>
                            <button
                              onClick={() => exportExamPDF([s])}
                              className="btn-premium"
                              title="Export this student's exam transcript with questions and answers as PDF"
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.78rem', color: '#f43f5e', borderColor: 'rgba(244,63,94,0.35)' }}
                            >
                              📄 PDF
                            </button>
                            <button
                              onClick={() => exportExamRecords([s])}
                              className="btn-premium"
                              title="Export this student's exam score to CSV"
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.78rem', color: '#60a5fa', borderColor: 'rgba(96,165,250,0.35)' }}
                            >
                              📊 CSV
                            </button>
                            <button
                              onClick={() => exportProctoringRecords([s])}
                              className="btn-premium"
                              title="Export this student's proctoring log to CSV"
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.78rem', color: '#a78bfa', borderColor: 'rgba(167,139,250,0.35)' }}
                            >
                              🛡️ Proctor
                            </button>
                            <button
                              onClick={() => forfeitStudent(s)}
                              disabled={forfeitingId === s.id}
                              className="btn-premium"
                              title="Mark student as forfeited — score set to zero"
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.78rem', color: '#fb923c', borderColor: 'rgba(251,146,60,0.35)', opacity: forfeitingId === s.id ? 0.5 : 1 }}
                            >
                              {forfeitingId === s.id ? 'Forfeiting...' : '⛔ Forfeit'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteScript(s)}
                              disabled={deletingScriptId === s.id}
                              className="btn-premium"
                              title="Permanently delete this student's exam record"
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.78rem', color: '#f87171', borderColor: 'rgba(248,113,113,0.35)', opacity: deletingScriptId === s.id ? 0.5 : 1 }}
                            >
                              {deletingScriptId === s.id ? 'Deleting...' : '🗑️ Delete'}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {scripts.length === 0 && <tr><td colSpan="6" style={{ padding: '1rem', textAlign: 'center' }}>No submissions yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeScript && (
              <div style={{ background: 'var(--bg-surface-solid)', padding: '2rem', borderRadius: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ color: 'var(--accent-gold)' }}>Script Review: {activeScript.profiles?.full_name}</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => exportExamPDF([activeScript])}
                      className="btn-premium"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', color: '#f43f5e', borderColor: 'rgba(244,63,94,0.4)' }}
                    >
                      📄 Export PDF Transcript
                    </button>
                    <button
                      onClick={() => exportExamRecords([activeScript])}
                      className="btn-premium"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', color: '#60a5fa', borderColor: 'rgba(96,165,250,0.4)' }}
                    >
                      📊 Export Exam CSV
                    </button>
                    <button
                      onClick={() => exportProctoringRecords([activeScript])}
                      className="btn-premium"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', color: '#a78bfa', borderColor: 'rgba(167,139,250,0.4)' }}
                    >
                      🛡️ Export Proctoring CSV
                    </button>
                    <button onClick={() => setActiveScript(null)} className="btn-premium secondary" style={{ padding: '0.4rem 0.8rem' }}>Back to List</button>
                  </div>
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

                {scriptInfractions.length > 0 && (
                  <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ color: '#ff4d4f', marginBottom: '1rem' }}>Proctoring Log ({scriptInfractions.length} infractions)</h4>
                    <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-obsidian)', borderRadius: '4px', padding: '0.75rem' }}>
                      {scriptInfractions.map(inf => (
                        <div key={inf.id} style={{ display: 'flex', gap: '1rem', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)', minWidth: '140px' }}>{new Date(inf.logged_at).toLocaleTimeString()}</span>
                          <span style={{
                            color: inf.infraction_type === 'visibilitychange' ? '#ff4d4f' : '#ffaa33',
                            fontWeight: 'bold', minWidth: '120px'
                          }}>{inf.infraction_type}</span>
                          <span style={{ color: 'var(--text-ivory)' }}>{inf.details}</span>
                        </div>
                      ))}
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

      {/* ===== Access Grant Modal ===== */}
      {accessModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--bg-surface-solid)', border: '1px solid #60a5fa', borderRadius: '10px', maxWidth: '520px', width: '100%', padding: '2rem', boxShadow: '0 20px 60px rgba(0,0,0,0.7)', animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#60a5fa', fontFamily: 'var(--font-heading)', margin: '0 0 0.4rem' }}>🔑 Grant Grading Access</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                Select which admins or lecturers can view and grade{' '}
                <strong style={{ color: 'var(--text-ivory)' }}>{accessModal.course_code} — {accessModal.course_name}</strong>.
              </p>
            </div>

            {accessLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading staff list...</div>
            ) : (
              <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
                {allStaff.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No other staff found on the system.</p>
                )}
                {allStaff.map(staff => {
                  const isSelected = selectedAccessIds.includes(staff.id);
                  return (
                    <label
                      key={staff.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        background: isSelected ? 'rgba(96,165,250,0.12)' : 'var(--bg-surface-hover)',
                        border: `1px solid ${isSelected ? '#60a5fa' : 'var(--border-subtle)'}`,
                        borderRadius: '6px', padding: '0.75rem 1rem', cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAccessIds(prev => [...prev, staff.id]);
                          } else {
                            setSelectedAccessIds(prev => prev.filter(id => id !== staff.id));
                          }
                        }}
                        style={{ accentColor: '#60a5fa', width: '16px', height: '16px', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'var(--text-ivory)', fontWeight: isSelected ? 'bold' : 'normal', fontSize: '0.9rem' }}>{staff.full_name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{staff.email} &middot; <span style={{ color: staff.role === 'superadmin' ? '#f59e0b' : '#60a5fa', textTransform: 'capitalize' }}>{staff.role}</span></div>
                      </div>
                      {isSelected && <span style={{ color: '#60a5fa', fontSize: '1.1rem' }}>✓</span>}
                    </label>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setAccessModal(null); setAllStaff([]); setSelectedAccessIds([]); }}
                className="btn-premium"
                style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={saveAccess}
                disabled={savingAccess || accessLoading}
                className="btn-premium primary"
                style={{ fontWeight: 'bold', opacity: savingAccess ? 0.6 : 1 }}
              >
                {savingAccess ? 'Saving...' : `Save Access (${selectedAccessIds.length} selected)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Delete Script Confirmation Modal ===== */}
      {confirmDeleteScript && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.82)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999,
            animation: 'fadeIn 0.2s ease',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDeleteScript(null); }}
        >
          <div style={{
            background: 'var(--bg-surface-solid)',
            border: '1px solid rgba(248,113,113,0.5)',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '420px',
            width: '90%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
            animation: 'slideUp 0.25s ease',
          }}>
            {/* Icon */}
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '56px', height: '56px', borderRadius: '50%',
                background: 'rgba(248,113,113,0.12)',
                border: '2px solid #f87171',
                fontSize: '1.75rem',
              }}>🗑️</div>
            </div>

            <h3 style={{
              color: '#f87171',
              textAlign: 'center',
              marginBottom: '0.5rem',
              fontSize: '1.15rem',
              fontWeight: 700,
            }}>Delete Exam Record?</h3>

            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              padding: '1rem',
              margin: '1rem 0 1.25rem',
              textAlign: 'center',
            }}>
              <p style={{ color: 'var(--text-ivory)', fontWeight: 700, fontSize: '0.95rem', margin: 0 }}>
                {confirmDeleteScript.profiles?.full_name}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0.3rem 0 0' }}>
                {confirmDeleteScript.profiles?.matriculation_number}
              </p>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.87rem', textAlign: 'center', marginBottom: '1.75rem', lineHeight: 1.65 }}>
              This will <strong style={{ color: '#f87171' }}>permanently delete</strong> all answers, scores, and infraction logs for this student on this assessment. <strong style={{ color: 'var(--text-ivory)' }}>This cannot be undone.</strong>
            </p>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setConfirmDeleteScript(null)}
                style={{
                  flex: 1, padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontWeight: 600, cursor: 'pointer',
                  fontSize: '0.9rem', transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteScript(confirmDeleteScript)}
                style={{
                  flex: 1, padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(248,113,113,0.6)',
                  background: 'rgba(248,113,113,0.15)',
                  color: '#f87171',
                  fontWeight: 700, cursor: 'pointer',
                  fontSize: '0.9rem', transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.28)'; e.currentTarget.style.color = '#fca5a5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.15)'; e.currentTarget.style.color = '#f87171'; }}
              >
                🗑️ Yes, Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
};

export default ExaminerFlow;
