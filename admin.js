// admin.js
import { auth, db } from './firebase-config.js';
import { requireAuth, logout } from './app.js';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, doc, setDoc, getDocs, query, orderBy, onSnapshot,
  serverTimestamp, runTransaction, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ===== DAFTAR JENIS IKAN/UDANG (Sesuai Blueprint) =====
const JENIS_BARANG = [
  'Bandeng', 'KKB', 'Manyung', 'Tawar', 'Mubara', 'Bawel', 'Mondo',
  'Daun', 'Kerong', 'Hiu', 'Ikan Merah', 'Banana', 'Tiger', 'Kputi',
  'Sarisi', 'Lajur', 'Lasi', 'Toki', 'Tenggiri', 'Udang Tiger', 'Udang Biasa'
];

// ===== FORMAT RUPIAH =====
const formatRupiah = (angka) =>
  'Rp ' + (angka || 0).toLocaleString('id-ID');

const formatTanggal = (timestamp) => {
  if (!timestamp) return '-';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ===== GUARD: WAJIB ADMIN =====
let currentUserData = null;
requireAuth(['admin']).then(({ user, userData }) => {
  currentUserData = { ...user, ...userData };
  document.getElementById('adminName').textContent = userData.name || 'Admin';
  initAll();
});

// ===== LOGOUT =====
document.getElementById('btnLogout').addEventListener('click', logout);

// ===== TAB NAVIGATION =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ===== INISIALISASI SEMUA FITUR =====
function initAll() {
  loadUsersDropdown();
  loadUsersTable();
  initNotaForm();
  loadRekap();
  loadAllNotas();
  initChat();
}

// ==========================================
// FITUR 1: BUAT USER BARU
// ==========================================
document.getElementById('formCreateUser').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('createUserMessage');
  const name = document.getElementById('newUserName').value.trim();
  const email = document.getElementById('newUserEmail').value.trim();
  const password = document.getElementById('newUserPassword').value;
  const role = document.getElementById('newUserRole').value;

  msg.textContent = 'Membuat user...';
  msg.className = 'message';

  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', userCred.user.uid), {
      uid: userCred.user.uid,
      name,
      email,
      role,
      createdAt: serverTimestamp()
    });
    msg.textContent = `User "${name}" berhasil dibuat!`;
    msg.className = 'message success';
    e.target.reset();
    loadUsersDropdown();
    loadUsersTable();
  } catch (err) {
    console.error(err);
    msg.textContent = err.code === 'auth/email-already-in-use'
      ? 'Email sudah terdaftar.'
      : 'Gagal: ' + err.message;
    msg.className = 'message error';
  }
});

function loadUsersTable() {
  onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc')), (snap) => {
    const tbody = document.querySelector('#tableUsers tbody');
    tbody.innerHTML = '';
    snap.forEach((docSnap, idx) => {
      const u = docSnap.data();
      tbody.innerHTML += `
        <tr>
          <td>${idx + 1}</td>
          <td>${u.name}</td>
          <td>${u.email}</td>
          <td><span class="badge badge-${u.role}">${u.role}</span></td>
          <td>${formatTanggal(u.createdAt)}</td>
        </tr>`;
    });
  });
}

// ==========================================
// FITUR 2: INPUT NOTA
// ==========================================
function loadUsersDropdown() {
  const select = document.getElementById('notaUser');
  getDocs(query(collection(db, 'users'), where('role', '==', 'user')))
    .then(snap => {
      select.innerHTML = '<option value="">-- Pilih User --</option>';
      snap.forEach(d => {
        const u = d.data();
        select.innerHTML += `<option value="${d.id}" data-name="${u.name}">${u.name}</option>`;
      });
    });
}

function initNotaForm() {
  document.getElementById('notaTanggal').valueAsDate = new Date();
  document.getElementById('btnAddRow').addEventListener('click', addRow);
  document.getElementById('formNota').addEventListener('submit', submitNota);
  addRow(); // baris pertama
}

