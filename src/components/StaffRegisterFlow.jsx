import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

const StaffRegisterFlow = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('examiner'); // default to examiner
  const [staffCode, setStaffCode] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const navigate = useNavigate();

  const handleStaffRegister = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return toast.error("Passphrases do not match");
    }
    setIsRegistering(true);
    
    // 1. Verify staff code via secure RPC (prevents code listing/scraping)
    const { data: isValid, error: codeError } = await supabase
      .rpc('verify_staff_code', { input_code: staffCode });

    if (codeError || !isValid) {
      toast.error("Unauthorized Access: Your credentials could not be verified by the system.");
      setIsRegistering(false);
      return;
    }

    // 2. Proceed with Auth Sign Up
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      toast.error(error.message);
      setIsRegistering(false);
    } else if (data?.user) {
      // 3. Insert staff profile
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email: email,
        full_name: fullName,
        role: role,
        staff_code: staffCode,
        is_active: true,
      });

      // We sign out immediately regardless of profile success to prevent auto-login
      await supabase.auth.signOut();

      if (profileError) {
        toast.error(`Profile Creation Error: ${profileError.message}`);
        setIsRegistering(false);
      } else {
        // 4. Mark staff code as used (case-insensitive via secure RPC)
        await supabase.rpc('redeem_staff_code', { input_code: staffCode });
        
        toast.success(`Staff account created successfully for ${fullName}. Please log in.`);
        setIsRegistering(false);
        navigate('/');
      }
    }
  };

  return (
    <main className="login-wrapper">
      <div className="glass-panel login-card" style={{ maxWidth: '500px' }}>
        <header className="login-header">
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🏛️</div>
          <h2>Staff Registration</h2>
          <p>Create a secure account for Academy Personnel.</p>
        </header>

        <form className="login-form" onSubmit={handleStaffRegister}>
          <div className="input-group">
            <label>Full Name</label>
            <input 
              type="text" 
              placeholder="Dr. Jane Smith" 
              required 
              value={fullName} 
              onChange={e => setFullName(e.target.value)} 
              disabled={isRegistering}
            />
          </div>

          <div className="input-group">
            <label>Official Email</label>
            <input 
              type="email" 
              placeholder="j.smith@zibiacademy.org" 
              required 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              disabled={isRegistering}
            />
          </div>

          <div className="input-group">
            <label>Staff Code</label>
            <input 
              type="text" 
              placeholder="ZA-STF-001" 
              required 
              value={staffCode} 
              onChange={e => setStaffCode(e.target.value)} 
              disabled={isRegistering}
            />
          </div>

          <div className="input-group">
            <label>Passphrase</label>
            <input 
              type="password" 
              placeholder="••••••••••••" 
              required 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              disabled={isRegistering}
            />
          </div>

          <div className="input-group">
            <label>Confirm Passphrase</label>
            <input 
              type="password" 
              placeholder="••••••••••••" 
              required 
              value={confirmPassword} 
              onChange={e => setConfirmPassword(e.target.value)} 
              disabled={isRegistering}
            />
          </div>

          <button 
            type="submit" 
            className="btn-premium primary login-btn" 
            disabled={isRegistering}
            style={{ marginTop: '1rem', opacity: isRegistering ? 0.7 : 1 }}
          >
            {isRegistering ? "Creating Staff Account..." : "Finalize Staff Registration"}
          </button>
        </form>

        <footer className="login-footer">
          <button onClick={() => navigate('/')} className="btn-premium secondary" style={{ width: '100%' }}>Return to Login</button>
        </footer>
      </div>
    </main>
  );
};

export default StaffRegisterFlow;
