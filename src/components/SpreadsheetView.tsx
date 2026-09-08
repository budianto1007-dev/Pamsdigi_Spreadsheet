import React, { useState, useEffect } from 'react';
import { UserRow, PelangganRow, AreaRow, TarifRow, AbonemenRow, DendaRow } from '../types';
import { 
  FileSpreadsheet, RotateCcw, AlertCircle, Plus, Trash2, Edit, Check, X, 
  CheckCircle, Save, Cloud, Database, RefreshCw, LogOut, CheckSquare, Loader2, Link2, ExternalLink
} from 'lucide-react';
import { 
  connectGoogleAccount, 
  disconnectGoogleAccount, 
  listSpreadsheets, 
  createNewSpreadsheet, 
  pushDataToSheets, 
  pullDataFromSheets, 
  getAccessToken,
  setAccessToken,
  getSavedDbConfig,
  DEFAULT_SPREADSHEET_ID
} from '../lib/googleSheets';

interface SpreadsheetViewProps {
  users: UserRow[];
  pelanggan: PelangganRow[];
  areas: AreaRow[];
  tarifs: TarifRow[];
  abonemen: AbonemenRow;
  denda: DendaRow;
  readings: any[];
  billingList: any[];
  cashTransactions: any[];
  onAddUser: (u: UserRow) => void;
  onUpdateUser?: (u: UserRow) => void;
  onDeleteUser: (username: string) => void;
  onAddPelanggan: (p: PelangganRow) => void;
  onDeletePelanggan: (id: string) => void;
  onAddArea: (a: AreaRow) => void;
  onUpdateArea: (a: AreaRow) => void;
  onDeleteArea: (id: string) => void;
  onAddTarif: (t: TarifRow) => void;
  onUpdateTarif: (t: TarifRow) => void;
  onDeleteTarif: (id: string) => void;
  onUpdateAbonemen: (ab: AbonemenRow) => void;
  onUpdateDenda: (d: DendaRow) => void;
  onResetData: () => void;
  onRestoreAllData: (data: {
    users?: UserRow[];
    pelanggan?: PelangganRow[];
    areas?: AreaRow[];
    tarifs?: TarifRow[];
    abonemen?: AbonemenRow;
    denda?: DendaRow;
  }) => void;
  onRestoreTransactionalData: (readings: any[], billingList: any[], cashTransactions: any[]) => void;
}

type SheetTab = 'Users' | 'Pelanggan' | 'Area' | 'Tarif' | 'Abonemen' | 'Denda' | 'Meter' | 'Tagihan' | 'Pembayaran';

