import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMicrophonePermissions } from "expo-camera";
import {
  EMERGENCY_GESTURES,
  type EmergencyGesture,
  getSelectedGestures,
  saveSelectedGestures,
} from "@/utils/storage";

export default function GestureSetupScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<EmergencyGesture[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();

  useEffect(() => {
    void getSelectedGestures().then((gestures) => {
      setSelected(gestures);
      setLoaded(true);
    });
  }, []);

  function toggleGesture(gesture: EmergencyGesture) {
    setSelected((current) => {
      if (current.includes(gesture)) return current.filter((item) => item !== gesture);
      if (current.length >= 2) {
        Alert.alert("Choose up to two", "Remove one selected gesture before choosing another.");
        return current;
      }
      return [...current, gesture];
    });
  }

  async function save() {
    if (selected.length === 0) {
      Alert.alert("Choose a gesture", "Select at least one gesture to activate safety mode.");
      return;
    }
    await saveSelectedGestures(selected);
    const saved = await getSelectedGestures();
    if (saved.length !== selected.length || selected.some((gesture) => !saved.includes(gesture))) {
      Alert.alert("Could not save gestures", "Please try again.");
      return;
    }
    // Ask during setup so recording an emergency clip never interrupts the user.
    // Permission denial is valid: video-alert will record a silent clip.
    try {
      await requestMicrophonePermission();
    } catch (error) {
      console.log("Microphone permission was not granted during setup:", error);
    }
    router.replace("/");
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.eyebrow}>SAFETY SETUP · FINAL STEP</Text>
      <Text style={styles.title}>Choose your emergency gesture</Text>
      <Text style={styles.subtitle}>
        After a shake, show either gesture you select. Just one matching gesture is enough to continue.
      </Text>
      <Text style={styles.permissionHint}>
        {microphonePermission?.granted
          ? "Microphone access is enabled. Emergency videos can include sound."
          : microphonePermission && !microphonePermission.canAskAgain
            ? "Microphone access is off. Emergency videos will be silent; you can enable it later in iPhone Settings."
            : "When you continue, iPhone will ask for microphone access so emergency videos can include sound. If you decline, videos will be silent and recording will still work."}
      </Text>
      <Text style={styles.count}>{selected.length} of 2 selected</Text>
      <View style={styles.options}>
        {EMERGENCY_GESTURES.map((gesture) => {
          const active = selected.includes(gesture.id);
          return (
            <TouchableOpacity
              key={gesture.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              style={[styles.option, active && styles.optionSelected]}
              onPress={() => toggleGesture(gesture.id)}
            >
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>{gesture.label}</Text>
                <Text style={styles.optionDescription}>{gesture.description}</Text>
              </View>
              <Text style={[styles.check, active && styles.checkSelected]}>{active ? "✓" : "＋"}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={[styles.saveButton, (!loaded || selected.length === 0) && styles.disabled]} onPress={() => void save()} disabled={!loaded}>
        <Text style={styles.saveText}>Save my gestures</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 20 },
  eyebrow: { color: "#22c55e", fontSize: 12, fontWeight: "700", letterSpacing: 1.2, marginTop: 16 },
  title: { color: "#fff", fontSize: 25, fontWeight: "800", marginTop: 12 },
  subtitle: { color: "#c7c7cc", fontSize: 15, lineHeight: 22, marginTop: 10 },
  permissionHint: { color: "#a1a1aa", fontSize: 13, lineHeight: 19, marginTop: 10 },
  count: { color: "#22c55e", fontSize: 14, fontWeight: "700", marginTop: 22, marginBottom: 10 },
  options: { gap: 10 },
  option: { minHeight: 76, borderRadius: 14, borderWidth: 1, borderColor: "#3a3a3c", backgroundColor: "#1c1c1e", padding: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionSelected: { borderColor: "#22c55e", backgroundColor: "#123522" },
  optionCopy: { flex: 1, paddingRight: 12 },
  optionTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  optionDescription: { color: "#c7c7cc", fontSize: 13, marginTop: 4 },
  check: { color: "#8e8e93", fontSize: 22, fontWeight: "700" },
  checkSelected: { color: "#22c55e" },
  saveButton: { backgroundColor: "#22c55e", borderRadius: 24, alignItems: "center", paddingVertical: 15, marginTop: 24 },
  disabled: { opacity: 0.55 },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
