import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { toast } from 'react-hot-toast';

const AuthFlow = () => {
  const [step, setStep] = useState('login'); // login, register_select, register, password, program
  const [registrationType, setRegistrationType] = useState('general'); // general, supernatural, theology
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Login states
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register states
  const [regFullName, setRegFullName] = useState('');
  const [regMatriculation, setRegMatriculation] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regProgram, setRegProgram] = useState('multi-semester');

  // Application Form States
  const [programmeApplied, setProgrammeApplied] = useState('');
  const [telephone, setTelephone] = useState('');
  const [address, setAddress] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [occupation, setOccupation] = useState('');
  const [highestQualification, setHighestQualification] = useState('');
  const [churchAttended, setChurchAttended] = useState('');
  const [reasonForApplication, setReasonForApplication] = useState('');
  const [twoReferees, setTwoReferees] = useState('');
  const [waterBaptismDesc, setWaterBaptismDesc] = useState('');
  const [holyGhostBaptism, setHolyGhostBaptism] = useState('');
  const [researchInterest, setResearchInterest] = useState('');
  const [sponsorshipDetails, setSponsorshipDetails] = useState('');
  const [courseOfSelection, setCourseOfSelection] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);

  const [matricLoading, setMatricLoading] = useState(false);
  const [matricHint, setMatricHint] = useState('');

  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const generateMatric = async () => {
    setMatricLoading(true);
    setMatricHint('');
    const year = new Date().getFullYear();
    const prefixMap = { 'ZIBI STEP': 'ZS', 'ZIBI REGULAR': 'ZR', 'Other': 'ZBI' };
    const prefix = prefixMap[programmeApplied] || 'ZBI';
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('programme_applied', programmeApplied);
    const serial = String((count || 0) + 1).padStart(3, '0');
    setRegMatriculation(`${prefix}-${year}-${serial}`);
    setMatricLoading(false);
  };

  const handleMatricClick = () => {
    if (regMatriculation) return; // already generated, do nothing
    if (!programmeApplied && !courseOfSelection) {
      setMatricHint('Please select your Programme and Course of Selection first.');
      return;
    }
    if (registrationType !== 'supernatural' && !programmeApplied) {
      setMatricHint('Please select your Programme first.');
      return;
    }
    if (!courseOfSelection) {
      setMatricHint('Please select your Course of Selection first.');
      return;
    }
    generateMatric();
  };

  // Auto-redirect if already logged in
  useEffect(() => {
    if (user && profile) {
      if (profile.role === 'superadmin') navigate('/admin');
      else if (profile.role === 'examiner') navigate('/examiner');
      else if (profile.role === 'candidate') {
        if (!profile.program_type) {
          setStep('program');
        } else {
          navigate('/student');
        }
      }
    }
  }, [user, profile, navigate]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setErrorMsg('');

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    if (error) {
      toast.error(error.message);
      setIsLoggingIn(false);
    }
    // On success, useEffect will redirect
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (regPassword !== regConfirmPassword) {
      return toast.error("Passwords do not match");
    }
    setIsLoggingIn(true);

    const { data, error } = await supabase.auth.signUp({
      email: regEmail,
      password: regPassword,
    });

    if (error) {
      toast.error(error.message);
      setIsLoggingIn(false);
    } else if (data?.user) {
      // Upload avatar if exists
      let uploadedAvatarUrl = null;
      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${data.user.id}-${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, avatarFile);
        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
          uploadedAvatarUrl = publicUrlData.publicUrl;
        }
      }

      // Insert profile
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email: regEmail,
        full_name: regFullName,
        matriculation_number: regMatriculation,
        role: 'candidate',
        program_type: null,
        programme_applied: programmeApplied,
        telephone: telephone,
        address: address,
        date_of_birth: dateOfBirth,
        occupation: occupation,
        highest_qualification: highestQualification,
        church_attended: churchAttended,
        reason_for_application: reasonForApplication,
        two_referees: twoReferees,
        water_baptism_desc: waterBaptismDesc,
        holy_ghost_baptism: holyGhostBaptism,
        research_interest: researchInterest,
        sponsorship_details: sponsorshipDetails,
        course_of_selection: courseOfSelection,
        avatar_url: uploadedAvatarUrl,
        registration_type: registrationType
      });

      if (profileError) {
        toast.error(profileError.message);
        setIsLoggingIn(false);
      } else {
        toast.success("Application submitted successfully!");
        setStep('program');
        setIsLoggingIn(false);
      }
      // On success, useEffect will pick up the new user session but step will be 'program'
    }
  };

  const handleProgramSubmit = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    const { error } = await supabase.from('profiles').update({ program_type: regProgram }).eq('id', user.id);
    if (error) {
      toast.error(error.message);
      setIsLoggingIn(false);
    } else {
      window.location.href = '/student'; // Reload to fetch fresh profile
    }
  };

  return (
    <main className="login-wrapper">
      <div className="glass-panel login-card">
        <header className="login-header">
          <h2>Portal Access</h2>
          <p>Authorized personnel and registered candidates only.</p>
        </header>
        <form className="login-form" onSubmit={handleLoginSubmit}>
          <div className="input-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="Enter your email"
              disabled={isLoggingIn}
              value={loginEmail}
              onChange={e => setLoginEmail(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label>Passphrase</label>
            <input
              type="password"
              placeholder="••••••••••••"
              disabled={isLoggingIn}
              value={loginPassword}
              onChange={e => setLoginPassword(e.target.value)}
              required
            />
          </div>
          <br />

          <button
            type="submit"
            className="btn-premium primary login-btn"
            disabled={isLoggingIn}
            style={{ opacity: isLoggingIn ? 0.7 : 1, cursor: isLoggingIn ? 'wait' : 'pointer' }}
          >
            {isLoggingIn ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <svg viewBox="0 0 50 50" style={{ width: '1.2rem', height: '1.2rem', animation: 'spin 1s linear infinite' }}>
                  <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="31.4 31.4" strokeLinecap="round"></circle>
                </svg>
                Authenticating...
              </span>
            ) : "Authenticate"}
          </button>
        </form>
        <footer className="login-footer">
          <button onClick={() => navigate('/register')} className="btn-premium secondary" style={{ width: '100%' }}>Register New Account</button>
        </footer>
      </div>
    </main>
  );
};

export default AuthFlow;
