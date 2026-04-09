import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

interface Stavka {
  id: string;
  naziv: string;
  datum: string;
  iznos: number;
  kategorija: string;
}

const DEFAULT_KATEGORIJE: Record<string, string[]> = {
  prihodi: [],
  rashodi: [],
};

function danasDatum(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getFullYear()}`;
}

function parseDatum(d: string): number {
  const [day, month, year] = d.split(".");
  return new Date(+year, +month - 1, +day).getTime();
}

function ucitajStavke(raw: string | null): Stavka[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s: Stavka) => ({ ...s, kategorija: s.kategorija ?? "Ostalo" }));
  } catch { return []; }
}

function ucitajKategorije(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

interface FormaStanje {
  naziv: string;
  datum: string;
  iznos: string;
  kategorija: string;
}

// ──────────────────────────────────────────────
// Picker komponenta
// ──────────────────────────────────────────────
interface KategorijaPickerProps {
  kategorije: string[];
  odabrana: string;
  boja: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onOdaberi: (k: string) => void;
  onDodaj: (k: string) => void;
  onObrisi: (k: string) => void;
}

function KategorijaPicker({ kategorije, odabrana, boja, colors, onOdaberi, onDodaj, onObrisi }: KategorijaPickerProps) {
  const [otvoren, setOtvoren] = useState(false);
  const [dodajeInline, setDodajeInline] = useState(false);
  const [novaKat, setNovaKat] = useState("");
  const [triggerY, setTriggerY] = useState(0);
  const [triggerH, setTriggerH] = useState(0);
  const triggerRef = useRef<View>(null);
  const novaKatRef = useRef<TextInput>(null);
  const screenW = Dimensions.get("window").width;
  const panelW = screenW - 40;
  const panelX = 20;

  useEffect(() => {
    if (dodajeInline) {
      setTimeout(() => novaKatRef.current?.focus(), 100);
    }
  }, [dodajeInline]);

  function handleOpen() {
    if (triggerRef.current) {
      triggerRef.current.measureInWindow((_x, y, _w, h) => {
        setTriggerY(y);
        setTriggerH(h);
        setOtvoren(true);
      });
    } else {
      setOtvoren(true);
    }
  }

  function potvrdiNovu() {
    const trimmed = novaKat.trim();
    if (!trimmed) return;
    onDodaj(trimmed);
    onOdaberi(trimmed);
    setNovaKat("");
    setDodajeInline(false);
  }

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <Pressable
          onPress={handleOpen}
          style={[styles.pickerTipka, { backgroundColor: colors.card, borderColor: boja + "44", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
        >
          <Text style={[styles.pickerTekst, { color: odabrana ? colors.foreground : colors.mutedForeground, flex: 1 }]}>
            {odabrana || "Odaberi kategoriju"}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 14, marginLeft: 8 }}>▾</Text>
        </Pressable>
      </View>

      {/* Modal za novu kategoriju — bottom sheet iznad tipkovnice */}
      <Modal
        visible={dodajeInline}
        transparent
        animationType="slide"
        onRequestClose={() => { setDodajeInline(false); setNovaKat(""); }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.novaKatOverlay}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => { setDodajeInline(false); setNovaKat(""); }} />
          <View style={[styles.novaKatModal, { backgroundColor: colors.card, borderTopColor: boja }]}>
            <TextInput
              ref={novaKatRef}
              placeholder="Naziv nove kategorije"
              placeholderTextColor={colors.mutedForeground}
              value={novaKat}
              onChangeText={setNovaKat}
              returnKeyType="done"
              onSubmitEditing={potvrdiNovu}
              style={[styles.pickerInput, { backgroundColor: colors.background, borderColor: boja + "66", color: colors.foreground, marginBottom: 12 }]}
            />
            <View style={styles.novaKatTipkeRow}>
              <Pressable onPress={() => { setDodajeInline(false); setNovaKat(""); }} style={[styles.pickerMalaTipka, { borderColor: colors.border }]}>
                <Text style={[styles.pickerMalaTekst, { color: colors.mutedForeground }]}>Odustani</Text>
              </Pressable>
              <Pressable onPress={potvrdiNovu} style={[styles.pickerMalaTipka, { backgroundColor: boja, borderColor: boja }]}>
                <Text style={[styles.pickerMalaTekst, { color: "#000" }]}>Dodaj</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={otvoren} transparent animationType="none" statusBarTranslucent onRequestClose={() => setOtvoren(false)}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setOtvoren(false)} />

        <View style={[styles.pickerPanel, {
          position: "absolute",
          top: triggerY + triggerH + 2,
          left: panelX,
          width: panelW,
          backgroundColor: "#1a1a1a",
          borderColor: colors.border,
        }]}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 260 }}>
            {kategorije.map((k) => (
              <Pressable
                key={k}
                onPress={() => { onOdaberi(k); setOtvoren(false); }}
                onLongPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Alert.alert(
                    "Obriši kategoriju",
                    `Obrisati "${k}"?\nStavke s tom kategorijom ostaju sačuvane.`,
                    [
                      { text: "Odustani", style: "cancel" },
                      { text: "Obriši", style: "destructive", onPress: () => { onObrisi(k); setOtvoren(false); } },
                    ]
                  );
                }}
                style={[
                  styles.pickerStavka,
                  { borderBottomColor: colors.border + "55" },
                  odabrana === k && { backgroundColor: boja + "33" },
                ]}
              >
                <Text style={[styles.pickerStavkaTekst, { color: odabrana === k ? boja : colors.foreground }]}>
                  {k}
                </Text>
                {odabrana === k && (
                  <View style={[styles.pickerCheck, { backgroundColor: boja }]}>
                    <Text style={styles.pickerCheckTekst}>✓</Text>
                  </View>
                )}
              </Pressable>
            ))}

            <Pressable
              onPress={() => { setOtvoren(false); setDodajeInline(true); setNovaKat(""); }}
              style={[styles.pickerStavka, { borderBottomWidth: 0 }]}
            >
              <Text style={[styles.pickerStavkaTekst, { color: boja }]}>+ Nova kategorija</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

// ──────────────────────────────────────────────
// Glavni ekran
// ──────────────────────────────────────────────
export default function ListaEkran() {
  const { tip } = useLocalSearchParams<{ tip: "prihodi" | "rashodi" }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const isGreen = tip === "prihodi";
  const boja = isGreen ? colors.income : colors.expense;
  const kljuc = `fin_${tip}`;
  const katKljuc = `fin_kategorije_${tip}`;

  const [stavke, setStavke] = useState<Stavka[]>([]);
  const [kategorije, setKategorije] = useState<string[]>([]);

  const [naziv, setNaziv] = useState("");
  const [datum, setDatum] = useState(danasDatum());
  const [iznos, setIznos] = useState("");
  const [kategorija, setKategorija] = useState("");
  const [greska, setGreska] = useState("");

  const [uredujId, setUredujId] = useState<string | null>(null);
  const [uredujForma, setUredujForma] = useState<FormaStanje>({ naziv: "", datum: "", iznos: "", kategorija: "" });
  const [uredujGreska, setUredujGreska] = useState("");
  const [prosirene, setProsirene] = useState<Set<string>>(new Set());

  const iznosRef = useRef<TextInput>(null);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(kljuc),
      AsyncStorage.getItem(katKljuc),
    ]).then(([stavkeRaw, katRaw]) => {
      const ucitaneStavke = ucitajStavke(stavkeRaw);
      const ucitaneKat = ucitajKategorije(katRaw);
      setStavke(ucitaneStavke);
      setKategorije(ucitaneKat);
      setKategorija(ucitaneKat[0] ?? "");
    });
  }, [kljuc, katKljuc, tip]);

  async function spremiStavke(noveStavke: Stavka[]) {
    setStavke(noveStavke);
    await AsyncStorage.setItem(kljuc, JSON.stringify(noveStavke));
  }

  async function dodajKategoriju(nova: string) {
    if (kategorije.includes(nova)) return;
    const azurirane = [...kategorije, nova];
    setKategorije(azurirane);
    await AsyncStorage.setItem(katKljuc, JSON.stringify(azurirane));
  }

  async function obrisiKategoriju(k: string) {
    const azurirane = kategorije.filter((kat) => kat !== k);
    setKategorije(azurirane);
    await AsyncStorage.setItem(katKljuc, JSON.stringify(azurirane));
    if (kategorija === k) setKategorija(azurirane[0] ?? "");
    if (uredujForma.kategorija === k) setUredujForma((f) => ({ ...f, kategorija: azurirane[0] ?? "" }));
  }

  function toggleSekciju(k: string) {
    setProsirene((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function dodajStavku() {
    if (!naziv.trim()) { setGreska("Unesite naziv stavke."); return; }
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(datum)) { setGreska("Datum mora biti u obliku dd.mm.yyyy."); return; }
    const iznosNum = parseFloat(iznos.replace(",", "."));
    if (isNaN(iznosNum) || iznosNum <= 0) { setGreska("Unesite ispravan iznos."); return; }
    setGreska("");

    const nova: Stavka = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 9),
      naziv: naziv.trim(),
      datum,
      iznos: iznosNum,
      kategorija,
    };

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await spremiStavke([...stavke, nova]);
    setNaziv("");
    setDatum(danasDatum());
    setIznos("");
  }

  function otvoriUredivanje(stavka: Stavka) {
    setUredujId(stavka.id);
    setUredujForma({ naziv: stavka.naziv, datum: stavka.datum, iznos: stavka.iznos.toString(), kategorija: stavka.kategorija });
    setUredujGreska("");
  }

  async function spremiUredivanje() {
    if (!uredujForma.naziv.trim()) { setUredujGreska("Unesite naziv stavke."); return; }
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(uredujForma.datum)) { setUredujGreska("Datum mora biti u obliku dd.mm.yyyy."); return; }
    const iznosNum = parseFloat(uredujForma.iznos.replace(",", "."));
    if (isNaN(iznosNum) || iznosNum <= 0) { setUredujGreska("Unesite ispravan iznos."); return; }
    setUredujGreska("");

    const azurirane = stavke.map((s) =>
      s.id === uredujId
        ? { ...s, naziv: uredujForma.naziv.trim(), datum: uredujForma.datum, iznos: iznosNum, kategorija: uredujForma.kategorija }
        : s
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await spremiStavke(azurirane);
    setUredujId(null);
  }

  function obrisiStavku(id: string) {
    Alert.alert("Obriši stavku", "Jeste li sigurni?", [
      { text: "Odustani", style: "cancel" },
      {
        text: "Obriši", style: "destructive",
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await spremiStavke(stavke.filter((s) => s.id !== id));
          if (uredujId === id) setUredujId(null);
        },
      },
    ]);
  }

  const ukupno = stavke.reduce((a, s) => a + s.iznos, 0);

  // Grupiraj po kategoriji, svaka grupa sortirana po datumu desc
  const sekcije = useMemo(() => {
    const grupe: Record<string, Stavka[]> = {};
    stavke.forEach((s) => {
      if (!grupe[s.kategorija]) grupe[s.kategorija] = [];
      grupe[s.kategorija].push(s);
    });
    const redoslijed = [...kategorije, ...Object.keys(grupe).filter((k) => !kategorije.includes(k)).sort()];
    return redoslijed
      .filter((k) => grupe[k] && grupe[k].length > 0)
      .map((k) => ({
        title: k,
        ukupno: grupe[k].reduce((a, s) => a + s.iznos, 0),
        data: prosirene.has(k)
          ? [...grupe[k]].sort((a, b) => parseDatum(b.datum) - parseDatum(a.datum))
          : [],
      }));
  }, [stavke, kategorije, prosirene]);

  const topPadding = Platform.OS === "web" ? 67 : 0;
  const bottomPadding = Platform.OS === "web" ? 34 : 0;
  const uredujStavka = stavke.find((s) => s.id === uredujId);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + topPadding, paddingBottom: insets.bottom + bottomPadding }]}>

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.nazadTipka, { opacity: pressed ? 0.5 : 1 }]} hitSlop={16}>
          <Text style={[styles.nazadStrelica, { color: colors.mutedForeground }]}>‹</Text>
        </Pressable>
        <Text style={[styles.headerNaslov, { color: boja }]}>{isGreen ? "Prihodi" : "Rashodi"}</Text>
        <Text style={[styles.headerUkupno, { color: boja }]}>{isGreen ? "+" : "-"}{ukupno.toFixed(2)} €</Text>
      </View>

      {/* Forma */}
      <View style={[styles.forma, { backgroundColor: "#0d0d0d", borderBottomColor: colors.border }]}>
        <Text style={[styles.formaLabel, { color: colors.mutedForeground }]}>NOVA STAVKA</Text>

        <KategorijaPicker
          kategorije={kategorije}
          odabrana={kategorija}
          boja={boja}
          colors={colors}
          onOdaberi={setKategorija}
          onDodaj={dodajKategoriju}
          onObrisi={obrisiKategoriju}
        />

        <TextInput
          placeholder="Naziv"
          placeholderTextColor={colors.mutedForeground}
          value={naziv}
          onChangeText={setNaziv}
          returnKeyType="next"
          onSubmitEditing={() => iznosRef.current?.focus()}
          style={[styles.input, { backgroundColor: colors.card, borderColor: boja + "44", color: colors.foreground }]}
        />

        <View style={styles.inputRow}>
          <TextInput
            placeholder="dd.mm.yyyy"
            placeholderTextColor={colors.mutedForeground}
            value={datum}
            onChangeText={setDatum}
            keyboardType="numbers-and-punctuation"
            style={[styles.inputPola, { backgroundColor: colors.card, borderColor: boja + "44", color: colors.foreground }]}
          />
          <TextInput
            ref={iznosRef}
            placeholder="Iznos (€)"
            placeholderTextColor={colors.mutedForeground}
            value={iznos}
            onChangeText={setIznos}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={dodajStavku}
            style={[styles.inputPola, { backgroundColor: colors.card, borderColor: boja + "44", color: boja, fontFamily: "Inter_700Bold" }]}
          />
        </View>

        {greska !== "" && <Text style={[styles.greska, { color: colors.expense }]}>{greska}</Text>}

        <Pressable
          onPress={dodajStavku}
          style={({ pressed }) => [styles.dodajTipka, { backgroundColor: boja, opacity: pressed ? 0.8 : 1, marginTop: 10 }]}
        >
          <Text style={[styles.dodajTekst, { color: "#000000" }]}>+ Dodaj stavku</Text>
        </Pressable>
      </View>

      {/* Lista sa sekcijama */}
      <SectionList
        sections={sekcije}
        keyExtractor={(item) => item.id}
        style={styles.lista}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={styles.prazno}>
            <Text style={[styles.praznoTekst, { color: colors.mutedForeground }]}>Nema unesenih stavki.</Text>
            <Text style={[styles.praznoOpisnik, { color: "#333333" }]}>Dodaj prvu stavku gore.</Text>
          </View>
        }
        renderSectionHeader={({ section }) => {
          const otvorena = prosirene.has(section.title);
          return (
            <Pressable
              onPress={() => toggleSekciju(section.title)}
              style={[styles.sekcijaNaslovRow, { backgroundColor: "#0d0d0d", borderBottomColor: colors.border, borderTopColor: colors.border }]}
            >
              <View style={[styles.sekcijaAkcent, { backgroundColor: boja }]} />
              <Text style={[styles.sekcijaNaslov, { color: colors.foreground }]}>{section.title}</Text>
              <Text style={[styles.sekcijaUkupno, { color: boja }]}>
                {isGreen ? "+" : "-"}{section.ukupno.toFixed(2)} €
              </Text>
              <Text style={[styles.sekcijaStrelica, { color: boja }]}>
                {otvorena ? "▴" : "▾"}
              </Text>
            </Pressable>
          );
        }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => otvoriUredivanje(item)}
            onLongPress={() => obrisiStavku(item.id)}
            style={[styles.stavkaRow, { borderBottomColor: colors.border }]}
          >
            <View style={styles.stavkaInfo}>
              <Text style={[styles.stavkaNaziv, { color: colors.foreground }]}>{item.naziv}</Text>
              <Text style={[styles.stavkaDatum, { color: colors.mutedForeground }]}>{item.datum}</Text>
            </View>
            <Text style={[styles.stavkaIznos, { color: boja }]}>
              {isGreen ? "+" : "-"}{item.iznos.toFixed(2)} €
            </Text>
          </Pressable>
        )}
      />

      {stavke.length > 0 && (
        <Text style={[styles.brisanjeHint, { color: "#333333" }]}>
          Pritisak za uređivanje  ·  Dugi pritisak za brisanje
        </Text>
      )}

      {/* Modal za uređivanje */}
      <Modal visible={uredujId !== null} animationType="slide" transparent onRequestClose={() => setUredujId(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "padding"} style={styles.kavOverlay}>
          <Pressable style={styles.modalOverlay} onPress={() => setUredujId(null)} />
          <View style={[styles.modalPanel, { backgroundColor: "#0d0d0d", borderTopColor: boja, paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalNaslov, { color: colors.foreground }]}>Uredi stavku</Text>
              <Pressable onPress={() => setUredujId(null)} hitSlop={12}>
                <Text style={[styles.modalZatvori, { color: colors.mutedForeground }]}>✕</Text>
              </Pressable>
            </View>

          <KategorijaPicker
            kategorije={kategorije}
            odabrana={uredujForma.kategorija}
            boja={boja}
            colors={colors}
            onOdaberi={(k) => setUredujForma((f) => ({ ...f, kategorija: k }))}
            onDodaj={dodajKategoriju}
            onObrisi={obrisiKategoriju}
          />

          <TextInput
            placeholder="Naziv"
            placeholderTextColor={colors.mutedForeground}
            value={uredujForma.naziv}
            onChangeText={(v) => setUredujForma((f) => ({ ...f, naziv: v }))}
            style={[styles.input, { backgroundColor: colors.card, borderColor: boja + "44", color: colors.foreground }]}
          />

          <View style={styles.inputRow}>
            <TextInput
              placeholder="dd.mm.yyyy"
              placeholderTextColor={colors.mutedForeground}
              value={uredujForma.datum}
              onChangeText={(v) => setUredujForma((f) => ({ ...f, datum: v }))}
              keyboardType="numbers-and-punctuation"
              style={[styles.inputPola, { backgroundColor: colors.card, borderColor: boja + "44", color: colors.foreground }]}
            />
            <TextInput
              placeholder="Iznos (€)"
              placeholderTextColor={colors.mutedForeground}
              value={uredujForma.iznos}
              onChangeText={(v) => setUredujForma((f) => ({ ...f, iznos: v }))}
              keyboardType="decimal-pad"
              style={[styles.inputPola, { backgroundColor: colors.card, borderColor: boja + "44", color: boja, fontFamily: "Inter_700Bold" }]}
            />
          </View>

          {uredujGreska !== "" && <Text style={[styles.greska, { color: colors.expense }]}>{uredujGreska}</Text>}

          <View style={[styles.modalTipkeRow, { marginTop: 10 }]}>
            <Pressable
              onPress={() => uredujStavka && obrisiStavku(uredujStavka.id)}
              style={({ pressed }) => [styles.modalBrisiTipka, { borderColor: colors.expense, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={[styles.modalBrisiTekst, { color: colors.expense }]}>Obriši</Text>
            </Pressable>
            <Pressable
              onPress={spremiUredivanje}
              style={({ pressed }) => [styles.modalSpremiTipka, { backgroundColor: boja, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={[styles.dodajTekst, { color: "#000" }]}>Spremi</Text>
            </Pressable>
          </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
  },
  nazadTipka: { marginRight: 12 },
  nazadStrelica: { fontSize: 32, lineHeight: 36 },
  headerNaslov: { fontSize: 20, fontFamily: "Inter_700Bold", flex: 1 },
  headerUkupno: { fontSize: 16, fontFamily: "Inter_700Bold" },
  forma: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1 },
  formaLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 12 },
  input: {
    borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 8,
  },
  inputRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  inputPola: {
    flex: 1, borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontFamily: "Inter_400Regular",
  },
  greska: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 8 },
  dodajTipka: { borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  dodajTekst: { fontSize: 15, fontFamily: "Inter_700Bold" },
  lista: { flex: 1 },
  sekcijaNaslovRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: 1, borderTopWidth: 1, gap: 10,
  },
  sekcijaAkcent: { width: 3, height: 16, borderRadius: 2 },
  sekcijaNaslov: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  sekcijaUkupno: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sekcijaStrelica: { fontSize: 18, fontFamily: "Inter_400Regular", width: 20, textAlign: "center" },
  stavkaRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1,
  },
  stavkaInfo: { flex: 1, gap: 3 },
  stavkaNaziv: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  stavkaDatum: { fontSize: 12, fontFamily: "Inter_400Regular" },
  stavkaIznos: { fontSize: 16, fontFamily: "Inter_700Bold" },
  prazno: { alignItems: "center", paddingVertical: 40, gap: 6 },
  praznoTekst: { fontSize: 15, fontFamily: "Inter_500Medium" },
  praznoOpisnik: { fontSize: 13, fontFamily: "Inter_400Regular" },
  brisanjeHint: { textAlign: "center", fontSize: 11, fontFamily: "Inter_400Regular", paddingVertical: 10 },
  kavOverlay: { flex: 1, justifyContent: "flex-end" },
  modalOverlay: { flex: 1, backgroundColor: "#00000088" },
  modalPanel: { paddingHorizontal: 20, paddingTop: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 3 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalStavkaNaziv: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 2 },
  modalNaslov: { fontSize: 17, fontFamily: "Inter_700Bold" },
  modalZatvori: { fontSize: 18, fontFamily: "Inter_400Regular" },
  modalTipkeRow: { flexDirection: "row", gap: 10 },
  modalBrisiTipka: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  modalBrisiTekst: { fontSize: 15, fontFamily: "Inter_700Bold" },
  modalSpremiTipka: { flex: 2, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  // Picker
  pickerTipka: {
    borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
    justifyContent: "center",
  },
  pickerTekst: { fontSize: 14, fontFamily: "Inter_400Regular" },
  pickerCheck: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
  },
  pickerCheckTekst: { fontSize: 12, color: "#000", fontFamily: "Inter_700Bold" },
  pickerInlineForma: {
    borderWidth: 1.5, borderRadius: 10,
    padding: 12, marginBottom: 8,
  },
  novaKatOverlay: { flex: 1, justifyContent: "flex-end" },
  novaKatModal: {
    borderTopWidth: 3, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  novaKatTipkeRow: { flexDirection: "row", gap: 8 },
  pickerOverlay: { flex: 1 },
  pickerPanel: {
    borderRadius: 12, borderWidth: 1, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  pickerStavka: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  pickerStavkaTekst: { fontSize: 15, fontFamily: "Inter_500Medium" },
  pickerInput: {
    borderWidth: 1.5, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontFamily: "Inter_400Regular",
  },
  pickerMalaTipka: {
    flex: 1, borderWidth: 1.5, borderRadius: 8,
    paddingVertical: 10, alignItems: "center",
  },
  pickerMalaTekst: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
