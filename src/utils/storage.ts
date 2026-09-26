import AsyncStorage from "@react-native-async-storage/async-storage";

const GESTURES_KEY = "pocketshield_selected_gestures";
const CONTACTS_KEY = "pocketshield_emergency_contacts";

export type EmergencyContact = {
  name: string;
  phone?: string;
};

export type EmergencyGesture = "thumbs_up" | "open_palm" | "peace_sign" | "fist";

export const EMERGENCY_GESTURES: { id: EmergencyGesture; label: string; description: string }[] = [
  { id: "thumbs_up", label: "Thumbs-up", description: "Raise your thumb with your fingers curled" },
  { id: "open_palm", label: "Open palm", description: "Show your hand with all fingers extended" },
  { id: "peace_sign", label: "Peace sign", description: "Extend your index and middle fingers" },
  { id: "fist", label: "Fist", description: "Close your hand into a fist" },
];

export async function saveSelectedGestures(gestures: EmergencyGesture[]): Promise<void> {
  try {
    await AsyncStorage.setItem(GESTURES_KEY, JSON.stringify(gestures.slice(0, 2)));
  } catch (err) {
    console.log("Error saving gesture:", err);
  }
}

export async function getSelectedGestures(): Promise<EmergencyGesture[]> {
  try {
    const value = await AsyncStorage.getItem(GESTURES_KEY);
    if (value) {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is EmergencyGesture =>
          EMERGENCY_GESTURES.some((gesture) => gesture.id === item),
        ).slice(0, 2);
      }
    }
    // Migrate the previous single-gesture preference where possible.
    const legacy = await AsyncStorage.getItem("pocketshield_selected_gesture");
    if (legacy === "thumbs_up") return ["thumbs_up"];
    return [];
  } catch (err) {
    console.log("Error getting gesture:", err);
    return [];
  }
}

export async function saveEmergencyContacts(
  contacts: EmergencyContact[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
  } catch (err) {
    console.log("Error saving contacts:", err);
  }
}

export async function getEmergencyContacts(): Promise<EmergencyContact[]> {
  try {
    const value = await AsyncStorage.getItem(CONTACTS_KEY);
    return value ? JSON.parse(value) : [];
  } catch (err) {
    console.log("Error getting contacts:", err);
    return [];
  }
}
