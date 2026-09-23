// src/hooks/use-shake-detector.ts
// PocketShield — Phone Shake Detection hook
// Works on iPhone and Android via Expo's shared sensor API.

import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';

// --- Tunable settings ---
// Adjust these after testing on a real phone.
const SHAKE_THRESHOLD = 1.8;      // how sharp a jolt counts as "part of a shake"
const SHAKES_NEEDED = 3;          // how many jolts in a row count as a real shake gesture
const TIME_WINDOW_MS = 1000;      // all jolts must happen within this many milliseconds
const COOLDOWN_MS = 1500;         // ignore new shakes for this long after one is detected
const SAMPLE_INTERVAL_MS = 50;    // how often we read the sensor (50ms = 20 readings/sec)

/**
 * useShakeDetector
 * Call this inside any screen and pass in a function to run when a
 * real shake is detected (e.g. Person 4's alert trigger).
 *
 * Usage:
 *   useShakeDetector(() => {
 *     triggerEmergencyAlert(); // <- Person 4's function, later
 *   });
 */
export function useShakeDetector(onShakeDetected: () => void) {
  const [lastMagnitude, setLastMagnitude] = useState(0);
  const shakeTimestamps = useRef<number[]>([]);
  const inCooldown = useRef(false);

  useEffect(() => {
    Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      // 1. Compute total force magnitude from all 3 axes
      const magnitude = Math.sqrt(x * x + y * y + z * z);

      // 2. Remove gravity's constant baseline (~1.0 in Expo's normalized units,
      //    where 1.0 = 9.8 m/s^2). What's left is just the "extra" motion.
      const delta = Math.abs(magnitude - 1.0);

      setLastMagnitude(magnitude);

      if (inCooldown.current) return; // ignore readings right after a detected shake

      const now = Date.now();

      // 3. If this reading is a sharp enough jolt, record it
      if (delta > SHAKE_THRESHOLD) {
        shakeTimestamps.current.push(now);

        // 4. Drop any jolts older than our time window
        shakeTimestamps.current = shakeTimestamps.current.filter(
          (t) => now - t <= TIME_WINDOW_MS
        );

        // 5. If we've hit enough jolts inside the window, it's a real shake
        if (shakeTimestamps.current.length >= SHAKES_NEEDED) {
          shakeTimestamps.current = [];
          inCooldown.current = true;

          onShakeDetected(); // <-- the "signal to Person 4"

          setTimeout(() => {
            inCooldown.current = false;
          }, COOLDOWN_MS);
        }
      }
    });

    return () => subscription.remove();
  }, [onShakeDetected]);

  return { lastMagnitude }; // handy for a live debug readout on screen
}