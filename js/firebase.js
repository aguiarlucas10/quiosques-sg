// ══════════════════════════════════════════════════════════
//  AUTH MODULE (type="module") — replaces current auth block
// ══════════════════════════════════════════════════════════

import { initializeApp }        from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, where,
         getDocs, updateDoc, onSnapshot, serverTimestamp }
         from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword,
         signInWithEmailAndPassword, signOut, onAuthStateChanged }
         from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyDIh81rAN7RSE8QcC5TUX0utYQKrarEdM0",
  authDomain:        "quiosque-sg.firebaseapp.com",
  projectId:         "quiosque-sg",
  storageBucket:     "quiosque-sg.firebasestorage.app",
  messagingSenderId: "426898777738",
  appId:             "1:426898777738:web:1fc62d5dda89389d2c2f73"
};

/* ── Firestore rules (update in Firebase console'):
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // App data — public read, any authenticated user can write
    match /app/{doc} {
      allow read:  if true;
      allow write: if request.auth != null;
    }

    // User profiles
    match /users/{uid} {
      // User can always read and create their own profile
      allow read, create: if request.auth != null && request.auth.uid == uid;
      // Admins and coordenadores can read all profiles
      allow read:   if request.auth != null
                    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['coordenador','admin'];
      // Only admins and coordenadores can update profiles (approve/reject/role change)
      allow update: if request.auth != null
                    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['coordenador','admin'];
    }
  }
}
*/


const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

const REF_STORE     = doc(db, 'app', 'store');
const REF_GOALS     = doc(db, 'app', 'goals');
const REF_ANALYTICS = doc(db, 'app', 'analytics');

// ── Role config ─────────────────────────────────────────
const ROLES = {
  vendedor:    { label: 'Vendedor',       level: 1 },
  gerente:     { label: 'Gerente de Loja',level: 2 },
  coordenador: { label: 'Coordenador',    level: 3 },
  admin:       { label: 'Admin Geral',    level: 4 },
};

// Tabs each role can see (cumulative: higher includes lower)
const ROLE_TABS = {
  vendedor:    ['geral','kiosques'],
  gerente:     ['geral','kiosques','consolidado','premiacoes'],
  coordenador: ['geral','kiosques','consolidado','premiacoes','financeiro','estoque','goals','produtos','aprovacao'],
  admin:       ['geral','kiosques','consolidado','premiacoes','financeiro','estoque','import','goals','produtos','aprovacao'],
};

function canAccessTab(tab) {
  const role = window._userRole || 'vendedor';
  return (ROLE_TABS[role] || ROLE_TABS.vendedor).includes(tab);
}

// ── CPF helpers ──────────────────────────────────────────
function cpfToEmail(cpf) {
  return cpf.replace(/\D/g,'') + '@sg.internal';
}
function formatCPF(v) {
  return v.replace(/\D/g,'').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
}
function validateCPF(cpf) {
  const c = cpf.replace(/\D/g,'');
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let sum = 0;
  for (let i=0; i<9; i++) sum += parseInt(c[i]) * (10-i);
  let r = (sum*10) % 11; if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(c[9])) return false;
  sum = 0;
  for (let i=0; i<10; i++) sum += parseInt(c[i]) * (11-i);
  r = (sum*10) % 11; if (r === 10 || r === 11) r = 0;
  return r === parseInt(c[10]);
}

// ── Auth state ───────────────────────────────────────────
window._isAdmin   = false;
window._userRole  = null;
window._userProfile = null;

onAuthStateChanged(auth, async user => {
  if (user) {
    // Load user profile from Firestore
    try {
      const snap = await getDoc(doc(db,'users',user.uid));
      if (snap.exists()) {
        const profile = snap.data();
        window._userProfile = profile;
        window._userRole    = profile.role || 'vendedor';
        window._isAdmin     = ['coordenador','admin'].includes(profile.role);

        if (profile.status !== 'active') {
          showPendingScreen(profile);
          await signOut(auth);
          return;
        }
        applyRoleUI(profile);
        closeAuthScreens();
        // Force render — data may have arrived before profile was set
        setTimeout(() => window.tryRender?.(), 100);
        return;
      }
      // Profile doc not found — user exists in Auth but not Firestore
      // Show pending screen with generic message
      const el = document.getElementById('pendingMsg');
      if (el) el.textContent = 'Perfil não encontrado. Entre em contato com o administrador.';
      document.getElementById('authScreen')?.classList.add('show');
      window.showAuthTab?.('pending');
      await signOut(auth);
      return;
    } catch(e) {
      console.warn('profile load:', e.code, e.message);
      // PERMISSION_DENIED usually means rules haven't been deployed yet
      // or the user doc doesn't exist — sign out and show login
      const el = document.getElementById('pendingMsg');
      if (el) el.textContent = e.code === 'permission-denied'
        ? 'Seu cadastro está aguardando aprovação ou as regras do banco ainda não foram configuradas.'
        : 'Erro ao carregar perfil: ' + e.message;
      document.getElementById('authScreen')?.classList.add('show');
      window.showAuthTab?.('pending');
      await signOut(auth);
      return;
    }
    // Profile loaded successfully — render outside try/catch
    window.tryRender?.();
    return;
  }
  // Not logged in — only reset UI if we were previously logged in
  // (prevents overriding tabs after deliberate signOut for pending/rejected users)
  window._isAdmin     = false;
  window._userRole    = null;
  window._userProfile = null;
  if (!document.getElementById('authScreen')?.classList.contains('show')) {
    applyRoleUI(null);
    showLoginScreen();
  }
});

