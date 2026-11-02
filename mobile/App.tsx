// SIXXAB AI native app (Expo): email or mobile sign-in, then the approvals inbox and morning briefing.
// Uses the same Supabase Auth REST flow and the same /api routes as the website.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';

const API = 'https://sixxab.ai';
const KEY = 'sixxab.session';
type Session = { accessToken: string; refreshToken: string; expiresAt: number; label: string };
type Approval = { id: string; kind: 'approve' | 'draft'; summary: string; proposed: Record<string, unknown> };

let cfg: { supabaseUrl: string; supabaseAnonKey: string } | null = null;
async function config() {
  if (cfg) return cfg;
  const r = await fetch(`${API}/api/config`);
  const c = await r.json();
  if (!c.supabaseUrl || !c.supabaseAnonKey) throw new Error('Sign-in is not switched on yet.');
  cfg = { supabaseUrl: c.supabaseUrl, supabaseAnonKey: c.supabaseAnonKey };
  return cfg;
}

async function auth<T>(path: string, body: unknown): Promise<T> {
  const c = await config();
  const r = await fetch(`${c.supabaseUrl}/auth/v1/${path}`, { method: 'POST', headers: { apikey: c.supabaseAnonKey, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 429 ? 'Too many attempts. Wait a minute.' : data.msg || 'That did not work. Try again.');
  return data as T;
}

type Tokens = { access_token: string; refresh_token: string; expires_in: number; user: { email?: string; phone?: string } };
const toSession = (t: Tokens): Session => ({ accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Math.floor(Date.now() / 1000) + t.expires_in, label: t.user.email || t.user.phone || 'Founder' });

async function loadSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  const s = JSON.parse(raw) as Session;
  if (s.expiresAt - 60 > Date.now() / 1000) return s;
  try {
    const next = toSession(await auth<Tokens>('token?grant_type=refresh_token', { refresh_token: s.refreshToken }));
    await SecureStore.setItemAsync(KEY, JSON.stringify(next));
    return next;
  } catch {
    await SecureStore.deleteItemAsync(KEY);
    return null;
  }
}

async function api<T>(s: Session, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${s.accessToken}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { loadSession().then((s) => { setSession(s); setReady(true); }); }, []);
  return (
    <SafeAreaView style={st.page}>
      <StatusBar style="light" />
      <Text style={st.brand}>SIXXAB <Text style={{ color: GOLD }}>AI</Text></Text>
      {!ready ? <ActivityIndicator color="#fff" /> : session ? <Inbox session={session} onSignOut={async () => { await SecureStore.deleteItemAsync(KEY); setSession(null); }} /> : <Login onSignedIn={setSession} />}
    </SafeAreaView>
  );
}

function Login({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [method, setMethod] = useState<'email' | 'sms'>('email');
  const [id, setId] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = method === 'email' ? { email: id.trim().toLowerCase() } : { phone: id.replace(/[^\d+]/g, '') };

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Error'); } finally { setBusy(false); } };
  return (
    <View style={st.card}>
      <Text style={st.h1}>Sign in</Text>
      <View style={st.tabs}>
        {(['email', 'sms'] as const).map((m) => (
          <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: method === m }} onPress={() => { setMethod(m); setSent(false); setId(''); }} style={[st.tab, method === m && st.tabOn]}>
            <Text style={[st.tabText, method === m && { color: BG }]}>{m === 'email' ? 'Email' : 'Mobile'}</Text>
          </Pressable>
        ))}
      </View>
      {!sent ? (
        <>
          <TextInput style={st.input} placeholder={method === 'email' ? 'you@company.com' : '+91 98765 43210'} placeholderTextColor="#6b7385" keyboardType={method === 'email' ? 'email-address' : 'phone-pad'} autoCapitalize="none" autoComplete={method === 'email' ? 'email' : 'tel'} value={id} onChangeText={setId} accessibilityLabel={method === 'email' ? 'Email' : 'Mobile number with country code'} />
          <Pressable style={st.btn} disabled={busy} onPress={() => run(async () => { await auth('otp', { ...target, create_user: true }); setSent(true); })}>
            <Text style={st.btnText}>{busy ? 'Sending…' : 'Send code'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <TextInput style={[st.input, { letterSpacing: 6, textAlign: 'center' }]} placeholder="123456" placeholderTextColor="#6b7385" keyboardType="number-pad" textContentType="oneTimeCode" value={code} onChangeText={setCode} accessibilityLabel="6-digit code" />
          <Pressable style={st.btn} disabled={busy} onPress={() => run(async () => {
            const t = await auth<Tokens>('verify', { type: method === 'email' ? 'email' : 'sms', ...target, token: code.trim() });
            const s = toSession(t);
            await SecureStore.setItemAsync(KEY, JSON.stringify(s));
            onSignedIn(s);
          })}>
            <Text style={st.btnText}>{busy ? 'Checking…' : 'Sign in'}</Text>
          </Pressable>
        </>
      )}
      {error && <Text style={st.error}>{error}</Text>}
    </View>
  );
}

