
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { ChevronUpIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, TerraformIcon } from './Icons';

const DpadButton: React.FC<{
  onPress: () => void;
  onRelease: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel: string;
  isKeyPressed?: boolean;
}> = ({ onPress, onRelease, children, className = '', ariaLabel, isKeyPressed = false }) => {
  const [isPointerPressed, setIsPointerPressed] = useState(false);
  const activePointerId = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (activePointerId.current !== null) return;
    
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch (err) {
      console.warn("Pointer capture failed.", err);
    }
    activePointerId.current = e.pointerId;

    setIsPointerPressed(true);
    onPress();
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent) => {
    if (activePointerId.current === e.pointerId) {
      activePointerId.current = null;
      setIsPointerPressed(false);
      onRelease();
    }
  };

  const isVisuallyPressed = isPointerPressed || isKeyPressed;

  return (
    <div
      role="button"
      aria-label={ariaLabel}
      className={`w-10 h-10 sm:w-14 sm:h-14 bg-gray-500/30 backdrop-blur-sm border border-white/20 rounded-full flex items-center justify-center text-white transition-all duration-100 ease-in-out select-none touch-none ${className} 
      ${isVisuallyPressed ? 'bg-cyan-400 text-black scale-90 border-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.6)]' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      onLostPointerCapture={handlePointerUpOrCancel}
    >
      {children}
    </div>
  );
};

const TerraformButton: React.FC<{
  onPress: () => void;
  onRelease: () => void;
  power: number;
}> = ({ onPress, onRelease, power }) => {
  const [isPointerPressed, setIsPointerPressed] = useState(false);
  const activePointerId = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (activePointerId.current !== null) return;
    
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch (err) {
      console.warn("Pointer capture failed.", err);
    }
    activePointerId.current = e.pointerId;

    setIsPointerPressed(true);
    onPress();
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent) => {
    if (activePointerId.current === e.pointerId) {
      activePointerId.current = null;
      setIsPointerPressed(false);
      onRelease();
    }
  };
  
  const isFull = power >= 1.0;
  const isDepleted = power <= 0.01;
  const fillHeight = `${Math.min(1, power) * 100}%`;

  const fillColor = isFull ? 'bg-cyan-400/50' : 'bg-white/40';
  const iconColor = isFull ? 'text-cyan-300' : 'text-white';

  return (
    <div
      role="button"
      aria-label="Terraform Fractal"
      title="Terraform"
      className={`w-16 h-16 sm:w-20 sm:h-20 bg-gray-500/30 backdrop-blur-sm border border-white/20 rounded-full flex items-center justify-center text-white transition-all duration-150 ease-in-out select-none touch-none transform relative overflow-hidden ${isPointerPressed ? 'scale-95' : ''} ${isDepleted && !isPointerPressed ? 'opacity-70' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      onLostPointerCapture={handlePointerUpOrCancel}
    >
      <div 
        className={`absolute bottom-0 left-0 w-full transition-colors duration-300 ${fillColor}`}
        style={{ height: fillHeight, transitionProperty: 'height, background-color', transitionTimingFunction: 'linear' }}
      />
      <TerraformIcon className={`w-8 h-8 sm:w-10 sm:h-10 relative z-10 transition-colors duration-300 ${iconColor}`} />
    </div>
  );
};


export const DpadControls: React.FC = () => {
  const { 
    pressKey, 
    releaseKey, 
    cameraControlsEnabled, 
    pressedKeys, 
    handleTerraformPress, 
    handleTerraformRelease, 
    terraformPower,
    isKinematicEnabled,
    kinematicLeftStickRef,
    kinematicRightStickRef
  } = useAppContext();

  // Local state to track which keys are "virtually" pressed by kinematic controls
  // This allows the UI to light up without needing to push to the global pressedKeys (which might cause loop issues)
  const [kinematicKeys, setKinematicKeys] = useState<Set<string>>(new Set());
  const requestRef = useRef<number>(0);

  useEffect(() => {
    if (!isKinematicEnabled) {
      setKinematicKeys(new Set());
      return;
    }

    const checkKinematics = () => {
      const leftJoy = kinematicLeftStickRef.current;
      const rightJoy = kinematicRightStickRef.current;
      // Lowered threshold to ensure contact triggers the button press reliably
      const THRESHOLD = 0.25;
      const newKeys = new Set<string>();

      // Left Stick (Move)
      if (leftJoy[1] > THRESHOLD) newKeys.add('s'); // Down (Backward)
      if (leftJoy[1] < -THRESHOLD) newKeys.add('w'); // Up (Forward)
      if (leftJoy[0] > THRESHOLD) newKeys.add('d'); // Right
      if (leftJoy[0] < -THRESHOLD) newKeys.add('a'); // Left

      // Right Stick (Look)
      if (rightJoy[1] > THRESHOLD) newKeys.add('arrowdown'); // Down (Pitch Down/Look Down)
      if (rightJoy[1] < -THRESHOLD) newKeys.add('arrowup'); // Up (Pitch Up/Look Up)
      if (rightJoy[0] > THRESHOLD) newKeys.add('arrowright'); // Right
      if (rightJoy[0] < -THRESHOLD) newKeys.add('arrowleft'); // Left

      // Update state only if changed to minimize re-renders
      setKinematicKeys(prev => {
        let changed = false;
        if (prev.size !== newKeys.size) changed = true;
        else {
           for (const k of newKeys) if (!prev.has(k)) { changed = true; break; }
        }
        return changed ? newKeys : prev;
      });

      requestRef.current = requestAnimationFrame(checkKinematics);
    };

    requestRef.current = requestAnimationFrame(checkKinematics);
    return () => cancelAnimationFrame(requestRef.current);
  }, [isKinematicEnabled]);

  const isActive = (key: string) => pressedKeys.has(key) || kinematicKeys.has(key);

  if (!cameraControlsEnabled) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 p-2 sm:p-4 flex justify-between items-end pointer-events-none z-30" aria-hidden="true">
      {/* Left Side: Movement */}
      <div className="flex items-end gap-3 pointer-events-auto">
        <div className="grid grid-cols-3 grid-rows-3 w-28 h-28 sm:w-40 sm:h-40">
          <div className="col-start-2 row-start-1 flex justify-center items-center">
            <DpadButton onPress={() => pressKey('w')} onRelease={() => releaseKey('w')} ariaLabel="Move Forward" isKeyPressed={isActive('w')}><ChevronUpIcon className="w-5 h-5 sm:w-7 sm:h-7" /></DpadButton>
          </div>
          <div className="col-start-1 row-start-2 flex justify-center items-center">
            <DpadButton onPress={() => pressKey('a')} onRelease={() => releaseKey('a')} ariaLabel="Move Left" isKeyPressed={isActive('a')}><ChevronLeftIcon className="w-5 h-5 sm:w-7 sm:h-7" /></DpadButton>
          </div>
          <div className="col-start-3 row-start-2 flex justify-center items-center">
            <DpadButton onPress={() => pressKey('d')} onRelease={() => releaseKey('d')} ariaLabel="Move Right" isKeyPressed={isActive('d')}><ChevronRightIcon className="w-5 h-5 sm:w-7 sm:h-7" /></DpadButton>
          </div>
          <div className="col-start-2 row-start-3 flex justify-center items-center">
            <DpadButton onPress={() => pressKey('s')} onRelease={() => releaseKey('s')} ariaLabel="Move Backward" isKeyPressed={isActive('s')}><ChevronDownIcon className="w-5 h-5 sm:w-7 sm:h-7" /></DpadButton>
          </div>
        </div>
        <div className="flex flex-col gap-2 h-28 sm:h-40 justify-center pb-1 sm:pb-2">
          <DpadButton onPress={() => pressKey('shift')} onRelease={() => releaseKey('shift')} ariaLabel="Move Down" className="!w-10 !h-16 sm:!w-12 sm:!h-20 !rounded-xl" isKeyPressed={isActive('shift')}><ChevronUpIcon className="w-5 h-5 sm:w-7 sm:h-7" /></DpadButton>
          <DpadButton onPress={() => pressKey(' ')} onRelease={() => releaseKey(' ')} ariaLabel="Move Up" className="!w-10 !h-16 sm:!w-12 sm:!h-20 !rounded-xl" isKeyPressed={isActive(' ')}><ChevronDownIcon className="w-5 h-5 sm:w-7 sm:h-7" /></DpadButton>
        </div>
      </div>
      
      {/* Center: Terraform Button */}
      <div className="absolute bottom-8 sm:bottom-14 left-1/2 -translate-x-1/2 pointer-events-auto">
        <TerraformButton onPress={handleTerraformPress} onRelease={handleTerraformRelease} power={terraformPower} />
      </div>

      {/* Right Side: Rotation */}
      <div className="pointer-events-auto">
        <div className="grid grid-cols-3 grid-rows-3 w-28 h-28 sm:w-40 sm:h-40">
          <div className="col-start-2 row-start-1 flex justify-center items-center">
            <DpadButton onPress={() => pressKey('arrowup')} onRelease={() => releaseKey('arrowup')} ariaLabel="Look Up" isKeyPressed={isActive('arrowup')}><ChevronUpIcon className="w-5 h-5 sm:w-7 sm:h-7" /></DpadButton>
          </div>
          <div className="col-start-1 row-start-2 flex justify-center items-center">
            <DpadButton onPress={() => pressKey('arrowleft')} onRelease={() => releaseKey('arrowleft')} ariaLabel="Look Left" isKeyPressed={isActive('arrowleft')}><ChevronLeftIcon className="w-5 h-5 sm:w-7 sm:h-7" /></DpadButton>
          </div>
          <div className="col-start-3 row-start-2 flex justify-center items-center">
            <DpadButton onPress={() => pressKey('arrowright')} onRelease={() => releaseKey('arrowright')} ariaLabel="Look Right" isKeyPressed={isActive('arrowright')}><ChevronRightIcon className="w-5 h-5 sm:w-7 sm:h-7" /></DpadButton>
          </div>
          <div className="col-start-2 row-start-3 flex justify-center items-center">
            <DpadButton onPress={() => pressKey('arrowdown')} onRelease={() => releaseKey('arrowdown')} ariaLabel="Look Down" isKeyPressed={isActive('arrowdown')}><ChevronDownIcon className="w-5 h-5 sm:w-7 sm:h-7" /></DpadButton>
          </div>
        </div>
      </div>
    </div>
  );
};
