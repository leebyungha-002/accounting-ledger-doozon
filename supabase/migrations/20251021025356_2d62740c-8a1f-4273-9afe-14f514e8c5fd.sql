-- Create table for general ledger data
CREATE TABLE public.general_ledgers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  upload_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.general_ledgers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own ledgers" 
ON public.general_ledgers 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own ledgers" 
ON public.general_ledgers 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ledgers" 
ON public.general_ledgers 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create table for AI analysis results
CREATE TABLE public.ledger_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ledger_id UUID NOT NULL REFERENCES public.general_ledgers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  analysis_type TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.ledger_analysis ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own analysis" 
ON public.ledger_analysis 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own analysis" 
ON public.ledger_analysis 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);