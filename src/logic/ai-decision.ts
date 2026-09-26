export type HandKeypoint = {
  name: string;
  x: number;
  y: number;
};

import type { EmergencyGesture } from "@/utils/storage";

const MAX_WINDOW_MS = 60_000;

export function isRealEmergency(shakeTimestamp: number): boolean {
  const elapsed = Date.now() - shakeTimestamp;
  return elapsed >= 0 && elapsed <= MAX_WINDOW_MS;
}

/** Classifies the four supported hand shapes from MediaPipe hand landmarks. */
export function detectEmergencyGestures(keypoints: HandKeypoint[]): EmergencyGesture[] {
  const points = new Map(keypoints.map((point) => [point.name, point]));
  const fingers = [
    ["index_finger_tip", "index_finger_pip"],
    ["middle_finger_tip", "middle_finger_pip"],
    ["ring_finger_tip", "ring_finger_pip"],
    ["pinky_finger_tip", "pinky_finger_pip"],
  ] as const;

  const fingerStates = fingers.map(([tipName, pipName]) => {
    const tip = points.get(tipName);
    const pip = points.get(pipName);
    const wrist = points.get("wrist");
    if (!tip || !pip || !wrist) return null;
    const tipToWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const pipToWrist = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);
    return tipToWrist > pipToWrist * 1.18;
  });
  if (fingerStates.some((state) => state === null)) return [];
  const extended = fingerStates as boolean[];
  const curledCount = extended.filter((state) => !state).length;

  const thumbTip = points.get("thumb_tip");
  const thumbIp = points.get("thumb_ip");
  const thumbPointsUp = Boolean(thumbTip && thumbIp && thumbTip.y < thumbIp.y - 8);
  const results: EmergencyGesture[] = [];

  if (curledCount === 4 && thumbPointsUp) results.push("thumbs_up");
  if (extended.every(Boolean)) results.push("open_palm");
  if (extended[0] && extended[1] && !extended[2] && !extended[3]) results.push("peace_sign");
  if (curledCount === 4 && !thumbPointsUp) results.push("fist");
  return results;
}
