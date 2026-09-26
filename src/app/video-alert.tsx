import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  type CameraView as CameraViewType,
} from "expo-camera";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const MAX_RECORDING_SECONDS = 10;

export default function VideoAlertScreen() {
  const cameraRef = useRef<CameraViewType>(null);
  const cameraReady = useRef(false);
  const startupRetries = useRef(0);
  const recordingStarted = useRef(false);
  const recordingActive = useRef(false);
  const mounted = useRef(true);
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [microphonePermission] = useMicrophonePermissions();
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState("Opening safety camera…");
  const [clipUri, setClipUri] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recordingActive.current) cameraRef.current?.stopRecording();
    };
  }, []);

  async function shareClip(uri: string) {
    setSharing(true);
    setStatus("Choose WhatsApp, then choose the contact or group for the video.");
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("Video sharing is not available on this device.");
      }
      await Sharing.shareAsync(uri, {
        dialogTitle: "Choose WhatsApp and a video recipient",
        mimeType: Platform.OS === "android" ? "video/mp4" : undefined,
        UTI: Platform.OS === "ios" ? "public.movie" : undefined,
      });
      if (mounted.current) router.replace("/");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (mounted.current) {
        setStatus(`Could not open sharing options: ${message}`);
        setSharing(false);
      }
    }
  }

  function startRecording() {
    if (recordingStarted.current || !cameraReady.current || !cameraRef.current) return;
    recordingStarted.current = true;
    recordingActive.current = true;
    setRetryAvailable(false);
    setStatus(
      microphonePermission?.granted
        ? "Recording video with audio… tap Stop when you have enough."
        : "Recording silent video… tap Stop when you have enough.",
    );
    const startedAt = Date.now();
    const ticker = setInterval(() => {
      const elapsed = Math.min(MAX_RECORDING_SECONDS, Math.floor((Date.now() - startedAt) / 1_000));
      if (mounted.current) setSeconds(elapsed);
    }, 200);

    void cameraRef.current.recordAsync({ maxDuration: MAX_RECORDING_SECONDS }).then((video) => {
      clearInterval(ticker);
      recordingActive.current = false;
      if (!video?.uri) {
        if (mounted.current) setStatus("No video was recorded. Return to PocketShield and try again.");
        return;
      }
      if (!mounted.current) return;
      setClipUri(video.uri);
      setSeconds(Math.min(MAX_RECORDING_SECONDS, Math.max(1, Math.floor((Date.now() - startedAt) / 1_000))));
      setStatus("Video ready. Choose WhatsApp and select who should receive it.");
      void shareClip(video.uri);
    }).catch((error: unknown) => {
      clearInterval(ticker);
      recordingActive.current = false;
      recordingStarted.current = false;
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("CameraOutputNotReadyException") && startupRetries.current < 2) {
        startupRetries.current += 1;
        if (mounted.current) {
          setStatus("Camera is still starting. Retrying automatically…");
          setTimeout(startRecording, 600);
        }
        return;
      }
      if (mounted.current) {
        setRetryAvailable(true);
        setStatus(
          message.includes("CameraOutputNotReadyException")
            ? "Camera is still starting. Tap Record again in a moment."
            : `Video recording failed: ${message}`,
        );
      }
    });
  }

  if (!permission) {
    return <Message text="Checking camera permission…" />;
  }
  if (!permission.granted) {
    return (
      <Message
        text="Camera access is needed to record the emergency video. Enable it for PocketShield in iPhone Settings."
        onBack={() => router.replace("/")}
      />
    );
  }
  return (
    <View style={styles.container}>
      {clipUri ? (
        <View style={styles.camera} />
      ) : (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="front"
          mode="video"
          mute={!microphonePermission?.granted}
          onCameraReady={() => {
            cameraReady.current = true;
            startRecording();
          }}
        />
      )}
      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.title}>Emergency video</Text>
          <Text style={styles.status}>{clipUri ? status : `${status}  ${seconds}/${MAX_RECORDING_SECONDS} seconds`}</Text>
          {sharing ? <ActivityIndicator color="#fff" /> : null}
          {clipUri && !sharing ? (
            <Pressable style={styles.button} onPress={() => void shareClip(clipUri)}>
              <Text style={styles.buttonText}>Share video</Text>
            </Pressable>
          ) : null}
          {!clipUri && recordingActive.current ? (
            <Pressable style={styles.stopButton} onPress={() => cameraRef.current?.stopRecording()}>
              <Text style={styles.buttonText}>Stop and share</Text>
            </Pressable>
          ) : null}
          {!clipUri && !recordingActive.current && retryAvailable ? (
            <Pressable style={styles.button} onPress={startRecording}>
              <Text style={styles.buttonText}>Try recording again</Text>
            </Pressable>
          ) : null}
          {clipUri && !sharing ? (
            <Pressable style={styles.cancelButton} onPress={() => router.replace("/")}>
              <Text style={styles.buttonText}>Finish</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

function Message({ text, onBack }: { text: string; onBack?: () => void }) {
  return (
    <SafeAreaView style={styles.messageScreen}>
      <Text style={styles.status}>{text}</Text>
      {onBack ? (
        <Pressable style={styles.button} onPress={onBack}>
          <Text style={styles.buttonText}>Return to PocketShield</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, justifyContent: "flex-end", padding: 16 },
  panel: { backgroundColor: "rgba(0,0,0,0.78)", borderRadius: 16, padding: 18, gap: 12, alignItems: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  status: { color: "#fff", textAlign: "center", fontSize: 15, lineHeight: 21 },
  button: { backgroundColor: "#22c55e", borderRadius: 24, paddingVertical: 13, paddingHorizontal: 22, alignItems: "center", width: "100%" },
  stopButton: { backgroundColor: "#dc2626", borderRadius: 24, paddingVertical: 13, paddingHorizontal: 22, alignItems: "center", width: "100%" },
  cancelButton: { backgroundColor: "#3a3a3c", borderRadius: 24, paddingVertical: 13, paddingHorizontal: 22, alignItems: "center", width: "100%" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  messageScreen: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 24, gap: 18 },
});
