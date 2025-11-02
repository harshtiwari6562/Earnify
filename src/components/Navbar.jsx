import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Code, 
  Home, 
  Terminal, 
  Users, 
  LogIn, 
  User, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  PlusSquare
} from 'lucide-react';
import InfinityLogo from './InfinityLogo';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const toggleProfileMenu = () => {
    setProfileMenuOpen(!profileMenuOpen);
  };

  return (
    <nav className="bg-gray-800 shadow-md">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16 w-full">
          {/* Div 1: Logo + Name */}
          <div className="flex items-center space-x-3">
            <InfinityLogo width={40} height={24} />
            <span className="font-bold text-xl text-white">Dashboard</span>
          </div>

          {/* Div 2: Navigation Links */}
          <div className="flex-1 flex justify-center">
            <div className="flex space-x-6">
              <Link to="/dashboard" className="text-gray-300 hover:text-white px-3 py-2 rounded-md font-medium">Home</Link>
              <Link to="/mocktest" className="text-gray-300 hover:text-white px-3 py-2 rounded-md font-medium">AI Mock Test</Link>
              <Link to="/create-room" className="text-gray-300 hover:text-white px-3 py-2 rounded-md font-medium">Create Room</Link>
              <Link to="/join-room" className="text-gray-300 hover:text-white px-3 py-2 rounded-md font-medium">Join Room</Link>
              <Link to="/interview" className="text-gray-300 hover:text-white px-3 py-2 rounded-md font-medium">Interview</Link>
            </div>
          </div>

          {/* Div 3: Profile (Sidebar) */}
          <div className="flex items-center">
            {user && (
              <div className="relative">
                <button onClick={toggleProfileMenu} className="flex items-center text-gray-300 hover:text-white focus:outline-none">
                  <User size={28} className="text-indigo-400" />
                </button>
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg py-1 z-10">
                    <Link to="/profile" className="px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 w-full text-left flex items-center">
                      <User size={16} className="mr-2" />
                      <span>Profile</span>
                    </Link>
                    <Link to="/settings" className="px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 w-full text-left flex items-center">
                      <Settings size={16} className="mr-2" />
                      <span>Settings</span>
                    </Link>
                    <button onClick={handleLogout} className="px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 w-full text-left flex items-center">
                      <LogOut size={16} className="mr-2" />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;