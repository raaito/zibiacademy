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
      <div className="glass-panel login-card" style={{ maxWidth: step === 'register' ? '800px' : undefined, transition: 'max-width 0.3s ease' }}>

        {step === 'login' && (
          <>
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
              <a href="#">Recover Access</a>
              <span className="divider">|</span>
              <a href="#" onClick={(e) => { e.preventDefault(); setStep('register_select'); }}>Request Registration</a>
            </footer>
          </>
        )}

        {step === 'register_select' && (
          <>
            <header className="login-header">
              <h2>Select Application Form</h2>
              <p>Please choose the appropriate registration form for your program.</p>
            </header>
            <div className="login-form">
              <button
                type="button"
                className="btn-premium primary"
                style={{ marginBottom: '1rem', width: '100%', padding: '1rem', fontSize: '1rem' }}
                onClick={() => { setRegistrationType('general'); setStep('register'); }}
              >
                ZIBI Application Form 2026
              </button>
              <button
                type="button"
                className="btn-premium primary"
                style={{ marginBottom: '1rem', width: '100%', padding: '1rem', fontSize: '1rem' }}
                onClick={() => { setRegistrationType('supernatural'); setStep('register'); }}
              >
                SSN BASIC & ADVANCED (July/August 2026 Session)
              </button>
              <button
                type="button"
                className="btn-premium primary"
                style={{ marginBottom: '1rem', width: '100%', padding: '1rem', fontSize: '1rem' }}
                onClick={() => { setRegistrationType('theology'); setStep('register'); }}
              >
                ZIBI - Theology Course - 2026
              </button>
            </div>
            <footer className="login-footer">
              <a href="#" onClick={(e) => { e.preventDefault(); setStep('login'); }}>Return to Login</a>
            </footer>
          </>
        )}

        {step === 'register' && (
          <>
            <header className="login-header">
              <h2>
                {registrationType === 'general' && 'ZIBI Application Form'}
                {registrationType === 'supernatural' && 'REGISTRATION FOR SSN BASIC & ADVANCED (JULY/AUGUST 2026 SESSION)'}
                {registrationType === 'theology' && 'ZIBI - THEOLOGY COURSE - 2026'}
              </h2>
              <p>Please complete your application for admission.</p>
            </header>
            <form className="login-form" onSubmit={(e) => { e.preventDefault(); setStep('password'); }}>

              <h3 style={{ color: 'var(--accent-gold)', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>Personal Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem', alignItems: 'flex-start' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Full Legal Name *</label>
                  <input type="text" placeholder="John Doe" required value={regFullName} onChange={e => setRegFullName(e.target.value)} />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Email *</label>
                  <input type="email" placeholder="j.doe@example.com" required value={regEmail} onChange={e => setRegEmail(e.target.value)} />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Telephone *</label>
                  <input type="tel" required value={telephone} onChange={e => setTelephone(e.target.value)} />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Date of Birth *</label>
                  <DatePicker
                    selected={dateOfBirth ? new Date(dateOfBirth) : null}
                    onChange={(date) => setDateOfBirth(date ? date.toISOString().split('T')[0] : '')}
                    dateFormat="dd MMMM yyyy"
                    showMonthDropdown
                    showYearDropdown
                    dropdownMode="select"
                    maxDate={new Date()}
                    placeholderText="Select date of birth"
                    required
                    wrapperClassName="datepicker-wrapper"
                    className="datepicker-input"
                  />
                </div>
                <div className="input-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                  <label>Address *</label>
                  <textarea required rows="2" value={address} onChange={e => setAddress(e.target.value)}></textarea>
                </div>
                <div className="input-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                  <label>Upload Image (Passport) *</label>
                  <input type="file" accept="image/*" required onChange={e => setAvatarFile(e.target.files[0])} />
                </div>
              </div>

              <h3 style={{ color: 'var(--accent-gold)', margin: '2rem 0 1rem 0', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>Academic & Background</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem', alignItems: 'flex-start' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Highest Qualification *</label>
                  <select required value={highestQualification} onChange={e => setHighestQualification(e.target.value)}>
                    <option value="">- Select Qualification -</option>
                    <optgroup label="Secondary">
                      <option value="WAEC / SSCE">WAEC / SSCE</option>
                      <option value="NECO">NECO</option>
                      <option value="GCE O-Level">GCE O-Level</option>
                      <option value="GCE A-Level">GCE A-Level</option>
                    </optgroup>
                    <optgroup label="Vocational / Technical">
                      <option value="OND (Ordinary National Diploma)">OND (Ordinary National Diploma)</option>
                      <option value="HND (Higher National Diploma)">HND (Higher National Diploma)</option>
                      <option value="NCE (National Certificate of Education)">NCE (National Certificate of Education)</option>
                    </optgroup>
                    <optgroup label="Undergraduate">
                      <option value="B.Sc. (Bachelor of Science)">B.Sc. (Bachelor of Science)</option>
                      <option value="B.A. (Bachelor of Arts)">B.A. (Bachelor of Arts)</option>
                      <option value="B.Ed. (Bachelor of Education)">B.Ed. (Bachelor of Education)</option>
                      <option value="B.Tech. (Bachelor of Technology)">B.Tech. (Bachelor of Technology)</option>
                      <option value="LLB (Bachelor of Law)">LLB (Bachelor of Law)</option>
                      <option value="MBBS / MBChB (Medicine)">MBBS / MBChB (Medicine)</option>
                    </optgroup>
                    <optgroup label="Postgraduate">
                      <option value="PGD (Postgraduate Diploma)">PGD (Postgraduate Diploma)</option>
                      <option value="M.Sc. (Master of Science)">M.Sc. (Master of Science)</option>
                      <option value="M.A. (Master of Arts)">M.A. (Master of Arts)</option>
                      <option value="MBA (Master of Business Administration)">MBA (Master of Business Administration)</option>
                      <option value="M.Ed. (Master of Education)">M.Ed. (Master of Education)</option>
                      <option value="Ph.D. (Doctor of Philosophy)">Ph.D. (Doctor of Philosophy)</option>
                    </optgroup>
                    <optgroup label="Theology / Ministry">
                      <option value="Certificate in Theology">Certificate in Theology</option>
                      <option value="Diploma in Theology">Diploma in Theology</option>
                      <option value="B.Th. (Bachelor of Theology)">B.Th. (Bachelor of Theology)</option>
                      <option value="M.Th. (Master of Theology)">M.Th. (Master of Theology)</option>
                      <option value="D.Min. (Doctor of Ministry)">D.Min. (Doctor of Ministry)</option>
                    </optgroup>
                    <option value="Other">Other (please describe in referees section)</option>
                  </select>
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Occupation *</label>
                  <input type="text" required value={occupation} onChange={e => setOccupation(e.target.value)} />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Church Attended *</label>
                  <input type="text" required value={churchAttended} onChange={e => setChurchAttended(e.target.value)} />
                </div>
                <div className="input-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                  <label>Two Referees (Names & Contacts) *</label>
                  <textarea required rows="2" value={twoReferees} onChange={e => setTwoReferees(e.target.value)}></textarea>
                </div>
              </div>

              <h3 style={{ color: 'var(--accent-gold)', margin: '2rem 0 1rem 0', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>Spiritual & Program Details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem', alignItems: 'flex-start' }}>
                {registrationType !== 'supernatural' && (
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label>What Programme are you applying for? *</label>
                    <select required value={programmeApplied} onChange={e => setProgrammeApplied(e.target.value)}>
                      <option value="">- Select Programme -</option>
                      <option value="ZIBI STEP">ZIBI STEP</option>
                      <option value="ZIBI REGULAR">ZIBI REGULAR</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                )}
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Course of Selection *</label>
                  <select required value={courseOfSelection} onChange={e => setCourseOfSelection(e.target.value)}>
                    <option value="">- Select Course -</option>
                    <option value="ZIBI - Leadership Refresher Course">ZIBI - Leadership Refresher Course</option>
                    {registrationType === 'supernatural' ? (
                      <>
                        <option value="School of Supernatural - Basic Studies">School of Supernatural - Basic Studies</option>
                        <option value="School of Supernatural - Advanced Studies">School of Supernatural - Advanced Studies</option>
                      </>
                    ) : (
                      <>
                        <option value="School of Supernatural - School of Basic Studies">School of Supernatural - School of Basic Studies</option>
                        <option value="School of Supernatural - School of Advanced Studies">School of Supernatural - School of Advanced Studies</option>
                      </>
                    )}
                    <option value="ZIBI - PGD in Theology">ZIBI - PGD in Theology</option>
                    <option value="ZIBI - Diploma in Theology">ZIBI - Diploma in Theology</option>
                    <option value="ZIBI - Certificate in Theology">ZIBI - Certificate in Theology</option>
                  </select>
                </div>

                {/* Matriculation — shown always but generates on click after both fields are set */}
                <div className="input-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Matriculation Number
                    {matricLoading && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic', textTransform: 'none' }}>generating…</span>}
                    {!matricLoading && regMatriculation && <span style={{ fontSize: '0.7rem', color: '#00cc66', textTransform: 'none' }}>✓ auto-assigned</span>}
                    {!regMatriculation && !matricLoading && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'none', fontStyle: 'italic' }}>click to generate</span>}
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={matricLoading ? 'Generating…' : (regMatriculation || '')}
                    placeholder="Click here to auto-generate"
                    onClick={handleMatricClick}
                    style={{
                      cursor: regMatriculation ? 'default' : 'pointer',
                      letterSpacing: regMatriculation ? '0.1em' : 'normal',
                      color: regMatriculation ? 'var(--accent-gold)' : 'var(--text-muted)',
                      fontWeight: regMatriculation ? 600 : 400,
                      background: regMatriculation ? 'rgba(197,160,89,0.06)' : 'var(--bg-surface-solid)',
                      border: regMatriculation ? '1px solid var(--border-focus)' : '1px dashed var(--border-subtle)',
                      transition: 'all 0.3s ease',
                    }}
                  />
                  {matricHint && (
                    <span style={{ fontSize: '0.78rem', color: '#ffaa33', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      ⚠ {matricHint}
                    </span>
                  )}
                </div>
                <div className="input-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                  <label>Have you received HolyGhost baptism? *</label>
                  <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', padding: '0.8rem', background: 'var(--bg-obsidian)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, color: 'var(--text-ivory)' }}><input type="radio" name="hg_baptism" value="Yes" onChange={e => setHolyGhostBaptism(e.target.value)} required /> Yes</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, color: 'var(--text-ivory)' }}><input type="radio" name="hg_baptism" value="No" onChange={e => setHolyGhostBaptism(e.target.value)} required /> No</label>
                  </div>
                </div>
                <div className="input-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                  <label>Have you been baptized in water? Describe How *</label>
                  <textarea required rows="2" value={waterBaptismDesc} onChange={e => setWaterBaptismDesc(e.target.value)}></textarea>
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Research Interest (What biblical topic would you like to research into) *</label>
                  <input type="text" required value={researchInterest} onChange={e => setResearchInterest(e.target.value)} />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Sponsorship Details (church sponsorship or other scholarship) *</label>
                  <input type="text" required value={sponsorshipDetails} onChange={e => setSponsorshipDetails(e.target.value)} />
                </div>
                <div className="input-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                  <label>Reason for Application *</label>
                  <textarea required rows="2" value={reasonForApplication} onChange={e => setReasonForApplication(e.target.value)}></textarea>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '2rem 0 1.5rem 0', color: 'var(--text-ivory)' }}>
                <input type="checkbox" id="terms" required checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)} style={{ width: 'auto' }} />
                <label htmlFor="terms" style={{ margin: 0, cursor: 'pointer' }}>I agree to terms and conditions *</label>
              </div>

              <button type="submit" className="btn-premium primary login-btn">
                Proceed to Setup Account
              </button>
            </form>
            <footer className="login-footer">
              <a href="#" onClick={(e) => { e.preventDefault(); setStep('register_select'); }}>Back to Form Selection</a>
            </footer>
          </>
        )}

        {step === 'password' && (
          <>
            <header className="login-header">
              <h2>Establish Passphrase</h2>
              <p>Create a secure passphrase to pair with your matriculation.</p>
            </header>
            <form className="login-form" onSubmit={handleRegisterSubmit}>
              <div className="input-group">
                <label>New Passphrase</label>
                <input type="password" placeholder="••••••••••••" required value={regPassword} onChange={e => setRegPassword(e.target.value)} disabled={isLoggingIn} />
              </div>
              <div className="input-group">
                <label>Confirm Passphrase</label>
                <input type="password" placeholder="••••••••••••" required value={regConfirmPassword} onChange={e => setRegConfirmPassword(e.target.value)} disabled={isLoggingIn} />
              </div>
              <br />
              <button type="submit" className="btn-premium primary login-btn" disabled={isLoggingIn} style={{ opacity: isLoggingIn ? 0.7 : 1, cursor: isLoggingIn ? 'wait' : 'pointer' }}>
                {isLoggingIn ? "Finalizing..." : "Finalize Registration"}
              </button>
            </form>
            <footer className="login-footer">
              <a href="#" onClick={(e) => { e.preventDefault(); setStep('register'); }}>Back to Details</a>
            </footer>
          </>
        )}

        {step === 'program' && (
          <>
            <header className="login-header">
              <h2>Program Selection</h2>
              <p>Choose your designated academic structure.</p>
            </header>
            <form className="login-form" onSubmit={handleProgramSubmit}>
              <div className="input-group">
                <label>Academic Program Type</label>
                <select value={regProgram} onChange={e => setRegProgram(e.target.value)} style={{ padding: '0.8rem', background: 'var(--bg-obsidian)', border: '1px solid var(--border-subtle)', color: 'var(--text-ivory)', width: '100%', borderRadius: '4px' }} disabled={isLoggingIn}>
                  <option value="multi-semester">Standard Multi-Semester Program</option>
                  <option value="stretch">Continuous Stretch Program</option>
                </select>
              </div>

              {errorMsg && <p style={{ color: '#ff4d4f', fontSize: '0.9rem', margin: '0' }}>{errorMsg}</p>}

              <button type="submit" className="btn-premium primary login-btn" disabled={isLoggingIn} style={{ opacity: isLoggingIn ? 0.7 : 1, cursor: isLoggingIn ? 'wait' : 'pointer', marginTop: '1rem' }}>
                {isLoggingIn ? "Saving..." : "Complete Setup"}
              </button>
            </form>
          </>
        )}

      </div>
    </main>
  );
};

export default AuthFlow;
