-- Elite Exam System Schema Definition

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Academic Years (Cohorts)
CREATE TABLE public.academic_years (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE, -- e.g. "2026/2027"
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Profiles (Extends Supabase Auth Users)
-- Role Enum: superadmin, examiner, candidate
CREATE TYPE user_role AS ENUM ('superadmin', 'examiner', 'candidate');

    CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    matriculation_number TEXT UNIQUE, -- null for superadmins
    role user_role DEFAULT 'candidate',
    is_active BOOLEAN DEFAULT false,
    cohort_id UUID REFERENCES public.academic_years(id), -- Only relevant for candidates
    semester TEXT DEFAULT 'First', -- 'First' or 'Second'
    program_type TEXT DEFAULT 'multi-semester', -- 'multi-semester' or 'stretch'
    programme_applied TEXT,
    avatar_url TEXT,
    telephone TEXT,
    address TEXT,
    date_of_birth DATE,
    occupation TEXT,
    highest_qualification TEXT,
    church_attended TEXT,
    reason_for_application TEXT,
    two_referees TEXT,
    water_baptism_desc TEXT,
    holy_ghost_baptism TEXT,
    research_interest TEXT,
    sponsorship_details TEXT,
    course_of_selection TEXT,
    registration_type TEXT,
    staff_code TEXT UNIQUE,
    session_token TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Assessments
CREATE TABLE public.assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_name TEXT NOT NULL,
    course_code TEXT NOT NULL,
    cohort_id UUID REFERENCES public.academic_years(id) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    is_open BOOLEAN DEFAULT false,
    is_hidden BOOLEAN DEFAULT false,
    semester TEXT DEFAULT 'First', -- 'First' or 'Second'
    question_type TEXT DEFAULT 'mcq', -- 'mcq', 'theory', or 'blended'
    is_blended BOOLEAN DEFAULT false, -- True if assessment contains timed blended sections
    category_durations JSONB DEFAULT '{"mcq": 0, "true_false": 0, "short_essay": 0}'::jsonb, -- Per-category time limits in minutes
    instructions TEXT DEFAULT '', -- Exam instructions for candidates
    created_by UUID REFERENCES public.profiles(id), -- The Examiner
    grader_access JSONB DEFAULT '[]'::jsonb, -- Array of examiner UUIDs allowed to grade this exam
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Questions Bank
CREATE TYPE question_type AS ENUM ('mcq', 'theory', 'true_false', 'short_essay');

CREATE TABLE public.questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE,
    q_type question_type NOT NULL, -- 'mcq', 'theory', 'true_false', 'short_essay'
    question_text TEXT NOT NULL,
    points INTEGER NOT NULL,
    options JSONB, -- For MCQ or True/False (Array of strings)
    correct_answer TEXT, -- For MCQ/True_False auto-grading validation
    sequence_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Candidate Scripts (Submissions)
CREATE TABLE public.candidate_scripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL,
    answers JSONB NOT NULL, -- The payload of student answers
    auto_mcq_score INTEGER DEFAULT 0,
    manual_theory_score INTEGER DEFAULT 0,
    total_possible_score INTEGER DEFAULT 0, -- Total points possible for this assessment
    question_scores JSONB DEFAULT '{}'::jsonb, -- Per-question scores {question_id: score}
    is_graded BOOLEAN DEFAULT false,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    device_info TEXT DEFAULT '', -- Browser/device info (user agent, platform, screen)
    ip_address TEXT DEFAULT '', -- Public IP address at time of exam
    location_lat DOUBLE PRECISION, -- Geolocation latitude
    location_lng DOUBLE PRECISION, -- Geolocation longitude
    UNIQUE(candidate_id, assessment_id) -- A candidate can submit only once
);

-- 6. Infraction Logs (Anti-Cheat)
CREATE TABLE public.infraction_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL,
    infraction_type TEXT NOT NULL, -- e.g., 'blur', 'visibilitychange', 'copy'
    details TEXT,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ROW LEVEL SECURITY (RLS) MACROS --

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Staff view all profiles" ON public.profiles FOR SELECT USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'examiner')
);
CREATE POLICY "Users insert own profile." ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Superadmins update profiles." ON public.profiles FOR UPDATE USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin');

-- Assessments
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Assessments viewable by target cohort or staff" ON public.assessments FOR SELECT USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'examiner') OR
  (cohort_id = (SELECT cohort_id FROM public.profiles WHERE id = auth.uid()))
);

CREATE POLICY "Examiners can insert assessments" ON public.assessments FOR INSERT WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'examiner')
);

CREATE POLICY "Examiners can update assessments" ON public.assessments FOR UPDATE USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'examiner')
);

CREATE POLICY "Examiners can delete assessments" ON public.assessments FOR DELETE USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'examiner')
);

-- SECURITY DEFINER Helper Function for RLS Role Checking
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon, authenticated;