function Inbox({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [items, setItems] = useState<Approval[] | null>(null);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<{ approvals: Approval[] }>(session, '/api/approvals').then((r) => setItems(r.approvals)).catch((e) => setError(e.message));
    api<{ briefing: { summary: string } }>(session, '/api/briefing').then((r) => setSummary(r.briefing.summary)).catch(() => undefined);
  }, [session]);
  useEffect(load, [load]);
  const decide = async (a: Approval, approved: boolean) => {
    try { await api(session, '/api/approvals', { method: 'POST', body: JSON.stringify({ approvalId: a.id, approved }) }); load(); } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  };
  return (
    <View style={{ flex: 1, width: '100%' }}>
      <View style={st.row}><Text style={st.muted}>{session.label}</Text><Pressable onPress={onSignOut}><Text style={{ color: GOLD }}>Sign out</Text></Pressable></View>
      {!!summary && <View style={st.card}><Text style={st.h2}>Morning briefing</Text><Text style={st.body}>{summary}</Text></View>}
      {error && <Text style={st.error}>{error}</Text>}
      <FlatList
        data={items ?? []}
        keyExtractor={(a) => a.id}
        onRefresh={load}
        refreshing={items === null}
        ListEmptyComponent={items ? <Text style={[st.muted, { textAlign: 'center', marginTop: 24 }]}>Nothing needs your yes right now.</Text> : null}
        renderItem={({ item }) => (
          <View style={st.card}>
            <Text style={{ color: GOLD, fontSize: 12 }}>{item.kind === 'draft' ? 'Draft for you to send' : 'Needs your approval'}</Text>
            <Text style={st.body}>{item.summary}</Text>
            <View style={st.row}>
              <Pressable style={st.ghost} onPress={() => decide(item, false)}><Text style={{ color: '#fff' }}>Reject</Text></Pressable>
              <Pressable style={st.btnSmall} onPress={() => decide(item, true)}><Text style={st.btnText}>{item.kind === 'draft' ? 'Accept' : 'Approve'}</Text></Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const BG = '#02060f';
const GOLD = '#ffe2b2';
const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG, alignItems: 'center', padding: 20, gap: 16 },
  brand: { color: '#fff', fontSize: 20, letterSpacing: 4, marginTop: 12 },
  card: { width: '100%', borderWidth: 1, borderColor: 'rgba(196,214,232,0.18)', borderRadius: 20, padding: 18, gap: 12, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.04)' },
  h1: { color: '#fff', fontSize: 26 },
  h2: { color: '#fff', fontSize: 18 },
  body: { color: '#dfe6ef', fontSize: 15, lineHeight: 22 },
  muted: { color: '#a2a9b8' },
  tabs: { flexDirection: 'row', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(196,214,232,0.18)', padding: 4 },
  tab: { flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: '#fff' },
  tabText: { color: '#c9d2de', fontSize: 15 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(196,214,232,0.28)', color: '#fff', paddingHorizontal: 14, fontSize: 17 },
  btn: { minHeight: 50, borderRadius: 999, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  btnSmall: { minHeight: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  ghost: { minHeight: 44, paddingHorizontal: 20, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(196,214,232,0.6)', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: BG, fontSize: 16, fontWeight: '600' },
  error: { color: '#ffb4a8' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 },
});
