import AsyncStorage from "@react-native-async-storage/async-storage";

const GESTURE_KEY = "pocketshield_selected_gesture";
const CONTACTS_KEY = "pocketshield_emergency_contacts";

export type EmergencyContact = {
  name: string;
  phone?: string;
};

export async function saveSelectedGesture(gesture: string): Promise<void> {
  try {
    await AsyncStorage.setItem(GESTURE_KEY, gesture);
  } catch (err) {
    console.log("Error saving gesture:", err);
  }
}

export async function getSelectedGesture(): Promise<string> {
  try {
    const value = await AsyncStorage.getItem(GESTURE_KEY);
    return value ?? "fist";
  } catch (err) {
    console.log("Error getting gesture:", err);
    return "fist";
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