import { Accelerometer } from "expo-sensors";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";

// Expo reports acceleration in g units. Tune this on the target phone if needed.
const SHAKE_THRESHOLD = 0.65;
const SHAKES_NEEDED = 3;
const TIME_WINDOW_MS = 1500;
const MIN_GAP_BETWEEN_SHAKES_MS = 250;
const COOLDOWN_MS = 2000;
const SAMPLE_INTERVAL_MS = 50;

export function useShakeDetector(onShakeDetected: () => void) {
  const callbackRef = useRef(onShakeDetected);

  useEffect(() => {
    callbackRef.current = onShakeDetected;
  }, [onShakeDetected]);

  useFocusEffect(
    useCallback(() => {
      let previous = { x: 0, y: 0, z: 0 };
      let hasPreviousReading = false;
      let lastShakeTime = 0;
      let cooldownUntil = 0;
      const shakeTimestamps: number[] = [];

      Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
      const subscription = Accelerometer.addListener(({ x, y, z }) => {
        if (!hasPreviousReading) {
          previous = { x, y, z };
          hasPreviousReading = true;
          return;
        }

        const change = Math.hypot(x - previous.x, y - previous.y, z - previous.z);
        previous = { x, y, z };
        const now = Date.now();

        if (now < cooldownUntil || change < SHAKE_THRESHOLD) return;
        if (now - lastShakeTime < MIN_GAP_BETWEEN_SHAKES_MS) return;

        lastShakeTime = now;
        shakeTimestamps.push(now);
        while (shakeTimestamps.length && now - shakeTimestamps[0] > TIME_WINDOW_MS) {
          shakeTimestamps.shift();
        }

        console.log(`Shake jolt ${shakeTimestamps.length}/${SHAKES_NEEDED}`);
        if (shakeTimestamps.length >= SHAKES_NEEDED) {
          shakeTimestamps.length = 0;
          cooldownUntil = now + COOLDOWN_MS;
          console.log("SHAKE DETECTED - opening camera");
          callbackRef.current();
        }
      });

      return () => subscription.remove();
    }, []),
  );
}