function addRow() {
  const tbody = document.getElementById('itemsBody');
  const row = document.createElement('tr');
  const options = JENIS_BARANG.map(b => `<option value="${b}">${b}</option>`).join('');
  row.innerHTML = `
    <td class="row-num"></td>
    <td>
      <select class="input-jenis">
        <option value="Ikan">Ikan</option>
        <option value="Udang">Udang</option>
      </select>
    </td>
    <td><select class="input-nama">${options}</select></td>
    <td><input type="number" class="input-qty" min="0" step="0.01" value="0" /></td>
    <td><input type="number" class="input-harga" min="0" value="0" /></td>
    <td class="cell-subtotal">Rp 0</td>
    <td><button type="button" class="btn-remove-row">✕</button></td>
  `;
  tbody.appendChild(row);
  updateRowNumbers();

  // Event hitung subtotal per baris
  row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => calcRow(row)));
  row.querySelector('.btn-remove-row').addEventListener('click', () => {
    row.remove();
    updateRowNumbers();
    calcTotal();
  });
}

function updateRowNumbers() {
  document.querySelectorAll('#itemsBody tr').forEach((tr, i) => {
    tr.querySelector('.row-num').textContent = i + 1;
  });
}

function calcRow(row) {
  const qty = parseFloat(row.querySelector('.input-qty').value) || 0;
  const harga = parseFloat(row.querySelector('.input-harga').value) || 0;
  const subtotal = qty * harga;
  row.querySelector('.cell-subtotal').textContent = formatRupiah(subtotal);
  calcTotal();
}

function calcTotal() {
  let total = 0;
  document.querySelectorAll('#itemsBody tr').forEach(row => {
    const qty = parseFloat(row.querySelector('.input-qty').value) || 0;
    const harga = parseFloat(row.querySelector('.input-harga').value) || 0;
    total += qty * harga;
  });
  document.getElementById('totalNota').textContent = formatRupiah(total);
  return total;
}

async function submitNota(e) {
  e.preventDefault();
  const msg = document.getElementById('notaMessage');
  const userId = document.getElementById('notaUser').value;
  const userName = document.getElementById('notaUser').selectedOptions[0].dataset.name;
  const tanggalInput = document.getElementById('notaTanggal').value;

  if (!userId) {
    msg.textContent = 'Pilih user terlebih dahulu.';
    msg.className = 'message error';
    return;
  }

  const rows = document.querySelectorAll('#itemsBody tr');
  const items = [];
  let totalNota = 0;
  let totalBerat = 0;

  rows.forEach(row => {
    const jenis = row.querySelector('.input-jenis').value;
    const namaBarang = row.querySelector('.input-nama').value;
    const qtyKg = parseFloat(row.querySelector('.input-qty').value) || 0;
    const hargaPerKg = parseFloat(row.querySelector('.input-harga').value) || 0;
    const subtotal = qtyKg * hargaPerKg;
    if (qtyKg > 0) {
      items.push({ jenis, namaBarang, qtyKg, hargaPerKg, subtotal });
      totalNota += subtotal;
      totalBerat += qtyKg;
    }
  });

  if (items.length === 0) {
    msg.textContent = 'Tambahkan minimal 1 item dengan berat > 0.';
    msg.className = 'message error';
    return;
  }

  msg.textContent = 'Menyimpan nota...';
  msg.className = 'message';

  try {
    const tanggal = new Date(tanggalInput);

    // Simpan nota
    const notaRef = await addDoc(collection(db, 'notas'), {
      userId,
      userName,
      tanggal,
      items,
      totalNota,
      createdByAdmin: currentUserData.uid,
      createdAt: serverTimestamp()
    });

    // Update rekap dengan TRANSACTION (atomic)
    const rekapRef = doc(db, 'rekap', userId);
    await runTransaction(db, async (tx) => {
      const rekapSnap = await tx.get(rekapRef);
      const current = rekapSnap.exists() ? rekapSnap.data() : {
        userId, userName, totalTransaksi: 0, totalBeratKg: 0, totalNominal: 0
      };
      tx.set(rekapRef, {
        ...current,
        userName, // update jika nama berubah
        totalTransaksi: current.totalTransaksi + 1,
        totalBeratKg: current.totalBeratKg + totalBerat,
        totalNominal: current.totalNominal + totalNota,
        lastUpdated: serverTimestamp()
      });
    });

    msg.textContent = `Nota berhasil disimpan untuk ${userName}. Total: ${formatRupiah(totalNota)}`;
    msg.className = 'message success';

    // Reset form items
    document.getElementById('itemsBody').innerHTML = '';
    addRow();
    calcTotal();
  } catch (err) {
    console.error(err);
    msg.textContent = 'Gagal menyimpan: ' + err.message;
    msg.className = 'message error';
  }
}

