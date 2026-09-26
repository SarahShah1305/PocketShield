import { AnimatedIcon } from "@/components/animated-icon";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useShakeDetector } from "@/hooks/use-shake-detector";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { NativeModules, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getEmergencyContacts } from "@/utils/storage";

export default function HomeScreen() {
  const router = useRouter();
  const [contactCount, setContactCount] = useState(0);
  const [showShakeDetected, setShowShakeDetected] = useState(false);
  const navigationPending = useRef(false);
  const shakeNavigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Best-effort: disable React Native's shake-to-open-dev-menu handler in debug builds.
    NativeModules.DevSettings?.setIsShakeToShowDevMenuEnabled?.(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      navigationPending.current = false;
      let active = true;
      void getEmergencyContacts().then((contacts) => {
        if (!active) return;
        setContactCount(contacts.length);
        if (contacts.length === 0) {
          console.log("No emergency contacts saved; opening required first-time setup");
          router.replace("/setup/contacts");
        }
      });
      return () => {
        active = false;
        if (shakeNavigationTimer.current) {
          clearTimeout(shakeNavigationTimer.current);
          shakeNavigationTimer.current = null;
        }
      };
    }, [router]),
  );

  useEffect(() => () => {
    if (shakeNavigationTimer.current) clearTimeout(shakeNavigationTimer.current);
  }, []);

  const handleShake = useCallback(() => {
    if (navigationPending.current) return;
    navigationPending.current = true;
    console.log("SHAKE DETECTED - opening camera");
    const shakeTime = Date.now().toString();
    setShowShakeDetected(true);
    shakeNavigationTimer.current = setTimeout(() => {
      setShowShakeDetected(false);
      router.push({ pathname: "/gesture", params: { shakeTime } });
      shakeNavigationTimer.current = null;
    }, 850);
  }, [router]);

  useShakeDetector(handleShake);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AnimatedIcon />
        <ThemedText type="title" style={styles.title}>
          Welcome to PocketShield
        </ThemedText>
        <ThemedText style={styles.hint}>
          Shake your phone three times to activate safety mode.
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/setup/contacts")}
          style={styles.editContactsButton}
        >
          <Text style={styles.editContactsText}>
            Edit emergency contacts ({contactCount})
          </Text>
        </Pressable>
      </SafeAreaView>
      {showShakeDetected ? (
        <View style={styles.shakeBanner} accessibilityLiveRegion="assertive">
          <Text style={styles.shakeBannerText}>Phone shake detected</Text>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  safeArea: {
    flex: 1,
    width: "100%",
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.four,
  },
  title: { textAlign: "center" },
  hint: { textAlign: "center" },
  editContactsButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: "rgba(34, 197, 94, 0.18)",
  },
  editContactsText: { color: "#22c55e", fontSize: 14, fontWeight: "600" },
  shakeBanner: {
    position: "absolute",
    top: 70,
    alignSelf: "center",
    backgroundColor: "#173c2b",
    borderColor: "#22c55e",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 12,
    zIndex: 10,
  },
  shakeBannerText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
