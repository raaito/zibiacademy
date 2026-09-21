import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

const cipherKey = (uid) => uid.replace(/-/g, '').substring(0, 32);

const getCurrentTimestamp = () => Date.now();

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

export const detectIsIOS = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  const platform = navigator.platform || '';

  // 1. Android devices are explicitly NOT iOS (whether mobile, tablet, or desktop mode)
  if (/Android/i.test(ua) || /Android/i.test(platform)) {
    return false;
  }

  // 2. Windows and Linux desktop/mobile are explicitly NOT iOS
  if (/Windows Phone|Windows NT|Linux/i.test(platform) && !/iPhone|iPad|iPod/i.test(ua)) {
    return false;
  }

  // 3. Positively confirm genuine Apple iOS/iPadOS
  const isDirectIOS = /iPhone|iPod|iPad/i.test(ua) || /iPhone|iPod|iPad/i.test(platform);
  
  // iPadOS 13+ reports MacIntel with touch support, but not a regular Mac desktop
  const isIPadOS = platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1 && !/Macintosh/.test(ua.replace(/Macintosh.*AppleWebKit/, ''));

  // MUST be strictly confirmed iOS/iPadOS
  return Boolean(isDirectIOS || isIPadOS);
};

export const detectIsMobile = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  const platform = navigator.platform || '';
  if (/Android/i.test(ua) || /Android/i.test(platform)) return true;
  if (/iPhone|iPod|iPad/i.test(ua) || /iPhone|iPod|iPad/i.test(platform)) return true;
  if (platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) return true;
  if (/Mobile|Tablet|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (typeof window.innerWidth === 'number' && window.innerWidth <= 800 && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0) return true;
  return false;
};

