import { AnimatedIcon } from "@/components/animated-icon";
import { MaxContentWidth } from "@/constants/theme";
import { useShakeDetector } from "@/hooks/use-shake-detector";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Modal,
  NativeModules,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  EMERGENCY_GESTURES,
  getEmergencyContacts,
  getSelectedGestures,
} from "@/utils/storage";

export default function HomeScreen() {
  const router = useRouter();
  const [contactCount, setContactCount] = useState(0);
  const [gestureLabels, setGestureLabels] = useState<string[]>([]);
  const [showShakeDetected, setShowShakeDetected] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const lightBlueRotation = useRef(new Animated.Value(0)).current;
  const deepBlueRotation = useRef(new Animated.Value(0)).current;
  const menuProgress = useRef(new Animated.Value(-340)).current;
  const navigationPending = useRef(false);
  const shakeNavigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    NativeModules.DevSettings?.setIsShakeToShowDevMenuEnabled?.(false);
  }, []);

  useEffect(() => {
    const lightDrift = Animated.loop(Animated.timing(lightBlueRotation, {
      toValue: 1,
      duration: 14000,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    const deepDrift = Animated.loop(Animated.timing(deepBlueRotation, {
      toValue: 1,
      duration: 18500,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    lightDrift.start();
    deepDrift.start();
    return () => {
      lightDrift.stop();
      deepDrift.stop();
    };
  }, [lightBlueRotation, deepBlueRotation]);

  const lightBlueAngle = lightBlueRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const deepBlueAngle = deepBlueRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["360deg", "0deg"],
  });

  useFocusEffect(
    useCallback(() => {
      navigationPending.current = false;
      let active = true;
      void Promise.all([getEmergencyContacts(), getSelectedGestures()]).then(([contacts, gestures]) => {
        if (!active) return;
        setContactCount(contacts.length);
        setGestureLabels(gestures.map((id) => EMERGENCY_GESTURES.find((item) => item.id === id)?.label ?? id));
        if (contacts.length === 0) router.replace("/setup/contacts");
        else if (gestures.length === 0) router.replace("/setup/gestures");
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
    const shakeTime = Date.now().toString();
    setShowShakeDetected(true);
    shakeNavigationTimer.current = setTimeout(() => {
      setShowShakeDetected(false);
      router.push({ pathname: "/gesture", params: { shakeTime } });
      shakeNavigationTimer.current = null;
    }, 850);
  }, [router]);

  useShakeDetector(handleShake);

  function openMenu() {
    setMenuVisible(true);
    menuProgress.setValue(-340);
    Animated.spring(menuProgress, {
      toValue: 0,
      damping: 24,
      stiffness: 190,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }

  function closeMenu() {
    Animated.timing(menuProgress, {
      toValue: -340,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setMenuVisible(false));
  }

  function openSetup(path: "/setup/contacts" | "/setup/gestures") {
    closeMenu();
    setTimeout(() => router.push(path), 190);
  }

  return (
    <View style={styles.container}>
      <View style={styles.gradientBase} />
      <Animated.View style={[styles.colorOrbit, { transform: [{ rotate: lightBlueAngle }] }]}>
        <Image source={require("@/assets/images/blue-light-field.png")} resizeMode="stretch" style={styles.colorField} accessibilityIgnoresInvertColors />
      </Animated.View>
      <Animated.View style={[styles.colorOrbit, { transform: [{ rotate: deepBlueAngle }] }]}>
        <Image source={require("@/assets/images/blue-deep-field.png")} resizeMode="stretch" style={styles.colorField} accessibilityIgnoresInvertColors />
      </Animated.View>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.screen}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open safety settings"
              onPress={openMenu}
              style={({ pressed }) => [styles.menuButton, pressed && styles.menuButtonPressed]}
            >
              <View style={styles.menuLine} />
              <View style={[styles.menuLine, styles.menuLineShort]} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.heroScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.hero}>
              <AnimatedIcon />
              <Text style={styles.title}>Welcome to PocketShield</Text>
              <Text style={styles.description}>Shake your phone to begin.</Text>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>

      {showShakeDetected ? (
        <View style={styles.shakeBanner} accessibilityLiveRegion="assertive">
          <Text style={styles.shakeBannerText}>Shake detected · Opening safety mode</Text>
        </View>
      ) : null}

      <Modal visible={menuVisible} transparent animationType="none" statusBarTranslucent onRequestClose={closeMenu}>
        <View style={styles.drawerRoot}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close menu" style={styles.scrim} onPress={closeMenu} />
          <Animated.View style={[styles.drawer, { transform: [{ translateX: menuProgress }] }]}>
            <SafeAreaView style={styles.drawerSafeArea}>
              <ScrollView contentContainerStyle={styles.drawerContent}>
                <View style={styles.drawerHeader}>
                  <View>
                    <Text style={styles.drawerEyebrow}>POCKETSHIELD</Text>
                    <Text style={styles.drawerTitle}>Your setup</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={closeMenu} style={styles.closeButton}>
                    <Text style={styles.closeText}>×</Text>
                  </Pressable>
                </View>
                <Text style={styles.drawerIntro}>Keep your trusted contacts and safety gesture up to date.</Text>
                <Text style={styles.drawerSectionLabel}>SAFETY SETTINGS</Text>
                <DrawerRow
                  symbol="♡"
                  title="Emergency contacts"
                  detail={`${contactCount} ${contactCount === 1 ? "person" : "people"} selected`}
                  onPress={() => openSetup("/setup/contacts")}
                />
                <DrawerRow
                  symbol="✦"
                  title="Safety gestures"
                  detail={gestureLabels.length ? gestureLabels.join("  ·  ") : "Choose up to two"}
                  onPress={() => openSetup("/setup/gestures")}
                />
                <View style={styles.drawerFooter}>
                  <Text style={styles.drawerFooterTitle}>Made for peace of mind</Text>
                  <Text style={styles.drawerFooterBody}>Your setup stays on this device.</Text>
                </View>
              </ScrollView>
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

function DrawerRow({
  symbol,
  title,
  detail,
  onPress,
}: {
  symbol: string;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.drawerRow, pressed && styles.drawerRowPressed]}>
      <View style={styles.drawerSymbolWrap}><Text style={styles.drawerSymbol}>{symbol}</Text></View>
      <View style={styles.drawerRowCopy}>
        <Text style={styles.drawerRowTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.drawerRowDetail}>{detail}</Text>
      </View>
      <Text style={styles.drawerChevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#3679a8", overflow: "hidden" },
  gradientBase: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#3679a8" },
  colorOrbit: { position: "absolute", top: "-25%", left: "-25%", width: "150%", height: "150%" },
  colorField: { width: "100%", height: "100%" },
  safeArea: { flex: 1, width: "100%", maxWidth: MaxContentWidth, alignSelf: "center" },
  screen: { flex: 1, paddingHorizontal: 27, paddingTop: 10, paddingBottom: 14 },
  header: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
  menuButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(18,39,91,0.26)", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)", alignItems: "center", justifyContent: "center", gap: 5 },
  menuButtonPressed: { opacity: 0.65, transform: [{ scale: 0.97 }] },
  menuLine: { width: 17, height: 1.6, borderRadius: 1, backgroundColor: "#ffffff" },
  menuLineShort: { width: 11, alignSelf: "flex-start", marginLeft: 13 },
  heroScroll: { flexGrow: 1, justifyContent: "center", paddingBottom: 14 },
  hero: { alignItems: "center", paddingTop: 0, transform: [{ translateY: -34 }] },
  title: { color: "#ffffff", fontSize: 31, lineHeight: 38, fontWeight: "700", letterSpacing: -0.45, textAlign: "center", marginTop: 12, maxWidth: 330 },
  description: { color: "rgba(244,249,255,0.9)", fontSize: 16, lineHeight: 24, textAlign: "center", marginTop: 12 },
  shakeBanner: { position: "absolute", top: 65, alignSelf: "center", backgroundColor: "#183966", borderColor: "#75ccde", borderWidth: 1, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12, zIndex: 10, shadowColor: "#112452", shadowOpacity: 0.2, shadowRadius: 16, elevation: 4 },
  shakeBannerText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  drawerRoot: { flex: 1, flexDirection: "row", backgroundColor: "rgba(16,35,72,0.3)" },
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(16,35,72,0.24)" },
  drawer: { width: "82%", maxWidth: 340, height: "100%", backgroundColor: "#f4f8fc", borderTopRightRadius: 28, borderBottomRightRadius: 28, overflow: "hidden", shadowColor: "#142f53", shadowOpacity: 0.18, shadowRadius: 25, elevation: 14 },
  drawerSafeArea: { flex: 1 },
  drawerContent: { flexGrow: 1, paddingHorizontal: 23, paddingTop: 20, paddingBottom: 28 },
  drawerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  drawerEyebrow: { color: "#4b85bd", fontSize: 9, fontWeight: "800", letterSpacing: 2 },
  drawerTitle: { color: "#20354e", fontSize: 27, fontWeight: "700", marginTop: 6 },
  closeButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#e5edf6", alignItems: "center", justifyContent: "center" },
  closeText: { color: "#4a6683", fontSize: 26, lineHeight: 29, marginTop: -2 },
  drawerIntro: { color: "#61788c", fontSize: 13, lineHeight: 20, marginTop: 16, maxWidth: 250 },
  drawerSectionLabel: { color: "#6b8295", fontSize: 9, fontWeight: "800", letterSpacing: 1.7, marginTop: 34, marginBottom: 11 },
  drawerRow: { minHeight: 74, flexDirection: "row", alignItems: "center", paddingHorizontal: 11, paddingVertical: 11, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.85)", borderWidth: 1, borderColor: "#dbe6f1", marginBottom: 10 },
  drawerRowPressed: { opacity: 0.7 },
  drawerSymbolWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#e2f0f5", alignItems: "center", justifyContent: "center", marginRight: 12 },
  drawerSymbol: { color: "#347eab", fontSize: 22 },
  drawerRowCopy: { flex: 1 },
  drawerRowTitle: { color: "#30455b", fontSize: 13, fontWeight: "700" },
  drawerRowDetail: { color: "#72869a", fontSize: 11, marginTop: 5 },
  drawerChevron: { color: "#6486a1", fontSize: 25, marginLeft: 7 },
  drawerFooter: { marginTop: "auto", paddingTop: 26 },
  drawerFooterTitle: { color: "#3b5975", fontSize: 12, fontWeight: "700" },
  drawerFooterBody: { color: "#7b91a6", fontSize: 11, marginTop: 5 },
});
