import { useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Globe } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { SettingsSection } from "@/screens/settings/settings-section";
import { useI18n, type LocaleId } from "@/i18n";
import { settingsStyles } from "@/styles/settings";
import type { Theme } from "@/styles/theme";

const ThemedGlobe = withUnistyles(Globe);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function LanguageSection() {
  const { locale, setLocale, availableLocales, t } = useI18n();

  const handlePress = useCallback(
    (id: LocaleId) => () => {
      setLocale(id);
    },
    [setLocale],
  );

  const getItemStyle = useCallback((pressed: boolean, hasBorder: boolean) => {
    const base = [styles.row, hasBorder && styles.rowBorder];
    return pressed ? [...base, styles.rowPressed] : base;
  }, []);

  return (
    <SettingsSection title={t("settings.section.language")}>
      <View style={settingsStyles.card}>
        {availableLocales.map((loc, index) => {
          const onPress = handlePress(loc.id);
          return (
            <Pressable key={loc.id} onPress={onPress}>
              {({ pressed }) => (
                <View style={getItemStyle(pressed, index > 0)}>
                  <View style={styles.rowContent}>
                    <ThemedGlobe size={18} uniProps={mutedColorMapping} />
                    <Text style={styles.label}>{loc.label}</Text>
                  </View>
                  {locale === loc.id && <View style={styles.checkmark} />}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    borderRadius: 8,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    borderRadius: 0,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  label: {
    fontSize: 14,
    color: theme.colors.foreground,
  },
  checkmark: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
    marginLeft: "auto",
  },
}));
