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
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { getEmergencyContacts } from "@/utils/storage";
import {
  detectEmergencyGesture,
  isRealEmergency,
  PREDEFINED_EMERGENCY_GESTURE,
} from "@/logic/ai-decision";

const DETECTION_INTERVAL_MS = 700;
const GESTURE_CONFIRMATION_FRAMES = 3;
const CAMERA_TIMEOUT_MS = 60_000;

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
    let hasLoggedHandLandmarks = false;
    let noHandFrames = 0;
    const timeout = setTimeout(() => {
      cancelled = true;
      console.log("Gesture check timed out");
      router.back();
    }, CAMERA_TIMEOUT_MS);

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
            setStatus("Hand detected. Hold a clear thumbs-up steady.");
          }
          const detectedGesture = hands[0]
            ? detectEmergencyGesture(
                hands[0].keypoints.map((point) => ({
                  name: point.name ?? "",
                  x: point.x,
                  y: point.y,
                })),
              )
            : null;

          if (detectedGesture === PREDEFINED_EMERGENCY_GESTURE) {
            confirmationCount.current += 1;
            setStatus(
              `Thumbs-up recognized ${confirmationCount.current}/${GESTURE_CONFIRMATION_FRAMES}`,
            );
          } else {
            confirmationCount.current = 0;
          }

          console.log(
            `Gesture frames ${confirmationCount.current}/${GESTURE_CONFIRMATION_FRAMES}`,
          );

          if (
            confirmationCount.current >= GESTURE_CONFIRMATION_FRAMES &&
            isRealEmergency(shakeTimestamp)
          ) {
            alreadyAlerted.current = true;
            cancelled = true;
            clearTimeout(timeout);
            console.log("Predefined thumbs-up gesture confirmed");
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

            setStatus("Thumbs-up detected. Continue to get GPS and choose recipients.");
            Alert.alert(
              "Gesture detected",
              "Thumbs-up confirmed. Continue to get your GPS location, then choose which contacts to alert.",
              [
                {
                  text: "Continue",
                  onPress: () => {
                    setStatus("Getting GPS and loading saved contacts…");
                    router.replace("/alert-recipients");
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
        const detector = await loadHandDetector();
        if (cancelled) return;
        setStatus("Show a thumbs-up to confirm the emergency.");
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
