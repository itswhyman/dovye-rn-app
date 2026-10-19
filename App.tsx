import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

const C = {
  void: '#05060F',
  panel: '#0B0F22',
  panelHi: '#101634',
  line: '#1C2552',
  tickOff: '#161D45',
  text: '#E6ECFF',
  dim: '#7F8BB8',
  cyan: '#00F0FF',
  magenta: '#FF2BD6',
  lime: '#B6FF3B',
  amber: '#FFB020',
  red: '#FF3B5C',
};

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'Menlo, Consolas, monospace' });

const textGlow = (color: string, r = 10): TextStyle =>
  Platform.select({
    web: { textShadow: `0 0 ${r}px ${color}` } as unknown as TextStyle,
    default: { textShadowColor: color, textShadowRadius: r, textShadowOffset: { width: 0, height: 0 } },
  }) as TextStyle;

const boxGlow = (color: string, r = 12): ViewStyle =>
  Platform.select({
    web: { boxShadow: `0 0 ${r}px ${color}66` } as unknown as ViewStyle,
    default: { shadowColor: color, shadowRadius: r, shadowOpacity: 0.7, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  }) as ViewStyle;

/* ------------------------------------------------------------------ */
/* Types & mock data                                                   */
/* ------------------------------------------------------------------ */

type ServiceState = 'online' | 'warning' | 'offline' | 'restarting';
type LogLevel = 'info' | 'ok' | 'warn';
type ActionId = 'ping' | 'nginx' | 'cache' | 'docker';

interface Service {
  id: string;
  name: string;
  detail: string;
  state: ServiceState;
}
interface LogLine {
  id: number;
  time: string;
  level: LogLevel;
  text: string;
}
interface Metrics {
  cpu: number;
  ram: number;
  disk: number;
}

const INITIAL_SERVICES: Service[] = [
  { id: 'nginx', name: 'Nginx', detail: ':80 / :443 · reverse proxy', state: 'online' },
  { id: 'mysql', name: 'MySQL', detail: ':3306 · 41 aktif bağlantı', state: 'online' },
  { id: 'docker', name: 'Docker', detail: 'dockerd · 2 konteyner unhealthy', state: 'warning' },
  { id: 'redis', name: 'Redis', detail: ':6379 · 1.2 GB bellek', state: 'online' },
  { id: 'postfix', name: 'Postfix', detail: ':25 · servis yanıt vermiyor', state: 'offline' },
];

const STATE_META: Record<ServiceState, { label: string; color: string }> = {
  online: { label: 'Online', color: C.lime },
  warning: { label: 'Warning', color: C.amber },
  offline: { label: 'Offline', color: C.red },
  restarting: { label: 'Restarting', color: C.cyan },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const stamp = () => new Date().toLocaleTimeString('tr-TR', { hour12: false });

/* ------------------------------------------------------------------ */
/* Responsive styles                                                   */
/* ------------------------------------------------------------------ */

const createStyles = (width: number) => {
  const contentWidth = Math.min(width, 760);
  const pad = width < 380 ? 12 : 16;
  const wide = contentWidth >= 560;
  const gaugeSize = clamp((contentWidth - pad * 2 - 24) / 3, 92, 170);
  const actionBasis = wide ? '23.5%' : '48.5%';

  const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.void, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0 },
    list: { alignItems: 'center' },
    page: { width: '100%', maxWidth: 760, paddingHorizontal: pad, paddingBottom: 40 },

    // header
    header: { paddingTop: 20, paddingBottom: 18 },
    hostRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
    host: { color: C.cyan, fontFamily: MONO, fontSize: wide ? 26 : 22, fontWeight: '700', ...textGlow(C.cyan, 12) },
    meta: { color: C.dim, fontFamily: MONO, fontSize: 12, marginTop: 6 },
    livePill: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.lime,
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      ...boxGlow(C.lime, 8),
    },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.lime, marginRight: 6 },
    liveText: { color: C.lime, fontFamily: MONO, fontSize: 11, fontWeight: '700' },

    // sections
    sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 },
    sectionTitle: { color: C.text, fontFamily: MONO, fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
    sectionHint: { color: C.dim, fontFamily: MONO, fontSize: 12 },

    // gauges
    gaugeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: C.panel,
      borderWidth: 1,
      borderColor: C.line,
      borderRadius: 6,
      paddingVertical: 16,
      paddingHorizontal: 8,
    },
    gaugeBox: { alignItems: 'center', width: gaugeSize },
    gaugeRing: { width: gaugeSize, height: gaugeSize, alignItems: 'center', justifyContent: 'center' },
    gaugeTickWrap: { position: 'absolute', width: gaugeSize, height: gaugeSize, alignItems: 'center' },
    gaugeValue: { fontFamily: MONO, fontSize: gaugeSize * 0.24, fontWeight: '700' },
    gaugeUnit: { fontFamily: MONO, fontSize: gaugeSize * 0.11, color: C.dim },
    gaugeLabel: { color: C.text, fontFamily: MONO, fontSize: 13, fontWeight: '700', marginTop: 10 },
    gaugeSub: { color: C.dim, fontFamily: MONO, fontSize: 11, marginTop: 2 },

    // actions
    actionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
    action: {
      flexBasis: actionBasis,
      flexGrow: 0,
      backgroundColor: C.panel,
      borderWidth: 1,
      borderRadius: 6,
      paddingVertical: 14,
      paddingHorizontal: 12,
      minHeight: 74,
      justifyContent: 'space-between',
    },
    actionBusy: { opacity: 0.55 },
    actionLabel: { fontFamily: MONO, fontSize: 14, fontWeight: '700' },
    actionHint: { color: C.dim, fontFamily: MONO, fontSize: 11, marginTop: 4 },

    // services
    serviceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.panel,
      borderWidth: 1,
      borderColor: C.line,
      borderLeftWidth: 3,
      borderRadius: 6,
      paddingVertical: 13,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    serviceText: { flex: 1, paddingRight: 10 },
    serviceName: { color: C.text, fontFamily: MONO, fontSize: 15, fontWeight: '700' },
    serviceDetail: { color: C.dim, fontFamily: MONO, fontSize: 11, marginTop: 3 },
    badge: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
    badgeDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
    badgeText: { fontFamily: MONO, fontSize: 11, fontWeight: '700' },

    // log
    log: { backgroundColor: '#03040B', borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 12, minHeight: 120 },
    logLine: { fontFamily: MONO, fontSize: 12, lineHeight: 18 },
    logEmpty: { color: C.dim, fontFamily: MONO, fontSize: 12 },
  });

  return styles;
};