export default function SpreadsheetView({
  users,
  pelanggan,
  areas,
  tarifs,
  abonemen,
  denda,
  readings,
  billingList,
  cashTransactions,
  onAddUser,
  onDeleteUser,
  onAddPelanggan,
  onDeletePelanggan,
  onAddArea,
  onUpdateArea,
  onDeleteArea,
  onAddTarif,
  onUpdateTarif,
  onDeleteTarif,
  onUpdateAbonemen,
  onUpdateDenda,
  onResetData,
  onRestoreAllData,
  onRestoreTransactionalData,
}: SpreadsheetViewProps) {
  const [activeTab, setActiveTab] = useState<SheetTab>('Pelanggan');

  // Google Sheets Integration States
  const [googleUser, setGoogleUser] = useState<any>({ email: 'KPS-PAMSDIGI SuperAdmin' });
  const [isConnecting, setIsConnecting] = useState(false);
  const [spreadsheets, setSpreadsheets] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSheetId, setSelectedSheetId] = useState<string>(DEFAULT_SPREADSHEET_ID);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [isSyncingPush, setIsSyncingPush] = useState(false);
  const [isSyncingPull, setIsSyncingPull] = useState(false);
  const [autoSync, setAutoSync] = useState<boolean>(true);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Quick form states
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newNama, setNewNama] = useState('');
  const [newRole, setNewRole] = useState<'Admin' | 'Petugas'>('Petugas');

  const [showAddAreaForm, setShowAddAreaForm] = useState(false);
  const [newAreaId, setNewAreaId] = useState('');
  const [newAreaNama, setNewAreaNama] = useState('');

  const [showAddTarifForm, setShowAddTarifForm] = useState(false);
  const [newTarifId, setNewTarifId] = useState('');
  const [newTarifGolongan, setNewTarifGolongan] = useState('');
  const [newTarifTipe, setNewTarifTipe] = useState<'Flat' | 'Bertingkat'>('Flat');
  const [newTarifFlat, setNewTarifFlat] = useState(3000);
  const [newTarifR1Max, setNewTarifR1Max] = useState(10);
  const [newTarifR1Tarif, setNewTarifR1Tarif] = useState(3000);
  const [newTarifR2Max, setNewTarifR2Max] = useState(20);
  const [newTarifR2Tarif, setNewTarifR2Tarif] = useState(3500);
  const [newTarifR3Tarif, setNewTarifR3Tarif] = useState(5000);

  // Parameters editing inline
  const [isEditingAbonemen, setIsEditingAbonemen] = useState(false);
  const [editAboNominal, setEditAboNominal] = useState(abonemen.nominal);
  const [editAboStatus, setEditAboStatus] = useState<'Aktif' | 'Nonaktif'>(abonemen.status);

  const [isEditingDenda, setIsEditingDenda] = useState(false);
  const [editDendaNominal, setEditDendaNominal] = useState(denda.nominal);
  const [editDendaHari, setEditDendaHari] = useState(denda.hariKeterlambatan);
  const [editDendaStatus, setEditDendaStatus] = useState<'Aktif' | 'Nonaktif'>(denda.status);

  // Monitor Google Authentication State & Saved Database Config
  useEffect(() => {
    getSavedDbConfig().then(cfg => {
      if (cfg.spreadsheetId) {
        setSelectedSheetId(cfg.spreadsheetId);
      }
    });

    const token = getAccessToken();
    const storedUser = localStorage.getItem('pams_google_user');
    if (token && storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setGoogleUser(parsed);
        loadSheetsList();
      } catch (e) {
        setGoogleUser(null);
      }
    } else {
      setGoogleUser(null);
      setSpreadsheets([]);
    }
  }, []);

  // Synchronize internal form states on props updates
  useEffect(() => {
    setEditAboNominal(abonemen.nominal);
    setEditAboStatus(abonemen.status);
  }, [abonemen]);

  useEffect(() => {
    setEditDendaNominal(denda.nominal);
    setEditDendaHari(denda.hariKeterlambatan);
    setEditDendaStatus(denda.status);
  }, [denda]);

  // Handle auto-sync trigger on data model changes (debounced)
  useEffect(() => {
    if (!autoSync || !selectedSheetId || !getAccessToken()) return;

    const delayDebounce = setTimeout(async () => {
      try {
        await pushDataToSheets(selectedSheetId, {
          users,
          pelanggan,
          areas,
          tarifs,
          abonemen,
          denda,
          readings,
          billingList,
          cashTransactions
        });
        // auto-sync completed
      } catch (_) {}
    }, 4000); // Debounce to allow grouped saves

    return () => clearTimeout(delayDebounce);
  }, [users, pelanggan, areas, tarifs, abonemen, denda, readings, billingList, cashTransactions, autoSync, selectedSheetId]);

  const showStatus = (type: 'success' | 'error' | 'info', text: string) => {
    setSyncStatusMsg({ type, text });
    if (type !== 'error') {
      setTimeout(() => setSyncStatusMsg(null), 5000);
    }
  };

  const handleGoogleConnect = async () => {
    setIsConnecting(true);
    setSyncStatusMsg(null);
    try {
      const res = await connectGoogleAccount();
      setGoogleUser(res.user);
      showStatus('success', `Berhasil terhubung dengan Google Account: ${res.user.email}`);
      await loadSheetsList();
    } catch (err: any) {
      showStatus('error', err?.message || 'Gagal menghubungkan Google Account.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    try {
      await disconnectGoogleAccount();
      setGoogleUser(null);
      setSpreadsheets([]);
      setSelectedSheetId('');
      showStatus('info', 'Google Account diputuskan.');
    } catch (err: any) {
      showStatus('error', err?.message || 'Gagal memutuskan Google Account.');
    }
  };

  const loadSheetsList = async () => {
    setIsLoadingSheets(true);
    try {
      const list = await listSpreadsheets();
      setSpreadsheets(list);
    } catch (_) {} finally {
      setIsLoadingSheets(false);
    }
  };

  const handleSelectSheetId = (id: string) => {
    setSelectedSheetId(id);
    if (id) {
      showStatus('info', 'Spreadsheet terpilih berhasil dimuat.');
    }
  };

  const handleCreateNewSheetFile = async () => {
    setIsConnecting(true);
    setSyncStatusMsg(null);
    try {
      const name = prompt('Masukkan nama Spreadsheet baru:', `PAMSDIGI Database - ${new Date().getFullYear()}`);
      if (!name) return;
      
      const res = await createNewSpreadsheet(name);
      showStatus('success', `Spreadsheet "${name}" berhasil dibuat di Google Drive!`);
      await loadSheetsList();
      handleSelectSheetId(res.id);
    } catch (err: any) {
      showStatus('error', err?.message || 'Gagal membuat spreadsheet baru.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handlePushData = async () => {
    if (!selectedSheetId) {
      showStatus('error', 'Silakan hubungkan dan pilih Spreadsheet tujuan terlebih dahulu.');
      return;
    }
    setIsSyncingPush(true);
    setSyncStatusMsg(null);
    try {
      await pushDataToSheets(selectedSheetId, {
        users,
        pelanggan,
        areas,
        tarifs,
        abonemen,
        denda,
        readings,
        billingList,
        cashTransactions
      });
      showStatus('success', 'Sinkronisasi Berhasil! Semua data lokal telah diunggah ke Google Sheets Anda.');
    } catch (err: any) {
      showStatus('error', err?.message || 'Gagal mengirim data ke Google Sheets.');
    } finally {
      setIsSyncingPush(false);
    }
  };

  const handlePullData = async () => {
    if (!selectedSheetId) {
      showStatus('error', 'Silakan pilih Spreadsheet sumber terlebih dahulu.');
      return;
    }
    if (!window.confirm('PERINGATAN: Menarik data akan sepenuhnya menimpa seluruh database lokal aktif di dashboard saat ini. Lanjutkan?')) {
      return;
    }
    setIsSyncingPull(true);
    setSyncStatusMsg(null);
    try {
      const data = await pullDataFromSheets(selectedSheetId);
      
      // Bulk restore
      onRestoreAllData({
        users: data.users,
        pelanggan: data.pelanggan,
        areas: data.areas,
        tarifs: data.tarifs,
        abonemen: data.abonemen,
        denda: data.denda
      });

      if (data.readings || data.billingList || data.cashTransactions) {
        onRestoreTransactionalData(
          data.readings || [],
          data.billingList || [],
          data.cashTransactions || []
        );
      }

      showStatus('success', 'Berhasil mengimpor data! Seluruh database lokal PAMSDIGI telah tersinkronisasi.');
    } catch (err: any) {
      showStatus('error', err?.message || 'Gagal menarik data dari Google Sheets.');
    } finally {
      setIsSyncingPull(false);
    }
  };

  const handleToggleAutoSync = () => {
    const nextVal = !autoSync;
    setAutoSync(nextVal);
    showStatus('info', nextVal ? 'Auto-Sync diaktifkan (Setiap ada entri data baru akan terunggah otomatis).' : 'Auto-Sync dinonaktifkan.');
  };

  // Inline forms submit
  const handleAddUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newNama.trim()) return;
    if (users.some((u) => u.username.toLowerCase() === newUsername.trim().toLowerCase())) {
      alert('Gagal: Username sudah digunakan!');
      return;
    }
    onAddUser({
      username: newUsername.trim(),
      password: newPassword.trim() || 'user123',
      nama: newNama.trim(),
      role: newRole,
      status: 'Aktif'
    });
    setNewUsername('');
    setNewPassword('');
    setNewNama('');
    setShowAddUserForm(false);
  };

  const handleAddAreaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAreaId.trim() || !newAreaNama.trim()) return;
    const idClean = newAreaId.trim().toUpperCase();
    if (areas.some((a) => a.id.toUpperCase() === idClean)) {
      alert('Gagal: ID Area sudah digunakan!');
      return;
    }
    onAddArea({ id: idClean, nama: newAreaNama.trim() });
    setNewAreaId('');
    setNewAreaNama('');
    setShowAddAreaForm(false);
  };

  const handleAddTarifSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTarifId.trim() || !newTarifGolongan.trim()) return;
    const idClean = newTarifId.trim().toUpperCase();
    if (tarifs.some((t) => t.id.toUpperCase() === idClean)) {
      alert('Gagal: ID Tarif sudah digunakan!');
      return;
    }
    onAddTarif({
      id: idClean,
      golongan: newTarifGolongan.trim(),
      tipe: newTarifTipe,
      tarifFlat: newTarifFlat,
      range1Max: newTarifR1Max,
      range1Tarif: newTarifR1Tarif,
      range2Max: newTarifR2Max,
      range2Tarif: newTarifR2Tarif,
      range3Tarif: newTarifR3Tarif,
      status: 'Aktif'
    });
    setNewTarifId('');
    setNewTarifGolongan('');
    setShowAddTarifForm(false);
  };

  const handleSaveAbonemen = () => {
    onUpdateAbonemen({ nominal: editAboNominal, status: editAboStatus });
    setIsEditingAbonemen(false);
  };

  const handleSaveDenda = () => {
    onUpdateDenda({ nominal: editDendaNominal, hariKeterlambatan: editDendaHari, status: editDendaStatus });
    setIsEditingDenda(false);
  };

  const tabs: SheetTab[] = ['Pelanggan', 'Users', 'Area', 'Tarif', 'Abonemen', 'Denda', 'Meter', 'Tagihan', 'Pembayaran'];

  return (
    <div id="spreadsheet-container" className="space-y-4">
      
      {/* Real Google Sheets Synchronization Panel */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-900/30">
              <Cloud size={22} className="animate-pulse" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-100 flex items-center gap-2">
                Konektor Google Sheets Direct Mode
                <span className="text-[9px] font-black tracking-widest bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 uppercase">
                  ACTIVE
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-normal max-w-xl">
                Integrasikan PAMSDIGI langsung dengan file Google Spreadsheet asli milik Anda tanpa login Google. Masukkan Spreadsheet ID di bawah dan lakukan sinkronisasi data secara langsung.
              </p>
            </div>
          </div>

          <div className="shrink-0">
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-bold">Mode Koneksi:</span>
                <span className="text-xs font-black text-emerald-400 block uppercase">TANPA LOGIN (DIRECT MODE)</span>
              </div>
            </div>
          </div>
        </div>

        {googleUser && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-fade-in text-xs">
            {/* Sheet Selection Column */}
            <div className="space-y-2 bg-slate-950/60 p-4 rounded-xl border border-slate-850">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">1. Masukkan Spreadsheet ID</span>
              
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={selectedSheetId}
                    onChange={(e) => handleSelectSheetId(e.target.value)}
                    placeholder="Masukkan atau tempel ID Spreadsheet Google..."
                    className="flex-1 bg-slate-900 border border-slate-750 text-slate-200 text-xs px-3 py-2 rounded-lg outline-none font-medium focus:border-emerald-500 placeholder:text-slate-600"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  {selectedSheetId && (
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${selectedSheetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-extrabold text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
                    >
                      Buka Google Sheet
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Sync Database Operations */}
            <div className="space-y-2 bg-slate-950/60 p-4 rounded-xl border border-slate-850">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">2. Aksi Sinkronisasi Manual</span>
              <div className="grid grid-cols-2 gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={handlePushData}
                  disabled={isSyncingPush || !selectedSheetId}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-2.5 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  {isSyncingPush ? <Loader2 size={13} className="animate-spin" /> : <Cloud size={13} />}
                  Kirim Data (Export)
                </button>

                <button
                  type="button"
                  onClick={handlePullData}
                  disabled={isSyncingPull || !selectedSheetId}
                  className="w-full bg-slate-800 hover:bg-slate-750 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 border border-slate-700 font-black py-2.5 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  {isSyncingPull ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  Tarik Data (Import)
                </button>
              </div>
            </div>

            {/* Real-time sync configuration */}
            <div className="space-y-2 bg-slate-950/60 p-4 rounded-xl border border-slate-850 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">3. Opsi Sinkronisasi Otomatis</span>
                <p className="text-[10px] text-slate-400 mt-1">
                  Saat diaktifkan, seluruh penambahan, pengeditan, atau penghapusan data di simulator akan langsung menyinkronkan baris Google Sheets Anda secara instan di background.
                </p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[10px] font-bold text-slate-300">Auto-Sync Status:</span>
                <button
                  type="button"
                  onClick={handleToggleAutoSync}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    autoSync ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      autoSync ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sync Status Alert Block */}
        {syncStatusMsg && (
          <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-semibold animate-fade-in ${
            syncStatusMsg.type === 'success' ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' :
            syncStatusMsg.type === 'error' ? 'bg-rose-950/40 border-rose-800 text-rose-300' :
            'bg-blue-950/40 border-blue-850 text-blue-300'
          }`}>
            {syncStatusMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            <span>{syncStatusMsg.text}</span>
          </div>
        )}
      </div>

      {/* Sheets Tab Bar Layout */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-md flex flex-col">
        <div className="bg-emerald-800 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <span className="font-mono text-xs font-bold uppercase tracking-wider">
              {selectedSheetId ? 'PAMSDIGI_Cloud_Database.xlsx' : 'PAMSDIGI_Local_Simulator.xlsx'}
            </span>
          </div>
          <span className="text-[10px] font-bold bg-emerald-900 px-2.5 py-1 rounded-full text-emerald-100 flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${selectedSheetId ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`}></span>
            {selectedSheetId ? 'Cloud Sync Active' : 'Offline State'}
          </span>
        </div>

        {/* Tab Selection */}
        <div className="bg-slate-100 border-b border-slate-200 flex overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            const isTabActive = ['Users', 'Pelanggan', 'Area', 'Tarif', 'Abonemen', 'Denda', 'Meter', 'Tagihan', 'Pembayaran'].includes(tab);
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-xs font-bold transition-all border-r border-slate-200 shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600 font-extrabold'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isTabActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                  <span>{tab}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Grid Content Area */}
        <div className="p-4 overflow-x-auto min-h-[350px]">
          
          {/* USERS SHEET */}
          {activeTab === 'Users' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">Sheet: Users (Petugas &amp; Admin)</span>
                <button 
                  onClick={() => setShowAddUserForm(!showAddUserForm)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer shadow-sm"
                >
                  <Plus size={12} />
                  Tambah Akun Baru
                </button>
              </div>

              {showAddUserForm && (
                <form onSubmit={handleAddUserSubmit} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3 animate-fade-in max-w-4xl">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Username</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Username" 
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      className="w-full text-xs font-medium bg-white px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Password</label>
                    <input 
                      type="password" 
                      required
                      placeholder="Password" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full text-xs font-medium bg-white px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Nama Lengkap</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Nama Lengkap" 
                      value={newNama}
                      onChange={(e) => setNewNama(e.target.value)}
                      className="w-full text-xs font-medium bg-white px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none mt-1"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Role</label>
                      <select 
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as any)}
                        className="w-full text-xs font-bold bg-white px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none mt-1"
                      >
                        <option value="Admin">Admin</option>
                        <option value="Petugas">Petugas</option>
                      </select>
                    </div>
                    <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold p-2.5 rounded-lg shadow-sm cursor-pointer">
                      <Check size={14} />
                    </button>
                    <button type="button" onClick={() => setShowAddUserForm(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold p-2.5 rounded-lg cursor-pointer">
                      <X size={14} />
                    </button>
                  </div>
                </form>
              )}

              {/* SpreadSheet Row Format Visualization */}
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="p-2 border-r border-slate-200 w-10 text-center">Row</th>
                    <th className="p-2 border-r border-slate-200">A - Username</th>
                    <th className="p-2 border-r border-slate-200">B - Password</th>
                    <th className="p-2 border-r border-slate-200">C - Nama</th>
                    <th className="p-2 border-r border-slate-200">D - Role</th>
                    <th className="p-2 border-r border-slate-200">E - Status</th>
                    <th className="p-2 text-center w-12">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50/50 text-slate-400 font-bold">
                    <td className="p-2 border-r border-b border-slate-200 text-center">1</td>
                    <td className="p-2 border-r border-b border-slate-200">Username</td>
                    <td className="p-2 border-r border-b border-slate-200">Password</td>
                    <td className="p-2 border-r border-b border-slate-200">Nama</td>
                    <td className="p-2 border-r border-b border-slate-200">Role</td>
                    <td className="p-2 border-r border-b border-slate-200">Status</td>
                    <td className="p-2 border-b border-slate-200"></td>
                  </tr>
                  {users.map((user, idx) => (
                    <tr key={user.username} className="hover:bg-slate-50 border-b border-slate-200">
                      <td className="p-2 border-r border-slate-200 text-center bg-slate-100 text-slate-500 font-bold">{idx + 2}</td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{user.username}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-500">••••••••</td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{user.nama}</td>
                      <td className="p-2 border-r border-slate-200">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          user.role === 'Admin' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          user.status === 'Aktif' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <button 
                          onClick={() => onDeleteUser(user.username)}
                          disabled={user.username === 'admin'}
                          className="text-slate-400 hover:text-red-600 transition disabled:opacity-30 cursor-pointer"
                          title="Hapus baris dari spreadsheet"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* PELANGGAN SHEET */}
          {activeTab === 'Pelanggan' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center pb-2">
                <span className="text-xs font-bold text-slate-500">Sheet: Pelanggan (Data Air &amp; Alamat)</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Total Baris: {pelanggan.length}</span>
              </div>

              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="p-2 border-r border-slate-200 w-10 text-center">Row</th>
                    <th className="p-2 border-r border-slate-200">A - NoPelanggan</th>
                    <th className="p-2 border-r border-slate-200">B - Nama</th>
                    <th className="p-2 border-r border-slate-200">C - Area</th>
                    <th className="p-2 border-r border-slate-200">D - Alamat</th>
                    <th className="p-2 border-r border-slate-200">E - Golongan</th>
                    <th className="p-2 border-r border-slate-200">F - TempatPemasangan</th>
                    <th className="p-2 border-r border-slate-200">G - TglPasang</th>
                    <th className="p-2 border-r border-slate-200">H - MeterAwal</th>
                    <th className="p-2 border-r border-slate-200">I - Telepon</th>
                    <th className="p-2 border-r border-slate-200">J - Lat</th>
                    <th className="p-2 border-r border-slate-200">K - Long</th>
                    <th className="p-2 border-r border-slate-200">L - Status</th>
                    <th className="p-2 border-r border-slate-200">M - CreatedAt</th>
                    <th className="p-2 text-center w-12">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50/50 text-slate-400 font-bold">
                    <td className="p-2 border-r border-b border-slate-200 text-center">1</td>
                    <td className="p-2 border-r border-b border-slate-200">NoPelanggan</td>
                    <td className="p-2 border-r border-b border-slate-200">Nama</td>
                    <td className="p-2 border-r border-b border-slate-200">Area</td>
                    <td className="p-2 border-r border-b border-slate-200">Alamat</td>
                    <td className="p-2 border-r border-b border-slate-200">Golongan</td>
                    <td className="p-2 border-r border-b border-slate-200">TempatPemasangan</td>
                    <td className="p-2 border-r border-b border-slate-200">TglPasang</td>
                    <td className="p-2 border-r border-b border-slate-200">MeterAwal</td>
                    <td className="p-2 border-r border-b border-slate-200">Telepon</td>
                    <td className="p-2 border-r border-b border-slate-200">Latitude</td>
                    <td className="p-2 border-r border-b border-slate-200">Longitude</td>
                    <td className="p-2 border-r border-b border-slate-200">Status</td>
                    <td className="p-2 border-r border-b border-slate-200">CreatedAt</td>
                    <td className="p-2 border-b border-slate-200"></td>
                  </tr>
                  {pelanggan.map((p, idx) => (
                    <tr key={p.noPelanggan} className="hover:bg-slate-50 border-b border-slate-200">
                      <td className="p-2 border-r border-slate-200 text-center bg-slate-100 text-slate-500 font-bold">{idx + 2}</td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{p.noPelanggan}</td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-800 truncate max-w-[120px]">{p.nama}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-600 truncate max-w-[100px]">{p.area}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-500 truncate max-w-[100px]">{p.alamat}</td>
                      <td className="p-2 border-r border-slate-200 font-semibold text-blue-600">{p.golongan}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-500">{p.tempatPemasangan}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-500 whitespace-nowrap">{p.tglPasang}</td>
                      <td className="p-2 border-r border-slate-200 text-right font-semibold">{p.meterAwal}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-500">{p.telepon}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-400">{p.latitude?.toFixed(4)}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-400">{p.longitude?.toFixed(4)}</td>
                      <td className="p-2 border-r border-slate-200">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          p.status === 'Aktif' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-2 border-r border-slate-200 text-slate-400 truncate max-w-[80px]" title={p.createdAt}>{p.createdAt}</td>
                      <td className="p-2 text-center">
                        <button 
                          onClick={() => onDeletePelanggan(p.noPelanggan)}
                          className="text-slate-400 hover:text-red-600 transition cursor-pointer"
                          title="Hapus baris dari spreadsheet"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* AREA SHEET */}
          {activeTab === 'Area' && (
            <div className="space-y-4 max-w-xl">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">Sheet: Area (Dusun / Wilayah Pemasangan)</span>
                <button 
                  onClick={() => setShowAddAreaForm(!showAddAreaForm)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer shadow-sm"
                >
                  <Plus size={12} />
                  Tambah Area Baru
                </button>
              </div>

              {showAddAreaForm && (
                <form onSubmit={handleAddAreaSubmit} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fade-in">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">ID Area</label>
                    <input 
                      type="text" 
                      required
                      placeholder="ID Area (Contoh: KRAJ)" 
                      value={newAreaId}
                      onChange={(e) => setNewAreaId(e.target.value)}
                      className="w-full text-xs font-bold bg-white px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none mt-1 uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Nama Dusun / Area</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Nama Area" 
                      value={newAreaNama}
                      onChange={(e) => setNewAreaNama(e.target.value)}
                      className="w-full text-xs font-medium bg-white px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none mt-1"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1 cursor-pointer">
                      <Check size={14} />
                      Simpan
                    </button>
                    <button type="button" onClick={() => setShowAddAreaForm(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold p-2.5 rounded-lg cursor-pointer">
                      <X size={14} />
                    </button>
                  </div>
                </form>
              )}

              {/* SpreadSheet Row Format Visualization */}
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="p-2 border-r border-slate-200 w-10 text-center">Row</th>
                    <th className="p-2 border-r border-slate-200">A - IDArea</th>
                    <th className="p-2 border-r border-slate-200">B - NamaArea</th>
                    <th className="p-2 text-center w-12">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50/50 text-slate-400 font-bold">
                    <td className="p-2 border-r border-b border-slate-200 text-center">1</td>
                    <td className="p-2 border-r border-b border-slate-200">IDArea</td>
                    <td className="p-2 border-r border-b border-slate-200">NamaArea</td>
                    <td className="p-2 border-b border-slate-200"></td>
                  </tr>
                  {areas.map((area, idx) => (
                    <tr key={area.id} className="hover:bg-slate-50 border-b border-slate-200">
                      <td className="p-2 border-r border-slate-200 text-center bg-slate-100 text-slate-500 font-bold">{idx + 2}</td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{area.id}</td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{area.nama}</td>
                      <td className="p-2 text-center">
                        <button 
                          onClick={() => onDeleteArea(area.id)}
                          className="text-slate-400 hover:text-red-600 transition cursor-pointer"
                          title="Hapus baris dari spreadsheet"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TARIF SHEET */}
          {activeTab === 'Tarif' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">Sheet: Tarif (Golongan Pelanggan Air)</span>
                <button 
                  onClick={() => setShowAddTarifForm(!showAddTarifForm)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer shadow-sm"
                >
                  <Plus size={12} />
                  Tambah Tarif Baru
                </button>
              </div>

              {showAddTarifForm && (
                <form onSubmit={handleAddTarifSubmit} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-5 gap-3 animate-fade-in">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">ID Tarif</label>
                    <input 
                      type="text" 
                      required
                      placeholder="ID (Contoh: TRF-A)" 
                      value={newTarifId}
                      onChange={(e) => setNewTarifId(e.target.value)}
                      className="w-full text-xs font-bold bg-white px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none mt-1 uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Golongan</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Nama Golongan" 
                      value={newTarifGolongan}
                      onChange={(e) => setNewTarifGolongan(e.target.value)}
                      className="w-full text-xs font-medium bg-white px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Tipe</label>
                    <select 
                      value={newTarifTipe}
                      onChange={(e) => setNewTarifTipe(e.target.value as any)}
                      className="w-full text-xs font-bold bg-white px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none mt-1"
                    >
                      <option value="Flat">Flat</option>
                      <option value="Bertingkat">Bertingkat</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      {newTarifTipe === 'Flat' ? 'Tarif Flat (Rp)' : 'Tarif R1 (s.d. 10m³)'}
                    </label>
                    <input 
                      type="number" 
                      value={newTarifTipe === 'Flat' ? newTarifFlat : newTarifR1Tarif}
                      onChange={(e) => {
                        if (newTarifTipe === 'Flat') setNewTarifFlat(Number(e.target.value));
                        else setNewTarifR1Tarif(Number(e.target.value));
                      }}
                      className="w-full text-xs font-mono bg-white px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none mt-1"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1 cursor-pointer">
                      <Check size={14} />
                      Simpan
                    </button>
                    <button type="button" onClick={() => setShowAddTarifForm(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold p-2.5 rounded-lg cursor-pointer">
                      <X size={14} />
                    </button>
                  </div>
                </form>
              )}

              {/* SpreadSheet Row Format Visualization */}
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="p-2 border-r border-slate-200 w-10 text-center">Row</th>
                    <th className="p-2 border-r border-slate-200">A - IDTarif</th>
                    <th className="p-2 border-r border-slate-200">B - Golongan</th>
                    <th className="p-2 border-r border-slate-200">C - Tipe</th>
                    <th className="p-2 border-r border-slate-200">D - TarifFlat</th>
                    <th className="p-2 border-r border-slate-200">E - R1 Max</th>
                    <th className="p-2 border-r border-slate-200">F - R1 Tarif</th>
                    <th className="p-2 border-r border-slate-200">G - R2 Max</th>
                    <th className="p-2 border-r border-slate-200">H - R2 Tarif</th>
                    <th className="p-2 border-r border-slate-200">I - R3 Tarif</th>
                    <th className="p-2 border-r border-slate-200">J - Status</th>
                    <th className="p-2 text-center w-12">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50/50 text-slate-400 font-bold">
                    <td className="p-2 border-r border-b border-slate-200 text-center">1</td>
                    <td className="p-2 border-r border-b border-slate-200">IDTarif</td>
                    <td className="p-2 border-r border-b border-slate-200">Golongan</td>
                    <td className="p-2 border-r border-b border-slate-200">Tipe</td>
                    <td className="p-2 border-r border-b border-slate-200">TarifFlat</td>
                    <td className="p-2 border-r border-b border-slate-200">Range1Max</td>
                    <td className="p-2 border-r border-b border-slate-200">Range1Tarif</td>
                    <td className="p-2 border-r border-b border-slate-200">Range2Max</td>
                    <td className="p-2 border-r border-b border-slate-200">Range2Tarif</td>
                    <td className="p-2 border-r border-b border-slate-200">Range3Tarif</td>
                    <td className="p-2 border-r border-b border-slate-200">Status</td>
                    <td className="p-2 border-b border-slate-200"></td>
                  </tr>
                  {tarifs.map((t, idx) => (
                    <tr key={t.id} className="hover:bg-slate-50 border-b border-slate-200">
                      <td className="p-2 border-r border-slate-200 text-center bg-slate-100 text-slate-500 font-bold">{idx + 2}</td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{t.id}</td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{t.golongan}</td>
                      <td className="p-2 border-r border-slate-200">{t.tipe}</td>
                      <td className="p-2 border-r border-slate-200 font-mono text-right">{t.tipe === 'Flat' ? t.tarifFlat : '-'}</td>
                      <td className="p-2 border-r border-slate-200 font-mono text-center">{t.tipe === 'Bertingkat' ? t.range1Max : '-'}</td>
                      <td className="p-2 border-r border-slate-200 font-mono text-right">{t.tipe === 'Bertingkat' ? t.range1Tarif : '-'}</td>
                      <td className="p-2 border-r border-slate-200 font-mono text-center">{t.tipe === 'Bertingkat' ? t.range2Max : '-'}</td>
                      <td className="p-2 border-r border-slate-200 font-mono text-right">{t.tipe === 'Bertingkat' ? t.range2Tarif : '-'}</td>
                      <td className="p-2 border-r border-slate-200 font-mono text-right">{t.tipe === 'Bertingkat' ? t.range3Tarif : '-'}</td>
                      <td className="p-2 border-r border-slate-200">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          t.status === 'Aktif' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <button 
                          onClick={() => onDeleteTarif(t.id)}
                          className="text-slate-400 hover:text-red-600 transition cursor-pointer"
                          title="Hapus baris dari spreadsheet"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ABONEMEN SHEET */}
          {activeTab === 'Abonemen' && (
            <div className="space-y-4 max-w-xl">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">Sheet: Abonemen (Biaya Beban Bulanan Tetap)</span>
                {!isEditingAbonemen ? (
                  <button 
                    onClick={() => setIsEditingAbonemen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                  >
                    <Edit size={12} />
                    Ubah Parameter
                  </button>
                ) : (
                  <div className="flex gap-1.5">
                    <button 
                      onClick={handleSaveAbonemen}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                    >
                      <Save size={12} />
                      Simpan
                    </button>
                    <button 
                      onClick={() => {
                        setEditAboNominal(abonemen.nominal);
                        setEditAboStatus(abonemen.status);
                        setIsEditingAbonemen(false);
                      }}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                    >
                      <X size={12} />
                      Batal
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-700">Konfigurasi Aktif Spreadsheet:</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">A - Nominal (Rp)</span>
                    {isEditingAbonemen ? (
                      <input 
                        type="number"
                        className="font-mono text-sm font-bold text-slate-800 border-b border-blue-500 w-full outline-none mt-1"
                        value={editAboNominal}
                        onChange={(e) => setEditAboNominal(Number(e.target.value))}
                      />
                    ) : (
                      <span className="font-mono text-sm font-black text-slate-800 block mt-1">
                        Rp {abonemen.nominal.toLocaleString('id-ID')}
                      </span>
                    )}
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">B - Status</span>
                    {isEditingAbonemen ? (
                      <select 
                        value={editAboStatus}
                        onChange={(e) => setEditAboStatus(e.target.value as 'Aktif' | 'Nonaktif')}
                        className="text-xs font-bold text-slate-800 border-b border-blue-500 w-full outline-none mt-1.5"
                      >
                        <option value="Aktif">Aktif (Dikenakan Biaya)</option>
                        <option value="Nonaktif">Nonaktif (Bebas Biaya)</option>
                      </select>
                    ) : (
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold mt-1.5 ${
                        abonemen.status === 'Aktif' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {abonemen.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* SpreadSheet Row Format Visualization */}
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="p-2 border-r border-slate-200 w-10 text-center">Row</th>
                    <th className="p-2 border-r border-slate-200">A - NominalAbonemen</th>
                    <th className="p-2 border-r border-slate-200">B - Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50/50 text-slate-400 font-bold">
                    <td className="p-2 border-r border-b border-slate-200 text-center">1</td>
                    <td className="p-2 border-r border-b border-slate-200">Nominal</td>
                    <td className="p-2 border-r border-b border-slate-200">Status</td>
                  </tr>
                  <tr className="hover:bg-slate-50 border-b border-slate-200">
                    <td className="p-2 border-r border-slate-200 text-center bg-slate-100 text-slate-500 font-bold">{2}</td>
                    <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{abonemen.nominal}</td>
                    <td className="p-2 border-r border-slate-200">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        abonemen.status === 'Aktif' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {abonemen.status}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* DENDA SHEET */}
          {activeTab === 'Denda' && (
            <div className="space-y-4 max-w-xl">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">Sheet: Denda (Biaya Keterlambatan Pembayaran)</span>
                {!isEditingDenda ? (
                  <button 
                    onClick={() => setIsEditingDenda(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                  >
                    <Edit size={12} />
                    Ubah Parameter
                  </button>
                ) : (
                  <div className="flex gap-1.5">
                    <button 
                      onClick={handleSaveDenda}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                    >
                      <Save size={12} />
                      Simpan
                    </button>
                    <button 
                      onClick={() => {
                        setEditDendaNominal(denda.nominal);
                        setEditDendaHari(denda.hariKeterlambatan);
                        setEditDendaStatus(denda.status);
                        setIsEditingDenda(false);
                      }}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                    >
                      <X size={12} />
                      Batal
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-700">Konfigurasi Aktif Spreadsheet:</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">A - Status Denda</span>
                    {isEditingDenda ? (
                      <select 
                        value={editDendaStatus}
                        onChange={(e) => setEditDendaStatus(e.target.value as 'Aktif' | 'Nonaktif')}
                        className="text-xs font-bold text-slate-800 border-b border-blue-500 w-full outline-none mt-1.5"
                      >
                        <option value="Aktif">ON (Aktif)</option>
                        <option value="Nonaktif">OFF (Mati)</option>
                      </select>
                    ) : (
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold mt-1.5 ${
                        denda.status === 'Aktif' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {denda.status === 'Aktif' ? 'ON' : 'OFF'}
                      </span>
                    )}
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">B - Nominal (Rp)</span>
                    {isEditingDenda ? (
                      <input 
                        type="number"
                        className="font-mono text-sm font-bold text-slate-800 border-b border-blue-500 w-full outline-none mt-1"
                        value={editDendaNominal}
                        onChange={(e) => setEditDendaNominal(Number(e.target.value))}
                      />
                    ) : (
                      <span className="font-mono text-sm font-black text-slate-800 block mt-1">
                        Rp {denda.nominal.toLocaleString('id-ID')}
                      </span>
                    )}
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">C - Hari Terlambat</span>
                    {isEditingDenda ? (
                      <input 
                        type="number"
                        className="font-mono text-sm font-bold text-slate-800 border-b border-blue-500 w-full outline-none mt-1"
                        value={editDendaHari}
                        onChange={(e) => setEditDendaHari(Number(e.target.value))}
                      />
                    ) : (
                      <span className="font-mono text-sm font-black text-slate-800 block mt-1">
                        Hari ke-{denda.hariKeterlambatan}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* SpreadSheet Row Format Visualization */}
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="p-2 border-r border-slate-200 w-10 text-center">Row</th>
                    <th className="p-2 border-r border-slate-200">A - StatusDenda</th>
                    <th className="p-2 border-r border-slate-200">B - NominalDenda</th>
                    <th className="p-2 border-r border-slate-200">C - HariKeterlambatan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50/50 text-slate-400 font-bold">
                    <td className="p-2 border-r border-b border-slate-200 text-center">1</td>
                    <td className="p-2 border-r border-b border-slate-200">Status</td>
                    <td className="p-2 border-r border-b border-slate-200">Nominal</td>
                    <td className="p-2 border-r border-b border-slate-200">HariKeterlambatan</td>
                  </tr>
                  <tr className="hover:bg-slate-50 border-b border-slate-200">
                    <td className="p-2 border-r border-slate-200 text-center bg-slate-100 text-slate-500 font-bold">{2}</td>
                    <td className="p-2 border-r border-slate-200">{denda.status}</td>
                    <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{denda.nominal}</td>
                    <td className="p-2 border-r border-slate-200 font-mono text-slate-600">{denda.hariKeterlambatan}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* METER READINGS SHEET */}
          {activeTab === 'Meter' && (
            <div className="space-y-4">
              <span className="text-xs font-bold text-slate-500">Sheet: Meter (Pencatatan Meter Air Bulanan Pelanggan)</span>
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="p-2 border-r border-slate-200 w-10 text-center">Row</th>
                    <th className="p-2 border-r border-slate-200">A - IDReadings</th>
                    <th className="p-2 border-r border-slate-200">B - NoPelanggan</th>
                    <th className="p-2 border-r border-slate-200">C - Nama</th>
                    <th className="p-2 border-r border-slate-200">D - Area</th>
                    <th className="p-2 border-r border-slate-200">E - MeterLalu</th>
                    <th className="p-2 border-r border-slate-200">F - MeterKini</th>
                    <th className="p-2 border-r border-slate-200">G - Usage (m³)</th>
                    <th className="p-2 border-r border-slate-200">H - TglBaca</th>
                    <th className="p-2">I - Periode</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50/50 text-slate-400 font-bold">
                    <td className="p-2 border-r border-b border-slate-200 text-center">1</td>
                    <td className="p-2 border-r border-b border-slate-200">IDReadings</td>
                    <td className="p-2 border-r border-b border-slate-200">NoPelanggan</td>
                    <td className="p-2 border-r border-b border-slate-200">Nama</td>
                    <td className="p-2 border-r border-b border-slate-200">Area</td>
                    <td className="p-2 border-r border-b border-slate-200">MeterLalu</td>
                    <td className="p-2 border-r border-b border-slate-200">MeterKini</td>
                    <td className="p-2 border-r border-b border-slate-200">Usage</td>
                    <td className="p-2 border-r border-b border-slate-200">TglBaca</td>
                    <td className="p-2 border-b border-slate-200">Periode</td>
                  </tr>
                  {readings.map((r, idx) => (
                    <tr key={r.id || idx} className="hover:bg-slate-50 border-b border-slate-200">
                      <td className="p-2 border-r border-slate-200 text-center bg-slate-100 text-slate-500 font-bold">{idx + 2}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-500">{r.id}</td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{r.noPelanggan}</td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{r.nama}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-600">{r.area}</td>
                      <td className="p-2 border-r border-slate-200 font-mono text-right">{r.meterLalu}</td>
                      <td className="p-2 border-r border-slate-200 font-mono text-right font-bold text-blue-600">{r.meterKini}</td>
                      <td className="p-2 border-r border-slate-200 font-mono text-right font-black text-slate-800">{r.usage}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-500">{r.tglBaca}</td>
                      <td className="p-2 font-semibold text-slate-600">{r.periode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAGIHAN SHEET */}
          {activeTab === 'Tagihan' && (
            <div className="space-y-4">
              <span className="text-xs font-bold text-slate-500">Sheet: Tagihan (Daftar Rekening Tagihan Air Bulanan)</span>
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="p-2 border-r border-slate-200 w-10 text-center">Row</th>
                    <th className="p-2 border-r border-slate-200">A - IDBill</th>
                    <th className="p-2 border-r border-slate-200">B - NoPelanggan</th>
                    <th className="p-2 border-r border-slate-200">C - Nama</th>
                    <th className="p-2 border-r border-slate-200">D - KubikasiBiaya</th>
                    <th className="p-2 border-r border-slate-200">E - Abonemen</th>
                    <th className="p-2 border-r border-slate-200">F - Denda</th>
                    <th className="p-2 border-r border-slate-200">G - Total</th>
                    <th className="p-2 border-r border-slate-200">H - Status</th>
                    <th className="p-2">I - Periode</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50/50 text-slate-400 font-bold">
                    <td className="p-2 border-r border-b border-slate-200 text-center">1</td>
                    <td className="p-2 border-r border-b border-slate-200">IDBill</td>
                    <td className="p-2 border-r border-b border-slate-200">NoPelanggan</td>
                    <td className="p-2 border-r border-b border-slate-200">Nama</td>
                    <td className="p-2 border-r border-b border-slate-200">KubikasiBiaya</td>
                    <td className="p-2 border-r border-b border-slate-200">Abonemen</td>
                    <td className="p-2 border-r border-b border-slate-200">Denda</td>
                    <td className="p-2 border-r border-b border-slate-200">Total</td>
                    <td className="p-2 border-r border-b border-slate-200">Status</td>
                    <td className="p-2 border-b border-slate-200">Periode</td>
                  </tr>
                  {billingList.map((b, idx) => (
                    <tr key={b.id || idx} className="hover:bg-slate-50 border-b border-slate-200">
                      <td className="p-2 border-r border-slate-200 text-center bg-slate-100 text-slate-500 font-bold">{idx + 2}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-500">{b.id}</td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{b.noPelanggan}</td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{b.nama}</td>
                      <td className="p-2 border-r border-slate-200 font-mono text-right">Rp {b.kubikasiBiaya.toLocaleString('id-ID')}</td>
                      <td className="p-2 border-r border-slate-200 font-mono text-right">Rp {b.abonemen.toLocaleString('id-ID')}</td>
                      <td className="p-2 border-r border-slate-200 font-mono text-right text-rose-500">Rp {b.denda.toLocaleString('id-ID')}</td>
                      <td className="p-2 border-r border-slate-200 font-mono text-right font-black text-emerald-600">Rp {b.total.toLocaleString('id-ID')}</td>
                      <td className="p-2 border-r border-slate-200">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          b.status === 'Lunas' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="p-2 font-semibold text-slate-600">{b.periode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* PEMBAYARAN SHEET */}
          {activeTab === 'Pembayaran' && (
            <div className="space-y-4">
              <span className="text-xs font-bold text-slate-500">Sheet: Pembayaran (Buku Jurnal Kas &amp; Setoran Keuangan)</span>
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="p-2 border-r border-slate-200 w-10 text-center">Row</th>
                    <th className="p-2 border-r border-slate-200">A - IDTransaction</th>
                    <th className="p-2 border-r border-slate-200">B - Tanggal</th>
                    <th className="p-2 border-r border-slate-200">C - Deskripsi</th>
                    <th className="p-2 border-r border-slate-200">D - Tipe</th>
                    <th className="p-2 border-r border-slate-200">E - Jumlah</th>
                    <th className="p-2">F - Area</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50/50 text-slate-400 font-bold">
                    <td className="p-2 border-r border-b border-slate-200 text-center">1</td>
                    <td className="p-2 border-r border-b border-slate-200">IDTransaction</td>
                    <td className="p-2 border-r border-b border-slate-200">Tanggal</td>
                    <td className="p-2 border-r border-b border-slate-200">Deskripsi</td>
                    <td className="p-2 border-r border-b border-slate-200">Tipe</td>
                    <td className="p-2 border-r border-b border-slate-200">Jumlah</td>
                    <td className="p-2 border-b border-slate-200">Area</td>
                  </tr>
                  {cashTransactions.map((t, idx) => (
                    <tr key={t.id || idx} className="hover:bg-slate-50 border-b border-slate-200">
                      <td className="p-2 border-r border-slate-200 text-center bg-slate-100 text-slate-500 font-bold">{idx + 2}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-500">{t.id}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-600">{t.tanggal}</td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{t.deskripsi}</td>
                      <td className="p-2 border-r border-slate-200">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          t.tipe === 'Masuk' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {t.tipe}
                        </span>
                      </td>
                      <td className="p-2 border-r border-slate-200 font-mono text-right font-bold text-slate-800">Rp {t.jumlah.toLocaleString('id-ID')}</td>
                      <td className="p-2 font-semibold text-slate-600">{t.area}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
