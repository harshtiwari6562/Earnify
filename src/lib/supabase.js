import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseUrl.startsWith('https://')) {
  throw new Error('Invalid or missing VITE_SUPABASE_URL. Please ensure it starts with https:// and is properly set in your environment variables.');
}

if (!supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_ANON_KEY. Please ensure it is properly set in your environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Authentication methods
export const signUp = async (email, password, userData) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  
  if (error) throw error;
  
  if (data?.user) {
    // Add the user's profile data to the profiles table
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([
        { 
          id: data.user.id,
          ...userData
        }
      ]);
    
    if (profileError) throw profileError;
  }
  
  return data;
};

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

export const getUserProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) throw error;
  return data;
};

// Room methods
export const createRoom = async (roomData) => {
  const { data, error } = await supabase
    .from('rooms')
    .insert([roomData])
    .select();
  
  if (error) throw error;
  return data[0];
};

export const joinRoom = async (roomId, userId) => {
  const { data, error } = await supabase
    .from('room_participants')
    .insert([{
      room_id: roomId,
      user_id: userId
    }])
    .select();
  
  if (error) throw error;
  return data[0];
};

export const getRoomById = async (roomId) => {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();
  
  if (error) throw error;
  return data;
};

export const getRoomParticipants = async (roomId) => {
  const { data, error } = await supabase
    .from('room_participants')
    .select(`
      user_id,
      profiles:user_id (
        full_name,
        username,
        skill_level
      )
    `)
    .eq('room_id', roomId);
  
  if (error) throw error;
  return data;
};

// Test and submission methods
export const saveSubmission = async (submissionData) => {
  const { data, error } = await supabase
    .from('submissions')
    .insert([submissionData])
    .select();
  
  if (error) throw error;
  return data[0];
};

export const getUserSubmissions = async (userId) => {
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
};

// Interview monitoring functions
export const logInterviewEvent = async (eventData) => {
  const { data, error } = await supabase
    .from('interview_logs')
    .insert([{
      user_id: eventData.userId,
      event_type: eventData.eventType,
      event_data: eventData.eventData || {},
      timestamp: new Date().toISOString()
    }])
    .select();
  
  if (error) {
    console.error('Error logging interview event:', error);
    throw error;
  }
  return data[0];
};

export const logCheater = async (userId, reason) => {
  try {
    await logInterviewEvent({
      userId,
      eventType: 'cheater_blocked',
      eventData: { reason }
    });
  } catch (error) {
    console.error('Error logging cheater:', error);
    throw error;
  }
};