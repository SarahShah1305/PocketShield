import * as Location from "expo-location";
import * as SMS from "expo-sms";
import { Linking, Share } from "react-native";
import { EmergencyContact, getEmergencyContacts } from "@/utils/storage";

export async function getEmergencyLocationText(): Promise<string> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      return "Location unavailable (permission denied)";
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const { latitude, longitude } = location.coords;
    return `https://maps.google.com/?q=${latitude},${longitude}`;
  } catch (err) {
    console.log("Location error:", err);
    return "Location unavailable (error getting location)";
  }
}

export type AlertChannel = "whatsapp" | "sms";

export type SMSBatchResult = {
  total: number;
  sent: number;
  unverified: number;
  cancelled: boolean;
};

export async function openEmergencySmsSeparately(
  contacts: EmergencyContact[],
  locationText: string,
): Promise<SMSBatchResult> {
  const addresses = [...new Set(
    contacts.map((contact) => contact.phone?.trim()).filter((phone): phone is string => Boolean(phone)),
  )];
  if (addresses.length === 0) throw new Error("No saved emergency contacts have phone numbers.");
  if (!(await SMS.isAvailableAsync())) throw new Error("SMS is not available on this device.");

  const timestamp = new Date().toLocaleString();
  const message = `EMERGENCY ALERT\nI may be in danger.\nTime: ${timestamp}\nLocation: ${locationText}`;
  const result: SMSBatchResult = { total: addresses.length, sent: 0, unverified: 0, cancelled: false };
  for (const address of addresses) {
    const response = await SMS.sendSMSAsync(address, message);
    if (response.result === "cancelled") {
      result.cancelled = true;
      break;
    }
    if (response.result === "sent") result.sent += 1;
    else result.unverified += 1;
  }
  return result;
}

export async function openEmergencyWhatsAppShare(locationText: string) {
  const timestamp = new Date().toLocaleString();
  const message = `EMERGENCY ALERT\nI may be in danger.\nTime: ${timestamp}\nLocation: ${locationText}`;
  return Share.share(
    { message, title: "PocketShield Emergency Alert" },
    { dialogTitle: "Choose WhatsApp and a recipient" },
  );
}

export async function openEmergencyAlertDraft(
  contact: EmergencyContact,
  locationText: string,
  channel: AlertChannel,
) {
  if (!contact.phone) {
    throw new Error(`${contact.name} does not have a phone number saved.`);
  }

  const timestamp = new Date().toLocaleString();
  const message = `EMERGENCY ALERT\nI may be in danger.\nTime: ${timestamp}\nLocation: ${locationText}`;

  if (channel === "whatsapp") {
    const rawPhone = contact.phone.trim();
    if (!rawPhone.startsWith("+") && !rawPhone.startsWith("00")) {
      throw new Error(
        `WhatsApp needs ${contact.name}'s phone saved with a country code, such as +92 followed by the number. Current value: ${contact.phone}`,
      );
    }
    const digits = rawPhone.replace(/\D/g, "").replace(/^00/, "");
    if (digits.length < 8 || digits.length > 15) {
      throw new Error(`The international phone number for ${contact.name} looks incomplete: ${contact.phone}`);
    }
    const whatsappUrl = `whatsapp://send?phone=${digits}&text=${encodeURIComponent(message)}`;
    await Linking.openURL(whatsappUrl);
    return "WhatsApp";
  }

  const smsUrl = `sms:${contact.phone}?body=${encodeURIComponent(message)}`;
  await Linking.openURL(smsUrl);
  return "SMS";
}

// Backwards-compatible entry point. Passing a list targets only those contacts;
// omitting it keeps the previous behavior of using all saved contacts.
export async function sendEmergencyAlert(
  selectedContacts?: EmergencyContact[],
  locationText?: string,
  channel: AlertChannel = "whatsapp",
) {
  const contacts = selectedContacts ?? (await getEmergencyContacts());
  if (contacts.length === 0) {
    console.log("No emergency contacts selected — cannot open an alert draft.");
    return;
  }

  const location = locationText ?? (await getEmergencyLocationText());
  for (const contact of contacts) {
    if (!contact.phone) continue;
    try {
      await openEmergencyAlertDraft(contact, location, channel);
    } catch (err) {
      console.log(`Failed to open alert draft for ${contact.name}:`, err);
    }
  }
}
