import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/DashboardPage';
import AIMocktestPage from './pages/AIMocktestPage';
import CreateRoom from './pages/CreateRoomPage';
import JoinRoom from './pages/JoinRoomPage';
import Login from './pages/LoginPage';
import TopicSolvePage from './pages/TopicSolvePage';
import InterviewPage from './pages/InterviewPage';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login/>} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/mocktest" element={<AIMocktestPage/>} />
        <Route path="/create-room" element={<CreateRoom />} />
        <Route path="/join-room" element={<JoinRoom />} />
        <Route path="/topics/:topicName/solve" element={<TopicSolvePage />} />
        <Route path="/interview" element={<InterviewPage />} />
        <Route 
          path="/interview" 
          element={
            <ProtectedRoute>
              <InterviewPage />
            </ProtectedRoute>
          } 
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    
  );
}

export default App;