function applyRoleUI(profile) {
  const role     = profile?.role || null;
  const name     = profile?.name || '';
  const allTabs  = ROLE_TABS[role] || [];

  // Show/hide navigation tabs (exclude auth-screen tabs)
  const tabBtns = document.querySelectorAll('.tabs .tab[data-tab]');
  tabBtns.forEach(btn => {
    const tab = btn.dataset.tab;
    const visible = role === 'admin' || allTabs.includes(tab);
    // Use both inline style AND .show class to override .tab.admin-only{display:none}
    btn.style.display = visible ? 'flex' : 'none';
    btn.classList.toggle('show', visible);
    btn.setAttribute('aria-selected', visible ? 'true' : 'false');
  });

  // User chip
  const chip = document.getElementById('userChip');
  const pName = document.getElementById('pName');
  const roleChip = document.getElementById('roleChip');
  if (chip) chip.classList.toggle('show', !!profile);
  if (pName) pName.textContent = name.split(' ')[0];
  if (roleChip) roleChip.textContent = ROLES[role]?.label || '';

  // Login/logout button
  const btnLogin = document.getElementById('btnLogin');
  if (btnLogin) btnLogin.style.display = profile ? 'none' : '';
}

// ── Save / load ──────────────────────────────────────────
window.fbSaveStore     = async d => { await setDoc(REF_STORE, d); };
window.fbSaveGoals     = async d => { await setDoc(REF_GOALS, d); };
window.fbResetStore    = async d => { await setDoc(REF_STORE, d); };
window.fbSaveAnalytics = async d => { await setDoc(REF_ANALYTICS, d); };

let _unsubStore=null, _unsubGoals=null, _unsubAnalytics=null;

function startListeners() {
  if (_unsubStore) return;
  _unsubStore = onSnapshot(REF_STORE, snap => {
    window._store = snap.exists() ? snap.data() : { kiosks:{}, sellers:{}, txnKeys:[], dateRange:[] };
    window.tryRender?.();
  });
  _unsubGoals = onSnapshot(REF_GOALS, snap => {
    const raw = snap.exists() ? snap.data() : { kiosks:{}, sellers:{} };
    window._goals = window.sanitizeGoals ? window.sanitizeGoals(raw) : raw;
    window.tryRender?.();
  }, err => console.warn('goals:', err));
  _unsubAnalytics = onSnapshot(REF_ANALYTICS, snap => {
    window._analytics = snap.exists() ? snap.data() : { skus:{} };
    if (document.getElementById('pnl-estoque')?.classList.contains('on')) window.renderEstoque?.();
  }, err => console.warn('analytics:', err));
}

// ── Registration ─────────────────────────────────────────
window._doRegister = async ({ name, cpf, dob, password, role }) => {
  const email = cpfToEmail(cpf);
  const cred  = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, 'users', cred.user.uid), {
    uid:       cred.user.uid,
    name,
    cpf:       cpf.replace(/\D/g,''),
    dob,
    role:      role || 'vendedor',
    status:    'pending',
    createdAt: new Date().toISOString(),
    email,
  });
  await signOut(auth);  // sign out until approved
  return cred.user.uid;
};

// ── Login ────────────────────────────────────────────────
window._doLogin = async (cpf, password) => {
  const email = cpfToEmail(cpf.replace(/\D/g,''));
  await signInWithEmailAndPassword(auth, email, password);
  startListeners();
};

window._doSignOut = async () => {
  await signOut(auth);
  if (_unsubStore)     { _unsubStore(); _unsubStore = null; }
  if (_unsubGoals)     { _unsubGoals(); _unsubGoals = null; }
  if (_unsubAnalytics) { _unsubAnalytics(); _unsubAnalytics = null; }
  window._store = { kiosks:{}, sellers:{}, txnKeys:[], dateRange:[] };
  window._goals = { kiosks:{}, sellers:{} };
};

// ── User management (for approval tab) ──────────────────
window.fbLoadPendingUsers = async () => {
  const q = query(collection(db,'users'), where('status','==','pending'));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
};
window.fbLoadAllUsers = async () => {
  const snap = await getDocs(collection(db,'users'));
  return snap.docs.map(d => d.data());
};
window.fbApproveUser = async (uid, role) => {
  await updateDoc(doc(db,'users',uid), { status:'active', role, approvedAt: new Date().toISOString() });
};
window.fbRejectUser = async (uid) => {
  await updateDoc(doc(db,'users',uid), { status:'rejected', rejectedAt: new Date().toISOString() });
};
window.fbUpdateUserRole = async (uid, role) => {
  await updateDoc(doc(db,'users',uid), { role });
};

// Start listeners immediately (data is public read)
startListeners();

// ── Screen helpers ───────────────────────────────────────
function showLoginScreen()    { document.getElementById('authScreen')?.classList.add('show'); }
function closeAuthScreens()   { document.getElementById('authScreen')?.classList.remove('show'); }
function showPendingScreen(p) {
  const el = document.getElementById('pendingMsg');
  if (el) el.textContent = p.status === 'rejected'
    ? 'Seu acesso foi recusado. Entre em contato com o coordenador.'
    : 'Seu cadastro está aguardando aprovação. Você receberá acesso em breve.';
  document.getElementById('authScreen')?.classList.add('show');
  window.showAuthTab?.('pending');
}

window.canAccessTab = canAccessTab;
window.ROLES        = ROLES;
window.ROLE_TABS    = ROLE_TABS;
window.validateCPF  = validateCPF;
window.formatCPF    = formatCPF;
window.cpfToEmail   = cpfToEmail;
