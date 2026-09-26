export type HandKeypoint = {
  name: string;
  x: number;
  y: number;
};

export const PREDEFINED_EMERGENCY_GESTURE = "thumbs_up" as const;
const MAX_WINDOW_MS = 60_000;

export function isRealEmergency(shakeTimestamp: number): boolean {
  const elapsed = Date.now() - shakeTimestamp;
  return elapsed >= 0 && elapsed <= MAX_WINDOW_MS;
}

/** Classifies an upright thumbs-up with the other four fingers curled. */
export function detectEmergencyGesture(
  keypoints: HandKeypoint[],
): "thumbs_up" | null {
  const points = new Map(keypoints.map((point) => [point.name, point]));
  const fingers = [
    ["index_finger_tip", "index_finger_pip"],
    ["middle_finger_tip", "middle_finger_pip"],
    ["ring_finger_tip", "ring_finger_pip"],
    ["pinky_finger_tip", "pinky_finger_pip"],
  ] as const;

  const fourFingersCurled = fingers.every(([tipName, pipName]) => {
    const tip = points.get(tipName);
    const pip = points.get(pipName);
    const wrist = points.get("wrist");
    if (!tip || !pip || !wrist) return false;
    const tipToWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const pipToWrist = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);
    return tipToWrist < pipToWrist * 1.18;
  });

  const thumbTip = points.get("thumb_tip");
  const thumbIp = points.get("thumb_ip");
  const thumbPointsUp = Boolean(thumbTip && thumbIp && thumbTip.y < thumbIp.y - 8);

  return fourFingersCurled && thumbPointsUp
    ? PREDEFINED_EMERGENCY_GESTURE
    : null;
}