-- Questions
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Questions viewable if assessment is open" ON public.questions;
DROP POLICY IF EXISTS "Questions viewable by staff or students of open assessment" ON public.questions;
DROP POLICY IF EXISTS "Examiners can insert questions" ON public.questions;
DROP POLICY IF EXISTS "Examiners can update questions" ON public.questions;
DROP POLICY IF EXISTS "Examiners can delete questions" ON public.questions;

CREATE POLICY "Questions viewable by staff or students of open assessment" ON public.questions FOR SELECT USING (
  public.get_user_role() IN ('superadmin', 'examiner') OR
  (EXISTS (
      SELECT 1 FROM public.assessments a 
      WHERE a.id = questions.assessment_id AND a.is_open = true 
      AND a.cohort_id = (SELECT cohort_id FROM public.profiles WHERE id = auth.uid())
  ))
);

CREATE POLICY "Examiners can insert questions" ON public.questions FOR INSERT WITH CHECK (
  public.get_user_role() IN ('superadmin', 'examiner')
);

CREATE POLICY "Examiners can update questions" ON public.questions FOR UPDATE USING (
  public.get_user_role() IN ('superadmin', 'examiner')
) WITH CHECK (
  public.get_user_role() IN ('superadmin', 'examiner')
);

CREATE POLICY "Examiners can delete questions" ON public.questions FOR DELETE USING (
  public.get_user_role() IN ('superadmin', 'examiner')
);

-- Candidate Scripts
ALTER TABLE public.candidate_scripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Examiners delete scripts" ON public.candidate_scripts;
CREATE POLICY "Candidates manage own scripts" ON public.candidate_scripts FOR INSERT WITH CHECK (auth.uid() = candidate_id);
CREATE POLICY "Candidates view own scripts" ON public.candidate_scripts FOR SELECT USING (auth.uid() = candidate_id);
CREATE POLICY "Examiners view all scripts" ON public.candidate_scripts FOR SELECT USING (public.get_user_role() IN ('superadmin', 'examiner'));
CREATE POLICY "Examiners rate scripts" ON public.candidate_scripts FOR UPDATE USING (public.get_user_role() IN ('superadmin', 'examiner'));
CREATE POLICY "Examiners delete scripts" ON public.candidate_scripts FOR DELETE USING (public.get_user_role() IN ('superadmin', 'examiner'));

-- Infraction Logs
ALTER TABLE public.infraction_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Examiners delete infractions" ON public.infraction_logs;
CREATE POLICY "Candidates insert infractions" ON public.infraction_logs FOR INSERT WITH CHECK (auth.uid() = candidate_id);
CREATE POLICY "Examiners view infractions" ON public.infraction_logs FOR SELECT USING (public.get_user_role() IN ('superadmin', 'examiner'));
CREATE POLICY "Examiners delete infractions" ON public.infraction_logs FOR DELETE USING (public.get_user_role() IN ('superadmin', 'examiner'));

-- Academic Years
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Academic years viewable by everyone" ON public.academic_years FOR SELECT USING (true);
CREATE POLICY "Superadmins can insert academic years" ON public.academic_years FOR INSERT WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin');
CREATE POLICY "Superadmins can update academic years" ON public.academic_years FOR UPDATE USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin');
CREATE POLICY "Superadmins can delete academic years" ON public.academic_years FOR DELETE USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin');

-- 7. Valid Staff Codes (Whitelisting for registration)
CREATE TABLE public.valid_staff_codes (
    code TEXT PRIMARY KEY,
    is_used BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.valid_staff_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins manage staff codes" ON public.valid_staff_codes FOR ALL USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin');

-- Secure "Blind Verification" function (prevents unauthorized code listing)
CREATE OR REPLACE FUNCTION verify_staff_code(input_code TEXT)
RETURNS BOOLEAN 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.valid_staff_codes 
    WHERE LOWER(code) = LOWER(input_code) AND is_used = false
  );
END;
$$ LANGUAGE plpgsql;

-- Secure case-insensitive redemption function
CREATE OR REPLACE FUNCTION redeem_staff_code(input_code TEXT)
RETURNS VOID 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.valid_staff_codes 
  SET is_used = true 
  WHERE LOWER(code) = LOWER(input_code);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION verify_staff_code(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION redeem_staff_code(TEXT) TO anon, authenticated;

-- 8. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_questions_assessment_id ON public.questions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_candidate_scripts_assessment_id ON public.candidate_scripts(assessment_id);
CREATE INDEX IF NOT EXISTS idx_candidate_scripts_candidate_id ON public.candidate_scripts(candidate_id);
CREATE INDEX IF NOT EXISTS idx_assessments_created_by ON public.assessments(created_by);
CREATE INDEX IF NOT EXISTS idx_assessments_cohort_id ON public.assessments(cohort_id);
CREATE INDEX IF NOT EXISTS idx_infraction_logs_assessment_id ON public.infraction_logs(assessment_id);
CREATE INDEX IF NOT EXISTS idx_infraction_logs_candidate_id ON public.infraction_logs(candidate_id);
CREATE INDEX IF NOT EXISTS idx_profiles_cohort_id ON public.profiles(cohort_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