type Styles = ReturnType<typeof createStyles>;

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

const TICKS = 48;

const levelColor = (v: number, base: string) => (v >= 90 ? C.red : v >= 75 ? C.amber : base);

const Gauge = memo(function Gauge({
  styles,
  size,
  label,
  sub,
  value,
  base,
}: {
  styles: Styles;
  size: number;
  label: string;
  sub: string;
  value: number;
  base: string;
}) {
  const color = levelColor(value, base);
  const lit = Math.round((value / 100) * TICKS);
  const tickH = size * 0.1;

  return (
    <View style={styles.gaugeBox}>
      <View style={styles.gaugeRing}>
        {Array.from({ length: TICKS }, (_, i) => {
          const on = i < lit;
          return (
            <View key={i} style={[styles.gaugeTickWrap, { transform: [{ rotate: `${(i / TICKS) * 360}deg` }] }]}>
              <View
                style={[
                  { width: 3, height: tickH, borderRadius: 2, backgroundColor: on ? color : C.tickOff },
                  on ? boxGlow(color, 6) : null,
                ]}
              />
            </View>
          );
        })}
        <Text style={[styles.gaugeValue, { color }, textGlow(color, 10)]}>
          {Math.round(value)}
          <Text style={styles.gaugeUnit}>%</Text>
        </Text>
      </View>
      <Text style={styles.gaugeLabel}>{label}</Text>
      <Text style={styles.gaugeSub}>{sub}</Text>
    </View>
  );
});

