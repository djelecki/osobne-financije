import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
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

const STORAGE_KEY = "fin_standardni_v5";
const BOJA_PLAVA = "#60a5fa";
const BOJA_PRIHOD = "#22c55e";
const BOJA_RASHOD = "#ef4444";

const MJESECI = [
  "Siječanj", "Veljača", "Ožujak", "Travanj",
  "Svibanj", "Lipanj", "Srpanj", "Kolovoz",
  "Rujan", "Listopad", "Studeni", "Prosinac",
];

// Standardne stavke — iste u svim månacima, iznosi po månadu
interface Stavka {
  id: string;
  naziv: string;
  iznosi: Record<string, number>;
  fixed?: boolean;
  isKucainstv?: boolean; // posebna stavka — iznos se računa iz podkategorija
}

// Podkategorije unutar Kućanstva — iste u svim månacima, iznosi po månadu
interface KucainstvoKat {
  id: string;
  naziv: string;
  iznosi: Record<string, number>;
}

interface Podaci {
  stavke: Stavka[];
  kucainstvoKat: KucainstvoKat[];
}

const FIKSNE_POCETNE: Stavka[] = [
  { id: "neto-placa", naziv: "Neto plaća",  iznosi: {}, fixed: true },
  { id: "kucainstv",  naziv: "Kućanstvo",   iznosi: {}, fixed: true, isKucainstv: true },
];

function ucitaj(raw: string | null): Podaci {
  if (!raw) return { stavke: structuredClone(FIKSNE_POCETNE), kucainstvoKat: [] };
  try {
    const p = JSON.parse(raw);
    const stavke: Stavka[] = Array.isArray(p.stavke) ? p.stavke : structuredClone(FIKSNE_POCETNE);
    const kucainstvoKat: KucainstvoKat[] = Array.isArray(p.kucainstvoKat) ? p.kucainstvoKat : [];
    // Osiguraj fiksne stavke
    if (!stavke.find((s) => s.id === "neto-placa")) stavke.unshift(structuredClone(FIKSNE_POCETNE[0]));
    if (!stavke.find((s) => s.id === "kucainstv")) {
      const idx = stavke.findIndex((s) => s.id === "neto-placa");
      stavke.splice(idx + 1, 0, structuredClone(FIKSNE_POCETNE[1]));
    }
    // Obriši staru "Štednja" stavku ako postoji
    const bez = stavke.filter((s) => s.id !== "stednja");
    return { stavke: bez, kucainstvoKat };
  } catch { return { stavke: structuredClone(FIKSNE_POCETNE), kucainstvoKat: [] }; }
}

