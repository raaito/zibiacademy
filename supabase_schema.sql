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
    semester TEXT DEFAULT 'First', -- 'First' or 'Second'
    created_by UUID REFERENCES public.profiles(id), -- The Examiner
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Questions Bank
CREATE TYPE question_type AS ENUM ('mcq', 'theory');

CREATE TABLE public.questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE,
    q_type question_type NOT NULL,
    question_text TEXT NOT NULL,
    points INTEGER NOT NULL,
    options JSONB, -- For MCQ (Array of strings)
    correct_answer TEXT, -- For MCQ validation
    sequence_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Candidate Scripts (Submissions)
CREATE TABLE public.candidate_scripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID REFERENCES public.profiles(id) NOT NULL,
    assessment_id UUID REFERENCES public.assessments(id) NOT NULL,
    answers JSONB NOT NULL, -- The payload of student answers
    auto_mcq_score INTEGER DEFAULT 0,
    manual_theory_score INTEGER DEFAULT 0,
    is_graded BOOLEAN DEFAULT false,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(candidate_id, assessment_id) -- A candidate can submit only once
);

-- 6. Infraction Logs (Anti-Cheat)
CREATE TABLE public.infraction_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID REFERENCES public.profiles(id) NOT NULL,
    assessment_id UUID REFERENCES public.assessments(id) NOT NULL,
    infraction_type TEXT NOT NULL, -- e.g., 'blur', 'visibilitychange', 'copy'
    details TEXT,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ROW LEVEL SECURITY (RLS) MACROS --

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by everyone." ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users insert own profile." ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Superadmins update profiles." ON public.profiles FOR UPDATE USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin');

-- Assessments
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Assessments viewable by target cohort or staff" ON public.assessments FOR SELECT USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'examiner') OR
  (cohort_id = (SELECT cohort_id FROM public.profiles WHERE id = auth.uid()))
);

-- Questions
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Questions viewable if assessment is open" ON public.questions FOR SELECT USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'examiner') OR
  (EXISTS (
      SELECT 1 FROM public.assessments a 
      WHERE a.id = questions.assessment_id AND a.is_open = true 
      AND a.cohort_id = (SELECT cohort_id FROM public.profiles WHERE id = auth.uid())
  ))
);

-- Candidate Scripts
ALTER TABLE public.candidate_scripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Candidates manage own scripts" ON public.candidate_scripts FOR INSERT WITH CHECK (auth.uid() = candidate_id);
CREATE POLICY "Candidates view own scripts" ON public.candidate_scripts FOR SELECT USING (auth.uid() = candidate_id);
CREATE POLICY "Examiners view all scripts" ON public.candidate_scripts FOR SELECT USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'examiner'));
CREATE POLICY "Examiners rate scripts" ON public.candidate_scripts FOR UPDATE USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'examiner'));

-- Infraction Logs
ALTER TABLE public.infraction_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Candidates insert infractions" ON public.infraction_logs FOR INSERT WITH CHECK (auth.uid() = candidate_id);
CREATE POLICY "Examiners view infractions" ON public.infraction_logs FOR SELECT USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'examiner'));

-- Academic Years
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Academic years viewable by everyone" ON public.academic_years FOR SELECT USING (true);
CREATE POLICY "Superadmins can insert academic years" ON public.academic_years FOR INSERT WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin');
CREATE POLICY "Superadmins can update academic years" ON public.academic_years FOR UPDATE USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin');
CREATE POLICY "Superadmins can delete academic years" ON public.academic_years FOR DELETE USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin');
