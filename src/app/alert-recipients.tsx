import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmergencyContact, getEmergencyContacts } from "@/utils/storage";
import {
  AlertChannel,
  getEmergencyLocationText,
  openEmergencyAlertDraft,
} from "@/services/alert-service";

export default function AlertRecipientsScreen() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [locationLoading, setLocationLoading] = useState(true);
  const [nextDraftIndex, setNextDraftIndex] = useState(0);
  const [openingDraft, setOpeningDraft] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [channel, setChannel] = useState<AlertChannel>("whatsapp");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const savedContacts = await getEmergencyContacts();
        if (active) setContacts(savedContacts.filter((contact) => Boolean(contact.phone?.trim())));
      } finally {
        if (active) setLoading(false);
      }

      try {
        const locationText = await getEmergencyLocationText();
        if (active) setLocation(locationText);
      } catch (error) {
        console.log("Could not get location for alert:", error);
        if (active) setLocation("Location unavailable");
      } finally {
        if (active) setLocationLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selectedContacts = useMemo(
    () => [...selected].sort((a, b) => a - b).map((index) => contacts[index]).filter(Boolean),
    [contacts, selected],
  );

  function toggleContact(index: number) {
    if (nextDraftIndex > 0) {
      Alert.alert("Recipient list locked", "Finish opening the selected drafts before changing recipients.");
      return;
    }
    setSelected((previous) => {
      const updated = new Set(previous);
      if (updated.has(index)) updated.delete(index);
      else updated.add(index);
      return updated;
    });
  }

  async function openNextDraft() {
    if (selectedContacts.length === 0) {
      Alert.alert("Choose a contact", "Select at least one phone contact to prepare an alert.");
      return;
    }
    const contact = selectedContacts[nextDraftIndex];
    if (!contact) {
      Alert.alert("All drafts opened", "Return to this screen after sending each message draft.");
      return;
    }

    setOpeningDraft(true);
    try {
      await openEmergencyAlertDraft(contact, location || "Location unavailable", channel);
      setNextDraftIndex((current) => current + 1);
      setDraftStatus(
        `${channel === "whatsapp" ? "WhatsApp" : "SMS"} draft opened for ${contact.name} (${contact.phone}). Tap Send there, return to PocketShield, then open the next selected contact's draft.`,
      );
    } catch (error) {
      console.log(`Could not open alert draft for ${contact.name}:`, error);
      Alert.alert(
        channel === "whatsapp" ? "Could not open WhatsApp chat" : "Could not open SMS draft",
        error instanceof Error ? error.message : `Could not open a message for ${contact.name} (${contact.phone}).`,
      );
    } finally {
      setOpeningDraft(false);
    }
  }

  function confirmOpenNextDraft() {
    const contact = selectedContacts[nextDraftIndex];
    if (!contact) return;
    const selectedChannel = channel === "whatsapp" ? "WhatsApp" : "SMS";
    Alert.alert(
      `Open ${selectedChannel} for this contact?`,
      `${contact.name}\n${contact.phone}\n\nCheck that this is the correct person and number. PocketShield will open a draft; you still tap Send in ${selectedChannel}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: `Open ${selectedChannel}`, onPress: () => void openNextDraft() },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Choose who to alert</Text>
        <Text style={styles.subtitle}>
          Only the contacts you select here will get a message draft. Select one or more recipients.
        </Text>

        <View style={styles.locationCard}>
          {locationLoading ? <ActivityIndicator color="#fff" /> : null}
          <Text style={styles.locationTitle}>{locationLoading ? "Getting your location…" : "Location for the alert"}</Text>
          {!locationLoading ? <Text style={styles.locationText}>{location}</Text> : null}
        </View>

        {loading ? <ActivityIndicator color="#fff" style={styles.loader} /> : null}
        {!loading && contacts.length === 0 ? (
          <Text style={styles.empty}>No saved contact with a phone number was found. Go back and save a phone contact first.</Text>
        ) : null}

        <Text style={styles.channelLabel}>Choose how to prepare the message</Text>
        <View style={styles.channelOptions}>
          <Pressable
            onPress={() => setChannel("whatsapp")}
            disabled={nextDraftIndex > 0}
            style={[styles.channelButton, channel === "whatsapp" && styles.channelSelected, nextDraftIndex > 0 && styles.disabled]}
          >
            <Text style={styles.channelText}>WhatsApp</Text>
          </Pressable>
          <Pressable
            onPress={() => setChannel("sms")}
            disabled={nextDraftIndex > 0}
            style={[styles.channelButton, channel === "sms" && styles.channelSelected, nextDraftIndex > 0 && styles.disabled]}
          >
            <Text style={styles.channelText}>SMS</Text>
          </Pressable>
        </View>

        {contacts.map((contact, index) => {
          const checked = selected.has(index);
          return (
            <Pressable
              key={`${contact.phone}-${index}`}
              onPress={() => toggleContact(index)}
              disabled={locationLoading || loading || nextDraftIndex > 0}
              style={[styles.contact, checked && styles.contactSelected]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
            >
              <View style={[styles.checkbox, checked && styles.checkboxSelected]}>
                {checked ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{contact.name}</Text>
                <Text style={styles.contactPhone}>{contact.phone}</Text>
              </View>
            </Pressable>
          );
        })}

        <Text style={styles.note}>
          The selected app opens one draft at a time. You must tap Send there, then return here for the next selected contact. If WhatsApp shows an invite or a website, check the number: it may not be registered on WhatsApp.
        </Text>
        {draftStatus ? <Text style={styles.draftStatus}>{draftStatus}</Text> : null}
        <Pressable
          onPress={confirmOpenNextDraft}
          disabled={openingDraft || loading || locationLoading || selectedContacts.length === 0 || nextDraftIndex >= selectedContacts.length}
          style={[styles.sendButton, (openingDraft || loading || locationLoading || selectedContacts.length === 0 || nextDraftIndex >= selectedContacts.length) && styles.disabled]}
        >
          {openingDraft ? <ActivityIndicator color="#fff" /> : null}
          <Text style={styles.sendButtonText}>
            {nextDraftIndex < selectedContacts.length
              ? `Open ${channel === "whatsapp" ? "WhatsApp" : "SMS"} draft ${Math.min(nextDraftIndex + 1, selectedContacts.length)} of ${selectedContacts.length}`
              : `All ${selectedContacts.length} selected drafts opened`}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  content: { padding: 18, paddingBottom: 36 },
  title: { color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: "#c7c7cc", fontSize: 15, lineHeight: 21, marginBottom: 16 },
  locationCard: { backgroundColor: "#1c1c1e", padding: 14, borderRadius: 12, marginBottom: 18, gap: 7 },
  locationTitle: { color: "#fff", fontWeight: "700", fontSize: 15 },
  locationText: { color: "#b8c7d9", fontSize: 13 },
  channelLabel: { color: "#fff", fontSize: 15, fontWeight: "600", marginTop: 4, marginBottom: 8 },
  channelOptions: { flexDirection: "row", gap: 10, marginBottom: 14 },
  channelButton: { flex: 1, backgroundColor: "#1c1c1e", borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#45454a" },
  channelSelected: { backgroundColor: "#174b31", borderColor: "#22c55e" },
  channelText: { color: "#fff", fontWeight: "700" },
  loader: { marginVertical: 18 },
  empty: { color: "#fbbf24", fontSize: 15, lineHeight: 21, marginVertical: 12 },
  contact: { flexDirection: "row", alignItems: "center", backgroundColor: "#1c1c1e", borderRadius: 12, padding: 14, marginBottom: 9, gap: 12 },
  contactSelected: { backgroundColor: "#163b2a", borderColor: "#22c55e", borderWidth: 1 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: "#8e8e93", alignItems: "center", justifyContent: "center" },
  checkboxSelected: { backgroundColor: "#22c55e", borderColor: "#22c55e" },
  checkmark: { color: "#fff", fontWeight: "800" },
  contactInfo: { flex: 1 },
  contactName: { color: "#fff", fontSize: 16, fontWeight: "600" },
  contactPhone: { color: "#c7c7cc", fontSize: 14, marginTop: 3 },
  note: { color: "#fbbf24", lineHeight: 20, fontSize: 13, marginTop: 12, marginBottom: 16 },
  draftStatus: { color: "#a7f3d0", lineHeight: 20, fontSize: 13, marginBottom: 14 },
  sendButton: { backgroundColor: "#22c55e", minHeight: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9, paddingHorizontal: 14 },
  disabled: { opacity: 0.45 },
  sendButtonText: { color: "#fff", fontWeight: "700", fontSize: 15, textAlign: "center" },
});
