import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { mapDocument } from "./map-document";
type Pin = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  shiftStart: number | null;
  lastSeen: number | null;
};
export function FieldMap({
  origin,
  employees,
  sites,
  points,
  selected,
  onSelect,
}: {
  origin: string;
  employees: Pin[];
  sites: {
    lat: number;
    lng: number;
    radius: number;
    name: string;
    active: number;
  }[];
  points: { lat: number; lng: number }[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<WebView>(null),
    ready = useRef(false),
    latest = useRef("");
  const payload = JSON.stringify({
    employees,
    sites,
    points,
    selected,
  }).replace(/</g, "\\u003c");
  latest.current = `window.updateFieldMap(${payload});true;`;
  useEffect(() => {
    if (ready.current) ref.current?.injectJavaScript(latest.current);
  }, [payload]);
  return (
    <View style={s.map}>
      <WebView
        ref={ref}
        source={{ html: mapDocument, baseUrl: origin }}
        originWhitelist={["*"]}
        applicationNameForUserAgent="GroSuiteAdmin/0.2"
        javaScriptEnabled
        domStorageEnabled={false}
        mixedContentMode="never"
        onLoadEnd={() => {
          ready.current = true;
          ref.current?.injectJavaScript(latest.current);
        }}
        onMessage={(e) => {
          try {
            const v = JSON.parse(e.nativeEvent.data);
            if (
              typeof v.id === "string" &&
              employees.some((p) => p.id === v.id)
            )
              onSelect(v.id);
          } catch {}
        }}
        onShouldStartLoadWithRequest={(r) =>
          r.url === "about:blank" || r.url === origin || r.url === origin + "/"
        }
        renderError={() => (
          <View style={s.error}>
            <Text>Map unavailable. Employee locations are listed below.</Text>
          </View>
        )}
      />
    </View>
  );
}
const s = StyleSheet.create({
  map: {
    height: 330,
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: "#e5eee9",
  },
  error: { padding: 30 },
});
