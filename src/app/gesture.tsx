import { CameraView, useCameraPermissions, type CameraView as CameraViewType } from "expo-camera";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-react-native";
import {
  createDetector,
  SupportedModels,
  type HandDetector,
} from "@tensorflow-models/hand-pose-detection";
import { decodeJpeg } from "@tensorflow/tfjs-react-native";
import { toByteArray } from "base64-js";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Share, StyleSheet, Text, View } from "react-native";
import {
  EMERGENCY_GESTURES,
  getEmergencyContacts,
  getSelectedGestures,
  type EmergencyGesture,
} from "@/utils/storage";
import {
  getEmergencyLocationText,
  openEmergencySmsSeparately,
  openEmergencyWhatsAppShare,
} from "@/services/alert-service";
import {
  detectEmergencyGestures,
  isRealEmergency,
} from "@/logic/ai-decision";

const DETECTION_INTERVAL_MS = 200;
const GESTURE_HOLD_DURATION_MS = 2_000;
const CAMERA_TIMEOUT_MS = 60_000;

  function gestureLabel(gesture: EmergencyGesture): string {
  return EMERGENCY_GESTURES.find((item) => item.id === gesture)?.label ?? "Gesture";
}

let detectorPromise: Promise<HandDetector> | null = null;

function loadHandDetector(): Promise<HandDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      await tf.setBackend("rn-webgl");
      await tf.ready();
      return createDetector(SupportedModels.MediaPipeHands, {
        runtime: "tfjs",
        modelType: "lite",
        maxHands: 1,
      });
    })();
  }
  return detectorPromise;
}