const wrapCanvasText = (ctx, text, x, y, maxWidth, lineHeight, maxLines = 6) => {
  if (!text) return;
  const words = String(text).split(' ');
  let line = '';
  let currentY = y;
  let linesDrawn = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
      linesDrawn++;
      if (linesDrawn >= maxLines) {
        ctx.fillText(line + '...', x, currentY);
        return;
      }
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
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
  const [_tickCount, setTickCounter] = useState(0);
  const [categoryTimeLeft, setCategoryTimeLeft] = useState(0);
  // Per-section independent timers. Each section tracks its own remaining
  // seconds and whether it is currently running (runningAt = epoch) or
  // paused (runningAt = null). When the student switches sections the old
  // section is paused and the new one resumes from where it left off.
  const sectionTimersRef = React.useRef({
    mcq:         { remaining: 0, runningAt: null },
    true_false:  { remaining: 0, runningAt: null },
    short_essay: { remaining: 0, runningAt: null },
  });

  // Device / Proctoring metadata captured at exam start
  const [deviceInfo, setDeviceInfo] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [locationCoords, setLocationCoords] = useState(null);

  // Strict Malpractice & Proctoring State
  const [screenShareLost, setScreenShareLost] = useState(false);
  const [fullscreenLost, setFullscreenLost] = useState(false);
  const [sectionConfirmModal, setSectionConfirmModal] = useState({ open: false, curName: '', nextName: '' });
  const [submitConfirmModal, setSubmitConfirmModal] = useState({ open: false, unansweredCount: 0 });
  const [malpracticeStrikes, setMalpracticeStrikes] = useState(0);
  const [lastInfractionDesc, setLastInfractionDesc] = useState('');
  const [forfeitedReason, setForfeitedReason] = useState('');
  const MAX_MALPRACTICE_STRIKES = 3;

  // iOS & Mobile Proctoring & State Tracking
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [isMobileDeviceState, setIsMobileDeviceState] = useState(false);
  const [isMobileProctor, setIsMobileProctor] = useState(false);
  const isIOSModeRef = React.useRef(false);
  const isMobileProctorModeRef = React.useRef(false);
  const questionsRef = React.useRef([]);
  const currentQuestionIndexRef = React.useRef(0);
  const answersRef = React.useRef({});
  const activeExamRef = React.useRef(null);
  const timeLeftRef = React.useRef(0);

  useEffect(() => { questionsRef.current = questions; }, [questions]);
  useEffect(() => { currentQuestionIndexRef.current = currentQuestionIndex; }, [currentQuestionIndex]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { activeExamRef.current = activeExam; }, [activeExam]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  useEffect(() => {
    const isIOS = detectIsIOS();
    const isMobile = detectIsMobile();
    setIsIOSDevice(isIOS);
    setIsMobileDeviceState(isMobile);
    isIOSModeRef.current = isIOS;
  }, []);

  let examStartRef = React.useRef(null);
  const examStateRef = React.useRef(examState);
  useEffect(() => {
    examStateRef.current = examState;
  }, [examState]);

  // Screen Capture & Webcam Streams
  const screenStreamRef = React.useRef(null);
  const screenVideoElRef = React.useRef(null);
  const webcamStreamRef = React.useRef(null);
  const webcamVideoElRef = React.useRef(null);
  const canvasElRef = React.useRef(null);
  const lastCaptureAtRef = React.useRef(0);
  const MIN_CAPTURE_INTERVAL_MS = 3500; // Throttle to prevent duplicate concurrent captures

  // Away-tracking & violation counters
  const awaySinceRef = React.useRef(null);
  const awayReasonRef = React.useRef(null);
  const awayCountRef = React.useRef(0);
  const genuineAwayCountRef = React.useRef(0);
  const latestRecordMalpracticeStrikeRef = React.useRef(null);
  const latestCaptureSnapshotRef = React.useRef(null);
  const categoryTimeLeftRef = React.useRef(0);
  const isBlendedRef = React.useRef(false);

  const exitFullscreenSafely = () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen().catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Could not exit fullscreen:', e);
    }
    setFullscreenLost(false);
  };

  const stopProctoringStreams = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach(t => t.stop());
      webcamStreamRef.current = null;
    }
    isMobileProctorModeRef.current = false;
    setIsMobileProctor(false);
    exitFullscreenSafely();
  };

  const handleScreenShareStopped = () => {
    if (examStateRef.current !== 'taking_exam') return;
    if (isIOSModeRef.current || isMobileProctorModeRef.current) return;
    setScreenShareLost(true);
    logInfraction(
      'screen_share_stopped',
      'CRITICAL: Student stopped sharing screen during active examination!',
      { severity: 'high', captureEvidence: false }
    );
    recordMalpracticeStrike('Screen sharing was stopped during the active exam.');
  };

  const reenableScreenShare = async () => {
    if (isIOSModeRef.current || isMobileProctorModeRef.current) {
      setScreenShareLost(false);
      return true;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
      screenStreamRef.current = stream;
      if (screenVideoElRef.current) {
        screenVideoElRef.current.srcObject = stream;
        await screenVideoElRef.current.play();
      }
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          handleScreenShareStopped();
        };
      }
      setScreenShareLost(false);
      toast.success('Screen sharing re-established. Continuing examination.');
      logInfraction('screen_share_restored', 'Candidate re-enabled mandatory screen sharing after interruption', { severity: 'low' });
      return true;
    } catch (err) {
      toast.error('Failed to resume screen sharing: ' + err.message);
      return false;
    }
  };

  const requestProctoringStreams = async (examId) => {
    stopProctoringStreams();
    const isIOS = detectIsIOS();
    const isMobile = detectIsMobile();
    setIsIOSDevice(isIOS);
    setIsMobileDeviceState(isMobile);
    isIOSModeRef.current = isIOS;

    let screenGranted = false;

    // ===== 1. MOBILE DEVICE ADAPTIVE PROCTORING (Apple iOS & Android Mobile) =====
    // Mobile browsers (iOS Safari, Android Chrome, mobile WebViews) lack multi-stream screen+camera capabilities.
    // Instead of failing or requesting unsupported desktop screen shares, smoothly activate the high-definition
    // front camera proctoring and real-time exam composite engine for comprehensive monitoring.
    if (isIOS || isMobile) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 }
          },
          audio: false
        });
        webcamStreamRef.current = camStream;
        if (!webcamVideoElRef.current) {
          webcamVideoElRef.current = document.createElement('video');
          webcamVideoElRef.current.playsInline = true;
          webcamVideoElRef.current.muted = true;
          webcamVideoElRef.current.setAttribute('playsinline', '');
          webcamVideoElRef.current.setAttribute('webkit-playsinline', '');
        }
        webcamVideoElRef.current.srcObject = camStream;
        await webcamVideoElRef.current.play();

        if (!canvasElRef.current) {
          canvasElRef.current = document.createElement('canvas');
        }
        canvasElRef.current.width = 1280;
        canvasElRef.current.height = 720;

        screenGranted = true;
        isMobileProctorModeRef.current = true;
        setIsMobileProctor(true);

        const modeLabel = isIOS ? 'Apple iOS' : 'Mobile Device';
        toast.success(
          `📱 ${modeLabel} Connected: Live Front Camera & Real-Time Exam Monitoring Enabled.`,
          { duration: 6000 }
        );

        if (user && examId) {
          await supabase.from('infraction_logs').insert({
            candidate_id: user.id,
            assessment_id: examId,
            infraction_type: isIOS ? 'device_mode_ios' : 'device_mode_mobile',
            details: `Candidate started exam on ${modeLabel}. Front camera facial monitoring + real-time exam canvas composite snapshots activated.`,
            severity: 'info'
          });
        }
        return true;
      } catch (camErr) {
        console.error('Mobile camera access error:', camErr);
        toast.error('Camera access is strictly required for proctoring on mobile devices. Please allow camera permissions in your browser settings.', { duration: 8000 });
        return false;
      }
    }

    // ===== 2. MANDATORY DESKTOP SCREEN CAPTURE & WEBCAM PIP =====
    // On desktop PCs / laptops, full screen capture is strictly mandatory.
    if (typeof navigator?.mediaDevices?.getDisplayMedia === 'function') {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        });
        screenStreamRef.current = screenStream;

        if (!screenVideoElRef.current) {
          screenVideoElRef.current = document.createElement('video');
          screenVideoElRef.current.playsInline = true;
          screenVideoElRef.current.muted = true;
        }
        screenVideoElRef.current.srcObject = screenStream;
        await screenVideoElRef.current.play();

        const screenTrack = screenStream.getVideoTracks()[0];
        if (screenTrack) {
          screenTrack.onended = () => {
            handleScreenShareStopped();
          };
        }
        screenGranted = true;
      } catch (err) {
        console.warn('Screen capture via getDisplayMedia was cancelled or not supported on this device:', err);
      }
    }

    // 3. Strict Requirement on Desktop:
    // On desktop PCs / laptops, full screen capture is strictly mandatory.
    if (!screenGranted) {
      toast.error('Screen sharing is strictly mandatory for proctoring. You must select your ENTIRE SCREEN to begin.', { duration: 8000 });
      if (user && examId) {
        await supabase.from('infraction_logs').insert({
          candidate_id: user.id,
          assessment_id: examId,
          infraction_type: 'screen_share_denied',
          details: 'Screen sharing refused or cancelled at exam start on desktop.',
          severity: 'high'
        });
      }
      return false;
    }

    // 4. Also try requesting candidate webcam on desktop for live face Picture-in-Picture
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 },
        audio: false
      });
      webcamStreamRef.current = camStream;
      if (!webcamVideoElRef.current) {
        webcamVideoElRef.current = document.createElement('video');
        webcamVideoElRef.current.playsInline = true;
        webcamVideoElRef.current.muted = true;
      }
      webcamVideoElRef.current.srcObject = camStream;
      await webcamVideoElRef.current.play();
    } catch (camErr) {
      console.warn('Webcam stream unavailable, continuing with screen capture only:', camErr);
    }

    // 5. Setup high-res snapshot canvas (1280x720 for crisp readable screen text)
    if (!canvasElRef.current) {
      canvasElRef.current = document.createElement('canvas');
    }
    canvasElRef.current.width = 1280;
    canvasElRef.current.height = 720;

    return screenGranted;
  };

  // Captures student screen (with optional face PiP in corner) every 5s & on infractions
  // On iOS (Option 4): Generates high-fidelity composite of virtual exam canvas + live front camera feed
  const captureSnapshot = async (trigger, force = false) => {
    if ((!screenStreamRef.current && !webcamStreamRef.current) || !canvasElRef.current) return null;
    const now = Date.now();
    if (!force && now - lastCaptureAtRef.current < MIN_CAPTURE_INTERVAL_MS) return null;
    lastCaptureAtRef.current = now;

    try {
      const canvas = canvasElRef.current;
      const ctx = canvas.getContext('2d');
      
      const isIOS = isIOSModeRef.current === true;
      const isMobileProctor = isMobileProctorModeRef.current === true;
      const useComposite = isIOS || isMobileProctor || (!screenVideoElRef.current || screenVideoElRef.current.videoWidth === 0);

      if (useComposite) {
        // ========================================================
        // OPTION 4 / MOBILE: LIVE EXAM CANVAS & FRONT CAMERA COMPOSITE
        // (Applies to Apple iOS & Mobile devices without screen sharing)
        // ========================================================
        ctx.fillStyle = '#0a0d14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const curIdx = currentQuestionIndexRef.current || 0;
        const qList = questionsRef.current || [];
        const curQ = qList[curIdx] || null;
        const ansMap = answersRef.current || {};
        const curAns = curQ ? ansMap[curQ.id] : null;
        const curExam = activeExamRef.current;
        const curTime = timeLeftRef.current || 0;

        // Left Panel: Virtual Exam Terminal (750 x 650)
        ctx.fillStyle = '#121622';
        ctx.fillRect(16, 16, 750, 650);
        ctx.strokeStyle = 'rgba(197, 160, 89, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(16, 16, 750, 650);

        // Header bar in left panel
        ctx.fillStyle = '#181f2e';
        ctx.fillRect(16, 16, 750, 48);
        ctx.fillStyle = '#c5a059';
        ctx.font = 'bold 15px sans-serif';
        const examTitle = `${curExam?.course_code || 'EXAM'} • ${curExam?.course_name || 'Active Assessment'}`;
        ctx.fillText(examTitle.slice(0, 52), 32, 46);

        // Timer badge in header
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 13px monospace';
        const m = Math.floor(curTime / 60);
        const s = curTime % 60;
        const timeFmt = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        ctx.fillText(`⏱ REMAINING: ${timeFmt}`, 580, 46);

        // Question Tracker Subheader
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(32, 78, 718, 38);
        ctx.fillStyle = '#c5a059';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`QUESTION ${curIdx + 1} OF ${qList.length}`, 44, 102);

        if (curQ?.category) {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '12px sans-serif';
          ctx.fillText(`[SECTION: ${curQ.category.toUpperCase()}]`, 240, 102);
        }

        if (curQ?.points) {
          ctx.fillStyle = '#38bdf8';
          ctx.font = '12px sans-serif';
          ctx.fillText(`(${curQ.points} Pts)`, 680, 102);
        }

        // Question Text (Cleanly wrapped)
        ctx.fillStyle = '#f8fafc';
        ctx.font = '16px sans-serif';
        const qText = curQ?.question_text || 'Active examination session in progress.';
        wrapCanvasText(ctx, qText, 44, 145, 690, 24, 4);

        // Render Candidate Response / Options
        if (curQ?.options && Array.isArray(curQ.options) && curQ.options.length > 0) {
          let optY = 265;
          curQ.options.slice(0, 5).forEach((opt, oIdx) => {
            const optLetter = String.fromCharCode(65 + oIdx);
            const isSelected = String(curAns || '').trim().toLowerCase() === optLetter.toLowerCase() ||
              String(curAns || '').trim().toLowerCase() === String(opt).trim().toLowerCase();

            ctx.fillStyle = isSelected ? 'rgba(197, 160, 89, 0.22)' : 'rgba(255, 255, 255, 0.03)';
            ctx.fillRect(44, optY - 20, 690, 38);
            ctx.strokeStyle = isSelected ? '#c5a059' : 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = isSelected ? 1.5 : 1;
            ctx.strokeRect(44, optY - 20, 690, 38);

            ctx.fillStyle = isSelected ? '#c5a059' : '#94a3b8';
            ctx.font = isSelected ? 'bold 14px sans-serif' : '14px sans-serif';
            const optLabel = `[${isSelected ? '✓ SELECTED' : ' '}]  (${optLetter})  ${String(opt).slice(0, 70)}`;
            ctx.fillText(optLabel, 58, optY + 4);

            optY += 48;
          });
        } else if (curQ?.q_type === 'short_essay' || curQ?.q_type === 'theory') {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.fillRect(44, 250, 690, 240);
          ctx.strokeStyle = 'rgba(197, 160, 89, 0.35)';
          ctx.strokeRect(44, 250, 690, 240);

          ctx.fillStyle = '#a1a1aa';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText('STUDENT TYPED THEORY / ESSAY RESPONSE:', 56, 275);

          ctx.fillStyle = '#f4f4f5';
          ctx.font = '13px monospace';
          const typed = typeof curAns === 'string' && curAns.trim() ? curAns : '(No written response entered yet)';
          wrapCanvasText(ctx, typed.slice(0, 480), 56, 305, 665, 20, 8);
        } else {
          // Standard answer preview
          ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
          ctx.fillRect(44, 250, 690, 80);
          ctx.strokeStyle = 'rgba(197, 160, 89, 0.3)';
          ctx.strokeRect(44, 250, 690, 80);
          ctx.fillStyle = '#c5a059';
          ctx.font = '13px sans-serif';
          ctx.fillText(`Recorded Response: ${String(curAns || '(Unanswered)')}`, 58, 296);
        }

        // Right Panel: Live Front Camera & Candidate Security Meta (484 x 650)
        const rightX = 780;
        const rightW = 484;

        ctx.fillStyle = '#121622';
        ctx.fillRect(rightX, 16, rightW, 650);
        ctx.strokeStyle = 'rgba(197, 160, 89, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rightX, 16, rightW, 650);

        // Header for Camera Panel
        ctx.fillStyle = '#181f2e';
        ctx.fillRect(rightX, 16, rightW, 48);
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(isIOS ? '🔴 LIVE iOS SURVEILLANCE FEED' : '🔴 LIVE MOBILE SURVEILLANCE FEED', rightX + 20, 46);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '11px sans-serif';
        ctx.fillText('FACIAL & GAZE MONITOR', rightX + 320, 46);

        // Draw Front Camera Video
        const camVideo = webcamVideoElRef.current;
        const vidW = rightW - 32;
        const vidH = Math.round(vidW * 0.75); // 452 x 339
        const vidX = rightX + 16;
        const vidY = 80;

        if (camVideo && camVideo.videoWidth > 0) {
          ctx.drawImage(camVideo, vidX, vidY, vidW, vidH);
          ctx.strokeStyle = '#c5a059';
          ctx.lineWidth = 2;
          ctx.strokeRect(vidX, vidY, vidW, vidH);

          // Video caption banner
          ctx.fillStyle = 'rgba(10, 13, 20, 0.85)';
          ctx.fillRect(vidX, vidY + vidH - 26, vidW, 26);
          ctx.fillStyle = '#fff';
          ctx.font = '11px sans-serif';
          ctx.fillText(`CAMERA: ${profile?.full_name?.slice(0, 26) || 'Candidate'}`, vidX + 10, vidY + vidH - 8);
        } else {
          ctx.fillStyle = '#0b0d14';
          ctx.fillRect(vidX, vidY, vidW, vidH);
          ctx.strokeStyle = '#334155';
          ctx.strokeRect(vidX, vidY, vidW, vidH);
          ctx.fillStyle = '#64748b';
          ctx.font = '13px sans-serif';
          ctx.fillText('Front camera feed initializing...', vidX + 120, vidY + 160);
        }

        // Candidate Biometric Metadata Card below video
        const metaY = vidY + vidH + 16;
        const metaH = 650 - (metaY - 16) - 16;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(vidX, metaY, vidW, metaH);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.strokeRect(vidX, metaY, vidW, metaH);

        ctx.fillStyle = '#c5a059';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('CANDIDATE BIOMETRIC PROFILE', vidX + 14, metaY + 24);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '12px sans-serif';
        ctx.fillText(`Candidate: ${profile?.full_name || 'Student'}`, vidX + 14, metaY + 48);
        ctx.fillText(`Matric No: ${profile?.matriculation_number || user?.email || 'N/A'}`, vidX + 14, metaY + 70);
        ctx.fillText(`Device Mode: ${isIOS ? 'Apple iOS • Option 4 (Canvas & Camera)' : 'Mobile Device • Live Camera & Canvas'}`, vidX + 14, metaY + 92);
        ctx.fillText(`Active Question: #${curIdx + 1} of ${qList.length}`, vidX + 14, metaY + 114);

        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('● REAL-TIME SURVEILLANCE & TAB MONITORING ACTIVE', vidX + 14, metaY + 142);
      } else {
        // ========================================================
        // STANDARD DESKTOP / ANDROID SCREEN CAPTURE
        // ========================================================
        ctx.fillStyle = '#0a0a0c';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Primary visual: candidate's active screen
        if (screenVideoElRef.current && screenVideoElRef.current.videoWidth > 0) {
          ctx.drawImage(screenVideoElRef.current, 0, 0, canvas.width, canvas.height);
        } else if (webcamVideoElRef.current && webcamVideoElRef.current.videoWidth > 0) {
          ctx.drawImage(webcamVideoElRef.current, 0, 0, canvas.width, canvas.height);
        }

        // Picture-in-Picture: Candidate face webcam in top-right corner
        if (
          screenVideoElRef.current && screenVideoElRef.current.videoWidth > 0 &&
          webcamVideoElRef.current && webcamVideoElRef.current.videoWidth > 0
        ) {
          const pipW = 240;
          const pipH = 180;
          const pipX = canvas.width - pipW - 16;
          const pipY = 16;

          ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
          ctx.fillRect(pipX - 3, pipY - 3, pipW + 6, pipH + 6);
          ctx.strokeStyle = '#c5a059';
          ctx.lineWidth = 2;
          ctx.strokeRect(pipX - 3, pipY - 3, pipW + 6, pipH + 6);

          ctx.drawImage(webcamVideoElRef.current, pipX, pipY, pipW, pipH);

          ctx.fillStyle = 'rgba(10, 10, 12, 0.85)';
          ctx.fillRect(pipX, pipY + pipH - 24, pipW, 24);
          ctx.fillStyle = '#ffffff';
          ctx.font = '11px sans-serif';
          ctx.fillText(`CAM: ${profile?.full_name?.slice(0, 20) || 'Candidate'}`, pipX + 8, pipY + pipH - 8);
        }
      }

      // Proctoring audit security footer watermark across bottom of all snapshots
      const barH = 36;
      ctx.fillStyle = 'rgba(10, 10, 14, 0.94)';
      ctx.fillRect(0, canvas.height - barH, canvas.width, barH);
      ctx.strokeStyle = 'rgba(197, 160, 89, 0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, canvas.height - barH, canvas.width, barH);

      ctx.fillStyle = '#c5a059';
      ctx.font = 'bold 12px sans-serif';
      const watermarkTitle = isIOS ? 'DTMD iOS PROCTOR (OPTION 4)' : isMobileProctor ? 'DTMD MOBILE PROCTOR' : 'DTMD STRICT SCREEN PROCTOR';
      ctx.fillText(watermarkTitle, 14, canvas.height - 14);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px sans-serif';
      const timeStr = new Date(now).toLocaleString();
      const candStr = `${profile?.full_name || 'Student'} (${profile?.matriculation_number || user?.email || 'N/A'})`;
      ctx.fillText(` | Candidate: ${candStr} | Event: ${trigger.toUpperCase()} | ${timeStr}`, isIOS ? 230 : isMobileProctor ? 200 : 220, canvas.height - 14);

      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.70));
      if (!blob) return null;

      const path = `${user.id}/${activeExam?.id || 'exam'}/${now}-${trigger}.jpg`;
      const { error } = await supabase.storage.from('proctoring-evidence').upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: false
      });
      if (error) {
        console.warn('Evidence upload failed:', error.message);
        return null;
      }
      return path;
    } catch (err) {
      console.error('Error in captureSnapshot:', err);
      return null;
    }
  };

  const recordMalpracticeStrike = async (reason) => {
    const nextStrikes = malpracticeStrikes + 1;
    setMalpracticeStrikes(nextStrikes);
    setLastInfractionDesc(reason);

    if (nextStrikes >= MAX_MALPRACTICE_STRIKES) {
      await triggerForfeitureAndSuspension(reason);
    } else {
      toast.error(
        `🚨 MALPRACTICE WARNING: ${reason}. Repeated prohibited actions will result in automatic exam forfeiture and account suspension.`,
        { duration: 8000, style: { background: '#1c1917', color: '#fca5a5', border: '2px solid #ef4444' } }
      );
    }
  };

  const triggerForfeitureAndSuspension = async (reason) => {
    stopProctoringStreams();
    setExamState('forfeited');
    setForfeitedReason(reason);

    // 1. Log high severity infraction
    await logInfraction(
      'auto_forfeit_suspended',
      `EXAM FORFEITED & ACCOUNT SUSPENDED: Malpractice violation: ${reason}`,
      { severity: 'high', captureEvidence: true }
    );

    // 2. Submit candidate script with score 0
    try {
      let totalPossible = 0;
      questions.forEach(q => { totalPossible += q.points; });
      await supabase.from('candidate_scripts').insert({
        candidate_id: user.id,
        assessment_id: activeExam?.id,
        answers: answers,
        auto_mcq_score: 0,
        manual_theory_score: 0,
        total_possible_score: totalPossible,
        question_scores: {},
        is_graded: true,
        device_info: `${deviceInfo} | FORFEITED FOR MALPRACTICE: Exceeded strikes limit. Trigger: ${reason}`,
        ip_address: ipAddress,
        location_lat: locationCoords !== null ? locationCoords.lat : null,
        location_lng: locationCoords !== null ? locationCoords.lng : null
      });
    } catch (err) {
      console.error('Failed to submit forfeited script:', err);
    }

    // 3. Suspend candidate account in profiles
    try {
      await supabase.from('profiles').update({
        is_active: false
      }).eq('id', user.id);
    } catch (err) {
      console.error('Failed to update candidate profile status:', err);
    }

    // 4. Remove local draft
    if (activeExam?.id) {
      localStorage.removeItem(`zibi_exam_draft_${activeExam.id}`);
    }

    exitFullscreenSafely();
    stopProctoringStreams();
    setExamState('finished');

    toast.error('Your examination has been FORFEITED and your student portal SUSPENDED due to malpractice violations.', {
      duration: 10000
    });
  };

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
    // Snapshot current remaining times: if a section is running, compute
    // its remaining at this instant so the draft is always up-to-date.
    const timerSnapshot = {};
    const st = sectionTimersRef.current;
    for (const key of ['mcq', 'true_false', 'short_essay']) {
      const t = st[key];
      if (t.runningAt !== null) {
        const elapsed = Math.floor((Date.now() - t.runningAt) / 1000);
        timerSnapshot[key] = Math.max(0, t.remaining - elapsed);
      } else {
        timerSnapshot[key] = t.remaining;
      }
    }
    const draftData = {
      answers,
      timeLeft,
      activeCategoryIndex,
      completedCategories,
      sectionTimers: timerSnapshot,
      savedAt: Date.now()
    };
    const cKey = cipherKey(user?.id || '');
    localStorage.setItem(draftKey, encrypt(JSON.stringify(draftData), cKey));
  };

  const captureDeviceInfo = () => {
    const isIOS = detectIsIOS();
    const isMobile = detectIsMobile();
    const ua = navigator.userAgent;
    const platform = navigator.platform || 'unknown';
    const screen = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    const lang = navigator.language || 'unknown';
    const modeTag = isIOS
      ? ' | Mode: iOS Option 4 (Canvas & Camera)'
      : isMobile
      ? ' | Mode: Mobile Device (Live Camera & Canvas)'
      : ' | Mode: Desktop Strict Screen Share';
    setDeviceInfo(`UA: ${ua} | Platform: ${platform} | Screen: ${screen} | Lang: ${lang}${modeTag}`);

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
    captureDeviceInfo();
    const granted = await requestProctoringStreams(exam.id);
    if (!granted) {
      return;
    }
    setActiveExam(exam);

    // Request full-screen display lockdown (Desktop / Android)
    if (!isIOSModeRef.current) {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch {
        // browser may restrict fullscreen without direct user gesture
      }
    }

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
          // Restore per-section remaining times from draft.
          // For the active section subtract any extra elapsed time since save.
          const savedST = parsed.sectionTimers || {};
          const st = sectionTimersRef.current;
          for (const k of ['mcq', 'true_false', 'short_essay']) {
            const durSec = (catDurs[k] || 10) * 60;
            const saved = savedST[k] !== undefined ? savedST[k] : durSec;
            // Only the active section loses time while the tab was closed.
            const loss = k === (defaultSeq[catIdx] || 'mcq') ? elapsed : 0;
            st[k] = { remaining: Math.max(0, Math.floor(saved - loss)), runningAt: null };
          }
          // Start the active section's timer running.
          const activeCatKey = defaultSeq[catIdx] || 'mcq';
          st[activeCatKey].runningAt = Date.now();
          setCategoryTimeLeft(st[activeCatKey].remaining);
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
          const st = sectionTimersRef.current;
          for (const k of ['mcq', 'true_false', 'short_essay']) {
            st[k] = { remaining: (catDurs[k] || 10) * 60, runningAt: null };
          }
          st.mcq.runningAt = Date.now();
          setCategoryTimeLeft(st.mcq.remaining);
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
        const st = sectionTimersRef.current;
        for (const k of ['mcq', 'true_false', 'short_essay']) {
          st[k] = { remaining: (catDurs[k] || 10) * 60, runningAt: null };
        }
        st.mcq.runningAt = Date.now(); // MCQ is always the first section
        setCategoryTimeLeft(st.mcq.remaining);
      } else {
        examStartRef.current = Date.now();
        setTimeLeft(exam.duration_minutes * 60);
      }
    }

    setCurrentQuestionIndex(0);
    isSubmittingRef.current = false;
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

  const logInfraction = async (type, details, opts = {}) => {
    if (!activeExam || !user) return;
    const { severity = 'low', durationSeconds = null, captureEvidence = false } = opts;

    const qNum = (currentQuestionIndexRef.current || 0) + 1;
    const totalQs = (questionsRef.current?.length) || (questions?.length) || 1;
    const curTime = isBlendedRef.current ? categoryTimeLeftRef.current : timeLeftRef.current;
    const timeRemaining = formatTime(curTime !== undefined ? curTime : (isBlended ? categoryTimeLeft : timeLeft));
    const enriched = `[Q${qNum}/${totalQs} | ${timeRemaining} remaining] ${details}`;

    // Only bother capturing a frame for events actually worth an examiner's
    // attention — info/low noise (a stray blur under the threshold) doesn't
    // need a photo, which also keeps storage/bandwidth sane.
    let evidence_path = null;
    if (captureEvidence && (severity === 'medium' || severity === 'high')) {
      evidence_path = await captureSnapshot(type, true);
    }

    const payload = {
      candidate_id: user.id,
      assessment_id: activeExam.id,
      infraction_type: type,
      details: enriched,
      severity,
      duration_seconds: durationSeconds,
      evidence_path
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

  // "Latest ref" mirrors for submitExam/logInfraction. resetIdleTimer's
  // setTimeout callback lives inside an effect that intentionally only
  // re-mounts when examState changes (see the isolated idle-timer effect
  // below) — so if it called submitExam/logInfraction directly, it would
  // close over whatever `answers`/`currentQuestionIndex`/etc. existed back
  // when the exam started, and an eventual auto-submit-on-idle could wipe
  // out everything the student had actually answered since. Routing the
  // call through a ref that's refreshed every render guarantees the
  // timeout always calls the current version, with current state, no
  // matter how long ago the effect that scheduled it last ran.
  const latestSubmitExamRef = React.useRef(null);
  const latestLogInfractionRef = React.useRef(null);
  const latestAdvanceRef = React.useRef(null);
  // Guard: prevent the 1-second interval from firing submitExam multiple
  // times before React re-renders examState to 'finished'.
  const isSubmittingRef = React.useRef(false);

  const resetIdleTimer = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      latestLogInfractionRef.current?.('inactivity', 'Auto-submitted due to inactivity', { severity: 'high', durationSeconds: IDLE_TIMEOUT, captureEvidence: true });
      latestSubmitExamRef.current?.(true);
    }, IDLE_TIMEOUT * 1000);
  };

  // Anti-Cheat Engine Log - Strict Event Monitoring
  useEffect(() => {
    if (examState !== 'taking_exam') return;

    // Single source of truth for away-from-exam tracking - eliminates race conditions & Set deadlocks
    const recordAwayStart = (reason) => {
      if (awaySinceRef.current === null) {
        awaySinceRef.current = Date.now();
        awayReasonRef.current = reason;
        // Immediately take evidence snapshot upon departure
        latestCaptureSnapshotRef.current?.('navigated_away', true);
      }
    };

    const recordAwayReturn = () => {
      if (awaySinceRef.current === null) return;
      const departureTime = awaySinceRef.current;
      const departureReason = awayReasonRef.current || 'tab_switch';
      awaySinceRef.current = null;
      awayReasonRef.current = null;

      const durationSec = Math.max(1, Math.round((Date.now() - departureTime) / 1000));

      if (departureReason === 'tab_switch_hidden' || departureReason === 'pagehide') {
        genuineAwayCountRef.current = (genuineAwayCountRef.current || 0) + 1;
        const severity = durationSec >= 10 ? 'high' : (durationSec >= 4 ? 'high' : 'medium');
        const desc = `Switched away to another browser tab or minimized window (${durationSec}s away to search or browse external resources)`;

        latestLogInfractionRef.current?.(
          'tab_or_window_switch',
          desc,
          { severity, durationSeconds: durationSec, captureEvidence: true }
        );

        latestRecordMalpracticeStrikeRef.current?.(
          `Switched to another browser tab or external application (${durationSec}s away)`
        );

        toast.error(
          `🚨 PROHIBITED TAB SWITCH DETECTED: You navigated away from the exam for ${durationSec}s. Tab switching to search for answers is strictly prohibited and recorded as malpractice!`,
          { duration: 7000, style: { background: '#1c1917', color: '#fca5a5', border: '2px solid #ef4444' } }
        );
      } else if (departureReason === 'window_blur') {
        if (durationSec < 2) return; // ignore micro focus change under 2s

        const severity = durationSec >= 8 ? 'high' : 'medium';
        const desc = `Exam window lost focus to external application or overlay (${durationSec}s duration)`;

        latestLogInfractionRef.current?.(
          'window_blur',
          desc,
          { severity, durationSeconds: durationSec, captureEvidence: true }
        );

        if (durationSec >= 6) {
          latestRecordMalpracticeStrikeRef.current?.(
            `Lost window focus to external application (${durationSec}s)`
          );
        }
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        recordAwayStart('tab_switch_hidden');
      } else {
        recordAwayReturn();
      }
    };

    const handlePageHide = () => {
      recordAwayStart('pagehide');
    };

    const handlePageShow = () => {
      recordAwayReturn();
    };

    const handleBlur = () => {
      if (!document.hidden) {
        recordAwayStart('window_blur');
      }
    };

    const handleFocus = () => {
      recordAwayReturn();
    };

    const preventCopyPaste = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = (e.type || 'clipboard').toUpperCase();
      const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';

      if (e.type === 'paste') {
        let pastedText = '';
        if (e.clipboardData) {
          try {
            pastedText = e.clipboardData.getData('text') || '';
          } catch (err) {
            void err;
          }
        }

        const snippet = pastedText
          ? ` | Captured Pasted Content: "${pastedText.slice(0, 300)}"`
          : '';

        toast.error('Pasting is strictly prohibited during the examination. You must type your response directly.', {
          duration: 6000,
          style: { background: '#1c1917', color: '#fca5a5', border: '2px solid #ef4444' }
        });

        latestLogInfractionRef.current?.(
          'unauthorized_paste_attempt',
          `Attempted clipboard paste into ${tag || 'exam field'}${snippet} (action blocked)`,
          { severity: 'high', captureEvidence: true }
        );
        latestRecordMalpracticeStrikeRef.current?.('Attempted clipboard paste into exam response');
      } else {
        const sel = window.getSelection()?.toString().trim();
        const snippet = sel ? ` | Captured Selected Content: "${sel.slice(0, 200)}"` : '';

        toast.error(`${action === 'CUT' ? 'Cutting' : 'Copying'} is strictly prohibited during the examination.`, {
          duration: 6000,
          style: { background: '#1c1917', color: '#fca5a5', border: '2px solid #ef4444' }
        });

        latestLogInfractionRef.current?.(
          'unauthorized_clipboard',
          `Attempted clipboard ${action} on ${tag || 'exam interface'}${snippet} (action blocked)`,
          { severity: 'high', captureEvidence: true }
        );
        latestRecordMalpracticeStrikeRef.current?.(`Attempted unauthorized clipboard ${action}`);
      }
    };

    // Mobile Keyboard input interception (Gboard, Samsung, iOS suggestions, clipboard chips)
    const handleBeforeInput = (e) => {
      const inputType = e.inputType || '';
      const isPaste = inputType.toLowerCase().includes('paste') || inputType === 'insertFromDrop' || inputType === 'insertFromYank';

      if (isPaste) {
        e.preventDefault();
        e.stopPropagation();

        let pastedText = '';
        if (e.dataTransfer) {
          try {
            pastedText = e.dataTransfer.getData('text') || '';
          } catch (err) {
            void err;
          }
        } else if (e.data) {
          pastedText = e.data;
        }

        const snippet = pastedText
          ? ` | Captured Pasted Content: "${pastedText.slice(0, 300)}"`
          : '';

        toast.error('Pasting via mobile keyboard clipboard is strictly prohibited.', {
          duration: 6000,
          style: { background: '#1c1917', color: '#fca5a5', border: '2px solid #ef4444' }
        });

        latestLogInfractionRef.current?.(
          'unauthorized_paste_attempt',
          `Mobile keyboard clipboard paste intercepted (inputType: ${inputType})${snippet} (action blocked)`,
          { severity: 'high', captureEvidence: true }
        );
        latestRecordMalpracticeStrikeRef.current?.('Attempted mobile keyboard clipboard paste');
      }
    };

    // Anti-selection enforcement: clears highlighting on questions or answers to prevent copying
    const handleSelectionChange = () => {
      if (examStateRef.current !== 'taking_exam') return;
      const sel = window.getSelection();
      if (!sel || !sel.toString().trim()) return;

      const activeEl = document.activeElement;
      const isInsideInput = activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT');

      if (!isInsideInput) {
        // Immediately clear any selection to disallow copying, without issuing a strike for inadvertent touch/tap highlights
        sel.removeAllRanges();
      }
    };

    const preventDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toast.error('Drag and drop is strictly prohibited during the examination.');
      latestLogInfractionRef.current?.('unauthorized_drag_drop', 'Attempted unauthorized drag-and-drop into exam (action blocked)', { severity: 'medium', captureEvidence: true });
    };

    const preventDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const preventContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sel = window.getSelection()?.toString().trim();
      const targetTag = e.target?.tagName ? e.target.tagName.toLowerCase() : 'unknown';
      let targetDesc = `element <${targetTag}>`;
      if (sel) {
        targetDesc = `selected text: "${sel.slice(0, 60)}..."`;
      } else if (e.target?.closest('.question-card') || e.target?.closest('[data-question-text]')) {
        targetDesc = `exam question panel`;
      }

      latestLogInfractionRef.current?.(
        'context_menu_attempt',
        `Right-click or long-press context menu attempted on ${targetDesc} (blocked to prevent inspect or external web search)`,
        { severity: 'medium', captureEvidence: true }
      );
    };

    // Keyboard Shortcuts (Copy/Paste, DevTools, View Source, Print/Save, Hotkey navigation)
    const handleKeyDown = (e) => {
      // 0. Copy / Paste / Cut Shortcuts: Ctrl+C, Ctrl+V, Ctrl+X, Cmd+C, Cmd+V, Cmd+X
      if ((e.ctrlKey || e.metaKey) && ['c', 'C', 'v', 'V', 'x', 'X'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        const key = e.key.toLowerCase();
        if (key === 'v') {
          toast.error('Pasting via shortcut (Ctrl+V / Cmd+V) is strictly prohibited. You must type your response directly.', {
            duration: 6000,
            style: { background: '#1c1917', color: '#fca5a5', border: '2px solid #ef4444' }
          });
          latestLogInfractionRef.current?.('unauthorized_paste_shortcut', 'Attempted unauthorized paste via Ctrl+V / Cmd+V shortcut (action blocked)', { severity: 'high', captureEvidence: true });
          latestRecordMalpracticeStrikeRef.current?.('Attempted unauthorized paste keyboard shortcut');
        } else if (key === 'c') {
          toast.error('Copying via shortcut (Ctrl+C / Cmd+C) is strictly prohibited.', {
            duration: 5000,
            style: { background: '#1c1917', color: '#fca5a5', border: '2px solid #ef4444' }
          });
          latestLogInfractionRef.current?.('unauthorized_copy_shortcut', 'Attempted unauthorized copy via Ctrl+C / Cmd+C shortcut (action blocked)', { severity: 'high', captureEvidence: true });
          latestRecordMalpracticeStrikeRef.current?.('Attempted unauthorized copy keyboard shortcut');
        } else if (key === 'x') {
          toast.error('Cutting via shortcut (Ctrl+X / Cmd+X) is strictly prohibited.', {
            duration: 5000,
            style: { background: '#1c1917', color: '#fca5a5', border: '2px solid #ef4444' }
          });
          latestLogInfractionRef.current?.('unauthorized_cut_shortcut', 'Attempted unauthorized cut via Ctrl+X / Cmd+X shortcut (action blocked)', { severity: 'high', captureEvidence: true });
          latestRecordMalpracticeStrikeRef.current?.('Attempted unauthorized cut keyboard shortcut');
        }
        return;
      }
      if ((e.shiftKey && e.key === 'Insert') || (e.ctrlKey && e.key === 'Insert')) {
        e.preventDefault();
        e.stopPropagation();
        toast.error('Clipboard shortcut with Insert key is strictly prohibited.', {
          duration: 5000,
          style: { background: '#1c1917', color: '#fca5a5', border: '2px solid #ef4444' }
        });
        latestLogInfractionRef.current?.('unauthorized_clipboard_shortcut', 'Attempted clipboard shortcut with Insert key (action blocked)', { severity: 'high', captureEvidence: true });
        latestRecordMalpracticeStrikeRef.current?.('Attempted unauthorized clipboard shortcut');
        return;
      }

      // 1. F12 Developer Tools
      if (e.key === 'F12') {
        e.preventDefault();
        latestLogInfractionRef.current?.('devtools_attempt', 'Attempted to open Developer Tools via F12 key (action blocked)', { severity: 'high', captureEvidence: true });
        latestRecordMalpracticeStrikeRef.current?.('Attempted to open Developer Tools via F12');
        return;
      }
      // 2. Ctrl+Shift+I / J / C (or Cmd+Option+I / J / C)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'I', 'j', 'J', 'c', 'C'].includes(e.key)) {
        e.preventDefault();
        latestLogInfractionRef.current?.('devtools_attempt', `Attempted to open Developer Tools / Inspect Element via shortcut Ctrl+Shift+${e.key.toUpperCase()} (blocked)`, { severity: 'high', captureEvidence: true });
        latestRecordMalpracticeStrikeRef.current?.('Attempted to inspect element or open Developer Tools');
        return;
      }
      // 3. Ctrl+U: View Page Source
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        latestLogInfractionRef.current?.('source_code_inspection', 'Attempted to view exam page source code via Ctrl+U (blocked)', { severity: 'high', captureEvidence: true });
        latestRecordMalpracticeStrikeRef.current?.('Attempted to inspect page source code');
        return;
      }
      // 4. Ctrl+P / Ctrl+S: Save or Print Exam
      if ((e.ctrlKey || e.metaKey) && ['s', 'S', 'p', 'P'].includes(e.key)) {
        e.preventDefault();
        latestLogInfractionRef.current?.('save_print_attempt', `Attempted unauthorized browser shortcut (Ctrl+${e.key.toUpperCase()}) to save or print exam questions (blocked)`, { severity: 'medium', captureEvidence: true });
        return;
      }
      // 5. Navigation Hotkeys: Alt+Tab, Ctrl+Tab, Ctrl+T, Ctrl+N
      if (
        (e.altKey && e.key === 'Tab') ||
        ((e.ctrlKey || e.metaKey) && ['t', 'T', 'n', 'N', 'w', 'W'].includes(e.key))
      ) {
        latestLogInfractionRef.current?.('navigation_hotkey_attempt', `Attempted unauthorized navigation shortcut (${e.altKey ? 'Alt+Tab' : `Ctrl+${e.key.toUpperCase()}`}) to switch tabs or open new window`, { severity: 'medium', captureEvidence: true });
      }
    };

    // Fullscreen enforcement
    const handleFullscreenChange = () => {
      if (examStateRef.current !== 'taking_exam') return;
      if (isIOSModeRef.current || isMobileProctorModeRef.current) return;
      if (!document.fullscreenElement) {
        setFullscreenLost(true);
        latestLogInfractionRef.current?.(
          'fullscreen_exit',
          'Exited fullscreen display mode',
          { severity: 'medium', captureEvidence: true }
        );
      } else {
        setFullscreenLost(false);
      }
    };

    // Split-screen & Window Resizing Detection
    let resizeDebounce = null;
    const handleResize = () => {
      if (resizeDebounce) clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => {
        const availW = window.screen.availWidth || window.screen.width;
        if (window.innerWidth < availW * 0.8) {
          latestLogInfractionRef.current?.(
            'window_resized_splitscreen',
            'Exam window resized (suspected split-screen layout alongside external applications or browser)',
            { severity: 'medium', captureEvidence: true }
          );
        }
      }, 500);
    };

    // Accidental Exit Prevention
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'You have an exam in progress. Are you sure you want to leave?';
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("copy", preventCopyPaste, true);
    document.addEventListener("paste", preventCopyPaste, true);
    document.addEventListener("cut", preventCopyPaste, true);
    document.addEventListener("beforeinput", handleBeforeInput, true);
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("drop", preventDrop, true);
    document.addEventListener("dragover", preventDragOver, true);
    document.addEventListener("contextmenu", preventContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("resize", handleResize);
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Anti-selection & Mobile Callout Prevention
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    document.body.style.webkitTouchCallout = 'none';

    return () => {
      if (resizeDebounce) clearTimeout(resizeDebounce);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("copy", preventCopyPaste, true);
      document.removeEventListener("paste", preventCopyPaste, true);
      document.removeEventListener("cut", preventCopyPaste, true);
      document.removeEventListener("beforeinput", handleBeforeInput, true);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("drop", preventDrop, true);
      document.removeEventListener("dragover", preventDragOver, true);
      document.removeEventListener("contextmenu", preventContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.body.style.userSelect = 'auto';
      document.body.style.webkitUserSelect = 'auto';
      document.body.style.webkitTouchCallout = 'default';
    };
  }, [examState, activeExam?.id]);

  // Inactivity auto-submit — deliberately its OWN effect, keyed only on
  // examState. The anti-cheat effect above re-mounts every second (it
  // depends on the ticking timeLeft/categoryTimeLeft), and its cleanup used
  // to call clearTimeout(idleTimer.current) on every one of those
  // re-mounts, immediately followed by a fresh resetIdleTimer() call in the
  // new effect body. Net effect: the "5 minutes of inactivity" timer was
  // being cancelled and re-armed to a full 5 minutes every second purely
  // because the exam clock was ticking — NOT because the student was
  // actually active. A student could sit idle (or walk away) for the
  // entire exam and never get auto-submitted. Isolating this here means
  // the timer is only ever reset by a genuine activity event.
  useEffect(() => {
    if (examState !== 'taking_exam') return;

    resetIdleTimer();
    const activityEvents = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    activityEvents.forEach(ev => document.addEventListener(ev, resetIdleTimer));

    return () => {
      activityEvents.forEach(ev => document.removeEventListener(ev, resetIdleTimer));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [examState]);

  // Periodic baseline visual snapshots — deliberately a SEPARATE effect from
  // the anti-cheat one above, which re-mounts every second because of the
  // timeLeft/categoryTimeLeft ticking dependencies. An interval declared in
  // that effect would be torn down and restarted every second and never
  // actually fire. This effect only depends on examState/activeExam.id, so
  // the interval survives for the whole exam.
  // Visual snapshot every 5s for the whole exam, as required for proctoring.
  // At 320x240 JPEG (~15KB) a 60-minute exam costs roughly 10MB of storage.
  const HEARTBEAT_INTERVAL_MS = 5000;
  useEffect(() => {
    if (examState !== 'taking_exam' || !activeExam || !user) return;

    const captureHeartbeat = async () => {
      try {
        const path = await captureSnapshot('heartbeat', true);
        if (!path) return;
        try {
          await supabase.from('proctoring_snapshots').insert({
            candidate_id: user.id,
            assessment_id: activeExam.id,
            evidence_path: path,
            trigger_type: 'heartbeat'
          });
        } catch {
          // Table may not exist or RLS may block, image safely preserved in proctoring-evidence storage
        }
      } catch (err) {
        console.error('Heartbeat snapshot error:', err);
      }
    };

    // Delay initial baseline frame by 1.5s so video element has time to receive initial screen frames
    const initialTimer = setTimeout(() => {
      captureHeartbeat();
    }, 1500);
    const interval = setInterval(captureHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [examState, activeExam?.id, user?.id]);

  // Release screen capture, camera, & exit fullscreen whenever leaving taking_exam
  useEffect(() => {
    if (examState !== 'taking_exam') {
      stopProctoringStreams();
      exitFullscreenSafely();
    }
  }, [examState]);

  // Safety net: also release streams if the component unmounts entirely
  useEffect(() => {
    return () => {
      stopProctoringStreams();
      exitFullscreenSafely();
    };
  }, []);

const advanceCategoryOrSubmit = (isManual = false, fromCategoryIndex = null) => {
  // fromCategoryIndex lets the timer (which knows the exact section that
  // just expired) pass itself in, in case the student is currently
  // viewing a different section when the expiry fires.
  const srcIdx = fromCategoryIndex !== null ? fromCategoryIndex : activeCategoryIndex;
  const currentCatKey = categorySequence[srcIdx];
  const st = sectionTimersRef.current;

  // Pause the section we're leaving. On manual advance preserve any
  // remaining time so the student can come back and continue it (spec:
  // leave = pause, return = continue). On timer expiry it's already 0.
  if (st[currentCatKey].runningAt !== null) {
    const elapsed = Math.floor((getCurrentTimestamp() - st[currentCatKey].runningAt) / 1000);
    st[currentCatKey] = { remaining: Math.max(0, st[currentCatKey].remaining - elapsed), runningAt: null };
  }
  // (expiry path already set remaining 0 + runningAt null before calling)

  const newCompleted = completedCategories.includes(currentCatKey) ? completedCategories : [...completedCategories, currentCatKey];
  setCompletedCategories(newCompleted);

const nextIndex = srcIdx + 1;
  if (nextIndex < categorySequence.length) {
    const nextCatKey = categorySequence[nextIndex];
    // Start the next section ONLY if the student is actually viewing it.
    // If they're advancing a background section (timer expiry while
    // reviewing another), the timer effect will hand control over when
    // they return... but actually for simplicity we'll start it running
    // immediately as the "working section" - the viewer will be yanked to it.
    if (st[nextCatKey].runningAt === null) {
      st[nextCatKey] = { ...st[nextCatKey], runningAt: getCurrentTimestamp() };
    }
    // Compute remaining time for display (accounting for elapsed if running)
    const t = st[nextCatKey];
    const displayRemaining = t.runningAt !== null ? Math.max(0, t.remaining - Math.floor((getCurrentTimestamp() - t.runningAt) / 1000)) : t.remaining;
    setCategoryTimeLeft(displayRemaining);

    setActiveCategoryIndex(nextIndex);
    setCurrentQuestionIndex(0);

    const catNames = { mcq: 'Multiple Choice (MCQ)', true_false: 'True or False', short_essay: 'Short Essay' };
    if (isManual) {
      toast.success(`Section saved! Advanced to Section ${nextIndex + 1}: ${catNames[nextCatKey]}`);
    } else {
      toast.success(`⏰ Time expired for ${catNames[currentCatKey]}! Auto-saved and advanced to Section ${nextIndex + 1}: ${catNames[nextCatKey]}`);
    }
  } else {
    // Guard against the interval firing this multiple times per second
    // while React is still re-rendering examState to 'finished'.
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    toast.success('⏰ Final section timer completed! Auto-submitting assessment...');
    latestSubmitExamRef.current?.(true);
  }
};

  // Per-section pause/resume timer.
  // The effect re-runs whenever the viewed section changes (activeCategoryIndex),
  // which is when we need to switch which section is actively counting.
  // On each activation it:
  //   1. Pauses the previously-running section (if any) by snapshotting remaining.
  //   2. Resumes the newly-viewed section (marks runningAt = now).
  //   3. Ticks every second, updating categoryTimeLeft for the header display.
  //   4. When the viewed section hits 0, fires advanceCategoryOrSubmit.
useEffect(() => {
  if (examState !== 'taking_exam') return;

  if (isBlended) {
    const st = sectionTimersRef.current;
    const viewedCatKey = categorySequence[activeCategoryIndex] || 'mcq';
    const viewedHasTime = st[viewedCatKey].remaining > 0;

    // Determine which section should be running:
    // - If viewed section has time, it should run
    // - Else, the most recently active section (working section) should keep running
    let runningKey = viewedCatKey;
    if (!viewedHasTime) {
      // Find a section that's currently running, or fall back to viewed (will be paused)
      runningKey = ['mcq', 'true_false', 'short_essay'].find(k => st[k].runningAt !== null) || viewedCatKey;
    }

    // Pause any running section that isn't the designated running section
    for (const k of ['mcq', 'true_false', 'short_essay']) {
      if (k === runningKey) continue;
      if (st[k].runningAt !== null) {
        const elapsed = Math.floor((getCurrentTimestamp() - st[k].runningAt) / 1000);
        st[k] = { remaining: Math.max(0, st[k].remaining - elapsed), runningAt: null };
      }
    }

    // Resume the designated running section if it has time and isn't already running
    if (st[runningKey].remaining > 0 && st[runningKey].runningAt === null) {
      st[runningKey] = { ...st[runningKey], runningAt: getCurrentTimestamp() };
    }

    const tick = () => {
      const t = sectionTimersRef.current[runningKey];
      if (t.runningAt === null) return; // section is paused
      const elapsed = Math.floor((getCurrentTimestamp() - t.runningAt) / 1000);
      const remaining = Math.max(0, t.remaining - elapsed);

      if (viewedHasTime) {
        // Viewed section still has time — count down its display.
        setCategoryTimeLeft(remaining);
      } else {
        // Viewed section is exhausted - show 0:00
        setCategoryTimeLeft(0);
        // categoryTimeLeft is now static (React bails on the same value), so
        // force a re-render to keep the section cards and other live UI fresh.
        setTickCounter(c => c + 1);
      }

      if (remaining <= 0) {
        // Freeze the timer and advance/submit.
        sectionTimersRef.current[runningKey] = { remaining: 0, runningAt: null };
        const idx = categorySequence.indexOf(runningKey);
        latestAdvanceRef.current?.(false, idx);
      }
    };

    // Show the current remaining time immediately (no 1s delay).
    tick();
    const interval = setInterval(tick, 1000);
    return () => {
      clearInterval(interval);
      // When the effect cleans up (section switch), snapshot remaining.
      const t = sectionTimersRef.current[runningKey];
      if (t.runningAt !== null) {
        const elapsed = Math.floor((Date.now() - t.runningAt) / 1000);
        sectionTimersRef.current[runningKey] = {
          remaining: Math.max(0, t.remaining - elapsed),
          runningAt: null,
        };
      }
    };
  } else {
    const tick = () => {
      if (!examStartRef.current) return;
      const elapsed = Math.floor((Date.now() - examStartRef.current) / 1000);
      const remaining = Math.max(0, (activeExam?.duration_minutes || 0) * 60 - elapsed);
      setTimeLeft(remaining);
      // Routed through the ref (see comment above resetIdleTimer):
      // for a non-blended exam this effect's deps never change after
      // mount, so this `tick` closure — and any `submitExam` it
      // referenced directly — would be frozen from the very start of
      // the exam. Without this fix, letting the timer expire normally
      // (rather than clicking Submit) would auto-submit with blank
      // answers, discarding everything the student actually entered.
      if (remaining <= 0) {
        if (!isSubmittingRef.current) {
          isSubmittingRef.current = true;
          latestSubmitExamRef.current?.(true);
        }
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }
}, [examState, isBlended, activeCategoryIndex, categorySequence]);

  const submitExam = async (isAutoSubmit = false, skipConfirmation = false) => {
    if (!activeExam || !user) return;

    const { data: freshExam } = await supabase.from('assessments').select('is_open').eq('id', activeExam.id).single();
    if (freshExam && !freshExam.is_open) {
      if (!isAutoSubmit) toast.error('This assessment has been closed by the examiner. Your answers could not be submitted.');
      setExamState('finished');
      return;
    }

    if (!isAutoSubmit && !skipConfirmation) {
      const unanswered = questions.filter(q => !answers[q.id] || String(answers[q.id]).trim() === '');
      setSubmitConfirmModal({ open: true, unansweredCount: unanswered.length });
      return;
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

    exitFullscreenSafely();
    stopProctoringStreams();

    // Clear auto-save cache upon successful submission
    const draftKey = `zibi_exam_draft_${activeExam.id}`;
    localStorage.removeItem(draftKey);

    toast.success('Assessment submitted successfully!');
    setExamState('finished');
  };

// Keep the idle-timeout's target functions current every render (see the
// comment on latestSubmitExamRef above resetIdleTimer). No dependency
// array — this runs after every render, which is intentional and cheap
// (just a ref assignment, no re-subscription of anything).
useEffect(() => {
  latestSubmitExamRef.current = submitExam;
  latestLogInfractionRef.current = logInfraction;
  latestAdvanceRef.current = advanceCategoryOrSubmit;
  latestRecordMalpracticeStrikeRef.current = recordMalpracticeStrike;
  latestCaptureSnapshotRef.current = captureSnapshot;
  categoryTimeLeftRef.current = categoryTimeLeft;
  isBlendedRef.current = isBlended;
});

  const handleAnswerChange = (qId, val, isTextInput = false) => {
    // ONLY apply bulk-paste burst checks to freeform text inputs (short_essay / theory textarea)
    // NEVER apply to multiple-choice (MCQ) or True/False options where val is the selected option string!
    if (isTextInput) {
      const prevVal = answersRef.current[qId] || '';
      const diffLen = val.length - prevVal.length;

      // Allow natural typing and word autocompletions. Reject anomalous bulk paste drops (> 25 characters in a single input burst)
      if (diffLen > 25) {
        let insertedText = '';
        if (val.startsWith(prevVal)) {
          insertedText = val.slice(prevVal.length);
        } else {
          insertedText = val;
        }

        toast.error('Bulk pasted text detected and rejected. You must type your response directly.', {
          duration: 6000,
          style: { background: '#1c1917', color: '#fca5a5', border: '2px solid #ef4444' }
        });

        latestLogInfractionRef.current?.(
          'unauthorized_paste_burst_detected',
          `Bulk pasted text detected into response (+${diffLen} chars) | Captured Pasted Content: "${insertedText.slice(0, 300)}" (action blocked & reverted)`,
          { severity: 'high', captureEvidence: true }
        );

        latestRecordMalpracticeStrikeRef.current?.('Pasted external content into exam response');

        // Reject the paste - revert back to prevVal so the student cannot insert copied material
        return;
      }
    }

    setAnswers(prev => ({ ...prev, [qId]: val }));
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
                                <div style={{
                                  background: script.is_graded ? 'rgba(0, 255, 136, 0.1)' : 'rgba(245, 158, 11, 0.12)',
                                  border: script.is_graded ? '1px solid #00ff88' : '1px solid #f59e0b',
                                  color: script.is_graded ? '#00ff88' : '#f59e0b',
                                  padding: '0.75rem',
                                  borderRadius: '4px',
                                  textAlign: 'center',
                                  fontWeight: 'bold',
                                  fontSize: '0.85rem'
                                }}>
                                  {script.is_graded 
                                    ? `✅ Final Score: ${(script.auto_mcq_score || 0) + (script.manual_theory_score || 0)} / ${totalPossible}` 
                                    : '⏳ Pending Evaluation (Short Essays Pending Grading)'}
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

                <div style={{ background: 'rgba(255, 195, 0, 0.08)', border: '1px solid rgba(255, 195, 0, 0.25)', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '1.25rem', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-gold, #ffc300)', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                    <span>{isIOSDevice || isMobileDeviceState ? '📱' : '🖥️'}</span> {isIOSDevice ? 'Apple iOS Proctoring Notice (Option 4)' : isMobileDeviceState ? 'Mobile Proctoring Notice' : 'Screen Capture Notice'}
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-muted, #ccc)', fontSize: '0.82rem', lineHeight: '1.5' }}>
                    {isIOSDevice
                      ? 'You are taking this exam on an iPhone/iPad. The system will activate your front camera and composite your exam canvas into proctoring evidence snapshots. Tip: Turn on "Do Not Disturb" (Focus Mode) so notifications do not interrupt your exam window.'
                      : isMobileDeviceState
                      ? 'You are taking this exam on a mobile device. The system will activate secure mobile camera surveillance and active exam monitoring. Tip: Turn on "Do Not Disturb" so calls and notification banners do not interrupt your exam window.'
                      : 'During this assessment, you will be prompted to share your screen for proctoring verification. Please ensure you select your entire screen.'}
                  </p>
                </div>

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
                    {isIOSDevice ? '📱 Enable Camera & Begin' : isMobileDeviceState ? '📱 Commence Mobile Exam' : '🖥️ Share Screen & Begin'}
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
        )}

        {examState === 'taking_exam' && activeExam && (
          <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            {/* Global anti-copy and mobile text-selection disabler */}
            <style>{`
              body, html, * {
                -webkit-touch-callout: none !important;
                -webkit-user-select: none !important;
                user-select: none !important;
              }
              textarea, input[type="text"], input[type="password"] {
                -webkit-touch-callout: none !important;
                -webkit-user-select: text !important;
                user-select: text !important;
              }
            `}</style>
            {/* Screen Share Interrupted Blocking Overlay (Only on standard desktop mode when screen sharing was used) */}
            {screenShareLost && !isIOSDevice && !isMobileProctor && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(8px)' }}>
                <div style={{ background: '#18181b', border: '2px solid #ef4444', borderRadius: '12px', padding: '2rem', maxWidth: '480px', width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(239,68,68,0.3)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                  <h3 style={{ color: '#ef4444', fontSize: '1.35rem', marginBottom: '0.75rem', fontWeight: 'bold' }}>Screen Sharing Interrupted!</h3>
                  <p style={{ color: '#e4e4e7', fontSize: '0.92rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                    Proctoring rules strictly require continuous screen capture throughout your exam. Stopping screen share constitutes an examination malpractice violation.
                  </p>
                  <button
                    onClick={reenableScreenShare}
                    className="btn-premium primary"
                    style={{ width: '100%', padding: '0.85rem', fontSize: '1rem', background: '#ef4444', borderColor: '#ef4444', color: '#fff', fontWeight: 'bold' }}
                  >
                    🖥️ Re-Share Entire Screen Now
                  </button>
                </div>
              </div>
            )}

            {/* Fullscreen Mode Exited Recovery Overlay (Only on desktop/android) */}
            {fullscreenLost && !isIOSDevice && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(6px)' }}>
                <div style={{ background: '#18181b', border: '1px solid var(--accent-gold, #ffc300)', borderRadius: '12px', padding: '2rem', maxWidth: '460px', width: '100%', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.7)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⛶</div>
                  <h3 style={{ color: 'var(--accent-gold, #ffc300)', fontSize: '1.25rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Fullscreen Mode Required</h3>
                  <p style={{ color: '#e4e4e7', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
                    Your examination must remain in fullscreen mode. Please click below to resume your assessment.
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        if (document.documentElement.requestFullscreen) {
                          await document.documentElement.requestFullscreen();
                        }
                      } catch (err) {
                        console.warn('Could not re-enter fullscreen:', err);
                      }
                      setFullscreenLost(false);
                    }}
                    className="btn-premium primary"
                    style={{ width: '100%', padding: '0.85rem', fontSize: '0.95rem', fontWeight: 600 }}
                  >
                    Re-enter Fullscreen Mode
                  </button>
                </div>
              </div>
            )}

            {/* Malpractice Warning Banner */}
            {malpracticeStrikes > 0 && (
              <div style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid #ef4444',
                borderRadius: '8px',
                padding: '0.75rem 1.25rem',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                animation: 'pulse 2s infinite'
              }}>
                <span style={{ fontSize: '1.4rem' }}>🚨</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>
                    PROCTORING ALERT: {lastInfractionDesc || 'Prohibited action detected during examination'}
                  </div>
                  <div style={{ color: '#fca5a5', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                    Repeated prohibited actions will result in automatic exam forfeiture and account suspension.
                  </div>
                </div>
              </div>
            )}

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  <span>Proctoring Engine: <span style={{ color: '#4ade80', fontWeight: '600' }}>
                    {isIOSDevice
                      ? 'Active (iOS Option 4: Front Cam & Exam Canvas Composite)'
                      : isMobileProctor
                      ? 'Active (Mobile Front Camera & Active Canvas)'
                      : 'Active & Recording Screen (5s Snapshots)'}
                  </span></span>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                  <span style={{ color: '#38bdf8' }}>
                    {isIOSDevice || isMobileProctor ? 'Front Camera Surveillance: Live' : 'Face Verification: In-Frame'}
                  </span>
                </div>
                {activeExam.instructions && (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(197,160,89,0.08)', border: '1px solid var(--border-focus)', borderRadius: '4px', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                    <strong style={{ color: 'var(--accent-gold)' }}>Instructions:</strong> {activeExam.instructions}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', minWidth: '150px', background: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                  {isBlended ? `Section ${activeCategoryIndex + 1} Timer` : 'Total Time Remaining'}
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
                        onClick={() => {
                          // Allow switching to any section already reached
                          // (active or completed). Upcoming sections cannot
                          // be jumped to before their timer starts.
                          if (!isUpcoming) {
                            setActiveCategoryIndex(idx);
                            setCurrentQuestionIndex(0);
                          }
                        }}
                        style={{
                          padding: '0.75rem 1rem',
                          borderRadius: '6px',
                          border: isActive ? '2px solid var(--accent-gold)' : (isDone ? '1px solid #10b981' : '1px solid var(--border-subtle)'),
                          background: isActive ? 'rgba(212,175,55,0.12)' : (isDone ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)'),
                          color: isActive ? 'var(--accent-gold)' : (isDone ? '#34d399' : 'var(--text-muted)'),
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                          cursor: isUpcoming ? 'not-allowed' : 'pointer',
                          transition: 'opacity 0.15s',
                          opacity: isUpcoming ? 0.5 : 1
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', fontWeight: 'bold' }}>
                          <span>{cat.label}</span>
                          <span style={{ fontSize: '0.7rem' }}>
                            {isDone ? '✅ Revisit' : (isActive ? '⚡ Active' : '⏳ Upcoming')}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                          {isDone
                            ? 'Time Expired'
                            : isActive
                              ? `⏱ ${formatTime(categoryTimeLeft)} remaining`
                              : `Limit: ${cat.duration} min`}
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
                              placeholder="Write your short essay response here (type directly; copying and pasting are prohibited)..."
                              value={answers[activeQ.id] || ''}
                              onChange={(e) => handleAnswerChange(activeQ.id, e.target.value, true)}
                              onCopy={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const sel = window.getSelection()?.toString().trim();
                                const snippet = sel ? ` | Captured Selected Content: "${sel.slice(0, 200)}"` : '';
                                toast.error('Copying is strictly prohibited during the examination.');
                                latestLogInfractionRef.current?.(
                                  'unauthorized_clipboard',
                                  `Attempted to copy from essay response${snippet} (action blocked)`,
                                  { severity: 'high', captureEvidence: true }
                                );
                                latestRecordMalpracticeStrikeRef.current?.('Attempted unauthorized copy from exam');
                              }}
                              onPaste={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                let pasted = '';
                                if (e.clipboardData) {
                                  try {
                                    pasted = e.clipboardData.getData('text') || '';
                                  } catch (err) {
                                    void err;
                                  }
                                }
                                const snippet = pasted ? ` | Captured Pasted Content: "${pasted.slice(0, 300)}"` : '';
                                toast.error('Pasting is strictly prohibited during the examination. You must type your response directly.', {
                                  duration: 6000,
                                  style: { background: '#1c1917', color: '#fca5a5', border: '2px solid #ef4444' }
                                });
                                latestLogInfractionRef.current?.(
                                  'unauthorized_paste_attempt',
                                  `Prohibited paste attempt into essay response${snippet} (action blocked)`,
                                  { severity: 'high', captureEvidence: true }
                                );
                                latestRecordMalpracticeStrikeRef.current?.('Attempted clipboard paste into exam response');
                              }}
                              onBeforeInput={(e) => {
                                const inputType = e.inputType || '';
                                const isPaste = inputType.toLowerCase().includes('paste') || inputType === 'insertFromDrop' || inputType === 'insertFromYank';
                                if (isPaste) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  let pasted = '';
                                  if (e.dataTransfer) {
                                    try {
                                      pasted = e.dataTransfer.getData('text') || '';
                                    } catch (err) {
                                      void err;
                                    }
                                  } else if (e.data) {
                                    pasted = e.data;
                                  }
                                  const snippet = pasted ? ` | Captured Pasted Content: "${pasted.slice(0, 300)}"` : '';
                                  toast.error('Pasting via mobile keyboard clipboard is strictly prohibited.', {
                                    duration: 6000,
                                    style: { background: '#1c1917', color: '#fca5a5', border: '2px solid #ef4444' }
                                  });
                                  latestLogInfractionRef.current?.(
                                    'unauthorized_paste_attempt',
                                    `Mobile keyboard clipboard paste blocked on essay (inputType: ${inputType})${snippet}`,
                                    { severity: 'high', captureEvidence: true }
                                  );
                                  latestRecordMalpracticeStrikeRef.current?.('Attempted mobile keyboard clipboard paste');
                                }
                              }}
                              onCut={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toast.error('Cutting is strictly prohibited during the examination.');
                                latestLogInfractionRef.current?.('unauthorized_cut', 'Attempted cut on essay response (action blocked)', { severity: 'high', captureEvidence: true });
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toast.error('Drag and drop is strictly prohibited during the examination.');
                                latestLogInfractionRef.current?.('unauthorized_drag_drop', 'Attempted drag and drop into essay field (action blocked)', { severity: 'medium', captureEvidence: true });
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="sentences"
                              spellCheck={false}
                              data-gramm="false"
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
                    setSectionConfirmModal({ open: true, curName, nextName });
                  }}
                >
                  ✅ Save Section &amp; Proceed to Next Category &rarr;
                </button>
              ) : (
                <button
                  className="btn-premium"
                  style={{ borderColor: '#ef4444', color: '#ef4444', width: '100%', maxWidth: '320px', padding: '0.85rem' }}
                  onClick={() => {
                    const unanswered = questions.filter(q => !answers[q.id] || String(answers[q.id]).trim() === '');
                    setSubmitConfirmModal({ open: true, unansweredCount: unanswered.length });
                  }}
                >
                  🏁 Submit Final Assessment
                </button>
              )}
            </div>

            {/* Section Transition In-App Modal */}
            {sectionConfirmModal.open && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(5px)' }}>
                <div style={{ background: '#18181b', border: '1px solid var(--accent-gold, #ffc300)', borderRadius: '12px', padding: '1.75rem', maxWidth: '460px', width: '100%', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}>
                  <div style={{ fontSize: '2.25rem', marginBottom: '0.75rem' }}>📑</div>
                  <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '0.5rem', fontFamily: 'var(--font-heading)' }}>
                    Proceed to Next Section?
                  </h3>
                  <p style={{ color: '#d4d4d8', fontSize: '0.88rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
                    Proceed from <strong style={{ color: 'var(--accent-gold, #ffc300)' }}>{sectionConfirmModal.curName}</strong> to <strong style={{ color: 'var(--accent-gold, #ffc300)' }}>{sectionConfirmModal.nextName}</strong>? You can still return to review this section during the exam.
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      onClick={() => setSectionConfirmModal({ open: false, curName: '', nextName: '' })}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: 'transparent',
                        color: 'var(--text-muted, #aaa)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '0.9rem'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-premium primary"
                      style={{ flex: 1, padding: '0.75rem', fontSize: '0.9rem' }}
                      onClick={() => {
                        setSectionConfirmModal({ open: false, curName: '', nextName: '' });
                        advanceCategoryOrSubmit(true);
                      }}
                    >
                      Yes, Proceed &rarr;
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Final Submission In-App Modal */}
            {submitConfirmModal.open && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(5px)' }}>
                <div style={{ background: '#18181b', border: '1px solid #ef4444', borderRadius: '12px', padding: '1.75rem', maxWidth: '460px', width: '100%', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}>
                  <div style={{ fontSize: '2.25rem', marginBottom: '0.75rem' }}>🏁</div>
                  <h3 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '0.5rem', fontFamily: 'var(--font-heading)' }}>
                    Submit Final Assessment?
                  </h3>
                  {submitConfirmModal.unansweredCount > 0 ? (
                    <div style={{
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      marginBottom: '1.25rem',
                      color: '#fca5a5',
                      fontSize: '0.85rem',
                      lineHeight: '1.4'
                    }}>
                      ⚠️ You have <strong>{submitConfirmModal.unansweredCount} unanswered question(s)</strong>. Are you sure you want to submit? You cannot return to this exam once submitted.
                    </div>
                  ) : (
                    <p style={{ color: '#d4d4d8', fontSize: '0.88rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
                      Are you sure you want to submit your final assessment? You cannot return to this exam once submitted.
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      onClick={() => setSubmitConfirmModal({ open: false, unansweredCount: 0 })}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: 'transparent',
                        color: 'var(--text-muted, #aaa)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '0.9rem'
                      }}
                    >
                      Return to Exam
                    </button>
                    <button
                      className="btn-premium"
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        fontSize: '0.9rem',
                        borderColor: '#ef4444',
                        background: 'rgba(239,68,68,0.2)',
                        color: '#fca5a5',
                        fontWeight: 600
                      }}
                      onClick={() => {
                        setSubmitConfirmModal({ open: false, unansweredCount: 0 });
                        submitExam(false, true);
                      }}
                    >
                      Confirm &amp; Submit
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Floating iOS / Mobile Proctor Surveillance Pill */}
            {(isIOSDevice || isMobileProctor) && (
              <div style={{
                position: 'fixed',
                bottom: '16px',
                left: '16px',
                zIndex: 900,
                background: 'rgba(10, 13, 20, 0.92)',
                border: '1px solid rgba(197, 160, 89, 0.6)',
                borderRadius: '24px',
                padding: '0.4rem 0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)',
                fontSize: '0.78rem',
                color: '#e2e8f0',
                pointerEvents: 'none'
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 8px #22c55e' }} />
                <span style={{ fontWeight: 600, color: 'var(--accent-gold)' }}>
                  {isIOSDevice ? 'iOS Option 4:' : 'Mobile Proctor:'}
                </span>
                <span>Front Cam &amp; Canvas Active</span>
              </div>
            )}
          </div>
        )}

        {examState === 'finished' && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', animation: 'fadeIn 0.5s ease-out' }}>
            <h2 style={{ color: 'var(--accent-gold)', fontSize: '2rem', marginBottom: '1rem', fontFamily: 'var(--font-heading)' }}>Assessment Concluded</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.95rem' }}>Your encrypted script has been securely saved and submitted to the evaluation matrix.</p>

            <button className="btn-premium primary" style={{ width: '100%', maxWidth: '400px' }} onClick={() => { setExamState('dashboard'); setAnswers({}); setActiveExam(null); }}>Return to Dashboard</button>
          </div>
        )}

        {examState === 'forfeited' && (
          <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', maxWidth: '640px', margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(239,68,68,0.15)', border: '3px solid #ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', margin: '0 auto 1.5rem' }}>
              ⛔
            </div>
            <h2 style={{ color: '#ef4444', fontSize: '1.85rem', marginBottom: '0.75rem', fontFamily: 'var(--font-heading)' }}>
              Examination Forfeited &amp; Student Suspended
            </h2>
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.75rem', textAlign: 'left' }}>
              <p style={{ color: '#fca5a5', fontWeight: 'bold', margin: '0 0 0.5rem', fontSize: '0.95rem' }}>
                Malpractice Disciplinary Reason:
              </p>
              <p style={{ color: '#e4e4e7', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
                {forfeitedReason || 'Multiple severe anti-cheat infractions and proctoring violations detected.'}
              </p>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '2rem' }}>
              In accordance with academic integrity guidelines, your assessment score has been set to <strong>0</strong> and your student portal access has been flagged and suspended. Complete proctoring screen snapshots and audit logs have been transmitted to the institution's examination committee.
            </p>
            <button
              className="btn-premium"
              style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'var(--text-ivory)', padding: '0.75rem 2rem' }}
              onClick={() => {
                supabase.auth.signOut();
                window.location.reload();
              }}
            >
              Sign Out of Portal
            </button>
          </div>
        )}

      </div>
    </main>
  );
};

export default StudentFlow;
