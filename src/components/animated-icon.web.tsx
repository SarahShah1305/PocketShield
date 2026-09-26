import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

export function AnimatedSplashOverlay() {
  return null;
}

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <View style={styles.iconTile}>
        <Image source={require("@/assets/images/expo-logo.png")} style={styles.logo} contentFit="contain" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: { width: 210, height: 210, alignItems: "center", justifyContent: "center" },
  iconTile: {
    width: 164,
    height: 164,
    borderRadius: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2389e2",
    experimental_backgroundImage: "linear-gradient(145deg, #49b9d1 0%, #308bdc 48%, #37328f 100%)",
    shadowColor: "#142a62",
    shadowOpacity: 0.25,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 15 },
    elevation: 12,
  },
  logo: { width: 102, height: 96 },
});
