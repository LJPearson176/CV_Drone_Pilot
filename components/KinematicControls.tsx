
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useEffect, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { useAppContext } from '../context/AppContext';

export const KinematicControls: React.FC = () => {
    const { isKinematicEnabled, kinematicLeftStickRef, kinematicRightStickRef } = useAppContext();
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
    const requestRef = useRef<number>(0);

    // Joystick Configuration (Screen Space: 0-1)
    // Note: Webcam is visually mirrored (scaleX(-1)). 
    // Anatomical Left Wrist (User's Left) appears at Raw X ~ 0.9. Visually Left (0.1).
    // Anatomical Right Wrist (User's Right) appears at Raw X ~ 0.1. Visually Right (0.9).
    // Positions aligned closer to bottom corners to match D-pads
    const LEFT_JOY_ORIGIN = { x: 0.92, y: 0.88 };
    const RIGHT_JOY_ORIGIN = { x: 0.08, y: 0.88 };
    const JOY_RADIUS = 0.12; // Increased radius to ensure sticks can reach buttons
    const DEADZONE = 0.15;

    // Load MediaPipe PoseLandmarker
    useEffect(() => {
        const createLandmarker = async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
                );
                poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numPoses: 1
                });
            } catch (err: any) {
                console.error("Failed to load PoseLandmarker", err);
                setError(err.message || "Failed to load computer vision model.");
            }
        };

        createLandmarker();
        return () => {
             poseLandmarkerRef.current?.close();
        };
    }, []);

    // Handle Camera Stream
    useEffect(() => {
        if (isKinematicEnabled && !stream) {
            navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
                .then(s => {
                    setStream(s);
                    if (videoRef.current) {
                        videoRef.current.srcObject = s;
                        videoRef.current.addEventListener("loadeddata", predictWebcam);
                    }
                })
                .catch(err => {
                    console.error("Camera access denied:", err);
                    setError("Camera access denied. Please check permissions.");
                });
        } else if (!isKinematicEnabled && stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
            cancelAnimationFrame(requestRef.current);
            // Reset joysticks
            kinematicLeftStickRef.current = [0, 0];
            kinematicRightStickRef.current = [0, 0];
        }
    }, [isKinematicEnabled]);

    const predictWebcam = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const landmarker = poseLandmarkerRef.current;
        if (!video || !canvas || !landmarker) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;

        let lastVideoTime = -1;

        const renderLoop = (time: number) => {
            if (lastVideoTime !== video.currentTime) {
                lastVideoTime = video.currentTime;
                const result = landmarker.detectForVideo(video, time);

                ctx.clearRect(0, 0, w, h);
                
                // Draw HUD zones
                const drawZone = (origin: {x:number, y:number}, active: boolean, value: [number, number]) => {
                     const cx = origin.x * w;
                     const cy = origin.y * h;
                     const r = JOY_RADIUS * w; // Use width for aspect consistency
                     
                     ctx.beginPath();
                     ctx.arc(cx, cy, r, 0, 2 * Math.PI);
                     ctx.strokeStyle = active ? "rgba(0, 255, 255, 0.6)" : "rgba(0, 255, 255, 0.15)";
                     ctx.lineWidth = active ? 3 : 1;
                     ctx.stroke();

                     // Draw Stick Position 
                     const sx = cx + (-value[0]) * r;
                     const sy = cy + value[1] * r; 
                     
                     ctx.beginPath();
                     ctx.arc(sx, sy, 8, 0, 2 * Math.PI);
                     ctx.fillStyle = active ? "rgba(255, 200, 0, 0.9)" : "rgba(255, 255, 255, 0.3)";
                     ctx.fill();
                     
                     // Connect center to stick
                     if (active) {
                        ctx.beginPath();
                        ctx.moveTo(cx, cy);
                        ctx.lineTo(sx, sy);
                        ctx.strokeStyle = "rgba(255, 200, 0, 0.5)";
                        ctx.lineWidth = 2;
                        ctx.stroke();
                     }
                };
                
                let lJoy: [number, number] = [0, 0];
                let rJoy: [number, number] = [0, 0];
                let lActive = false;
                let rActive = false;

                if (result.landmarks && result.landmarks.length > 0) {
                    const lm = result.landmarks[0];
                    const leftWrist = lm[15];
                    const rightWrist = lm[16];

                    // Left Wrist (User's anatomical left, Visual Left, Raw X ~ 0.9)
                    if (leftWrist) {
                        let dx = leftWrist.x - LEFT_JOY_ORIGIN.x;
                        let dy = leftWrist.y - LEFT_JOY_ORIGIN.y;
                        
                        const aspect = w / h;
                        dy /= aspect; 

                        const rawDist = Math.sqrt(dx*dx + dy*dy);
                        const radiusNorm = JOY_RADIUS;
                        
                        if (rawDist > DEADZONE * radiusNorm) {
                            const factor = (rawDist - DEADZONE * radiusNorm) / ((1 - DEADZONE) * radiusNorm);
                            const clampedFactor = Math.min(1.0, factor);
                            
                            const vx = dx / rawDist;
                            const vy = dy / rawDist;
                            
                            // Invert X: Moving wrist "Left" (visually) increases Raw X. dx > 0.
                            // We want "Left" output to be negative. So -vx.
                            lJoy = [-vx * clampedFactor, vy * clampedFactor];
                            lActive = true;
                        }
                    }

                    // Right Wrist (User's anatomical right, Visual Right, Raw X ~ 0.1)
                    if (rightWrist) {
                         let dx = rightWrist.x - RIGHT_JOY_ORIGIN.x;
                         let dy = rightWrist.y - RIGHT_JOY_ORIGIN.y;
                         const aspect = w / h;
                         dy /= aspect; 

                         const rawDist = Math.sqrt(dx*dx + dy*dy);
                         const radiusNorm = JOY_RADIUS;
                         
                         if (rawDist > DEADZONE * radiusNorm) {
                            const factor = (rawDist - DEADZONE * radiusNorm) / ((1 - DEADZONE) * radiusNorm);
                            const clampedFactor = Math.min(1.0, factor);
                            
                            const vx = dx / rawDist;
                            const vy = dy / rawDist;
                            
                            // Invert X: Moving wrist "Right" (visually) decreases Raw X. dx < 0.
                            // We want "Right" output to be positive. So -vx.
                            rJoy = [-vx * clampedFactor, vy * clampedFactor];
                            rActive = true;
                         }
                    }
                }
                
                // Update Global Refs
                kinematicLeftStickRef.current = lJoy;
                kinematicRightStickRef.current = rJoy;

                drawZone(LEFT_JOY_ORIGIN, lActive, lJoy);
                drawZone(RIGHT_JOY_ORIGIN, rActive, rJoy);
            }
            requestRef.current = requestAnimationFrame(renderLoop);
        };
        requestRef.current = requestAnimationFrame(renderLoop);
    };

    if (!isKinematicEnabled) return null;

    return (
        <div className="fixed inset-0 pointer-events-none z-10 flex items-center justify-center">
            {error ? (
                 <div className="bg-red-900/80 p-4 rounded text-white border border-red-500 pointer-events-auto">
                    <p>Kinematic Error: {error}</p>
                 </div>
            ) : (
                <div className="relative w-full h-full">
                     {/* Mini Camera Feed - Visible and Mirrored */}
                    <video 
                        ref={videoRef} 
                        className={`absolute bottom-10 left-1/2 ml-12 w-28 h-20 sm:bottom-14 sm:ml-24 sm:w-48 sm:h-36 object-cover rounded-xl border-2 border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.2)] z-20 transition-all duration-300 pointer-events-auto ${stream ? 'opacity-80' : 'opacity-0'}`}
                        style={{ transform: 'scaleX(-1)' }}
                        autoPlay 
                        playsInline
                        muted
                    ></video>
                    
                    {/* Visual Overlay - Mirrored for intuitive feedback */}
                    <canvas 
                        ref={canvasRef} 
                        className="absolute inset-0 w-full h-full opacity-60"
                        style={{ transform: 'scaleX(-1)' }} 
                    />
                    
                    {/* Instructions */}
                    <div className="absolute top-24 left-1/2 -translate-x-1/2 text-cyan-400 text-xs font-mono opacity-50 bg-black/40 px-2 py-1 rounded backdrop-blur-sm">
                        RAISE HANDS TO CONTROLS
                    </div>
                </div>
            )}
        </div>
    );
};