export default function StandardniEkran() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [stavke, setStavke] = useState<Stavka[]>(structuredClone(FIKSNE_POCETNE));
  const [kucainstvoKat, setKucainstvoKat] = useState<KucainstvoKat[]>([]);
  const [prosirene, setProsirene] = useState<Set<string>>(new Set());

  // Modal — Dodaj novu stavku (globalno)
  const [modalDodaj, setModalDodaj] = useState(false);
  const [noviNaziv, setNoviNaziv] = useState("");
  const [noviGreska, setNoviGreska] = useState("");
  const noviNazivRef = useRef<TextInput>(null);

  // Modal — Uredi iznos stavke za određeni månad
  const [uredujId, setUredujId] = useState<string | null>(null);
  const [uredujMjesec, setUredujMjesec] = useState("");
  const [uredujIznos, setUredujIznos] = useState("");
  const [uredujGreska, setUredujGreska] = useState("");
  const uredujIznosRef = useRef<TextInput>(null);
  const kucaBudzetIznosRef = useRef<TextInput>(null);
  const katUrIznosRef = useRef<TextInput>(null);

  // Modal — Kućanstvo (podkategorije za određeni månad)
  const [kucainstvoMjesec, setKucainstvoMjesec] = useState<string | null>(null);
  // Unutar Kućanstvo modala — dodaj podkategoriju
  const [katDodaj, setKatDodaj] = useState(false);
  const [katNoviNaziv, setKatNoviNaziv] = useState("");
  const [katNoviGreska, setKatNoviGreska] = useState("");
  const katNoviRef = useRef<TextInput>(null);
  // Unutar Kućanstvo modala — uredi iznos podkategorije
  const [katUrId, setKatUrId] = useState<string | null>(null);
  const [katUrIznos, setKatUrIznos] = useState("");
  const [katUrGreska, setKatUrGreska] = useState("");
  // Unutar Kućanstvo modala — uredi budžet
  const [kucaBudzetUredi, setKucaBudzetUredi] = useState(false);
  const [kucaBudzetIznos, setKucaBudzetIznos] = useState("");
  const [kucaBudzetGreska, setKucaBudzetGreska] = useState("");

  const topPadding = Platform.OS === "web" ? 67 : 0;
  const bottomPadding = Platform.OS === "web" ? 34 : 0;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      const p = ucitaj(raw);
      setStavke(p.stavke);
      setKucainstvoKat(p.kucainstvoKat);
    });
  }, []);

  async function spremi(noveStavke: Stavka[], noveKat: KucainstvoKat[]) {
    setStavke(noveStavke);
    setKucainstvoKat(noveKat);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ stavke: noveStavke, kucainstvoKat: noveKat }));
  }

  // Budžet Kućanstva = iznos koji je korisnik postavio za kućanstvo (ne suma podkategorija)
  function budzetKucainstv(mjäsec: string) {
    return stavke.find((s) => s.id === "kucainstv")?.iznosi[mjäsec] ?? 0;
  }

  // Suma ručno unesenih kategorija Kućanstva (bez Hrane)
  function sumaKategorija(mjäsec: string) {
    return kucainstvoKat.reduce((sum, k) => sum + (k.iznosi[mjäsec] ?? 0), 0);
  }

  // Hrana = budžet kućanstva − suma ostalih kategorija
  function iznosHrana(mjäsec: string) {
    return budzetKucainstv(mjäsec) - sumaKategorija(mjäsec);
  }

  function izracunajBudzet(mjäsec: string) {
    const neto = stavke.find((s) => s.id === "neto-placa")?.iznosi[mjäsec] ?? 0;
    const kuca = budzetKucainstv(mjäsec);
    const ostale = stavke.filter((s) => !s.fixed).reduce((sum, s) => sum + (s.iznosi[mjäsec] ?? 0), 0);
    return neto - kuca - ostale;
  }

  function otvorKucaBudzet() {
    if (!kucainstvoMjesec) return;
    const v = budzetKucainstv(kucainstvoMjesec);
    setKucaBudzetIznos(v > 0 ? v.toFixed(2) : "");
    setKucaBudzetGreska("");
    setKucaBudzetUredi(true);
  }

  async function potvrdiKucaBudzet() {
    if (!kucainstvoMjesec) return;
    const raw = kucaBudzetIznos.replace(",", ".");
    const iznos = raw === "" ? 0 : parseFloat(raw);
    if (isNaN(iznos) || iznos < 0) { setKucaBudzetGreska("Unesite ispravan iznos."); return; }
    await spremi(
      stavke.map((s) => s.id === "kucainstv" ? { ...s, iznosi: { ...s.iznosi, [kucainstvoMjesec]: iznos } } : s),
      kucainstvoKat
    );
    setKucaBudzetUredi(false);
  }

  function toggleSekciju(m: string) {
    setProsirene((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  }

  // ── Dodaj globalnu stavku ──
  function otvorDodaj() {
    setNoviNaziv(""); setNoviGreska(""); setModalDodaj(true);
    setTimeout(() => noviNazivRef.current?.focus(), 150);
  }
  async function potvrdiDodaj() {
    if (!noviNaziv.trim()) { setNoviGreska("Unesite naziv."); return; }
    const nova: Stavka = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      naziv: noviNaziv.trim(), iznosi: {},
    };
    await spremi([...stavke, nova], kucainstvoKat);
    setModalDodaj(false);
  }

  // ── Uredi iznos globalne stavke ──
  function otvorUredi(id: string, mjäsec: string) {
    const s = stavke.find((x) => x.id === id);
    if (!s) return;
    setUredujId(id); setUredujMjesec(mjäsec);
    const v = s.iznosi[mjäsec];
    setUredujIznos(v != null && v > 0 ? v.toFixed(2) : "");
    setUredujGreska("");
  }
  async function potvrdiUredi() {
    const raw = uredujIznos.replace(",", ".");
    const iznosNum = raw === "" ? 0 : parseFloat(raw);
    if (isNaN(iznosNum) || iznosNum < 0) { setUredujGreska("Unesite ispravan iznos."); return; }
    await spremi(
      stavke.map((s) => s.id === uredujId ? { ...s, iznosi: { ...s.iznosi, [uredujMjesec]: iznosNum } } : s),
      kucainstvoKat
    );
    setUredujId(null);
  }
  async function obrisiStavku(id: string) {
    await spremi(stavke.filter((s) => s.id !== id), kucainstvoKat);
    setUredujId(null);
  }

  // ── Kućanstvo podkategorije ──
  function otvorKucainstv(mjäsec: string) {
    setKucainstvoMjesec(mjäsec);
    setKatDodaj(false); setKatUrId(null);
  }
  function otvorKatDodaj() {
    setKatNoviNaziv(""); setKatNoviGreska(""); setKatDodaj(true);
    setTimeout(() => katNoviRef.current?.focus(), 150);
  }
  async function potvrdiKatDodaj() {
    if (!katNoviNaziv.trim()) { setKatNoviGreska("Unesite naziv."); return; }
    const nova: KucainstvoKat = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      naziv: katNoviNaziv.trim(), iznosi: {},
    };
    await spremi(stavke, [...kucainstvoKat, nova]);
    setKatDodaj(false);
  }
  function otvorKatUredi(id: string) {
    const k = kucainstvoKat.find((x) => x.id === id);
    if (!k || !kucainstvoMjesec) return;
    setKatUrId(id);
    const v = k.iznosi[kucainstvoMjesec];
    setKatUrIznos(v != null && v > 0 ? v.toFixed(2) : "");
    setKatUrGreska("");
  }
  async function potvrdiKatUredi() {
    if (!kucainstvoMjesec) return;
    const raw = katUrIznos.replace(",", ".");
    const iznosNum = raw === "" ? 0 : parseFloat(raw);
    if (isNaN(iznosNum) || iznosNum < 0) { setKatUrGreska("Unesite ispravan iznos."); return; }
    await spremi(
      stavke,
      kucainstvoKat.map((k) => k.id === katUrId ? { ...k, iznosi: { ...k.iznosi, [kucainstvoMjesec]: iznosNum } } : k)
    );
    setKatUrId(null);
  }
  async function obrisiKat(id: string) {
    await spremi(stavke, kucainstvoKat.filter((k) => k.id !== id));
    setKatUrId(null);
  }

  // Sekcije SectionList
  const sekcije = MJESECI.map((m) => ({
    title: m,
    data: prosirene.has(m) ? stavke : [],
  }));

  const uredujStavka = stavke.find((x) => x.id === uredujId);
  const katUrStavka = kucainstvoKat.find((x) => x.id === katUrId);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + topPadding, paddingBottom: insets.bottom + bottomPadding }]}>

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backTipka}>
          <Text style={[styles.backTekst, { color: BOJA_PLAVA }]}>‹ Natrag</Text>
        </Pressable>
        <Text style={[styles.headerNaslov, { color: colors.foreground }]}>Standardni unosi</Text>
        <View style={{ width: 70 }} />
      </View>

      {/* Gumb Dodaj */}
      <View style={styles.dodajWrapper}>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); otvorDodaj(); }}
          style={[styles.dodajTipka, { backgroundColor: BOJA_PLAVA }]}
        >
          <Text style={styles.dodajTekst}>+ Dodaj stavku</Text>
        </Pressable>
      </View>

      {/* Lista 12 månadi */}
      <SectionList
        sections={sekcije}
        style={styles.lista}
        keyExtractor={(item, i) => item.id + i}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => {
          const otvorena = prosirene.has(section.title);
          const budzet = izracunajBudzet(section.title);
          const bojaBudzet = budzet >= 0 ? BOJA_PRIHOD : BOJA_RASHOD;
          return (
            <Pressable
              onPress={() => toggleSekciju(section.title)}
              style={[styles.sekcijaNaslovRow, { backgroundColor: "#0d0d0d", borderBottomColor: colors.border, borderTopColor: colors.border }]}
            >
              <View style={[styles.sekcijaAkcent, { backgroundColor: BOJA_PLAVA }]} />
              <Text style={[styles.sekcijaNaslov, { color: colors.foreground }]}>{section.title}</Text>
              <Text style={[styles.sekcijaBudzet, { color: bojaBudzet }]}>
                {budzet >= 0 ? "" : "-"}{Math.abs(budzet).toFixed(2)} €
              </Text>
              <Text style={[styles.sekcijaStrelica, { color: BOJA_PLAVA }]}>{otvorena ? "▴" : "▾"}</Text>
            </Pressable>
          );
        }}
        renderItem={({ item, section }) => {
          const isKuca = item.isKucainstv === true;
          const iznos = isKuca ? budzetKucainstv(section.title) : (item.iznosi[section.title] ?? 0);
          if (isKuca) {
            // Kućanstvo — lijevu stranu tapkamo za iznos popup, "›" za puni ekran
            return (
              <View style={[styles.stavkaRow, { borderBottomColor: colors.border }]}>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); otvorUredi(item.id, section.title); }}
                  style={styles.stavkaInfo}
                >
                  <Text style={[styles.stavkaNaziv, { color: colors.foreground }]}>{item.naziv}</Text>
                </Pressable>
                <Text style={[styles.stavkaIznos, { color: colors.foreground }]}>{iznos.toFixed(2)} €</Text>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); otvorKucainstv(section.title); }}
                  hitSlop={12}
                >
                  <Text style={[styles.kucaStrelica, { color: BOJA_PLAVA }]}>›</Text>
                </Pressable>
              </View>
            );
          }
          return (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); otvorUredi(item.id, section.title); }}
              onLongPress={() => {
                if (item.fixed) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                Alert.alert("Obriši stavku", `Obrisati "${item.naziv}" iz svih månadi?`, [
                  { text: "Odustani", style: "cancel" },
                  { text: "Obriši", style: "destructive", onPress: () => obrisiStavku(item.id) },
                ]);
              }}
              style={[styles.stavkaRow, { borderBottomColor: colors.border }]}
            >
              <View style={styles.stavkaInfo}>
                <Text style={[styles.stavkaNaziv, { color: colors.foreground }]}>{item.naziv}</Text>
              </View>
              <Text style={[styles.stavkaIznos, { color: colors.foreground }]}>{iznos.toFixed(2)} €</Text>
            </Pressable>
          );
        }}
        renderSectionFooter={({ section }) => (
          prosirene.has(section.title) ? <View style={{ height: 6 }} /> : null
        )}
      />

      {/* Modal — Dodaj novu stavku */}
      <Modal visible={modalDodaj} transparent animationType="slide" onRequestClose={() => setModalDodaj(false)}
        onShow={() => { setTimeout(() => noviNazivRef.current?.focus(), 100); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "padding"} style={styles.kav}>
          <Pressable style={styles.modalOverlay} onPress={() => setModalDodaj(false)} />
          <View style={[styles.modalSadrzaj, { backgroundColor: colors.card, borderTopColor: BOJA_PLAVA, paddingBottom: insets.bottom + 28 }]}>
            <Text style={[styles.modalNaslov, { color: colors.foreground, marginBottom: 14 }]}>Nova stavka</Text>
            <TextInput
              ref={noviNazivRef}
              placeholder="Naziv stavke"
              placeholderTextColor={colors.mutedForeground}
              value={noviNaziv}
              onChangeText={setNoviNaziv}
              returnKeyType="done"
              onSubmitEditing={potvrdiDodaj}
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            />
            {noviGreska !== "" && <Text style={[styles.greska, { color: BOJA_RASHOD }]}>{noviGreska}</Text>}
            <View style={styles.modalTipkeRow}>
              <Pressable onPress={() => setModalDodaj(false)} style={[styles.modalOdustaniTipka, { borderColor: colors.border }]}>
                <Text style={[styles.modalOdustaniTekst, { color: colors.mutedForeground }]}>Odustani</Text>
              </Pressable>
              <Pressable onPress={potvrdiDodaj} style={[styles.modalSpremiTipka, { backgroundColor: BOJA_PLAVA }]}>
                <Text style={styles.modalSpremiTekst}>Dodaj</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal — Uredi iznos stavke za månad */}
      <Modal visible={uredujId !== null} transparent animationType="slide" onRequestClose={() => setUredujId(null)}
        onShow={() => { setTimeout(() => uredujIznosRef.current?.focus(), 100); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "padding"} style={styles.kav}>
          <Pressable style={styles.modalOverlay} onPress={() => setUredujId(null)} />
          <View style={[styles.modalSadrzaj, { backgroundColor: colors.card, borderTopColor: BOJA_PLAVA, paddingBottom: insets.bottom + 28 }]}>
            <Text style={[styles.modalNaslov, { color: colors.foreground }]}>{uredujStavka?.naziv}</Text>
            <Text style={[styles.modalPodnaslov, { color: colors.mutedForeground }]}>{uredujMjesec}</Text>
            <TextInput
              ref={uredujIznosRef}
              placeholder="Iznos (€)"
              placeholderTextColor={colors.mutedForeground}
              value={uredujIznos}
              onChangeText={setUredujIznos}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={potvrdiUredi}
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            />
            {uredujGreska !== "" && <Text style={[styles.greska, { color: BOJA_RASHOD }]}>{uredujGreska}</Text>}
            <View style={styles.modalTipkeRow}>
              {!uredujStavka?.fixed && (
                <Pressable
                  onPress={() => Alert.alert("Obriši stavku", `Obrisati "${uredujStavka?.naziv}" iz svih månadi?`, [
                    { text: "Odustani", style: "cancel" },
                    { text: "Obriši", style: "destructive", onPress: () => obrisiStavku(uredujId!) },
                  ])}
                  style={[styles.modalBrisiTipka, { borderColor: BOJA_RASHOD }]}
                >
                  <Text style={[styles.modalBrisiTekst, { color: BOJA_RASHOD }]}>Obriši</Text>
                </Pressable>
              )}
              <Pressable onPress={() => setUredujId(null)} style={[styles.modalOdustaniTipka, { borderColor: colors.border }]}>
                <Text style={[styles.modalOdustaniTekst, { color: colors.mutedForeground }]}>Odustani</Text>
              </Pressable>
              <Pressable onPress={potvrdiUredi} style={[styles.modalSpremiTipka, { backgroundColor: BOJA_PLAVA }]}>
                <Text style={styles.modalSpremiTekst}>Spremi</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal — Kućanstvo podkategorije */}
      <Modal visible={kucainstvoMjesec !== null} transparent animationType="slide" onRequestClose={() => setKucainstvoMjesec(null)}>
        <View style={[styles.kucaOverlay, { backgroundColor: colors.background, paddingTop: insets.top + topPadding, paddingBottom: insets.bottom + bottomPadding }]}>

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setKucainstvoMjesec(null)} style={styles.backTipka}>
              <Text style={[styles.backTekst, { color: BOJA_PLAVA }]}>‹ Natrag</Text>
            </Pressable>
            <View style={{ alignItems: "center" }}>
              <Text style={[styles.headerNaslov, { color: colors.foreground }]}>Kućanstvo</Text>
              <Text style={[styles.kucaMjesecLabel, { color: colors.mutedForeground }]}>{kucainstvoMjesec}</Text>
            </View>
            <View style={{ width: 70 }} />
          </View>

          {/* Gumb Dodaj kategoriju */}
          <View style={styles.dodajWrapper}>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); otvorKatDodaj(); }}
              style={[styles.dodajTipka, { backgroundColor: BOJA_PLAVA }]}
            >
              <Text style={styles.dodajTekst}>+ Dodaj kategoriju</Text>
            </Pressable>
          </View>

          {/* Budžet red — samo prikaz */}
          <View style={[styles.kucaBudzetRow, { borderBottomColor: colors.border, borderTopColor: colors.border }]}>
            <View style={styles.stavkaInfo}>
              <Text style={[styles.kucaBudzetLabel, { color: colors.mutedForeground }]}>Budžet kućanstva</Text>
            </View>
            <Text style={[styles.stavkaIznos, { color: colors.foreground }]}>
              {budzetKucainstv(kucainstvoMjesec!).toFixed(2)} €
            </Text>
          </View>

          {/* Lista podkategorija */}
          <ScrollView style={{ flex: 1 }}>
            {kucainstvoKat.map((k) => {
              const iznos = k.iznosi[kucainstvoMjesec!] ?? 0;
              return (
                <Pressable
                  key={k.id}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); otvorKatUredi(k.id); }}
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Alert.alert("Obriši kategoriju", `Obrisati "${k.naziv}" iz svih månadi?`, [
                      { text: "Odustani", style: "cancel" },
                      { text: "Obriši", style: "destructive", onPress: () => obrisiKat(k.id) },
                    ]);
                  }}
                  style={[styles.stavkaRow, { borderBottomColor: colors.border }]}
                >
                  <View style={styles.stavkaInfo}>
                    <Text style={[styles.stavkaNaziv, { color: colors.foreground }]}>{k.naziv}</Text>
                  </View>
                  <Text style={[styles.stavkaIznos, { color: colors.foreground }]}>
                    {iznos.toFixed(2)} €
                  </Text>
                </Pressable>
              );
            })}

            {/* Hrana — uvijek zadnja, računata */}
            {(() => {
              const hrana = iznosHrana(kucainstvoMjesec!);
              const bojaHrana = hrana >= 0 ? colors.foreground : BOJA_RASHOD;
              return (
                <View style={[styles.hranaRow, { borderTopColor: colors.border }]}>
                  <View style={styles.stavkaInfo}>
                    <Text style={[styles.stavkaNaziv, { color: colors.foreground }]}>Hrana</Text>
                  </View>
                  <Text style={[styles.stavkaIznos, { color: bojaHrana }]}>
                    {hrana.toFixed(2)} €
                  </Text>
                </View>
              );
            })()}
          </ScrollView>

          {/* Sub-modal — Uredi budžet kućanstva */}
          <Modal visible={kucaBudzetUredi} transparent animationType="slide" onRequestClose={() => setKucaBudzetUredi(false)}
            onShow={() => { setTimeout(() => kucaBudzetIznosRef.current?.focus(), 100); }}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "padding"} style={styles.kav}>
              <Pressable style={styles.modalOverlay} onPress={() => setKucaBudzetUredi(false)} />
              <View style={[styles.modalSadrzaj, { backgroundColor: colors.card, borderTopColor: BOJA_PLAVA, paddingBottom: insets.bottom + 28 }]}>
                <Text style={[styles.modalNaslov, { color: colors.foreground }]}>Budžet kućanstva</Text>
                <Text style={[styles.modalPodnaslov, { color: colors.mutedForeground }]}>{kucainstvoMjesec}</Text>
                <TextInput
                  ref={kucaBudzetIznosRef}
                  placeholder="Iznos (€)"
                  placeholderTextColor={colors.mutedForeground}
                  value={kucaBudzetIznos}
                  onChangeText={setKucaBudzetIznos}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={potvrdiKucaBudzet}
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                />
                {kucaBudzetGreska !== "" && <Text style={[styles.greska, { color: BOJA_RASHOD }]}>{kucaBudzetGreska}</Text>}
                <View style={styles.modalTipkeRow}>
                  <Pressable onPress={() => setKucaBudzetUredi(false)} style={[styles.modalOdustaniTipka, { borderColor: colors.border }]}>
                    <Text style={[styles.modalOdustaniTekst, { color: colors.mutedForeground }]}>Odustani</Text>
                  </Pressable>
                  <Pressable onPress={potvrdiKucaBudzet} style={[styles.modalSpremiTipka, { backgroundColor: BOJA_PLAVA }]}>
                    <Text style={styles.modalSpremiTekst}>Spremi</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          {/* Sub-modal — Dodaj kategoriju */}
          <Modal visible={katDodaj} transparent animationType="slide" onRequestClose={() => setKatDodaj(false)}
            onShow={() => { setTimeout(() => katNoviRef.current?.focus(), 100); }}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "padding"} style={styles.kav}>
              <Pressable style={styles.modalOverlay} onPress={() => setKatDodaj(false)} />
              <View style={[styles.modalSadrzaj, { backgroundColor: colors.card, borderTopColor: BOJA_PLAVA, paddingBottom: insets.bottom + 28 }]}>
                <Text style={[styles.modalNaslov, { color: colors.foreground, marginBottom: 14 }]}>Nova kategorija</Text>
                <TextInput
                  ref={katNoviRef}
                  placeholder="Naziv kategorije"
                  placeholderTextColor={colors.mutedForeground}
                  value={katNoviNaziv}
                  onChangeText={setKatNoviNaziv}
                  returnKeyType="done"
                  onSubmitEditing={potvrdiKatDodaj}
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                />
                {katNoviGreska !== "" && <Text style={[styles.greska, { color: BOJA_RASHOD }]}>{katNoviGreska}</Text>}
                <View style={styles.modalTipkeRow}>
                  <Pressable onPress={() => setKatDodaj(false)} style={[styles.modalOdustaniTipka, { borderColor: colors.border }]}>
                    <Text style={[styles.modalOdustaniTekst, { color: colors.mutedForeground }]}>Odustani</Text>
                  </Pressable>
                  <Pressable onPress={potvrdiKatDodaj} style={[styles.modalSpremiTipka, { backgroundColor: BOJA_PLAVA }]}>
                    <Text style={styles.modalSpremiTekst}>Dodaj</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          {/* Sub-modal — Uredi iznos kategorije */}
          <Modal visible={katUrId !== null} transparent animationType="slide" onRequestClose={() => setKatUrId(null)}
            onShow={() => { setTimeout(() => katUrIznosRef.current?.focus(), 100); }}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "padding"} style={styles.kav}>
              <Pressable style={styles.modalOverlay} onPress={() => setKatUrId(null)} />
              <View style={[styles.modalSadrzaj, { backgroundColor: colors.card, borderTopColor: BOJA_PLAVA, paddingBottom: insets.bottom + 28 }]}>
                <Text style={[styles.modalNaslov, { color: colors.foreground }]}>{katUrStavka?.naziv}</Text>
                <Text style={[styles.modalPodnaslov, { color: colors.mutedForeground }]}>{kucainstvoMjesec}</Text>
                <TextInput
                  ref={katUrIznosRef}
                  placeholder="Iznos (€)"
                  placeholderTextColor={colors.mutedForeground}
                  value={katUrIznos}
                  onChangeText={setKatUrIznos}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={potvrdiKatUredi}
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                />
                {katUrGreska !== "" && <Text style={[styles.greska, { color: BOJA_RASHOD }]}>{katUrGreska}</Text>}
                <View style={styles.modalTipkeRow}>
                  <Pressable
                    onPress={() => Alert.alert("Obriši", `Obrisati "${katUrStavka?.naziv}"?`, [
                      { text: "Odustani", style: "cancel" },
                      { text: "Obriši", style: "destructive", onPress: () => obrisiKat(katUrId!) },
                    ])}
                    style={[styles.modalBrisiTipka, { borderColor: BOJA_RASHOD }]}
                  >
                    <Text style={[styles.modalBrisiTekst, { color: BOJA_RASHOD }]}>Obriši</Text>
                  </Pressable>
                  <Pressable onPress={() => setKatUrId(null)} style={[styles.modalOdustaniTipka, { borderColor: colors.border }]}>
                    <Text style={[styles.modalOdustaniTekst, { color: colors.mutedForeground }]}>Odustani</Text>
                  </Pressable>
                  <Pressable onPress={potvrdiKatUredi} style={[styles.modalSpremiTipka, { backgroundColor: BOJA_PLAVA }]}>
                    <Text style={styles.modalSpremiTekst}>Spremi</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  backTipka: { width: 70 },
  backTekst: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  headerNaslov: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  kucaMjesecLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  dodajWrapper: { paddingHorizontal: 16, paddingVertical: 12, alignItems: "center" },
  dodajTipka: { borderRadius: 10, paddingVertical: 13, paddingHorizontal: 32, alignItems: "center" },
  dodajTekst: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#000" },
  lista: { flex: 1 },
  sekcijaNaslovRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: 1, borderTopWidth: 1, gap: 10,
  },
  sekcijaAkcent: { width: 3, height: 16, borderRadius: 2 },
  sekcijaNaslov: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  sekcijaBudzet: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sekcijaStrelica: { fontSize: 18, width: 20, textAlign: "center" },
  stavkaRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, gap: 8,
  },
  stavkaInfo: { flex: 1 },
  stavkaNaziv: { fontSize: 15, fontFamily: "Inter_500Medium" },
  stavkaIznos: { fontSize: 16, fontFamily: "Inter_700Bold" },
  kucaStrelica: { fontSize: 20 },
  kucaOverlay: { flex: 1 },
  kucaBudzetRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1, borderBottomWidth: 1,
    backgroundColor: "#0d0d0d",
  },
  kucaBudzetLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  hranaRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1,
  },
  input: {
    borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 10,
  },
  greska: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 6 },
  kav: { flex: 1, justifyContent: "flex-end" },
  modalOverlay: { flex: 1, backgroundColor: "#000000aa" },
  modalSadrzaj: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 3, padding: 20,
  },
  modalNaslov: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 2, textAlign: "center" },
  modalPodnaslov: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 14 },
  modalTipkeRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  modalBrisiTipka: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  modalBrisiTekst: { fontSize: 15, fontFamily: "Inter_700Bold" },
  modalOdustaniTipka: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  modalOdustaniTekst: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  modalSpremiTipka: { flex: 2, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  modalSpremiTekst: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#000" },
});
