// The installed SDK 57 module keeps the function-based API under /legacy.
import * as Contacts from "expo-contacts/legacy";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import {
  EmergencyContact,
  getEmergencyContacts,
  saveEmergencyContacts,
} from "@/utils/storage";

function normalizePhone(phone: string) {
  return phone.replace(/[^0-9]/g, "");
}

export default function ContactsSetupScreen() {
  const router = useRouter();
  const [allContacts, setAllContacts] = useState<Contacts.ExistingContact[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [manualContacts, setManualContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage(
          `Contacts permission status: ${permission.status}. Use the iPhone picker below or enter numbers manually.`,
        );
        setAllContacts([]);
        return;
      }

      const [{ data }, saved] = await Promise.all([
        Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers],
          pageSize: 1000,
          sort: Contacts.SortTypes.FirstName,
        }),
        getEmergencyContacts(),
      ]);
      const withPhones = data.filter(
        (contact) => contact.phoneNumbers?.some((phone) => phone.number),
      );
      setAllContacts(withPhones);
      const savedPhones = new Set(saved.map((contact) => normalizePhone(contact.phone ?? "")));
      const matchingSavedRows = withPhones.filter((contact) =>
        contact.phoneNumbers?.some(
          (phone) => phone.number && savedPhones.has(normalizePhone(phone.number)),
        ),
      );
      const matchingSavedPhones = new Set(
        matchingSavedRows.flatMap((contact) =>
          (contact.phoneNumbers ?? [])
            .map((phone) => normalizePhone(phone.number ?? ""))
            .filter((phone) => savedPhones.has(phone)),
        ),
      );
      setSelectedIds(new Set(matchingSavedRows.map((contact) => contact.id)));
      // Previously saved numbers not present in the address book (manual/picker entries)
      // remain editable as removable entries.
      setManualContacts(
        saved.filter((contact) => !matchingSavedPhones.has(normalizePhone(contact.phone ?? ""))),
      );
    } catch (error) {
      console.log("Unable to load iPhone contacts:", error);
      setErrorMessage(
        `Could not read the address book (${error instanceof Error ? error.message : String(error)}). Try the iPhone picker below.`,
      );
      setAllContacts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadContacts();
    }, [loadContacts]),
  );

  function toggleSelect(id: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function pickFromPhone() {
    try {
      const contact = await Contacts.presentContactPickerAsync();
      if (!contact) return;
      const phone = contact.phoneNumbers?.find((item) => item.number)?.number;
      if (!phone) {
        Alert.alert("No phone number", `${contact.name} has no phone number saved.`);
        return;
      }
      const normalized = normalizePhone(phone);
      const alreadySelectedFromList = allContacts.some(
        (item) =>
          item.id &&
          selectedIds.has(item.id) &&
          item.phoneNumbers?.some((number) => normalizePhone(number.number ?? "") === normalized),
      );
      if (alreadySelectedFromList) return;
      setManualContacts((previous) => {
        if (previous.some((item) => normalizePhone(item.phone ?? "") === normalized)) {
          return previous;
        }
        return [...previous, { name: contact.name || "Emergency Contact", phone }];
      });
    } catch (error) {
      Alert.alert(
        "iPhone contact picker unavailable",
        error instanceof Error ? error.message : "Please enter the phone number manually.",
      );
    }
  }

  function addManualContact() {
    const phone = manualPhone.trim();
    if (normalizePhone(phone).length < 7) {
      Alert.alert("Enter a valid phone number", "Include the country code, for example +92…");
      return;
    }
    if (
      manualContacts.some((item) => normalizePhone(item.phone ?? "") === normalizePhone(phone)) ||
      allContacts.some(
        (contact) =>
          contact.id &&
          selectedIds.has(contact.id) &&
          contact.phoneNumbers?.some((item) => normalizePhone(item.number ?? "") === normalizePhone(phone)),
      )
    ) {
      Alert.alert("Already added", "That phone number is already in your emergency contacts.");
      return;
    }
    setManualContacts((previous) => [
      ...previous,
      { name: manualName.trim() || "Emergency Contact", phone },
    ]);
    setManualName("");
    setManualPhone("");
  }

  async function handleSave() {
    const selectedFromAddressBook: EmergencyContact[] = allContacts
      .filter((contact) => selectedIds.has(contact.id))
      .map((contact) => ({
        name: contact.name || "Emergency Contact",
        phone: contact.phoneNumbers?.find((item) => item.number)?.number,
      }))
      .filter((contact): contact is EmergencyContact & { phone: string } => Boolean(contact.phone));

    // Saving replaces the current emergency recipient list, so deselected contacts are removed.
    const combined = [...selectedFromAddressBook, ...manualContacts];
    const unique = new Map<string, EmergencyContact>();
    for (const contact of combined) {
      const key = normalizePhone(contact.phone ?? "");
      if (key.length >= 7) unique.set(key, contact);
    }
    const contactsToSave = [...unique.values()];
    if (contactsToSave.length === 0) {
      Alert.alert("No contacts selected", "Pick contacts from your phone or add at least one phone number.");
      return;
    }

    await saveEmergencyContacts(contactsToSave);
    const verified = await getEmergencyContacts();
    if (verified.length !== contactsToSave.length) {
      Alert.alert("Could not verify saved contacts", "Please try saving again.");
      return;
    }
    Alert.alert(
      "Emergency contacts saved",
      `${verified.length} contact${verified.length === 1 ? "" : "s"} saved: ${verified.map((item) => item.name).join(", ")}`,
      [{ text: "Continue", onPress: () => router.replace("/") }],
    );
  }

  const selectionCount = selectedIds.size + manualContacts.length;

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Pick your emergency contacts</Text>
      <Text style={styles.subtitle}>
        Choose contacts from your iPhone, tap rows in the list, or add phone numbers. Include a country code for WhatsApp.
      </Text>

      {errorMessage ? <Text style={styles.permissionHint}>{errorMessage}</Text> : null}

      <TouchableOpacity style={styles.pickerButton} onPress={() => void pickFromPhone()}>
        <Text style={styles.saveButtonText}>Choose from iPhone Contacts</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>
        {loading ? "Loading phone contacts…" : `Phone contacts (${allContacts.length})`}
      </Text>
      {!loading && allContacts.length === 0 ? (
        <Text style={styles.emptyHint}>No phone contacts are available in the address book list.</Text>
      ) : null}
      <FlatList
        style={styles.contactList}
        data={allContacts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isSelected = selectedIds.has(item.id);
          return (
            <TouchableOpacity
              style={[styles.row, isSelected && styles.rowSelected]}
              onPress={() => toggleSelect(item.id)}
            >
              <Text style={styles.rowText}>{item.name || "Unnamed contact"}</Text>
              <Text style={styles.rowPhone}>
                {item.phoneNumbers?.find((phone) => phone.number)?.number} {isSelected ? "✓" : ""}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {manualContacts.map((contact, index) => (
        <TouchableOpacity
          key={`${contact.phone}-${index}`}
          style={styles.pendingRow}
          onPress={() => setManualContacts((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}
        >
          <Text style={styles.rowText}>{contact.name}: {contact.phone}  ✓  (tap to remove)</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.sectionTitle}>Add a number manually</Text>
      <TextInput
        value={manualName}
        onChangeText={setManualName}
        placeholder="Contact name"
        placeholderTextColor="#8e8e93"
        style={styles.input}
        autoCapitalize="words"
      />
      <TextInput
        value={manualPhone}
        onChangeText={setManualPhone}
        placeholder="Phone number, e.g. +92…"
        placeholderTextColor="#8e8e93"
        style={styles.input}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
      />
      <TouchableOpacity style={styles.addButton} onPress={addManualContact}>
        <Text style={styles.saveButtonText}>Add this number</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.saveButton} onPress={() => void handleSave()}>
      <Text style={styles.saveButtonText}>Save {selectionCount} emergency contact{selectionCount === 1 ? "" : "s"}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000", padding: 16 },
  title: { color: "#ffffff", fontSize: 20, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: "#c7c7cc", fontSize: 14, marginBottom: 12 },
  permissionHint: { color: "#fbbf24", fontSize: 13, marginBottom: 8 },
  emptyHint: { color: "#8e8e93", fontSize: 13, marginVertical: 8 },
  sectionTitle: { color: "#ffffff", fontSize: 15, fontWeight: "600", marginVertical: 8 },
  contactList: { maxHeight: 240, flexGrow: 0 },
  row: { padding: 12, borderRadius: 10, backgroundColor: "#1c1c1e", marginBottom: 7 },
  rowSelected: { backgroundColor: "#2457a6" },
  rowText: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  rowPhone: { color: "#c7c7cc", fontSize: 13, marginTop: 3 },
  pendingRow: { backgroundColor: "#174b31", padding: 10, borderRadius: 8, marginBottom: 6 },
  input: { backgroundColor: "#1c1c1e", color: "#ffffff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 7 },
  pickerButton: { backgroundColor: "#2563eb", borderRadius: 24, paddingVertical: 13, alignItems: "center", marginVertical: 5 },
  addButton: { backgroundColor: "#176b3a", borderRadius: 24, paddingVertical: 12, alignItems: "center", marginBottom: 6 },
  saveButton: { backgroundColor: "#22c55e", borderRadius: 24, paddingVertical: 14, alignItems: "center", marginTop: 6 },
  saveButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "700", textAlign: "center", paddingHorizontal: 8 },
});
