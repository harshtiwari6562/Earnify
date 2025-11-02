import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Navbar from '../components/Navbar';
import { logInterviewEvent, logCheater } from '../lib/supabase';
import { Camera, AlertTriangle, Eye, MousePointer, X, EyeOff } from 'lucide-react';
import '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';

const InterviewPage = () => {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const modelRef = useRef(null);
  const animationFrameRef = useRef(null);

  // State
  const [isVideoActive, setIsVideoActive] = useState(false);
  const [eyeContactStatus, setEyeContactStatus] = useState('checking');
  const [warningCount, setWarningCount] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [cursorPositions, setCursorPositions] = useState([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [lastWarningTime, setLastWarningTime] = useState(null);
  const [modelLoaded, setModelLoaded] = useState(false);

  // Initialize face detection model
  useEffect(() => {
    const initModel = async () => {
      try {
        const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
        const detectorConfig = {
          runtime: 'mediapipe',
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
          refineLandmarks: true,
          maxFaces: 1,
        };
        const detector = await faceLandmarksDetection.createDetector(model, detectorConfig);
        modelRef.current = detector;
        setModelLoaded(true);
        console.log('Face detection model loaded successfully');
      } catch (error) {
        console.error('Error initializing face detection model:', error);
        showToast('Failed to initialize face detection. Please refresh the page.', 'error');
      }
    };

    initModel();

    return () => {
      if (modelRef.current) {
        modelRef.current.dispose();
      }
    };
  }, [showToast]);

  // Auto-start camera when component mounts and model is loaded
  useEffect(() => {
    if (!isBlocked && modelLoaded && !isVideoActive) {
      // Small delay to ensure everything is ready
      const timer = setTimeout(() => {
        startVideo();
      }, 500);
      
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelLoaded, isBlocked, isVideoActive]);

  // Start video stream
  const startVideo = async () => {
    try {
      // Check if camera is already active
      if (isVideoActive && streamRef.current) {
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsVideoActive(true);

        // Wait for video to be ready
        const video = videoRef.current;
        
        const handleLoadedMetadata = () => {
          if (video) {
            video.play()
              .then(() => {
                console.log('Video is playing');
                setIsVideoActive(true);
                // Start detection after video is playing
                setTimeout(() => {
                  startEyeContactDetection();
                }, 500);
              })
              .catch(err => {
                console.error('Error playing video:', err);
                showToast('Error starting video playback', 'error');
                setIsVideoActive(false);
              });
          }
        };

        const handlePlaying = () => {
          console.log('Video playback started');
          setIsVideoActive(true);
        };

        const handleError = (err) => {
          console.error('Video error:', err);
          showToast('Error displaying video stream', 'error');
          setIsVideoActive(false);
        };

        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('playing', handlePlaying);
        video.addEventListener('error', handleError);

        // If metadata is already loaded, trigger play immediately
        if (video.readyState >= 2) {
          handleLoadedMetadata();
        }
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      let errorMessage = 'Camera access denied.';
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = 'Camera permission denied. Please allow camera access in your browser settings.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = 'No camera found. Please connect a camera and refresh the page.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage = 'Camera is being used by another application. Please close it and try again.';
      }
      
      showToast(errorMessage, 'error');
      setIsVideoActive(false);
    }
  };

  // Stop video stream
  const stopVideo = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setIsVideoActive(false);
    setIsDetecting(false);
  };

  // Eye contact detection
  const detectEyeContact = async () => {
    if (!modelRef.current || !videoRef.current || !canvasRef.current || isBlocked) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      try {
        const faces = await modelRef.current.estimateFaces(video, {
          flipHorizontal: false,
          staticImageMode: false
        });

        if (faces.length > 0) {
          const face = faces[0];
          const keypoints = face.keypoints || [];

          // MediaPipe FaceMesh landmark indices
          // Left eye: 33 (left iris center)
          // Right eye: 468 (right iris center) or 362 (alternative)
          // Nose tip: 4
          // Left eye corners: 33, 133, 7, 163, 144, 145, 153, 154, 155, 157, 158, 159, 160, 161
          // Right eye corners: 468, 362, 382, 381, 380, 374, 373, 390, 249, 263, 388, 387, 386, 385, 384

          // Get key facial points by index
          const leftEyeIdx = keypoints.length > 33 ? 33 : 0;
          const rightEyeIdx = keypoints.length > 468 ? 468 : (keypoints.length > 362 ? 362 : 1);
          const noseIdx = keypoints.length > 4 ? 4 : 2;

          const leftEyePoint = keypoints[leftEyeIdx];
          const rightEyePoint = keypoints[rightEyeIdx];
          const nosePoint = keypoints[noseIdx];

          if (leftEyePoint && rightEyePoint && nosePoint) {
            // Calculate eye positions (keypoints have x, y, z coordinates)
            const eyeY = (leftEyePoint.y + rightEyePoint.y) / 2;
            const noseY = nosePoint.y;
            
            // Calculate if eyes are aligned horizontally (looking forward)
            const eyeVerticalDiff = Math.abs(leftEyePoint.y - rightEyePoint.y);
            const eyeHorizontalCenter = (leftEyePoint.x + rightEyePoint.x) / 2;
            const noseX = nosePoint.x;
            const eyeNoseHorizontalDiff = Math.abs(eyeHorizontalCenter - noseX);
            
            // Eye contact detection: eyes should be roughly level and centered
            // Threshold values adjusted for better detection
            const isLookingForward = 
              eyeVerticalDiff < 0.08 && // Eyes are level
              eyeNoseHorizontalDiff < 0.12 && // Eyes centered relative to nose
              Math.abs(eyeY - noseY) < 0.25; // Eyes at reasonable vertical position

            if (isLookingForward) {
              setEyeContactStatus('good');
              setLastWarningTime(null);
            } else {
              setEyeContactStatus('away');
              // Only trigger warning after sustained loss (debounced in handleEyeContactLoss)
              handleEyeContactLoss();
            }

            // Draw face mesh on canvas (for debugging, can be hidden)
            if (showAdminPanel) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = isLookingForward ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
              ctx.beginPath();
              ctx.arc(leftEyePoint.x * canvas.width, leftEyePoint.y * canvas.height, 8, 0, 2 * Math.PI);
              ctx.arc(rightEyePoint.x * canvas.width, rightEyePoint.y * canvas.height, 8, 0, 2 * Math.PI);
              ctx.fill();
            }
          } else {
            setEyeContactStatus('no_face');
            handleEyeContactLoss();
          }
        } else {
          setEyeContactStatus('no_face');
          handleEyeContactLoss();
        }
      } catch (error) {
        console.error('Error detecting face:', error);
        setEyeContactStatus('error');
      }
    }

    if (!isBlocked && isVideoActive) {
      animationFrameRef.current = requestAnimationFrame(detectEyeContact);
    }
  };

  const startEyeContactDetection = () => {
    setIsDetecting(true);
    detectEyeContact();
  };

  // Handle eye contact loss
  const handleEyeContactLoss = () => {
    const now = Date.now();
    // Debounce: only count if last warning was more than 5 seconds ago
    if (lastWarningTime && (now - lastWarningTime) < 5000) {
      return;
    }

    if (warningCount < 3) {
      const newCount = warningCount + 1;
      setWarningCount(newCount);
      setLastWarningTime(now);

      // Log warning event
      if (user) {
        logInterviewEvent({
          userId: user.id,
          eventType: 'eye_contact_warning',
          eventData: { warningNumber: newCount }
        }).catch(err => console.error('Failed to log warning:', err));
      }

      showToast(
        `Warning ${newCount}/3: Please maintain eye contact with the camera.`,
        'warning'
      );

      if (newCount >= 3) {
        blockUser();
      }
    }
  };

  // Block user after 3 warnings
  const blockUser = async () => {
    setIsBlocked(true);
    stopVideo();

    try {
      if (user) {
        await logCheater(user.id, 'Repeated eye contact violations (3 warnings)');
        await logInterviewEvent({
          userId: user.id,
          eventType: 'user_blocked',
          eventData: { reason: 'eye_contact_violations' }
        });
      }
    } catch (error) {
      console.error('Error logging block event:', error);
    }

    showToast(
      'You have been removed for repeatedly breaking interview monitoring rules.',
      'error'
    );

    // Logout and redirect after 3 seconds
    setTimeout(async () => {
      await logout();
      navigate('/login');
    }, 3000);
  };

  // Mouse cursor tracking
  useEffect(() => {
    if (isBlocked || !user) return;

    let lastLogTime = 0;
    const logInterval = 5000; // Log every 5 seconds

    const handleMouseMove = (e) => {
      const position = {
        x: e.clientX,
        y: e.clientY,
        timestamp: Date.now()
      };

      setCursorPositions(prev => {
        const updated = [...prev, position];
        // Keep only last 100 positions
        return updated.slice(-100);
      });

      // Log cursor position periodically (every 5 seconds)
      const now = Date.now();
      if (now - lastLogTime >= logInterval) {
        lastLogTime = now;
        logInterviewEvent({
          userId: user.id,
          eventType: 'cursor_tracking',
          eventData: { position }
        }).catch(err => console.error('Failed to log cursor:', err));
      }
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [user, isBlocked]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVideo();
    };
  }, []);

  // Get status color
  const getStatusColor = () => {
    switch (eyeContactStatus) {
      case 'good':
        return 'text-green-500';
      case 'away':
      case 'no_face':
        return 'text-red-500';
      default:
        return 'text-yellow-500';
    }
  };

  // Get status text
  const getStatusText = () => {
    switch (eyeContactStatus) {
      case 'good':
        return 'Maintaining Eye Contact';
      case 'away':
        return 'Not Looking at Camera';
      case 'no_face':
        return 'Face Not Detected';
      case 'checking':
        return 'Checking...';
      default:
        return 'Initializing...';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white flex items-center">
            <Camera className="mr-3 text-indigo-500" />
            Remote Interview Monitoring
          </h1>
          <button
            onClick={() => setShowAdminPanel(!showAdminPanel)}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 text-sm"
          >
            {showAdminPanel ? 'Hide' : 'Show'} Admin Panel
          </button>
        </div>

        {isBlocked ? (
          <div className="card max-w-2xl mx-auto text-center">
            <div className="flex flex-col items-center py-12">
              <AlertTriangle className="h-16 w-16 text-red-500 mb-4" />
              <h2 className="text-2xl font-bold text-white mb-4">
                Access Blocked
              </h2>
              <p className="text-gray-300 mb-6">
                You have been removed for repeatedly breaking interview monitoring rules.
              </p>
              <p className="text-gray-400 text-sm">
                Redirecting to login...
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Video Panel */}
            <div className="lg:col-span-2">
              <div className="card">
                <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
                  {!isVideoActive ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                      <Camera className="h-16 w-16 mb-4" />
                      <p className="text-lg">Camera Not Active</p>
                      <button
                        onClick={startVideo}
                        className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                      >
                        Start Camera
                      </button>
                    </div>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                        style={{ transform: 'scaleX(-1)' }}
                      />
                      <canvas
                        ref={canvasRef}
                        className="absolute top-0 left-0 pointer-events-none"
                        style={{ display: showAdminPanel ? 'block' : 'none', transform: 'scaleX(-1)' }}
                      />
                      <button
                        onClick={stopVideo}
                        className="absolute top-4 right-4 p-2 bg-red-600 text-white rounded-full hover:bg-red-700 z-10"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Status Bar */}
                <div className="mt-4 p-4 bg-gray-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {eyeContactStatus === 'good' ? (
                        <Eye className="h-5 w-5 text-green-500" />
                      ) : (
                        <EyeOff className="h-5 w-5 text-red-500" />
                      )}
                      <span className={`font-medium ${getStatusColor()}`}>
                        {getStatusText()}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        <span className="text-gray-300 text-sm">
                          Warnings: {warningCount}/3
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <MousePointer className="h-4 w-4 text-blue-500" />
                        <span className="text-gray-300 text-sm">
                          Cursor Tracked
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Warning Bars */}
                  {warningCount > 0 && (
                    <div className="mt-3 space-y-2">
                      {[1, 2, 3].map((num) => (
                        <div
                          key={num}
                          className={`h-2 rounded ${
                            num <= warningCount
                              ? 'bg-red-500'
                              : 'bg-gray-700'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Side Panel */}
            <div className="space-y-6">
              {/* Monitoring Info */}
              <div className="card">
                <h3 className="text-xl font-bold text-white mb-4">Monitoring Status</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Eye Contact</span>
                    <span className={getStatusColor()}>
                      {eyeContactStatus === 'good' ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Mouse Tracking</span>
                    <span className="text-green-500">Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Camera</span>
                    <span className={isVideoActive ? 'text-green-500' : 'text-red-500'}>
                      {isVideoActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Warning Alert */}
              {warningCount > 0 && (
                <div className="card bg-yellow-900 border-yellow-700">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                    <div>
                      <h3 className="font-bold text-yellow-200 mb-1">
                        Warning {warningCount}/3
                      </h3>
                      <p className="text-yellow-300 text-sm">
                        Please maintain eye contact with your camera. 
                        {warningCount >= 2 && (
                          <span className="block mt-1 font-semibold">
                            One more violation will result in removal.
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="card">
                <h3 className="text-xl font-bold text-white mb-4">Instructions</h3>
                <ul className="space-y-2 text-gray-300 text-sm">
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Ensure good lighting and face the camera directly</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Maintain eye contact with the camera throughout</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Your mouse movements are being tracked</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>3 warnings for breaking eye contact will result in removal</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Admin Panel (Hidden by default) */}
        {showAdminPanel && (
          <div className="mt-6 card">
            <h3 className="text-xl font-bold text-white mb-4">Admin Monitoring Panel</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-gray-300 mb-2">Eye Contact Status</h4>
                <p className="text-gray-400 text-sm">{getStatusText()}</p>
              </div>
              <div>
                <h4 className="text-gray-300 mb-2">Warning Count</h4>
                <p className="text-gray-400 text-sm">{warningCount}/3</p>
              </div>
              <div>
                <h4 className="text-gray-300 mb-2">Recent Cursor Positions</h4>
                <div className="max-h-32 overflow-y-auto">
                  {cursorPositions.slice(-10).map((pos, idx) => (
                    <p key={idx} className="text-gray-400 text-xs">
                      ({pos.x}, {pos.y}) - {new Date(pos.timestamp).toLocaleTimeString()}
                    </p>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-gray-300 mb-2">Session Info</h4>
                <p className="text-gray-400 text-sm">
                  User: {user?.email || 'Unknown'}
                </p>
                <p className="text-gray-400 text-sm">
                  Detection: {isDetecting ? 'Active' : 'Inactive'}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default InterviewPage;

