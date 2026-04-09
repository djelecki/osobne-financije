import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

import { useColors } from "@/hooks/useColors";

interface Stavka {
  id: string;
  naziv: string;
  datum: string;
  iznos: number;
}

function ucitajStavke(raw: string | null): Stavka[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function GlavniEkran() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [prihodiStavke, setPrihodiStavke] = useState<Stavka[]>([]);
  const [rashodiStavke, setRashodiStavke] = useState<Stavka[]>([]);

  const ucitaj = useCallback(async () => {
    const [p, r] = await Promise.all([
      AsyncStorage.getItem("fin_prihodi"),
      AsyncStorage.getItem("fin_rashodi"),
    ]);
    setPrihodiStavke(ucitajStavke(p));
    setRashodiStavke(ucitajStavke(r));
  }, []);

  useFocusEffect(
    useCallback(() => {
      ucitaj();
    }, [ucitaj])
  );

  const prihodi = prihodiStavke.reduce((a, s) => a + s.iznos, 0);
  const rashodi = rashodiStavke.reduce((a, s) => a + s.iznos, 0);
  const ukupno = prihodi + rashodi;
  const hasData = ukupno > 0;
  const saldo = prihodi - rashodi;

  const SIZE = 220;
  const STROKE = 18;
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  const zelenaLen = hasData ? (prihodi / ukupno) * circumference : 0;
  const crvenaLen = hasData ? (rashodi / ukupno) * circumference : 0;

  const topPadding = Platform.OS === "web" ? 67 : 0;
  const bottomPadding = Platform.OS === "web" ? 34 : 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + topPadding + 20,
          paddingBottom: insets.bottom + bottomPadding + 10,
        },
      ]}
    >
      {/* Krug */}
      <View style={styles.krugContainer}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={radius}
            fill="none"
            stroke="#1a1a1a"
            strokeWidth={STROKE}
          />
          {hasData ? (
            <>
              <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={radius}
                fill="none"
                stroke={colors.income}
                strokeWidth={STROKE}
                strokeDasharray={`${zelenaLen} ${circumference - zelenaLen}`}
                strokeDashoffset={0}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
              <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={radius}
                fill="none"
                stroke={colors.expense}
                strokeWidth={STROKE}
                strokeDasharray={`${crvenaLen} ${circumference - crvenaLen}`}
                strokeDashoffset={-zelenaLen}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            </>
          ) : (
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={radius}
              fill="none"
              stroke="#2a2a2a"
              strokeWidth={STROKE}
              strokeDasharray="6 10"
            />
          )}
        </Svg>

        <View style={styles.krugCentar}>
          {hasData ? (
            <>
              <Text style={[styles.krugBrojka, { color: colors.income }]}>
                +{prihodi.toFixed(2)}
              </Text>
              <Text style={[styles.krugBrojka, { color: colors.expense }]}>
                -{rashodi.toFixed(2)}
              </Text>
            </>
          ) : (
            <Text style={[styles.krugPrazno, { color: colors.mutedForeground }]}>
              Nema podataka
            </Text>
          )}
        </View>
      </View>

      {/* Saldo */}
      {hasData && (
        <View
          style={[
            styles.saldoBox,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.saldoLabel, { color: colors.mutedForeground }]}>
            SALDO
          </Text>
          <Text
            style={[
              styles.saldoVrijednost,
              { color: saldo >= 0 ? colors.income : colors.expense },
            ]}
          >
            {saldo >= 0 ? "+" : ""}
            {saldo.toFixed(2)} €
          </Text>
        </View>
      )}

      {/* Tipke */}
      <View style={styles.tipkeRow}>
        <Pressable
          style={({ pressed }) => [
            styles.tipka,
            {
              backgroundColor: colors.incomeBackground,
              borderColor: colors.income,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({ pathname: "/lista", params: { tip: "prihodi" } });
          }}
        >
          <Text style={[styles.tipkaTekst, { color: colors.income }]}>
            Prihodi
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.tipka,
            {
              backgroundColor: colors.expenseBackground,
              borderColor: colors.expense,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({ pathname: "/lista", params: { tip: "rashodi" } });
          }}
        >
          <Text style={[styles.tipkaTekst, { color: colors.expense }]}>
            Rashodi
          </Text>
        </Pressable>
      </View>

      {/* Standardni unosi */}
      <Pressable
        style={({ pressed }) => [
          styles.standardnaTipka,
          { opacity: pressed ? 0.75 : 1 },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({ pathname: "/standardni" });
        }}
      >
        <Text style={styles.standardnaTekst}>
          Standardni mjesečni unosi
        </Text>
      </Pressable>

      {/* Verzija */}
      <Text style={[styles.verzija, { color: "#333333", bottom: insets.bottom + 16 }]}>
        v23  09.04.2026
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  naslov: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 40,
    textAlign: "center",
  },
  krugContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  krugCentar: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  krugBrojka: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    lineHeight: 24,
  },
  krugPrazno: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  saldoBox: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  saldoLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  saldoVrijednost: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  tipkeRow: {
    flexDirection: "row",
    gap: 14,
    width: "100%",
  },
  tipka: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tipkaTekst: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  standardnaTipka: {
    width: "100%",
    marginTop: 12,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#60a5fa",
    backgroundColor: "#1e3a5f",
    alignItems: "center",
    justifyContent: "center",
  },
  standardnaTekst: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#93c5fd",
  },
  verzija: {
    position: "absolute",
    bottom: 16,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