const ActionButton = memo(function ActionButton({
  styles,
  label,
  hint,
  color,
  busy,
  disabled,
  onPress,
}: {
  styles: Styles;
  label: string;
  hint: string;
  color: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, { borderColor: color }, busy || disabled ? styles.actionBusy : boxGlow(color, 10)]}
    >
      <Text style={[styles.actionLabel, { color }, textGlow(color, 8)]}>{busy ? 'Running…' : label}</Text>
      <Text style={styles.actionHint}>{hint}</Text>
    </TouchableOpacity>
  );
});

const ServiceRow = memo(function ServiceRow({ styles, item }: { styles: Styles; item: Service }) {
  const meta = STATE_META[item.state];
  return (
    <View style={[styles.serviceRow, { borderLeftColor: meta.color }]}>
      <View style={styles.serviceText}>
        <Text style={styles.serviceName}>{item.name}</Text>
        <Text style={styles.serviceDetail}>{item.detail}</Text>
      </View>
      <View style={[styles.badge, { borderColor: meta.color }]}>
        <View style={[styles.badgeDot, { backgroundColor: meta.color }]} />
        <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
      </View>
    </View>
  );
});

// Kendi state'ini tuttuğu için her saniye tüm listeyi yeniden çizmez.
const Uptime = memo(function Uptime({ style }: { style: TextStyle }) {
  const [sec, setSec] = useState(12 * 86400 + 5 * 3600 + 41 * 60);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const d = Math.floor(sec / 86400);
  const h = String(Math.floor((sec % 86400) / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return <Text style={style}>uptime {d}g {h}:{m}:{s}</Text>;
});

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function App() {
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(width), [width]);
  const gaugeSize = useMemo(() => {
    const contentWidth = Math.min(width, 760);
    const pad = width < 380 ? 12 : 16;
    return clamp((contentWidth - pad * 2 - 24) / 3, 92, 170);
  }, [width]);

  const [metrics, setMetrics] = useState<Metrics>({ cpu: 38, ram: 62, disk: 71 });
  const [services, setServices] = useState<Service[]>(INITIAL_SERVICES);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState<ActionId | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const logId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const pushLog = useCallback((level: LogLevel, text: string) => {
    logId.current += 1;
    const line: LogLine = { id: logId.current, time: stamp(), level, text };
    setLogs((prev) => [line, ...prev].slice(0, 8));
  }, []);

  const setServiceState = useCallback((id: string, state: ServiceState) => {
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, state } : s)));
  }, []);

  // canlı metrik simülasyonu
  useEffect(() => {
    const t = setInterval(() => {
      setMetrics((m) => ({
        cpu: clamp(m.cpu + rand(-9, 9), 8, 97),
        ram: clamp(m.ram + rand(-3, 3.5), 25, 96),
        disk: clamp(m.disk + rand(-0.1, 0.25), 40, 98),
      }));
    }, 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    pushLog('info', 'prod-eu-01 bağlantısı kuruldu');
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, [pushLog]);

  const run = useCallback(
    (id: ActionId) => {
      if (busy) return;
      setBusy(id);

      switch (id) {
        case 'ping': {
          pushLog('info', 'ping 10.0.4.12 gönderiliyor…');
          later(() => {
            const ms = Math.round(rand(12, 48));
            setLatency(ms);
            pushLog('ok', `yanıt alındı · ${ms} ms · TTL 57`);
            setBusy(null);
          }, 900);
          break;
        }
        case 'nginx': {
          setServiceState('nginx', 'restarting');
          pushLog('warn', 'nginx yeniden başlatılıyor…');
          later(() => {
            setServiceState('nginx', 'online');
            pushLog('ok', 'nginx tekrar online');
            setBusy(null);
          }, 2200);
          break;
        }
        case 'cache': {
          pushLog('info', 'önbellek temizleniyor…');
          later(() => {
            const freed = Math.round(rand(6, 14));
            setMetrics((m) => ({ ...m, ram: clamp(m.ram - freed, 20, 100) }));
            pushLog('ok', `önbellek temizlendi · RAM %${freed} azaldı`);
            setBusy(null);
          }, 1300);
          break;
        }
        case 'docker': {
          setServiceState('docker', 'restarting');
          pushLog('warn', 'unhealthy konteynerler yeniden başlatılıyor…');
          later(() => {
            setServiceState('docker', 'online');
            pushLog('ok', 'docker sağlıklı · 0 unhealthy konteyner');
            setBusy(null);
          }, 2600);
          break;
        }
      }
    },
    [busy, later, pushLog, setServiceState],
  );

  const onlineCount = services.filter((s) => s.state === 'online').length;

  const actions: { id: ActionId; label: string; hint: string; color: string }[] = [
    { id: 'ping', label: 'Ping Server', hint: latency ? `son: ${latency} ms` : 'gecikmeyi ölç', color: C.cyan },
    { id: 'nginx', label: 'Restart Nginx', hint: 'web sunucusunu yenile', color: C.magenta },
    { id: 'cache', label: 'Clear Cache', hint: 'RAM önbelleğini boşalt', color: C.lime },
    { id: 'docker', label: 'Restart Docker', hint: 'warning durumunu düzelt', color: C.amber },
  ];

  const header = (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.hostRow}>
          <Text style={styles.host}>prod-eu-01</Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
        <Uptime style={styles.meta} />
        <Text style={styles.meta}>10.0.4.12 · Ubuntu 24.04 · 8 vCPU · 16 GB RAM</Text>
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Kaynak kullanımı</Text>
        <Text style={styles.sectionHint}>2 sn&apos;de bir yenilenir</Text>
      </View>
      <View style={styles.gaugeRow}>
        <Gauge styles={styles} size={gaugeSize} label="CPU" sub="8 çekirdek" value={metrics.cpu} base={C.cyan} />
        <Gauge
          styles={styles}
          size={gaugeSize}
          label="RAM"
          sub={`${((metrics.ram / 100) * 16).toFixed(1)} / 16 GB`}
          value={metrics.ram}
          base={C.magenta}
        />
        <Gauge
          styles={styles}
          size={gaugeSize}
          label="Disk"
          sub={`${Math.round((metrics.disk / 100) * 480)} / 480 GB`}
          value={metrics.disk}
          base={C.lime}
        />
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <Text style={styles.sectionHint}>{busy ? 'işlem sürüyor' : 'hazır'}</Text>
      </View>
      <View style={styles.actionGrid}>
        {actions.map((a) => (
          <ActionButton
            key={a.id}
            styles={styles}
            label={a.label}
            hint={a.hint}
            color={a.color}
            busy={busy === a.id}
            disabled={busy !== null && busy !== a.id}
            onPress={() => run(a.id)}
          />
        ))}
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Servisler</Text>
        <Text style={styles.sectionHint}>
          {onlineCount}/{services.length} online
        </Text>
      </View>
    </View>
  );

  const footer = (
    <View style={styles.page}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Olay günlüğü</Text>
        <Text style={styles.sectionHint}>son {logs.length} kayıt</Text>
      </View>
      <View style={styles.log}>
        {logs.length === 0 ? (
          <Text style={styles.logEmpty}>Henüz kayıt yok. Bir eylem çalıştır.</Text>
        ) : (
          logs.map((l) => {
            const color = l.level === 'ok' ? C.lime : l.level === 'warn' ? C.amber : C.cyan;
            return (
              <Text key={l.id} style={[styles.logLine, { color }]}>
                <Text style={{ color: C.dim }}>{l.time} </Text>
                {l.text}
              </Text>
            );
          })
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.void} />
      <FlatList
        data={services}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <View style={styles.page}>
            <ServiceRow styles={styles} item={item} />
          </View>
        )}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