// ==========================================
// FITUR 3: REKAP KESELURUHAN
// ==========================================
function loadRekap() {
  onSnapshot(collection(db, 'rekap'), (snap) => {
    const tbody = document.querySelector('#tableRekap tbody');
    tbody.innerHTML = '';
    let gTransaksi = 0, gBerat = 0, gNominal = 0;

    snap.forEach((docSnap, idx) => {
      const r = docSnap.data();
      gTransaksi += r.totalTransaksi || 0;
      gBerat += r.totalBeratKg || 0;
      gNominal += r.totalNominal || 0;
      tbody.innerHTML += `
        <tr>
          <td>${idx + 1}</td>
          <td>${r.userName}</td>
          <td>${r.totalTransaksi || 0}</td>
          <td>${(r.totalBeratKg || 0).toFixed(2)}</td>
          <td>${formatRupiah(r.totalNominal || 0)}</td>
          <td>${formatTanggal(r.lastUpdated)}</td>
        </tr>`;
    });

    document.getElementById('rekapTotalTransaksi').textContent = gTransaksi;
    document.getElementById('rekapTotalBerat').textContent = gBerat.toFixed(2) + ' Kg';
    document.getElementById('rekapGrandTotal').textContent = formatRupiah(gNominal);
  });
}

function loadAllNotas() {
  onSnapshot(query(collection(db, 'notas'), orderBy('tanggal', 'desc')), (snap) => {
    const tbody = document.querySelector('#tableAllNotas tbody');
    tbody.innerHTML = '';
    snap.forEach((docSnap, idx) => {
      const n = docSnap.data();
      tbody.innerHTML += `
        <tr>
          <td>${idx + 1}</td>
          <td>${formatTanggal(n.tanggal)}</td>
          <td>${n.userName}</td>
          <td>${(n.items || []).length}</td>
          <td>${formatRupiah(n.totalNota || 0)}</td>
        </tr>`;
    });
  });
}

// ==========================================
// FITUR 4: LIVE CHAT
// ==========================================
function initChat() {
  const chatBox = document.getElementById('chatBox');
  const formChat = document.getElementById('formChat');
  const chatInput = document.getElementById('chatInput');

  // Load chat realtime
  onSnapshot(query(collection(db, 'chats'), orderBy('createdAt', 'asc')), (snap) => {
    chatBox.innerHTML = '';
    snap.forEach(d => {
      const c = d.data();
      const isMe = c.senderId === currentUserData.uid;
      const div = document.createElement('div');
      div.className = 'chat-bubble ' + (isMe ? 'me' : 'other');
      div.innerHTML = `
        <div class="chat-sender">${c.senderName}</div>
        <div class="chat-text">${escapeHtml(c.text)}</div>
        <div class="chat-time">${formatTanggal(c.createdAt)}</div>
      `;
      chatBox.appendChild(div);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  formChat.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    try {
      await addDoc(collection(db, 'chats'), {
        senderId: currentUserData.uid,
        senderName: currentUserData.name,
        text,
        createdAt: serverTimestamp()
      });
      chatInput.value = '';
    } catch (err) {
      console.error(err);
      alert('Gagal mengirim pesan.');
    }
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}