export default function GestureScreen() {
  const cameraRef = useRef<CameraViewType>(null);
  const confirmationCount = useRef(0);
  const alreadyAlerted = useRef(false);
  const router = useRouter();
  const { shakeTime } = useLocalSearchParams<{ shakeTime?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [status, setStatus] = useState("Preparing safety camera…");
  const [error, setError] = useState<string | null>(null);

  const parsedShakeTime = Number(shakeTime);
  const shakeTimestamp = Number.isFinite(parsedShakeTime) && parsedShakeTime > 0
    ? parsedShakeTime
    : Date.now();

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!permission?.granted || !cameraReady) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let selectedGestures: EmergencyGesture[] = [];
    let confirmedGesture: EmergencyGesture | null = null;
    let holdStartedAt = 0;
    let locationPromise: Promise<string> | null = null;
    let hasLoggedHandLandmarks = false;
    let noHandFrames = 0;
    const timeout = setTimeout(() => {
      cancelled = true;
      console.log("Gesture check timed out");
      router.back();
    }, CAMERA_TIMEOUT_MS);

    function promptForVideo(message: string) {
      Alert.alert(
        "Send a video too?",
        message,
        [
          { text: "Not now", style: "cancel", onPress: () => router.replace("/") },
          { text: "Record video", onPress: () => router.replace("/video-alert") },
        ],
        { cancelable: false },
      );
    }

    async function inspectFrame(detector: HandDetector) {
      if (cancelled || alreadyAlerted.current) return;

      try {
        const picture = await cameraRef.current?.takePictureAsync({
          quality: 0.25,
          shutterSound: false,
        });

        if (!picture?.uri) {
          timer = setTimeout(() => void inspectFrame(detector), DETECTION_INTERVAL_MS);
          return;
        }

        const smallPicture = await manipulateAsync(
          picture.uri,
          [{ resize: { width: 480 } }],
          { base64: true, compress: 0.45, format: SaveFormat.JPEG },
        );
        if (!smallPicture.base64) {
          timer = setTimeout(() => void inspectFrame(detector), DETECTION_INTERVAL_MS);
          return;
        }

        const image = decodeJpeg(toByteArray(smallPicture.base64));
        try {
          const hands = await detector.estimateHands(image, { flipHorizontal: true });
          if (hands.length > 0 && !hasLoggedHandLandmarks) {
            hasLoggedHandLandmarks = true;
            console.log(
              "Hand landmarks:",
              hands[0].keypoints.map((point) => ({
                name: point.name,
                x: Math.round(point.x),
                y: Math.round(point.y),
              })),
            );
          } else if (hands.length === 0 && noHandFrames < 3) {
            noHandFrames += 1;
            console.log("Hand detector found no hand in frame", noHandFrames);
          }
          if (hands.length === 0) {
            setStatus("No hand detected. Hold your full hand in the camera view.");
          } else {
            setStatus("Hand detected. Show one of your saved gestures clearly.");
          }
          const detectedGestures = hands[0]
            ? detectEmergencyGestures(
                hands[0].keypoints.map((point) => ({
                  name: point.name ?? "",
                  x: point.x,
                  y: point.y,
                })),
              )
            : [];
          const detectedGesture = selectedGestures.find((gesture) => detectedGestures.includes(gesture)) ?? null;

          if (detectedGesture) {
            if (confirmedGesture !== detectedGesture) {
              confirmedGesture = detectedGesture;
              holdStartedAt = Date.now();
            }
            const holdMs = Date.now() - holdStartedAt;
            confirmationCount.current = Math.min(holdMs, GESTURE_HOLD_DURATION_MS);
            setStatus(
              `Hold ${gestureLabel(detectedGesture)} for ${Math.max(0, (GESTURE_HOLD_DURATION_MS - holdMs) / 1_000).toFixed(1)} more seconds`,
            );
          } else {
            confirmationCount.current = 0;
            confirmedGesture = null;
            holdStartedAt = 0;
          }

          console.log(
            `Gesture hold ${confirmationCount.current}/${GESTURE_HOLD_DURATION_MS}ms`,
          );

          if (
            confirmationCount.current >= GESTURE_HOLD_DURATION_MS &&
            isRealEmergency(shakeTimestamp)
          ) {
            alreadyAlerted.current = true;
            cancelled = true;
            clearTimeout(timeout);
            const label = gestureLabel(confirmedGesture ?? selectedGestures[0]);
            console.log(`Saved ${label} gesture confirmed`);
            const contacts = await getEmergencyContacts();
            if (contacts.length === 0) {
              setStatus("No emergency contact has been saved.");
              Alert.alert(
                "Gesture detected",
                "No emergency contact is saved yet. Set up a contact before testing the alert.",
                [{ text: "OK" }],
              );
              return;
            }

            setStatus(`${label} detected. Preparing SMS to all saved contacts.`);
            Alert.alert(
              "Emergency gesture detected",
              `${label} confirmed. Choose how to share your alert. SMS opens a separate draft for each saved contact; tap Send once per person. WhatsApp opens the share sheet so you can choose an individual chat or a group.`,
              [
                {
                  text: "Cancel",
                  style: "cancel",
                },
                {
                  text: "SMS separately",
                  onPress: () => {
                    void (async () => {
                      try {
                        setStatus("Opening a separate SMS draft for each contact…");
                        const location = await (locationPromise ?? getEmergencyLocationText());
                        const result = await openEmergencySmsSeparately(contacts, location);
                        if (result.cancelled) {
                          setStatus(`SMS stopped after ${result.sent} of ${result.total} contacts.`);
                        } else if (result.unverified > 0) {
                          setStatus(`Opened SMS drafts for ${result.total} contacts; delivery could not be confirmed by the device.`);
                        } else {
                          setStatus(`Messages reports send was initiated for ${result.sent} contacts; delivery is not confirmed.`);
                        }
                        if (result.sent + result.unverified > 0) {
                          promptForVideo("Record up to 10 seconds, then choose WhatsApp and select who should receive the clip.");
                        }
                      } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        setStatus("Could not open the emergency SMS draft.");
                        Alert.alert("Could not open SMS", message);
                      }
                    })();
                  },
                },
                {
                  text: "WhatsApp",
                  onPress: () => {
                    void (async () => {
                      try {
                        setStatus("Opening WhatsApp sharing options…");
                        const location = await (locationPromise ?? getEmergencyLocationText());
                        const result = await openEmergencyWhatsAppShare(location);
                        if (result.action === Share.dismissedAction) {
                          setStatus("WhatsApp sharing cancelled.");
                        } else {
                          setStatus("WhatsApp sharing returned.");
                          promptForVideo("If you sent the alert, record up to 10 seconds and choose WhatsApp recipients for the clip.");
                        }
                      } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        setStatus("Could not open sharing options.");
                        Alert.alert("Could not open sharing options", message);
                      }
                    })();
                  },
                },
              ],
              { cancelable: false },
            );
            return;
          }
        } finally {
          image.dispose();
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        console.log("Gesture detection error:", message);
        setError("Gesture detection could not start. Check the terminal log.");
        cancelled = true;
        clearTimeout(timeout);
        return;
      }

      if (!cancelled) {
        timer = setTimeout(() => void inspectFrame(detector), DETECTION_INTERVAL_MS);
      }
    }

    void (async () => {
      try {
        setStatus("Loading hand detector…");
        selectedGestures = await getSelectedGestures();
        if (selectedGestures.length === 0) {
          router.replace("/setup/gestures");
          return;
        }
        locationPromise = getEmergencyLocationText();
        const detector = await loadHandDetector();
        if (cancelled) return;
        setStatus(`Hold ${selectedGestures.map(gestureLabel).join(" or ")} steadily for 2 seconds.`);
        await inspectFrame(detector);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        console.log("Unable to load hand detector:", message);
        setError("Hand detector failed to load. Check internet and the terminal log.");
        cancelled = true;
        clearTimeout(timeout);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (timer) clearTimeout(timer);
    };
  }, [cameraReady, permission?.granted, router, shakeTimestamp]);

  if (!permission) {
    return <MessageScreen text="Checking camera permission…" />;
  }

  if (!permission.granted) {
    return (
      <MessageScreen
        text="Camera access is required. Enable it for PocketShield in iPhone Settings."
      />
    );
  }

  if (error) return <MessageScreen text={error} />;

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="front"
        onCameraReady={() => setCameraReady(true)}
      />
      <View pointerEvents="none" style={styles.statusPanel}>
        {status.includes("Loading") || status.includes("Preparing") ? (
          <ActivityIndicator color="#fff" />
        ) : null}
        <Text style={styles.status}>{status}</Text>
      </View>
    </View>
  );
}

function MessageScreen({ text }: { text: string }) {
  return (
    <View style={styles.messageScreen}>
      <Text style={styles.message}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  statusPanel: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 28,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  status: { color: "#fff", textAlign: "center", fontSize: 16 },
  messageScreen: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  message: { color: "#fff", textAlign: "center", fontSize: 16 },
});
