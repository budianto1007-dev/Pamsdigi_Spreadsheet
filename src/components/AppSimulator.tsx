import React, { useState, useEffect, useRef } from 'react';
import { 
  UserRow, PelangganRow, AreaRow, TarifRow, AbonemenRow, DendaRow,
  RoleFeatureAccess, RoleMenuAccess, FeaturePermissions, MenuPermissions,
  DEFAULT_FEATURE_ACCESS, DEFAULT_MENU_ACCESS
} from '../types';
import { 
  initialUsers, 
  initialPelanggan, 
  initialAreas, 
  initialTarifs, 
  initialAbonemen, 
  initialDenda 
} from '../data/initialData';
import { 
  Play, LogOut, CheckCircle, Search, Plus, MapPin, Phone, 
  Calendar, User, Users, Eye, EyeOff, ShieldAlert, Wifi, WifiOff, 
  Terminal, RefreshCw, Upload, Download, FileSpreadsheet, 
  AlertTriangle, Check, X, Settings, DollarSign, Bell, Clock, Edit, Trash2,
  Menu, Home, FileText, CreditCard, PieChart, Shield, Camera, Image, Droplet,
  FileCode, BookOpen, Database, Link2, ExternalLink, Building2, Copy, Sparkles, RotateCcw, Save
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { gasFiles } from '../data/gasCode';
import SpreadsheetView from './SpreadsheetView';
import CodeExporter from './CodeExporter';
import DeploymentGuide from './DeploymentGuide';
import { 
  connectGoogleAccount, 
  pushDataToSheets, 
  getAccessToken,
  pullDataFromSheets,
  initializeSheetsAndHeaders,
  fetchGasConfig,
  saveGlobalDbConfig,
  resetGlobalDbConfig,
  disconnectGlobalDbConfig,
  getSavedDbConfig,
  authenticateWithSheets,
  getOfflineQueueCount,
  drainOfflineQueue,
  DEFAULT_GAS_URL
} from '../lib/googleSheets';
import { compressImage, getBase64SizeKB } from '../lib/imageCompressor';

interface AppSimulatorProps {
  users: UserRow[];
  pelanggan: PelangganRow[];
  areas: AreaRow[];
  tarifs: TarifRow[];
  abonemen: AbonemenRow;
  denda: DendaRow;
  onAddPelanggan: (p: PelangganRow) => void;
  onReplacePelanggan: (pList: PelangganRow[]) => void;
  onUpdatePelanggan: (p: PelangganRow) => void;
  onDeletePelanggan: (noPelanggan: string) => void;
  onAddArea: (a: AreaRow) => void;
  onUpdateArea: (a: AreaRow) => void;
  onDeleteArea: (id: string) => void;
  onAddTarif: (t: TarifRow) => void;
  onUpdateTarif: (t: TarifRow) => void;
  onDeleteTarif: (id: string) => void;
  onUpdateAbonemen: (ab: AbonemenRow) => void;
  onUpdateDenda: (d: DendaRow) => void;
  onResetData: () => void;
  onAddUser: (u: UserRow) => void;
  onUpdateUser: (u: UserRow) => void;
  onDeleteUser: (username: string) => void;
  onRestoreAllData?: (data: { users?: UserRow[], pelanggan?: PelangganRow[], areas?: AreaRow[], tarifs?: TarifRow[], abonemen?: AbonemenRow, denda?: DendaRow }) => void;
}

interface SimulatedLog {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'request';
  message: string;
}

// Helper calculation details for SPRINT 2
export interface TariffBreakdownItem {
  level: string;
  range: string;
  vol: number;
  rate: number;
  total: number;
}

export interface BillingDetailsResult {
  kubikasiBiaya: number;
  abonemen: number;
  denda: number;
  total: number;
  breakdown: TariffBreakdownItem[];
  isBertingkat: boolean;
}

export const calculateBillingDetails = (
  usage: number,
  tarif: TarifRow,
  abonemenNominal: number,
  dendaNominal: number
): BillingDetailsResult => {
  let kubikasiBiaya = 0;
  const breakdown: TariffBreakdownItem[] = [];
  const isBertingkat = tarif.tipe === 'Bertingkat';

  if (!isBertingkat) {
    kubikasiBiaya = usage * (tarif.tarifFlat || 3000);
    breakdown.push({
      level: 'Tarif Flat',
      range: 'Semua',
      vol: usage,
      rate: tarif.tarifFlat || 3000,
      total: kubikasiBiaya,
    });
  } else {
    let parsedLevels: { dari: number; sampai?: number; tarif: number; }[] | null = null;
    if (tarif.levels) {
      try {
        parsedLevels = JSON.parse(tarif.levels);
      } catch (e) {
        parsedLevels = null;
      }
    }

    if (parsedLevels && Array.isArray(parsedLevels) && parsedLevels.length > 0) {
      for (let i = 0; i < parsedLevels.length; i++) {
        const lvl = parsedLevels[i];
        const dari = Number(lvl.dari) || 0;
        const sampai = lvl.sampai !== undefined && lvl.sampai !== null && lvl.sampai !== 0 ? Number(lvl.sampai) : 0;
        const rate = Number(lvl.tarif) || 0;

        const lowerBound = dari > 0 ? dari - 1 : 0;
        const upperBound = sampai;

        let vol = 0;
        if (usage > lowerBound) {
          if (!upperBound || upperBound <= lowerBound) {
            vol = usage - lowerBound;
          } else {
            vol = Math.min(usage - lowerBound, upperBound - lowerBound);
          }
        }

        if (vol > 0) {
          const totalLvl = vol * rate;
          kubikasiBiaya += totalLvl;
          breakdown.push({
            level: `Level ${i + 1}`,
            range: (!upperBound || upperBound <= lowerBound) ? `>${lowerBound} m³` : `${dari}-${sampai} m³`,
            vol,
            rate,
            total: totalLvl,
          });
        }
      }
    } else {
      const r1Max = tarif.range1Max || 10;
      const r1Tarif = tarif.range1Tarif || 3000;
      const r2Max = tarif.range2Max || 20;
      const r2Tarif = tarif.range2Tarif || 3500;
      const r3Tarif = tarif.range3Tarif || 5000;

      // Level 1: 0 to r1Max
      const l1Vol = Math.min(usage, r1Max);
      const l1Total = l1Vol * r1Tarif;
      if (l1Vol > 0) {
        breakdown.push({
          level: 'Level 1',
          range: `0-${r1Max} m³`,
          vol: l1Vol,
          rate: r1Tarif,
          total: l1Total,
        });
      }

      // Level 2: r1Max+1 to r2Max
      const l2Vol = Math.max(0, Math.min(usage - r1Max, r2Max - r1Max));
      const l2Total = l2Vol * r2Tarif;
      if (l2Vol > 0) {
        breakdown.push({
          level: 'Level 2',
          range: `${r1Max + 1}-${r2Max} m³`,
          vol: l2Vol,
          rate: r2Tarif,
          total: l2Total,
        });
      }

      // Level 3: > r2Max
      const l3Vol = Math.max(0, usage - r2Max);
      const l3Total = l3Vol * r3Tarif;
      if (l3Vol > 0) {
        breakdown.push({
          level: 'Level 3',
          range: `>${r2Max} m³`,
          vol: l3Vol,
          rate: r3Tarif,
          total: l3Total,
        });
      }

      kubikasiBiaya = l1Total + l2Total + l3Total;
    }
  }

  const total = kubikasiBiaya + abonemenNominal + dendaNominal;

  return {
    kubikasiBiaya,
    abonemen: abonemenNominal,
    denda: dendaNominal,
    total,
    breakdown,
    isBertingkat,
  };
};

const getWibDateString = (): string => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  } catch (err) {
    const now = new Date();
    const wibTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    return wibTime.toISOString().split('T')[0];
  }
};

const getStoredSession = (): UserRow | null => {
  try {
    const stored = localStorage.getItem('pamsdigi_session');
    if (!stored) return null;
    const session = JSON.parse(stored);
    if (session && session.user && session.loginDateWib) {
      const todayWib = getWibDateString();
      if (session.loginDateWib === todayWib) {
        return session.user;
      } else {
        localStorage.removeItem('pamsdigi_session');
      }
    }
  } catch (_) {}
  return null;
};

export default function AppSimulator({
  users,
  pelanggan,
  areas,
  tarifs,
  abonemen,
  denda,
  onAddPelanggan,
  onReplacePelanggan,
  onUpdatePelanggan,
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
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onRestoreAllData,
}: AppSimulatorProps) {
  // App states
  const [currentUser, setCurrentUser] = useState<UserRow | null>(() => getStoredSession());
  const [currentView, setCurrentView] = useState<'login' | 'dashboard' | 'pelanggan' | 'catat-meter' | 'tagihan' | 'keuangan' | 'laporan' | 'master-data' | 'pengaturan' | 'spreadsheet' | 'code' | 'guide'>(() => {
    const user = getStoredSession();
    if (!user) return 'login';
    const validViews = ['dashboard', 'pelanggan', 'catat-meter', 'tagihan', 'keuangan', 'laporan', 'master-data', 'pengaturan', 'spreadsheet', 'code', 'guide'];
    const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#\/?/, '') : '';
    if (hash && validViews.includes(hash)) {
      return hash as any;
    }
    return 'dashboard';
  });

  // Synchronize browser URL hash with currentView so page refresh persists current view without new localStorage
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '');
      const validViews = ['dashboard', 'pelanggan', 'catat-meter', 'tagihan', 'keuangan', 'laporan', 'master-data', 'pengaturan', 'spreadsheet', 'code', 'guide'];
      if (hash && validViews.includes(hash) && hash !== currentView) {
        setCurrentView(hash as any);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentView]);

  useEffect(() => {
    if (currentUser && currentView && currentView !== 'login') {
      const currentHash = window.location.hash.replace(/^#\/?/, '');
      if (currentHash !== currentView) {
        window.location.hash = currentView;
      }
    }
  }, [currentView, currentUser]);
  const [searchQuery, setSearchQuery] = useState('');
  const [pelangganFilterArea, setPelangganFilterArea] = useState('Semua');

  // Debounced states for robust, instant and crash-free typing on mobile browsers
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Sidebar navigation and tab states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeMasterTab, setActiveMasterTab] = useState<'area' | 'tarif' | 'abonemen' | 'denda' | 'users' | 'hak-akses'>('area');

  // Simulated functional states for Catat Meter, Tagihan, Keuangan, Laporan
  const [readings, setReadings] = useState<any[]>([]);
  const [billingList, setBillingList] = useState<any[]>([]);
  const [cashTransactions, setCashTransactions] = useState<any[]>([]);

  // Catat Meter inputs
  const [selectedMeterPelanggan, setSelectedMeterPelanggan] = useState('');
  const [inputMeterKini, setInputMeterKini] = useState('');
  const [meterFotoPreview, setMeterFotoPreview] = useState<string | null>(null);
  const [meterSearchQuery, setMeterSearchQuery] = useState('');
  const [meterSearchInput, setMeterSearchInput] = useState('');
  useEffect(() => {
    setMeterSearchInput(meterSearchQuery);
  }, [meterSearchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMeterSearchQuery(meterSearchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [meterSearchInput]);
  const [meterFilterArea, setMeterFilterArea] = useState('Semua');

  // Camera & Webcam Stream States
  const [showWebcam, setShowWebcam] = useState(false);
  const [showEditWebcam, setShowEditWebcam] = useState(false);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const editWebcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [editWebcamStream, setEditWebcamStream] = useState<MediaStream | null>(null);

  // Edit Catat Meter states
  const [editingReading, setEditingReading] = useState<any | null>(null);
  const [editReadingMeterKini, setEditReadingMeterKini] = useState<string>('');
  const [editReadingFoto, setEditReadingFoto] = useState<string | null>(null);
  const [editReadingAlasan, setEditReadingAlasan] = useState<string>('');
  const [isEditReadingModalOpen, setIsEditReadingModalOpen] = useState(false);
  const [isAddReadingModalOpen, setIsAddReadingModalOpen] = useState(false);

  // Tagihan inputs
  const [billSearchQuery, setBillSearchQuery] = useState('');
  const [billSearchInput, setBillSearchInput] = useState('');
  useEffect(() => {
    setBillSearchInput(billSearchQuery);
  }, [billSearchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setBillSearchQuery(billSearchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [billSearchInput]);
  const [billFilterArea, setBillFilterArea] = useState('Semua');
  const [billFilterStatus, setBillFilterStatus] = useState('Semua');
  const [selectedBillForStruk, setSelectedBillForStruk] = useState<any | null>(null);
  const [isGeneratingBills, setIsGeneratingBills] = useState(false);

  // SPRINT 2 - Payment modal & selections
  const [payingBill, setPayingBill] = useState<any | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'Tunai' | 'Transfer' | 'QRIS'>('Tunai');
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [receiptSize, setReceiptSize] = useState<'58mm' | '80mm'>('58mm');

  // Keuangan inputs
  const [inputTransDeskripsi, setInputTransDeskripsi] = useState('');
  const [inputTransTipe, setInputTransTipe] = useState<'Masuk' | 'Keluar'>('Masuk');
  const [inputTransJumlah, setInputTransJumlah] = useState('');
  const [inputTransArea, setInputTransArea] = useState('');
  
  // SPRINT 2 REVISED - Keuangan & Akun Transaksi
  const [keuanganSubmenu, setKeuanganSubmenu] = useState<'transaksi' | 'akun-transaksi'>('transaksi');
  
  // Audit Trail & Edit Transaksi Keuangan
  const [editingTransaction, setEditingTransaction] = useState<any | null>(null);
  const [isEditTransModalOpen, setIsEditTransModalOpen] = useState(false);
  const [editTransDeskripsi, setEditTransDeskripsi] = useState('');
  const [editTransTipe, setEditTransTipe] = useState<'Masuk' | 'Keluar'>('Masuk');
  const [editTransKategoriId, setEditTransKategoriId] = useState('');
  const [editTransTanggal, setEditTransTanggal] = useState('');
  const [editTransArea, setEditTransArea] = useState('');
  const [editTransJumlah, setEditTransJumlah] = useState('');

  const [selectedTxHistory, setSelectedTxHistory] = useState<any[] | null>(null);
  const [selectedTxDesc, setSelectedTxDesc] = useState('');
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  const [categories, setCategories] = useState<{ id: string; nama: string; tipe: 'Masuk' | 'Keluar' }[]>([
    { id: 'cat-1', nama: 'Pembayaran Air', tipe: 'Masuk' },
    { id: 'cat-2', nama: 'Pemasukan Lain', tipe: 'Masuk' },
    { id: 'cat-3', nama: 'Operasional', tipe: 'Keluar' },
    { id: 'cat-4', nama: 'Maintenance', tipe: 'Keluar' },
    { id: 'cat-5', nama: 'Listrik', tipe: 'Keluar' },
    { id: 'cat-6', nama: 'Gaji', tipe: 'Keluar' },
  ]);
  const [inputTransKategoriId, setInputTransKategoriId] = useState('cat-1');
  const [inputTransTanggal, setInputTransTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [petugasCanInputKeuangan, setPetugasCanInputKeuangan] = useState(false);

  // Dynamic Hak Akses & Menu Matrix State (Stored in Google Spreadsheet Konfigurasi sheet)
  const [featureAccess, setFeatureAccess] = useState<RoleFeatureAccess>(DEFAULT_FEATURE_ACCESS);
  const [menuAccess, setMenuAccess] = useState<RoleMenuAccess>(DEFAULT_MENU_ACCESS);
  const [isSavingAccessRights, setIsSavingAccessRights] = useState(false);
  const [lastAccessRightsSaved, setLastAccessRightsSaved] = useState<string>('');

  const canPerformAction = (action: keyof FeaturePermissions): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'SUPER_ADMIN') return true;
    const roleKey = currentUser.role === 'Admin' ? 'admin' : 'petugas';
    return featureAccess[roleKey]?.[action] ?? false;
  };

  const isMenuVisible = (menuView: string): boolean => {
    if (!currentUser) return true;
    if (currentUser.role === 'SUPER_ADMIN') return true;
    const roleKey = currentUser.role === 'Admin' ? 'admin' : 'petugas';
    const roleMenu = menuAccess[roleKey];
    if (!roleMenu) return true;
    return roleMenu[menuView as keyof MenuPermissions] ?? true;
  };

  // Automatically redirect away from views that are hidden for the active user role
  useEffect(() => {
    if (!currentUser || currentUser.role === 'SUPER_ADMIN' || currentView === 'login') return;
    const viewsToValidate = ['dashboard', 'pelanggan', 'catat-meter', 'tagihan', 'keuangan', 'laporan', 'master-data', 'pengaturan'];
    if (viewsToValidate.includes(currentView) && !isMenuVisible(currentView)) {
      const allowedItem = [
        'dashboard', 'pelanggan', 'catat-meter', 'tagihan', 'keuangan', 'laporan', 'master-data', 'pengaturan'
      ].find(v => isMenuVisible(v));
      if (allowedItem) {
        setCurrentView(allowedItem as any);
      }
    }
  }, [currentUser, currentView, menuAccess]);

  // SPRINT 3 - Laporan & Analisis Submenus & Filters
  const [laporanActiveTab, setLaporanActiveTab] = useState<'ringkasan' | 'tagihan' | 'pembayaran' | 'tunggakan' | 'pemakaian-air' | 'pemasukan' | 'pengeluaran' | 'arus-kas' | 'rekap-area' | 'rekap-petugas'>('ringkasan');
  const [reportFilterBulan, setReportFilterBulan] = useState('ALL');
  const [reportFilterTahun, setReportFilterTahun] = useState('ALL');
  const [reportFilterArea, setReportFilterArea] = useState('ALL');
  const [reportFilterPetugas, setReportFilterPetugas] = useState('ALL');
  const [reportFilterStatus, setReportFilterStatus] = useState('ALL');

  // Kategori Form inputs
  const [categoryInputNama, setCategoryInputNama] = useState('');
  const [categoryInputTipe, setCategoryInputTipe] = useState<'Masuk' | 'Keluar'>('Masuk');
  const [editingCategory, setEditingCategory] = useState<{ id: string; nama: string; tipe: 'Masuk' | 'Keluar' } | null>(null);

  useEffect(() => {
    const matched = categories.find(c => c.tipe === inputTransTipe);
    if (matched) {
      setInputTransKategoriId(matched.id);
    } else {
      setInputTransKategoriId('');
    }
  }, [inputTransTipe, categories]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showSpreadsheetApiModal, setShowSpreadsheetApiModal] = useState(false);
  const [copiedState, setCopiedState] = useState(false);
  const [activeGasFileIdx, setActiveGasFileIdx] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [networkErrorSimulation, setNetworkErrorSimulation] = useState(false);

  // Excel states for bulk import
  interface ExcelImportRow {
    NoPelanggan?: string;
    Nama?: string;
    Area?: string;
    Alamat?: string;
    Golongan?: string;
    TempatPemasangan?: string;
    TglPasang?: string;
    MeterAwal?: any;
    Telepon?: string;
    Status?: string;
    rowNum: number;
    isValid: boolean;
    errors: string[];
  }

  const [importRows, setImportRows] = useState<ExcelImportRow[]>([]);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states for pelanggan
  const [formNoPelanggan, setFormNoPelanggan] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formArea, setFormArea] = useState('');
  const [formAlamat, setFormAlamat] = useState('');
  const [formGolongan, setFormGolongan] = useState('');
  const [formTempat, setFormTempat] = useState('');
  const [formTgl, setFormTgl] = useState('');
  const [formMeter, setFormMeter] = useState(0);
  const [formTelepon, setFormTelepon] = useState('');
  const [formLat, setFormLat] = useState(-7.8012);
  const [formLong, setFormLong] = useState(110.3644);
  const [formStatus, setFormStatus] = useState<'Aktif' | 'Nonaktif'>('Aktif');
  const [isEditPelanggan, setIsEditPelanggan] = useState(false);

  // Form states for Master Area
  const [areaInputId, setAreaInputId] = useState('');
  const [areaInputNama, setAreaInputNama] = useState('');
  const [areaEditId, setAreaEditId] = useState<string | null>(null);

  // Form states for Master Tarif
  const [tarifInputId, setTarifInputId] = useState('');
  const [tarifInputGolongan, setTarifInputGolongan] = useState('');
  const [tarifInputTipe, setTarifInputTipe] = useState<'Flat' | 'Bertingkat'>('Flat');
  const [tarifInputFlat, setTarifInputFlat] = useState(3000);
  const [tarifInputR1Max, setTarifInputR1Max] = useState(10);
  const [tarifInputR1Tarif, setTarifInputR1Tarif] = useState(3000);
  const [tarifInputR2Max, setTarifInputR2Max] = useState(20);
  const [tarifInputR2Tarif, setTarifInputR2Tarif] = useState(3500);
  const [tarifInputR3Tarif, setTarifInputR3Tarif] = useState(5000);
  const [tarifInputLevels, setTarifInputLevels] = useState<{ dari: number; sampai?: number; tarif: number; }[]>([
    { dari: 0, sampai: 10, tarif: 3000 }
  ]);
  const [tarifEditId, setTarifEditId] = useState<string | null>(null);

  // Form states for Master Abonemen
  const [aboInputNominal, setAboInputNominal] = useState(abonemen.nominal);
  const [aboInputStatus, setAboInputStatus] = useState<'Aktif' | 'Nonaktif'>(abonemen.status);

  // Form states for Master Denda
  const [dendaInputStatus, setDendaInputStatus] = useState<'Aktif' | 'Nonaktif'>(denda.status);
  const [dendaInputNominal, setDendaInputNominal] = useState(denda.nominal);
  const [dendaInputHari, setDendaInputHari] = useState(denda.hariKeterlambatan);

  // Form states for Master Users
  const [userInputUsername, setUserInputUsername] = useState('');
  const [userInputPassword, setUserInputPassword] = useState('');
  const [userInputNama, setUserInputNama] = useState('');
  const [userInputRole, setUserInputRole] = useState<'Admin' | 'Petugas'>(() => (localStorage.getItem('pams_config_default_role') as 'Admin' | 'Petugas') || 'Petugas');
  const [userInputStatus, setUserInputStatus] = useState<'Aktif' | 'Nonaktif'>('Aktif');
  const [userEditUsername, setUserEditUsername] = useState<string | null>(null);
  const [userInputAreaAkses, setUserInputAreaAkses] = useState<string[]>(['ALL']);

  // Settings submenu tab state
  const [activeSettingsTab, setActiveSettingsTab] = useState<'profil' | 'aplikasi' | 'backup' | 'database' | 'lisensi'>('profil');

  // Database integration state variables
  const [dbCompanyName, setDbCompanyName] = useState<string>(() => localStorage.getItem('pams_db_company_name') || 'KPSPAMS DESA MANDIRI');
  const [dbCompanyId, setDbCompanyId] = useState<string>(() => localStorage.getItem('pams_db_company_id') || 'COMP-PAMSDIGI-2026');
  const [dbSpreadsheetId, setDbSpreadsheetId] = useState<string>(() => localStorage.getItem('pams_google_sheet_id') || '');
  const [dbGasUrl, setDbGasUrl] = useState<string>(() => {
    return localStorage.getItem('pams_google_gas_url') || DEFAULT_GAS_URL;
  });
  const [dbLastConnected, setDbLastConnected] = useState<string>(() => {
    const syncStatus = localStorage.getItem('pams_db_sync_status');
    if (syncStatus === 'Disconnected') return 'Belum Terhubung';
    return localStorage.getItem('pams_db_last_connected') || new Date().toLocaleString('id-ID');
  });
  const [dbSyncStatus, setDbSyncStatus] = useState<'Connected' | 'Disconnected'>(() => {
    const saved = localStorage.getItem('pams_db_sync_status');
    if (saved === 'Disconnected') return 'Disconnected';
    return 'Connected';
  });
  const [dbSpreadsheetName, setDbSpreadsheetName] = useState<string>(() => {
    const syncStatus = localStorage.getItem('pams_db_sync_status');
    if (syncStatus === 'Disconnected') return 'Belum Terhubung';
    const saved = localStorage.getItem('pams_db_sheet_name');
    if (!saved || saved === 'PAMSDIGI Spreadsheet' || saved === 'DB_kpspmas siaga') {
      localStorage.setItem('pams_db_sheet_name', 'Db_pamsdigi');
      return 'Db_pamsdigi';
    }
    return saved;
  });
  const [showResetDbModal, setShowResetDbModal] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(() => getOfflineQueueCount());

  useEffect(() => {
    const updateQueue = () => setOfflineQueueCount(getOfflineQueueCount());
    const interval = setInterval(updateQueue, 3000);
    window.addEventListener('online', updateQueue);
    window.addEventListener('offline', updateQueue);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', updateQueue);
      window.removeEventListener('offline', updateQueue);
    };
  }, []);

  const handleDrainQueue = async () => {
    setIsLoading(true);
    try {
      const res = await drainOfflineQueue();
      if (res.success) {
        setOfflineQueueCount(0);
        showToast(`Berhasil menyinkronkan ${res.processed} transaksi offline ke Google Spreadsheet!`, 'success');
      } else {
        showToast('Gagal sinkronisasi antrean: pastikan internet aktif dan database terhubung.', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    getSavedDbConfig().then(cfg => {
      if (cfg && cfg.syncStatus === 'Connected' && cfg.gasUrl) {
        setDbGasUrl(cfg.gasUrl);
        setDbSyncStatus('Connected');
        setDbSpreadsheetName(cfg.spreadsheetName || 'DB_kpspmas siaga');
        if (cfg.lastConnected) setDbLastConnected(cfg.lastConnected);
        if (cfg.spreadsheetId) setDbSpreadsheetId(cfg.spreadsheetId);
      }
    }).catch(() => {});
  }, []);

  const handleResetDatabase = async () => {
    setIsCheckingDb(true);
    try {
      await disconnectGlobalDbConfig();

      const lastKnown = localStorage.getItem('pams_last_known_gas_url') || dbGasUrl;

      setDbSpreadsheetName('Belum Terhubung');
      setDbSpreadsheetId('');
      setDbSyncStatus('Disconnected');
      setDbLastConnected('Belum Terhubung');
      setDbCheckSteps([]);

      if (!dbGasUrl && lastKnown) {
        setDbGasUrl(lastKnown);
      }

      showToast('Koneksi database berhasil diputus (Disconnected). Status: BELUM TERHUBUNG', 'success');
      addLog('info', 'Koneksi database diputus oleh SUPER_ADMIN. Status aplikasi menjadi BELUM TERHUBUNG.');
    } catch (err: any) {
      showToast('Gagal memutus koneksi database: ' + err.message, 'error');
    } finally {
      setIsCheckingDb(false);
    }
  };

  // DB Check Checklist States
  const [dbCheckSteps, setDbCheckSteps] = useState<{
    id: string;
    label: string;
    status: 'idle' | 'loading' | 'success' | 'error';
    errorDetail?: string;
  }[]>([]);
  const [isCheckingDb, setIsCheckingDb] = useState(false);

  const handleCheckDatabase = async () => {
    const rawInputUrl = dbGasUrl;
    let cleanUrl = dbGasUrl.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');

    if (!cleanUrl) {
      showToast('URL Google Apps Script tidak boleh kosong. Masukkan URL Web App Apps Script Anda.', 'error');
      return;
    }

    if (cleanUrl.endsWith('/dev')) {
      cleanUrl = cleanUrl.substring(0, cleanUrl.length - 4) + '/exec';
      setDbGasUrl(cleanUrl);
      localStorage.setItem('pams_google_gas_url', cleanUrl);
    }

    if (cleanUrl.includes('/edit') || cleanUrl.includes('/macros/d/')) {
      showToast('URL yang dimasukkan adalah URL Editor Apps Script. Harap gunakan URL Web App yang berakhiran /exec dari menu Deploy -> New Deployment.', 'error');
      return;
    }

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      showToast('URL Google Apps Script tidak valid. URL harus diawali dengan https://script.google.com/macros/s/...', 'error');
      return;
    }

    setDbGasUrl(cleanUrl);
    localStorage.setItem('pams_google_gas_url', cleanUrl);

    setIsCheckingDb(true);

    // 1. Initialize verification steps
    const steps = [
      { id: 'contact', label: 'Menghubungi Google Apps Script...', status: 'loading' as const },
      { id: 'connection', label: 'Memeriksa koneksi...', status: 'idle' as const },
      { id: 'database', label: 'Memeriksa database...', status: 'idle' as const },
      { id: 'structure', label: 'Memeriksa struktur database...', status: 'idle' as const },
      { id: 'finalize', label: 'Menyelesaikan proses...', status: 'idle' as const },
    ];
    setDbCheckSteps(steps);

    const updateStepStatus = (id: string, status: 'loading' | 'success' | 'error', errorDetail?: string) => {
      setDbCheckSteps(prev => prev.map(s => s.id === id ? { ...s, status, errorDetail } : s));
    };

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      addLog('info', `Memulai tes koneksi runtime. Input URL: ${rawInputUrl} | Clean URL: ${cleanUrl}`);
      
      // Step 1: Contact Google Apps Script Web App URL directly
      await delay(400);
      let responseData: any = null;
      let pingSuccess = false;
      let pingErrorMsg = '';
      let fetchError: any = null;
      let finalFetchUrl = '';
      let responseUrl = '';
      let httpStatus = 0;
      let rawBody = '';

      try {
        finalFetchUrl = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=getConfig&t=${Date.now()}`;
        const directRes = await fetch(finalFetchUrl, { method: 'GET', redirect: 'follow' });
        
        responseUrl = directRes.url;
        httpStatus = directRes.status;
        rawBody = await directRes.text();

        if (directRes.ok) {
          try { responseData = JSON.parse(rawBody); } catch (_) {}
          if (responseData && responseData.success) {
            pingSuccess = true;
          } else if (responseData && responseData.message) {
            pingErrorMsg = responseData.message;
          }
        } else if (directRes.status === 404) {
          pingErrorMsg = `HTTP Status 404 (Not Found).\nResponse URL: ${responseUrl || finalFetchUrl}`;
        } else {
          pingErrorMsg = `HTTP Status ${directRes.status}.\nResponse URL: ${responseUrl || finalFetchUrl}`;
        }
      } catch (err: any) {
        fetchError = err;
        pingErrorMsg = err.message || "Gagal menghubungi Google Apps Script.";
      }

      if (!pingSuccess) {
        const exceptionMsg = fetchError ? `${fetchError.name || 'Error'}: ${fetchError.message || String(fetchError)}` : (responseData?.message ? `API Error: ${responseData.message}` : '-');
        const stackTraceMsg = fetchError?.stack || '-';
        const nowIso = new Date().toISOString();
        const browserPlatform = typeof navigator !== 'undefined' ? (navigator.vendor ? `${navigator.vendor} (${navigator.platform})` : navigator.platform) : 'Unknown';
        const userAgentStr = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';

        const runtimeDiag = 
`======================================================
RUNTIME DIAGNOSTIC
======================================================
1. URL Input
: ${rawInputUrl}
2. Clean URL
: ${cleanUrl}
3. URL Final Fetch
: ${finalFetchUrl}
4. Response URL
: ${responseUrl || '(Gagal / Redirect tidak selesai / Tidak ada)'}
5. HTTP Status
: ${httpStatus || '0 (Fetch / Network error)'}
6. Response Body (Raw)
: ${rawBody || pingErrorMsg || '(Kosong)'}
7. Exception (jika ada)
: ${exceptionMsg}
8. Stack Trace (jika ada)
: ${stackTraceMsg}
9. Timestamp
: ${nowIso}
10. Browser
: ${browserPlatform}
11. User Agent
: ${userAgentStr}
12. Source File
: AppSimulator.tsx
13. Function
: handleCheckDatabase
======================================================`;

        addLog('error', runtimeDiag);
        updateStepStatus('contact', 'error', runtimeDiag);
        throw new Error(`Gagal menghubungi Google Apps Script:\n${runtimeDiag}`);
      }
      updateStepStatus('contact', 'success');

      // Step 2: Check Connection Response
      updateStepStatus('connection', 'loading');
      await delay(400);
      
      if (!responseData) {
        const errMsg = 'Web App tidak mengembalikan data respons yang valid.';
        updateStepStatus('connection', 'error', errMsg);
        throw new Error(`Koneksi Gagal: ${errMsg}`);
      }
      updateStepStatus('connection', 'success');

      // Step 3: Check Database Access
      updateStepStatus('database', 'loading');
      await delay(400);
      updateStepStatus('database', 'success');

      // Step 4: Check & Auto-create Sheets (initSheets) directly via Apps Script
      updateStepStatus('structure', 'loading');
      await delay(800);
      
      let initJson: any = null;
      let initSuccess = false;
      let initErrMsg = '';

      try {
        const directInitUrl = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=initSheets&t=${Date.now()}`;
        const directInitRes = await fetch(directInitUrl, { method: 'GET', redirect: 'follow' });
        if (directInitRes.ok) {
          const directText = await directInitRes.text();
          try { initJson = JSON.parse(directText); } catch (_) {}
          if (initJson && initJson.success) {
            initSuccess = true;
          } else if (initJson && initJson.message) {
            initErrMsg = initJson.message;
          }
        } else {
          initErrMsg = `Status response: ${directInitRes.status}`;
        }
      } catch (err: any) {
        initErrMsg = err.message || 'Gagal terhubung ke Apps Script.';
      }

      if (!initSuccess) {
        const errMsg = initErrMsg || initJson?.message || 'Gagal menginisialisasi tabel.';
        updateStepStatus('structure', 'error', errMsg);
        throw new Error(`Gagal memeriksa struktur database: ${errMsg}`);
      }
      updateStepStatus('structure', 'success');

      // Step 5: Finalize configuration and save globally
      updateStepStatus('finalize', 'loading');
      await delay(600);

      const lastConn = new Date().toLocaleString('id-ID');

      const realSheetName = (responseData?.spreadsheetName && responseData.spreadsheetName !== 'PAMSDIGI Spreadsheet') ? responseData.spreadsheetName : 'Db_pamsdigi';

      await saveGlobalDbConfig({
        gasUrl: cleanUrl,
        spreadsheetName: realSheetName,
        lastConnected: lastConn,
        spreadsheetId: ''
      });

      setDbGasUrl(cleanUrl);
      setDbSpreadsheetId('');
      setDbSpreadsheetName(realSheetName);
      setDbLastConnected(lastConn);
      setDbSyncStatus('Connected');

      localStorage.setItem('pams_google_gas_url', cleanUrl);
      localStorage.setItem('pams_db_sheet_name', realSheetName);
      localStorage.setItem('pams_db_sync_status', 'Connected');
      localStorage.setItem('pams_db_last_connected', lastConn);
      
      updateStepStatus('finalize', 'success');
      addLog('success', `Simpan & Cek Database: Berhasil menghubungkan dan memvalidasi Google Spreadsheet.`);
      showToast('Koneksi Google Spreadsheet berhasil disimpan & divalidasi!', 'success');

      // Automatically sync current local data to populate the empty Google Sheets
      try {
        addLog('info', 'Menyinkronkan data lokal Anda ke Google Spreadsheet database baru...');
        await pushDataToSheets({
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
        addLog('success', 'Data awal berhasil disinkronkan ke Google Spreadsheet.');
      } catch (pushErr: any) {
        addLog('info', `Koneksi tersimpan, namun sinkronisasi data awal gagal: ${pushErr.message}`);
      }

    } catch (err: any) {
      await resetGlobalDbConfig();
      setDbGasUrl(cleanUrl);
      setDbSyncStatus('Disconnected');
      setDbSpreadsheetName('Belum Terhubung');
      setDbLastConnected('Belum Terhubung');
      addLog('error', `Gagal validasi database: ${err.message || 'Error tidak diketahui'}`);
      showToast('Gagal terhubung ke Google Apps Script. Lihat detail Runtime Diagnostic di bawah.', 'error');
    } finally {
      setIsCheckingDb(false);
    }
  };

  // State variables for Profil Sistem (KPSPAMS)
  const [systemNama, setSystemNama] = useState<string>(() => localStorage.getItem('pams_system_nama') || 'KPSPAMS DESA MANDIRI');
  const [systemNamaDesa, setSystemNamaDesa] = useState<string>(() => localStorage.getItem('pams_system_nama_desa') || 'Desa Mandiri');
  const [systemKecamatan, setSystemKecamatan] = useState<string>(() => localStorage.getItem('pams_system_kecamatan') || 'Kecamatan Makmur');
  const [systemKabupaten, setSystemKabupaten] = useState<string>(() => localStorage.getItem('pams_system_kabupaten') || 'Kabupaten Sejahtera');
  const [systemProvinsi, setSystemProvinsi] = useState<string>(() => localStorage.getItem('pams_system_provinsi') || 'Provinsi Lestari');
  const [systemAlamat, setSystemAlamat] = useState<string>(() => localStorage.getItem('pams_system_alamat') || 'Jl. Raya Desa Mandiri, RT 01/RW 02');
  const [systemHp, setSystemHp] = useState<string>(() => localStorage.getItem('pams_system_hp') || '081234567890');
  const [systemEmail, setSystemEmail] = useState<string>(() => localStorage.getItem('pams_system_email') || 'kpspams.mandiri@desa.go.id');
  const [systemKetua, setSystemKetua] = useState<string>(() => localStorage.getItem('pams_system_ketua') || 'Agus Setiawan');
  const [systemBendahara, setSystemBendahara] = useState<string>(() => localStorage.getItem('pams_system_bendahara') || 'Siti Rahayu');
  const [systemFooterStruk, setSystemFooterStruk] = useState<string>(() => localStorage.getItem('pams_system_footer_struk') || 'Terima kasih telah membayar tepat waktu. Air bersih untuk kehidupan yang sehat!');
  const [systemLogo, setSystemLogo] = useState<string | null>(() => localStorage.getItem('pams_system_logo') || null);
  const [systemStempel, setSystemStempel] = useState<string | null>(() => localStorage.getItem('pams_system_stempel') || null);

  // Application configurations state
  const [configTglTutupBuku, setConfigTglTutupBuku] = useState<number>(() => Number(localStorage.getItem('pams_config_tgl_tutup_buku') || '25'));
  const [configFormatOtomatis, setConfigFormatOtomatis] = useState<boolean>(() => localStorage.getItem('pams_config_format_otomatis') !== 'false');
  const [configPrefixPelanggan, setConfigPrefixPelanggan] = useState<string>(() => localStorage.getItem('pams_config_prefix_pelanggan') || 'PLG');
  const [configDefaultRole, setConfigDefaultRole] = useState<'Admin' | 'Petugas'>(() => (localStorage.getItem('pams_config_default_role') as 'Admin' | 'Petugas') || 'Petugas');
  const [configWajibFotoMeter, setConfigWajibFotoMeter] = useState<boolean>(() => localStorage.getItem('pams_config_wajib_foto_meter') === 'true');
  const [configIzinkanEditMeter, setConfigIzinkanEditMeter] = useState<boolean>(() => localStorage.getItem('pams_config_izinkan_edit_meter') !== 'false');
  const [configIzinkanEditKas, setConfigIzinkanEditKas] = useState<boolean>(() => localStorage.getItem('pams_config_izinkan_edit_kas') !== 'false');
  const [configModeDemo, setConfigModeDemo] = useState<boolean>(() => localStorage.getItem('pams_config_mode_demo') === 'true');

  // Backup & Restore metadata states
  const [lastBackupDate, setLastBackupDate] = useState<string>(() => localStorage.getItem('pams_last_backup_date') || 'Belum pernah');
  const [lastBackupSize, setLastBackupSize] = useState<string>(() => localStorage.getItem('pams_last_backup_size') || '-');

  // System License states
  const [licenseStatus, setLicenseStatus] = useState<'TRIAL' | 'LIFETIME'>(() => {
    const val = localStorage.getItem('pams_license_status') || 'TRIAL';
    return val === 'LIFETIME' ? 'LIFETIME' : 'TRIAL';
  });
  const [licenseKey, setLicenseKey] = useState<string>(() => localStorage.getItem('pams_license_key') || '');
  const [trialStartDate, setTrialStartDate] = useState<string>(() => {
    let dateStr = localStorage.getItem('pams_trial_start_date');
    if (!dateStr) {
      dateStr = new Date().toISOString().split('T')[0];
      localStorage.setItem('pams_trial_start_date', dateStr);
    }
    return dateStr;
  });
  const [validSerials, setValidSerials] = useState<string[]>(() => {
    const saved = localStorage.getItem('pams_valid_serials');
    if (saved) return JSON.parse(saved);
    const seed = ['PAMSDIGI-ABCD-001'];
    localStorage.setItem('pams_valid_serials', JSON.stringify(seed));
    return seed;
  });
  const [activationLogs, setActivationLogs] = useState<string[]>(() => {
    const saved = localStorage.getItem('pams_activation_logs');
    return saved ? JSON.parse(saved) : [];
  });

  const currentMode = dbGasUrl && dbSyncStatus === 'Connected'
    ? (licenseStatus === 'LIFETIME' ? 'LIFETIME' : 'TRIAL')
    : 'DEMO';

  const getTrialRemainingDays = (): number => {
    const start = new Date(trialStartDate);
    const today = new Date();
    start.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const remaining = 7 - diffDays;
    return remaining < 0 ? 0 : remaining;
  };

  // Synchronize browser tab title & favicon with PAMSDIGI branding and dynamic systemLogo
  useEffect(() => {
    document.title = "PAMSDIGI - Sistem Digital KPSPAMS";
    const faviconElement = document.getElementById('dynamic-favicon') as HTMLLinkElement;
    if (faviconElement) {
      if (systemLogo) {
        faviconElement.href = systemLogo;
      } else {
        faviconElement.href = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%232563eb' stroke='%231d4ed8' stroke-width='2'><path d='M12 22a7 7 0 0 0 7-7c0-4.3-7-13-7-13S5 10.7 5 15a7 7 0 0 0 7 7z'/></svg>";
      }
    }
  }, [systemLogo]);

  // Sync inputs when active states change
  useEffect(() => {
    if (currentUser && currentUser.role === 'Petugas' && currentUser.areaAkses && currentUser.areaAkses !== 'ALL') {
      const allowed = currentUser.areaAkses.split(',').map(a => a.trim());
      if (allowed.length > 0 && !allowed.includes(meterFilterArea)) {
        setMeterFilterArea(allowed[0]);
      }
    }
  }, [currentUser]);

  useEffect(() => {
    if (areas.length > 0 && !formArea) {
      setFormArea(areas[0].nama);
    }
  }, [areas]);

  useEffect(() => {
    if (tarifs.length > 0 && !formGolongan) {
      setFormGolongan(tarifs[0].golongan);
    }
  }, [tarifs]);

  useEffect(() => {
    setAboInputNominal(abonemen.nominal);
    setAboInputStatus(abonemen.status);
  }, [abonemen]);

  useEffect(() => {
    setDendaInputStatus(denda.status);
    setDendaInputNominal(denda.nominal);
    setDendaInputHari(denda.hariKeterlambatan);
  }, [denda]);

  // Sync simulated meter readings and billing data based on loaded pelanggan & tarifs
  useEffect(() => {
    // Mock data generation disabled to support clean slate state
  }, [pelanggan, tarifs, abonemen, denda]);

  // Login form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const loadTenantData = (sheetId: string) => {
    if (!sheetId) return;

    const usersKey = `pams_data_users_${sheetId}`;
    const pelangganKey = `pams_data_pelanggan_${sheetId}`;
    const areasKey = `pams_data_areas_${sheetId}`;
    const tarifsKey = `pams_data_tarifs_${sheetId}`;
    const abonemenKey = `pams_data_abonemen_${sheetId}`;
    const dendaKey = `pams_data_denda_${sheetId}`;
    
    const readingsKey = `pams_data_readings_${sheetId}`;
    const billingKey = `pams_data_billing_${sheetId}`;
    const cashKey = `pams_data_cash_${sheetId}`;

    const tenantUsers = localStorage.getItem(usersKey);
    const tenantPelanggan = localStorage.getItem(pelangganKey);
    const tenantAreas = localStorage.getItem(areasKey);
    const tenantTarifs = localStorage.getItem(tarifsKey);
    const tenantAbonemen = localStorage.getItem(abonemenKey);
    const tenantDenda = localStorage.getItem(dendaKey);
    
    const tenantReadings = localStorage.getItem(readingsKey);
    const tenantBilling = localStorage.getItem(billingKey);
    const tenantCash = localStorage.getItem(cashKey);

    const loadedUsers = tenantUsers ? JSON.parse(tenantUsers) : [...initialUsers];
    const loadedPelanggan = tenantPelanggan ? JSON.parse(tenantPelanggan) : [...initialPelanggan];
    const loadedAreas = tenantAreas ? JSON.parse(tenantAreas) : [...initialAreas];
    const loadedTarifs = tenantTarifs ? JSON.parse(tenantTarifs) : [...initialTarifs];
    const loadedAbonemen = tenantAbonemen ? JSON.parse(tenantAbonemen) : { ...initialAbonemen };
    const loadedDenda = tenantDenda ? JSON.parse(tenantDenda) : { ...initialDenda };

    // Swap state in App.tsx
    onRestoreAllData({
      users: loadedUsers,
      pelanggan: loadedPelanggan,
      areas: loadedAreas,
      tarifs: loadedTarifs,
      abonemen: loadedAbonemen,
      denda: loadedDenda
    });

    // Handle readings, billingList, and cashTransactions
    let finalReadings = [];
    let finalBilling = [];
    let finalCash = [];

    if (tenantReadings) {
      finalReadings = JSON.parse(tenantReadings);
    } else {
      finalReadings = [];
    }

    if (tenantBilling) {
      finalBilling = JSON.parse(tenantBilling);
    } else {
      finalBilling = [];
    }

    if (tenantCash) {
      finalCash = JSON.parse(tenantCash);
    } else {
      finalCash = [];
    }

    setReadings(finalReadings);
    setBillingList(finalBilling);
    setCashTransactions(finalCash);

    localStorage.setItem(usersKey, JSON.stringify(loadedUsers));
    localStorage.setItem(pelangganKey, JSON.stringify(loadedPelanggan));
    localStorage.setItem(areasKey, JSON.stringify(loadedAreas));
    localStorage.setItem(tarifsKey, JSON.stringify(loadedTarifs));
    localStorage.setItem(abonemenKey, JSON.stringify(loadedAbonemen));
    localStorage.setItem(dendaKey, JSON.stringify(loadedDenda));
    localStorage.setItem(readingsKey, JSON.stringify(finalReadings));
    localStorage.setItem(billingKey, JSON.stringify(finalBilling));
    localStorage.setItem(cashKey, JSON.stringify(finalCash));
  };

  const isLoadedRef = useRef(false);

  useEffect(() => {
    const initializeData = async () => {
      let activeSheetId = localStorage.getItem('pams_google_sheet_id') || '';
      
      // Google Apps Script is the single source of truth for connection status & config
      const liveConfig = await fetchGasConfig();

      if (liveConfig.syncStatus === 'Disconnected' || !liveConfig.gasUrl) {
        setDbGasUrl(prev => prev || DEFAULT_GAS_URL);
        setDbSpreadsheetName('Belum Terhubung');
        setDbSyncStatus('Disconnected');
        setDbLastConnected('Belum Terhubung');
        setDbCheckSteps([]);
      } else {
        setDbGasUrl(liveConfig.gasUrl);
        const resSheetName = (liveConfig.spreadsheetName && liveConfig.spreadsheetName !== 'PAMSDIGI Spreadsheet') ? liveConfig.spreadsheetName : 'Db_pamsdigi';
        setDbSpreadsheetName(resSheetName);
        setDbSyncStatus('Connected');
        setDbLastConnected(liveConfig.lastConnected || new Date().toLocaleString('id-ID'));
      }

      try {
        addLog('info', 'Mencoba menyinkronkan database dari server PAMSDIGI & Google Spreadsheet...');
        const remoteData = await pullDataFromSheets();

        if (remoteData && (remoteData.users || remoteData.pelanggan || remoteData.readings || remoteData.cashTransactions || remoteData.areas || remoteData.tarifs)) {
          onRestoreAllData({
            users: (remoteData.users && remoteData.users.length > 0) ? remoteData.users : users,
            pelanggan: remoteData.pelanggan || [],
            areas: remoteData.areas || [],
            tarifs: remoteData.tarifs || [],
            abonemen: remoteData.abonemen || { nominal: 0, status: 'Nonaktif' },
            denda: remoteData.denda || { nominal: 0, hariKeterlambatan: 0, status: 'Nonaktif' },
          });
          if (remoteData.readings) setReadings(remoteData.readings);
          if (remoteData.billingList) setBillingList(remoteData.billingList);
          if (remoteData.cashTransactions) setCashTransactions(remoteData.cashTransactions);
          if (remoteData.profil) {
            const p = remoteData.profil;
            const sysNama = p.systemNama || p.SystemNama || '';
            if (sysNama) {
              setSystemNama(sysNama);
              localStorage.setItem('pams_system_nama', sysNama);
            }
            const sysNamaDesa = p.systemNamaDesa || p.SystemNamaDesa || '';
            if (sysNamaDesa) {
              setSystemNamaDesa(sysNamaDesa);
              localStorage.setItem('pams_system_nama_desa', sysNamaDesa);
            }
            const sysKecamatan = p.systemKecamatan || p.SystemKecamatan || '';
            if (sysKecamatan) {
              setSystemKecamatan(sysKecamatan);
              localStorage.setItem('pams_system_kecamatan', sysKecamatan);
            }
            const sysKabupaten = p.systemKabupaten || p.SystemKabupaten || '';
            if (sysKabupaten) {
              setSystemKabupaten(sysKabupaten);
              localStorage.setItem('pams_system_kabupaten', sysKabupaten);
            }
            const sysProvinsi = p.systemProvinsi || p.SystemProvinsi || '';
            if (sysProvinsi) {
              setSystemProvinsi(sysProvinsi);
              localStorage.setItem('pams_system_provinsi', sysProvinsi);
            }
            const sysAlamat = p.systemAlamat || p.SystemAlamat || '';
            if (sysAlamat) {
              setSystemAlamat(sysAlamat);
              localStorage.setItem('pams_system_alamat', sysAlamat);
            }
            const sysTelepon = p.systemTelepon || p.SystemTelepon || p.systemHp || p.SystemHp || '';
            if (sysTelepon) {
              setSystemHp(sysTelepon);
              localStorage.setItem('pams_system_hp', sysTelepon);
            }
            const sysEmail = p.systemEmail || p.SystemEmail || '';
            if (sysEmail) {
              setSystemEmail(sysEmail);
              localStorage.setItem('pams_system_email', sysEmail);
            }
            const sysKetua = p.systemKetua || p.SystemKetua || '';
            if (sysKetua) {
              setSystemKetua(sysKetua);
              localStorage.setItem('pams_system_ketua', sysKetua);
            }
            const sysBendahara = p.systemBendahara || p.SystemBendahara || '';
            if (sysBendahara) {
              setSystemBendahara(sysBendahara);
              localStorage.setItem('pams_system_bendahara', sysBendahara);
            }
            const sysFooterStruk = p.systemFooterStruk || p.SystemFooterStruk || '';
            if (sysFooterStruk) {
              setSystemFooterStruk(sysFooterStruk);
              localStorage.setItem('pams_system_footer_struk', sysFooterStruk);
            }
            const sysLogo = p.systemLogo || p.SystemLogo || '';
            if (sysLogo !== undefined && sysLogo !== null) {
              setSystemLogo(sysLogo || null);
              if (sysLogo) localStorage.setItem('pams_system_logo', sysLogo);
              else localStorage.removeItem('pams_system_logo');
            }
            const sysStempel = p.systemStempel || p.SystemStempel || '';
            if (sysStempel !== undefined && sysStempel !== null) {
              setSystemStempel(sysStempel || null);
              if (sysStempel) localStorage.setItem('pams_system_stempel', sysStempel);
              else localStorage.removeItem('pams_system_stempel');
            }
          }

          // Unpack Hak Akses & Menu Permissions from Sheet Konfigurasi
          if (remoteData.konfigurasi && Array.isArray(remoteData.konfigurasi)) {
            const featRow = remoteData.konfigurasi.find(k => k.key === 'HAK_AKSES_FITUR');
            if (featRow && featRow.value) {
              try {
                const parsedFeat = JSON.parse(featRow.value);
                if (parsedFeat && parsedFeat.admin && parsedFeat.petugas) {
                  setFeatureAccess(parsedFeat);
                }
              } catch (_) {}
            }

            const menuRow = remoteData.konfigurasi.find(k => k.key === 'HAK_AKSES_MENU');
            if (menuRow && menuRow.value) {
              try {
                const parsedMenu = JSON.parse(menuRow.value);
                if (parsedMenu && parsedMenu.admin && parsedMenu.petugas) {
                  setMenuAccess(parsedMenu);
                }
              } catch (_) {}
            }

            const petKeuRow = remoteData.konfigurasi.find(k => k.key === 'petugasCanInputKeuangan');
            if (petKeuRow && petKeuRow.value !== undefined) {
              setPetugasCanInputKeuangan(petKeuRow.value === 'true');
            }
          }

          setDbSyncStatus('Connected');
          localStorage.setItem('pams_db_sync_status', 'Connected');
          addLog('success', 'Database terhubung & data berhasil dimuat dari server database PAMSDIGI.');
          isLoadedRef.current = true;
          return;
        }
      } catch (err: any) {
        addLog('error', `Gagal sinkronisasi data dari Google Spreadsheet / Server saat startup (Menggunakan cache lokal): ${err.message}`);
      }

      if (activeSheetId) {
        loadTenantData(activeSheetId);
      }
      isLoadedRef.current = true;
    };

    initializeData();
  }, []);

  // Enforce access control for settings tabs based on current user role
  useEffect(() => {
    if (currentView === 'pengaturan' && currentUser) {
      // Role-based access logic for settings tabs (all roles may view their respective allowed tabs)
    }
  }, [currentView, currentUser, activeSettingsTab]);

  // Immediately fetch global database configuration on initial app load across all devices/browsers
  useEffect(() => {
    fetchGasConfig().then(cfg => {
      if (cfg.syncStatus === 'Connected' && cfg.gasUrl) {
        setDbGasUrl(cfg.gasUrl);
        const resSheetName = (cfg.spreadsheetName && cfg.spreadsheetName !== 'PAMSDIGI Spreadsheet') ? cfg.spreadsheetName : 'Db_pamsdigi';
        setDbSpreadsheetName(resSheetName);
        setDbSyncStatus('Connected');
        setDbLastConnected(cfg.lastConnected || new Date().toLocaleString('id-ID'));
        if (cfg.spreadsheetId) setDbSpreadsheetId(cfg.spreadsheetId);
      } else if (cfg.syncStatus === 'Disconnected') {
        setDbGasUrl(prev => prev || DEFAULT_GAS_URL);
        setDbSyncStatus('Disconnected');
        setDbSpreadsheetName('Belum Terhubung');
        setDbLastConnected('Belum Terhubung');
        setDbSpreadsheetId('');
      }
    }).catch(_ => {});
  }, []);

  // Fetch latest global database config directly from server when opening database settings tab or view
  useEffect(() => {
    if ((activeSettingsTab === 'database' || currentView === 'database') && currentUser) {
      if (isCheckingDb) return;
      fetchGasConfig().then(cfg => {
        if (cfg.syncStatus === 'Connected' && cfg.gasUrl) {
          if (dbSyncStatus === 'Disconnected' || !dbGasUrl) {
            setDbGasUrl(cfg.gasUrl);
            const resSheetName = (cfg.spreadsheetName && cfg.spreadsheetName !== 'PAMSDIGI Spreadsheet') ? cfg.spreadsheetName : 'Db_pamsdigi';
            setDbSpreadsheetName(resSheetName);
            setDbSyncStatus('Connected');
            setDbLastConnected(cfg.lastConnected || 'Belum Terhubung');
          }
        } else if (cfg.syncStatus === 'Disconnected') {
          if (dbSyncStatus === 'Connected') {
            setDbGasUrl(prev => prev || DEFAULT_GAS_URL);
            setDbSyncStatus('Disconnected');
            setDbSpreadsheetName('Belum Terhubung');
            setDbLastConnected('Belum Terhubung');
            setDbCheckSteps([]);
            localStorage.setItem('pams_google_gas_url', DEFAULT_GAS_URL);
            localStorage.setItem('pams_db_sheet_name', 'Belum Terhubung');
            localStorage.setItem('pams_google_sheet_id', '');
            localStorage.setItem('pams_db_sync_status', 'Disconnected');
            localStorage.setItem('pams_db_last_connected', 'Belum Terhubung');
          }
        }
      });
    }
  }, [activeSettingsTab, currentView, currentUser]);

  // Helper to compile full 13-field Profil payload
  const getProfilPayload = () => ({
    systemNama,
    systemNamaDesa,
    systemKecamatan,
    systemKabupaten,
    systemProvinsi,
    systemAlamat,
    systemTelepon: systemHp,
    systemEmail,
    systemKetua,
    systemBendahara,
    systemFooterStruk,
    systemLogo: systemLogo || '',
    systemStempel: systemStempel || ''
  });

  // Helper to compile dynamic Konfigurasi rows (Hak Akses Fitur & Menu)
  const getKonfigurasiPayload = (
    customFeat?: RoleFeatureAccess,
    customMenu?: RoleMenuAccess
  ) => {
    const f = customFeat || featureAccess;
    const m = customMenu || menuAccess;
    return [
      { key: 'HAK_AKSES_FITUR', value: JSON.stringify(f), deskripsi: 'Matriks Hak Akses Fitur Operasi User PAMSDIGI' },
      { key: 'HAK_AKSES_MENU', value: JSON.stringify(m), deskripsi: 'Matriks Hak Akses Menu Navigasi PAMSDIGI' },
      { key: 'petugasCanInputKeuangan', value: String(f.petugas.catatKeuangan), deskripsi: 'Akses Input Transaksi Keuangan Petugas' }
    ];
  };

  // Handler to toggle Feature Permissions checkbox
  const handleToggleFeatureAccess = (role: 'admin' | 'petugas', key: keyof FeaturePermissions) => {
    if (currentUser?.role !== 'Admin' && currentUser?.role !== 'SUPER_ADMIN') {
      showToast('Akses Ditolak: Hanya Admin yang dapat mengubah hak akses!', 'error');
      return;
    }
    const nextRolePermissions = {
      ...featureAccess[role],
      [key]: !featureAccess[role][key]
    };
    const updatedFeat = {
      ...featureAccess,
      [role]: nextRolePermissions
    };
    setFeatureAccess(updatedFeat);
    if (role === 'petugas' && key === 'catatKeuangan') {
      setPetugasCanInputKeuangan(nextRolePermissions.catatKeuangan);
    }
    // Auto-sync langsung ke spreadsheet database secara global
    handleSaveAccessRights(updatedFeat, menuAccess, true);
  };

  // Handler to toggle Menu Visibility checkbox
  const handleToggleMenuAccess = (role: 'admin' | 'petugas', key: keyof MenuPermissions) => {
    if (currentUser?.role !== 'Admin' && currentUser?.role !== 'SUPER_ADMIN') {
      showToast('Akses Ditolak: Hanya Admin yang dapat mengubah hak akses!', 'error');
      return;
    }
    const nextRolePermissions = {
      ...menuAccess[role],
      [key]: !menuAccess[role][key]
    };
    const updatedMenu = {
      ...menuAccess,
      [role]: nextRolePermissions
    };
    setMenuAccess(updatedMenu);
    // Auto-sync langsung ke spreadsheet database secara global
    handleSaveAccessRights(featureAccess, updatedMenu, true);
  };

  // Save Hak Akses & Menu Permissions to Google Spreadsheet (Sheet Konfigurasi)
  const handleSaveAccessRights = async (
    customFeat?: RoleFeatureAccess,
    customMenu?: RoleMenuAccess,
    silent: boolean = false
  ) => {
    const targetFeat = customFeat || featureAccess;
    const targetMenu = customMenu || menuAccess;

    setIsSavingAccessRights(true);
    try {
      const konfigData = getKonfigurasiPayload(targetFeat, targetMenu);
      await pushDataToSheets({
        users,
        pelanggan,
        areas,
        tarifs,
        abonemen,
        denda,
        readings,
        billingList,
        cashTransactions,
        konfigurasi: konfigData,
        profil: getProfilPayload()
      });

      const nowTime = new Date().toLocaleTimeString('id-ID');
      setLastAccessRightsSaved(nowTime);
      if (!silent) {
        showToast('Hak akses berhasil disimpan ke Spreadsheet!', 'success');
      }
      addLog('success', 'Hak akses berhasil disimpan ke Google Spreadsheet (Sheet Konfigurasi).');
    } catch (err: any) {
      if (!silent) {
        showToast(`Gagal menyimpan hak akses ke spreadsheet: ${err.message || 'Error'}`, 'error');
      }
      addLog('error', `Gagal menyimpan hak akses: ${err.message}`);
    } finally {
      setIsSavingAccessRights(false);
    }
  };

  // Reset Hak Akses to System Defaults
  const handleResetAccessRights = async () => {
    if (currentUser?.role !== 'Admin' && currentUser?.role !== 'SUPER_ADMIN') {
      showToast('Akses Ditolak: Hanya Admin / Super Admin yang dapat me-reset hak akses!', 'error');
      return;
    }
    setFeatureAccess(DEFAULT_FEATURE_ACCESS);
    setMenuAccess(DEFAULT_MENU_ACCESS);
    setPetugasCanInputKeuangan(DEFAULT_FEATURE_ACCESS.petugas.catatKeuangan);
    await handleSaveAccessRights(DEFAULT_FEATURE_ACCESS, DEFAULT_MENU_ACCESS);
    showToast('Hak akses berhasil di-reset ke nilai default sistem.', 'success');
  };

  // Real-time Global Database Config Polling across all browsers/devices
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (isCheckingDb) return;

      try {
        const liveCfg = await fetchGasConfig();
        if (liveCfg.syncStatus === 'Connected' && liveCfg.gasUrl) {
          if (dbSyncStatus === 'Disconnected' || dbGasUrl !== liveCfg.gasUrl) {
            setDbGasUrl(liveCfg.gasUrl);
            const resSheetName = (liveCfg.spreadsheetName && liveCfg.spreadsheetName !== 'PAMSDIGI Spreadsheet') ? liveCfg.spreadsheetName : 'Db_pamsdigi';
            setDbSpreadsheetName(resSheetName);
            setDbSyncStatus('Connected');
            setDbLastConnected(liveCfg.lastConnected || new Date().toLocaleString('id-ID'));
            addLog('info', 'Sistem terhubung ke database global terbaru.');
          }
        } else {
          if (dbSyncStatus === 'Connected') {
            setDbGasUrl(prev => prev || DEFAULT_GAS_URL);
            setDbSyncStatus('Disconnected');
            setDbSpreadsheetName('Belum Terhubung');
            setDbLastConnected('Belum Terhubung');
            setDbCheckSteps([]);
            localStorage.setItem('pams_google_gas_url', DEFAULT_GAS_URL);
            localStorage.setItem('pams_db_sheet_name', 'Belum Terhubung');
            localStorage.setItem('pams_google_sheet_id', '');
            localStorage.setItem('pams_db_sync_status', 'Disconnected');
            localStorage.setItem('pams_db_last_connected', 'Belum Terhubung');
            addLog('info', 'Sistem mendeteksi konfigurasi database di-reset secara global. Status diubah menjadi BELUM TERHUBUNG.');
          }
        }
      } catch (_) {}
    }, 3000);

    return () => clearInterval(syncInterval);
  }, [dbSyncStatus, dbGasUrl, isCheckingDb]);

  // Real-time synchronization to Database Server & Google Sheets upon changes
  useEffect(() => {
    if (!isLoadedRef.current) return;

    const syncTimeout = setTimeout(async () => {
      try {
        await pushDataToSheets({
          users,
          pelanggan,
          areas,
          tarifs,
          abonemen,
          denda,
          readings,
          billingList,
          cashTransactions,
          konfigurasi: getKonfigurasiPayload(),
          profil: getProfilPayload()
        });
      } catch (_) {}
    }, 300); // 300ms debounce for instant persistence
    return () => clearTimeout(syncTimeout);
  }, [
    users, pelanggan, areas, tarifs, abonemen, denda, readings, billingList, cashTransactions,
    featureAccess, menuAccess,
    systemNama, systemNamaDesa, systemKecamatan, systemKabupaten, systemProvinsi, systemAlamat,
    systemHp, systemEmail, systemKetua, systemBendahara, systemFooterStruk, systemLogo, systemStempel
  ]);

  useEffect(() => {
    const sheetId = dbSpreadsheetId || 'default';
    localStorage.setItem(`pams_data_users_${sheetId}`, JSON.stringify(users));
    localStorage.setItem(`pams_data_pelanggan_${sheetId}`, JSON.stringify(pelanggan));
    localStorage.setItem(`pams_data_areas_${sheetId}`, JSON.stringify(areas));
    localStorage.setItem(`pams_data_tarifs_${sheetId}`, JSON.stringify(tarifs));
    localStorage.setItem(`pams_data_abonemen_${sheetId}`, JSON.stringify(abonemen));
    localStorage.setItem(`pams_data_denda_${sheetId}`, JSON.stringify(denda));
    localStorage.setItem(`pams_data_readings_${sheetId}`, JSON.stringify(readings));
    localStorage.setItem(`pams_data_billing_${sheetId}`, JSON.stringify(billingList));
    localStorage.setItem(`pams_data_cash_${sheetId}`, JSON.stringify(cashTransactions));
  }, [users, pelanggan, areas, tarifs, abonemen, denda, readings, billingList, cashTransactions, dbSpreadsheetId]);

  // Simulated Apps Script logs
  const [logs, setLogs] = useState<SimulatedLog[]>([
    {
      id: '1',
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      message: 'PAMSDIGI Apps Script Simulator started. Ready for Sprint 2 Master Data requests.',
    },
  ]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const addLog = (type: 'info' | 'success' | 'error' | 'request', message: string) => {
    setLogs((prev) => [
      {
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        type,
        message,
      },
      ...prev.slice(0, 49),
    ]);
  };

  const testConnection = async (id: string) => {
    const trimmedId = id.trim();
    if (!trimmedId || trimmedId.length < 15) {
      throw new Error('Spreadsheet tidak ditemukan');
    }

    const url = `https://docs.google.com/spreadsheets/d/${trimmedId}/gviz/tq?tqx=out:json`;
    
    try {
      const response = await fetch(url);
      
      if (response.status === 404) {
        throw new Error('Spreadsheet tidak ditemukan');
      }
      
      const text = await response.text();
      
      if (
        text.includes('<!DOCTYPE html>') || 
        text.includes('<html') || 
        text.includes('Sign in') || 
        text.includes('serviceLogin') || 
        text.includes('accounts.google.com')
      ) {
        throw new Error('Spreadsheet belum dibagikan');
      }
      
      if (text.includes('google.visualization.Query.setResponse')) {
        return 'Koneksi berhasil';
      } else {
        throw new Error('Spreadsheet tidak ditemukan');
      }
    } catch (err: any) {
      if (err.message === 'Spreadsheet belum dibagikan' || err.message === 'Spreadsheet tidak ditemukan') {
        throw err;
      }
      throw new Error('Spreadsheet belum dibagikan');
    }
  };

  // Daily Auto-Logout Check (Timezone Asia/Jakarta, exact 00:00 WIB)
  useEffect(() => {
    if (!currentUser) return;

    const checkDailyAutoLogout = () => {
      const todayWib = getWibDateString();
      const stored = localStorage.getItem('pamsdigi_session');
      if (stored) {
        try {
          const session = JSON.parse(stored);
          if (session.loginDateWib && session.loginDateWib !== todayWib) {
            // New day in Jakarta timezone! Auto logout.
            localStorage.removeItem('pamsdigi_session');
            setUsername('');
            setPassword('');
            setShowPassword(false);
            setCurrentUser(null);
            setCurrentView('login');
            showToast('Sesi kedaluwarsa (Auto Logout harian 00:00 WIB)', 'error');
            addLog('info', 'Session expired automatically at 00:00 WIB.');
          }
        } catch (_) {}
      }
    };

    // Run the check immediately
    checkDailyAutoLogout();

    // Check every 1 second (1000ms) to ensure exact logout at 00:00 WIB
    const intervalId = setInterval(checkDailyAutoLogout, 1000);
    return () => clearInterval(intervalId);
  }, [currentUser]);

  // --- SIMULATED GOOGLE SCRIPT RUN ENGINE ---
  const runGoogleScript = (
    functionName: string,
    args: any,
    onSuccess: (response: any) => void,
    onFailure?: (error: Error) => void
  ) => {
    addLog('request', `google.script.run.${functionName}(${JSON.stringify(args) || ''})`);
    const delay = 500 + Math.random() * 500;

    setTimeout(() => {
      if (networkErrorSimulation) {
        const err = new Error('Connection timeout! Google Sheets API is currently unreachable.');
        addLog('error', `withFailureHandler: ${err.message}`);
        if (onFailure) {
          onFailure(err);
        } else {
          showToast(err.message, 'error');
        }
        return;
      }

      try {
        if (functionName === 'authenticateUser') {
          const { username: userIn, password: passIn } = args;

          if (userIn.toLowerCase() === 'superadmin') {
            if (passIn === 'PAMSDIGI2026') {
              const superAdminUser: UserRow = {
                username: 'superadmin',
                nama: 'Super Developer (System)',
                role: 'SUPER_ADMIN',
                status: 'Aktif',
                password: 'PAMSDIGI2026',
                areaAkses: 'ALL'
              };
              const resp = { success: true, ...superAdminUser };
              addLog('success', `Returned Authenticated Session (SUPER_ADMIN): ${JSON.stringify(resp)}`);
              onSuccess(resp);
              return;
            } else {
              const resp = { success: false, message: 'Password yang Anda masukkan salah.' };
              addLog('error', `Returned: ${JSON.stringify(resp)}`);
              onSuccess(resp);
              return;
            }
          }

          // Coba Live Auth ke Google Spreadsheet jika online & terhubung
          if (dbSyncStatus === 'Connected' && typeof navigator !== 'undefined' && navigator.onLine) {
            authenticateWithSheets(userIn, passIn).then(liveAuth => {
              if (liveAuth.success && liveAuth.user) {
                const resp = { success: true, ...liveAuth.user };
                addLog('success', `Live Auth Spreadsheet Berhasil: ${JSON.stringify(resp)}`);
                onSuccess(resp);
                return;
              }
              if (liveAuth.message && liveAuth.message.includes('Password yang Anda masukkan salah')) {
                const resp = { success: false, message: liveAuth.message };
                addLog('error', `Live Auth Gagal: ${JSON.stringify(resp)}`);
                onSuccess(resp);
                return;
              }
              fallbackLocalAuth();
            }).catch(() => {
              fallbackLocalAuth();
            });
            return;
          }

          function fallbackLocalAuth() {
            let match = users.find(u => u.username.toLowerCase() === userIn.toLowerCase());
            
            if (userIn.toLowerCase() === 'admin' && passIn === 'admin') {
              if (!match) {
                match = {
                  username: 'admin',
                  password: 'admin',
                  nama: 'Budi Santoso',
                  role: 'Admin',
                  status: 'Aktif',
                  areaAkses: 'ALL'
                };
                onAddUser(match);
              } else if (match.password !== 'admin') {
                match = { ...match, password: 'admin' };
                onUpdateUser(match);
              }
            }

            if (!match) {
              const resp = { success: false, message: 'Username tidak ditemukan.' };
              addLog('error', `Returned: ${JSON.stringify(resp)}`);
              onSuccess(resp);
            } else if (match.password !== passIn) {
              const resp = { success: false, message: 'Password yang Anda masukkan salah.' };
              addLog('error', `Returned: ${JSON.stringify(resp)}`);
              onSuccess(resp);
            } else if (match.status !== 'Aktif') {
              const resp = { success: false, message: 'Akun Anda berstatus Nonaktif. Hubungi Admin.' };
              addLog('error', `Returned: ${JSON.stringify(resp)}`);
              onSuccess(resp);
            } else {
              const resp = { success: true, ...match };
              addLog('success', `Returned Authenticated Session: ${JSON.stringify(resp)}`);
              onSuccess(resp);
            }
          }
          fallbackLocalAuth();
          return;
        } 
        else if (functionName === 'saveOrUpdatePelanggan') {
          const pel = args as PelangganRow;
          const exists = pelanggan.some(p => p.noPelanggan === pel.noPelanggan);
          let updatedPelList: PelangganRow[];
          if (exists) {
            onUpdatePelanggan(pel);
            updatedPelList = pelanggan.map(p => p.noPelanggan === pel.noPelanggan ? pel : p);
          } else {
            if (pelanganNoPelExists(pel.noPelanggan)) {
              const resp = { success: false, message: `Gagal: No. Pelanggan ${pel.noPelanggan} sudah digunakan!` };
              addLog('error', `Returned: ${JSON.stringify(resp)}`);
              onSuccess(resp);
              return;
            }
            onAddPelanggan(pel);
            updatedPelList = [...pelanggan, pel];
          }
          pushDataToSheets({
            users, pelanggan: updatedPelList, areas, tarifs, abonemen, denda, readings, billingList, cashTransactions,
            profil: getProfilPayload()
          });
          const resp = { success: true, message: `Berhasil menyimpan pelanggan: ${pel.nama}` };
          addLog('success', `Returned: ${JSON.stringify(resp)}`);
          onSuccess(resp);
        }
        else if (functionName === 'deletePelanggan') {
          const noPel = args as string;
          onDeletePelanggan(noPel);
          const updatedPelList = pelanggan.filter(p => p.noPelanggan !== noPel);
          pushDataToSheets({
            users, pelanggan: updatedPelList, areas, tarifs, abonemen, denda, readings, billingList, cashTransactions,
            profil: getProfilPayload()
          });
          const resp = { success: true, message: `Pelanggan ${noPel} berhasil dihapus dari database.` };
          addLog('success', `Returned: ${JSON.stringify(resp)}`);
          onSuccess(resp);
        }
        else if (functionName === 'bulkImportPelanggan') {
          const validList = args as PelangganRow[];
          onReplacePelanggan(validList);
          pushDataToSheets({
            users, pelanggan: validList, areas, tarifs, abonemen, denda, readings, billingList, cashTransactions,
            profil: getProfilPayload()
          });
          const resp = { success: true, message: `Berhasil mengganti seluruh data lama dan mengimport ${validList.length} data pelanggan ke Google Sheet!` };
          addLog('success', `Returned: ${JSON.stringify(resp)}`);
          onSuccess(resp);
        }
        else if (functionName === 'saveArea') {
          const newArea = args as AreaRow;
          onAddArea(newArea);
          const updatedAreas = [...areas, newArea];
          pushDataToSheets({
            users, pelanggan, areas: updatedAreas, tarifs, abonemen, denda, readings, billingList, cashTransactions,
            profil: getProfilPayload()
          });
          const resp = { success: true, message: `Area ${newArea.nama} berhasil disimpan ke Spreadsheet.` };
          addLog('success', `Returned: ${JSON.stringify(resp)}`);
          onSuccess(resp);
        }
        else if (functionName === 'updateArea') {
          const updatedArea = args as AreaRow;
          onUpdateArea(updatedArea);
          const updatedAreas = areas.map(a => a.id === updatedArea.id ? updatedArea : a);
          pushDataToSheets({
            users, pelanggan, areas: updatedAreas, tarifs, abonemen, denda, readings, billingList, cashTransactions,
            profil: getProfilPayload()
          });
          const resp = { success: true, message: `Area ${updatedArea.nama} berhasil diperbarui di Spreadsheet.` };
          addLog('success', `Returned: ${JSON.stringify(resp)}`);
          onSuccess(resp);
        }
        else if (functionName === 'deleteArea') {
          const id = args as string;
          onDeleteArea(id);
          const updatedAreas = areas.filter(a => a.id !== id);
          pushDataToSheets({
            users, pelanggan, areas: updatedAreas, tarifs, abonemen, denda, readings, billingList, cashTransactions,
            profil: getProfilPayload()
          });
          const resp = { success: true, message: `Baris area ID ${id} berhasil dihapus dari Google Sheets.` };
          addLog('success', `Returned: ${JSON.stringify(resp)}`);
          onSuccess(resp);
        }
        else if (functionName === 'saveTarif') {
          const t = args as TarifRow;
          onAddTarif(t);
          const updatedTarifs = [...tarifs, t];
          pushDataToSheets({
            users, pelanggan, areas, tarifs: updatedTarifs, abonemen, denda, readings, billingList, cashTransactions,
            profil: getProfilPayload()
          });
          const resp = { success: true, message: `Skema tarif ${t.golongan} berhasil disimpan ke Spreadsheet.` };
          addLog('success', `Returned: ${JSON.stringify(resp)}`);
          onSuccess(resp);
        }
        else if (functionName === 'updateTarif') {
          const t = args as TarifRow;
          onUpdateTarif(t);
          const updatedTarifs = tarifs.map(tf => tf.id === t.id ? t : tf);
          pushDataToSheets({
            users, pelanggan, areas, tarifs: updatedTarifs, abonemen, denda, readings, billingList, cashTransactions,
            profil: getProfilPayload()
          });
          const resp = { success: true, message: `Skema tarif ${t.golongan} berhasil diperbarui.` };
          addLog('success', `Returned: ${JSON.stringify(resp)}`);
          onSuccess(resp);
        }
        else if (functionName === 'deleteTarif') {
          const id = args as string;
          onDeleteTarif(id);
          const updatedTarifs = tarifs.filter(t => t.id !== id);
          pushDataToSheets({
            users, pelanggan, areas, tarifs: updatedTarifs, abonemen, denda, readings, billingList, cashTransactions,
            profil: getProfilPayload()
          });
          const resp = { success: true, message: `Tarif ID ${id} telah dihapus dari database.` };
          addLog('success', `Returned: ${JSON.stringify(resp)}`);
          onSuccess(resp);
        }
        else if (functionName === 'saveAbonemen') {
          const ab = args as AbonemenRow;
          onUpdateAbonemen(ab);
          pushDataToSheets({
            users, pelanggan, areas, tarifs, abonemen: ab, denda, readings, billingList, cashTransactions,
            profil: getProfilPayload()
          });
          const resp = { success: true, message: `Abonemen nominal Rp ${ab.nominal.toLocaleString('id-ID')} disimpan.` };
          addLog('success', `Returned: ${JSON.stringify(resp)}`);
          onSuccess(resp);
        }
        else if (functionName === 'saveDenda') {
          const de = args as DendaRow;
          onUpdateDenda(de);
          pushDataToSheets({
            users, pelanggan, areas, tarifs, abonemen, denda: de, readings, billingList, cashTransactions,
            profil: getProfilPayload()
          });
          const resp = { success: true, message: `Pengaturan denda diperbarui (Status: ${de.status}, Rp ${de.nominal}).` };
          addLog('success', `Returned: ${JSON.stringify(resp)}`);
          onSuccess(resp);
        }
        else if (functionName === 'saveUser') {
          const u = args as UserRow;
          onAddUser(u);
          const updatedUsers = [...users, u];
          pushDataToSheets({
            users: updatedUsers, pelanggan, areas, tarifs, abonemen, denda, readings, billingList, cashTransactions,
            profil: getProfilPayload()
          });
          const resp = { success: true, message: `User ${u.nama} berhasil didaftarkan.` };
          addLog('success', `Returned: ${JSON.stringify(resp)}`);
          onSuccess(resp);
        }
        else if (functionName === 'updateUser') {
          const u = args as UserRow;
          onUpdateUser(u);
          const updatedUsers = users.map(us => us.username === u.username ? u : us);
          pushDataToSheets({
            users: updatedUsers, pelanggan, areas, tarifs, abonemen, denda, readings, billingList, cashTransactions,
            profil: getProfilPayload()
          });
          const resp = { success: true, message: `User ${u.nama} berhasil diperbarui.` };
          addLog('success', `Returned: ${JSON.stringify(resp)}`);
          onSuccess(resp);
        }
        else if (functionName === 'deleteUser') {
          const username = args as string;
          onDeleteUser(username);
          const updatedUsers = users.filter(u => u.username !== username);
          pushDataToSheets({
            users: updatedUsers, pelanggan, areas, tarifs, abonemen, denda, readings, billingList, cashTransactions,
            profil: getProfilPayload()
          });
          const resp = { success: true, message: `User ${username} telah dihapus.` };
          addLog('success', `Returned: ${JSON.stringify(resp)}`);
          onSuccess(resp);
        }
        else if (functionName === 'getDashboardStats') {
          const stats = {
            totalPelanggan: pelanggan.length,
            totalAktif: pelanggan.filter(p => p.status === 'Aktif').length,
            totalNonaktif: pelanggan.filter(p => p.status === 'Nonaktif').length,
            totalArea: areas.length,
            totalUsers: users.length
          };
          const resp = { success: true, stats };
          onSuccess(resp);
        }
      } catch (err: any) {
        addLog('error', `Simulation Error: ${err.message}`);
        onFailure(err);
      }
    }, delay);
  };

  const pelanganNoPelExists = (noPel: any) => {
    return pelanggan.some(p => String(p.noPelanggan || '').trim().toLowerCase() === String(noPel || '').trim().toLowerCase());
  };

  // --- STATS HANDLERS ---
  const [appStats, setAppStats] = useState({
    totalPelanggan: pelanggan.length,
    totalAktif: pelanggan.filter(p => p.status === 'Aktif').length,
    totalNonaktif: pelanggan.filter(p => p.status === 'Nonaktif').length,
    totalArea: areas.length,
    totalUsers: users.length
  });

  const refreshStats = () => {
    runGoogleScript(
      'getDashboardStats',
      null,
      (response) => {
        if (response.success) {
          setAppStats(response.stats);
        }
      },
      (error) => {
        addLog('error', `Failed background cached statistics update: ${error.message}`);
      }
    );
  };

  useEffect(() => {
    setAppStats({
      totalPelanggan: pelanggan.length,
      totalAktif: pelanggan.filter(p => p.status === 'Aktif').length,
      totalNonaktif: pelanggan.filter(p => p.status === 'Nonaktif').length,
      totalArea: areas.length,
      totalUsers: users.length
    });
  }, [pelanggan, users, areas]);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    runGoogleScript(
      'authenticateUser',
      { username, password },
      (response) => {
        setIsLoading(false);
        if (response.success) {
          const todayWib = getWibDateString();
          localStorage.setItem('pamsdigi_session', JSON.stringify({
            user: response,
            loginDateWib: todayWib
          }));
          setCurrentUser(response);
          setUsername('');
          setPassword('');
          setShowPassword(false);
          showToast(`Selamat Datang ${response.nama}!`, 'success');
          const validViews = ['dashboard', 'pelanggan', 'catat-meter', 'tagihan', 'keuangan', 'laporan', 'master-data', 'pengaturan', 'spreadsheet', 'code', 'guide'];
          const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#\/?/, '') : '';
          const targetView = (hash && validViews.includes(hash)) ? (hash as any) : 'dashboard';
          setCurrentView(targetView);
        } else {
          showToast(response.message, 'error');
        }
      },
      (error) => {
        setIsLoading(false);
        showToast(`Koneksi Gagal: ${error.message}`, 'error');
      }
    );
  };

  const handlePelangganFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isEditPelanggan) {
      if (!canPerformAction('editPelanggan')) {
        showToast('Akses Ditolak: Anda tidak memiliki hak akses untuk mengedit pelanggan.', 'error');
        return;
      }
    } else {
      if (!canPerformAction('tambahPelanggan')) {
        showToast('Akses Ditolak: Anda tidak memiliki hak akses untuk menambah pelanggan baru.', 'error');
        return;
      }
    }
    
    // Fallback if formArea/formGolongan are unselected
    const selectedArea = formArea || (areas.length > 0 ? areas[0].nama : 'Dusun Krajan');
    const selectedGol = formGolongan || (tarifs.length > 0 ? tarifs[0].golongan : 'Rumah Tangga A');

    let finalNoPelanggan = formNoPelanggan;
    if (!isEditPelanggan) {
      if (!finalNoPelanggan || pelanggan.some(p => p.noPelanggan === finalNoPelanggan)) {
        finalNoPelanggan = generateAutomaticNoPelanggan();
      }
    }

    const inputData: PelangganRow = {
      noPelanggan: finalNoPelanggan,
      nama: formNama,
      area: selectedArea,
      alamat: formAlamat,
      golongan: selectedGol,
      tempatPemasangan: formTempat,
      tglPasang: formTgl,
      meterAwal: Number(formMeter) || 0,
      telepon: formTelepon,
      latitude: Number(formLat) || 0,
      longitude: Number(formLong) || 0,
      status: formStatus,
      createdAt: new Date().toISOString()
    };

    setIsModalOpen(false);
    setIsLoading(true);

    runGoogleScript(
      'saveOrUpdatePelanggan',
      inputData,
      (response) => {
        setIsLoading(false);
        if (response.success) {
          showToast(response.message, 'success');
          refreshStats();
        } else {
          showToast(response.message, 'error');
        }
      },
      (error) => {
        setIsLoading(false);
        showToast(`Koneksi Gagal: ${error.message}`, 'error');
      }
    );
  };

  // --- SPRINT 1.5 EXCEL INTERACTION HANDLERS ---
  const handleExportExcel = () => {
    try {
      const exportData = pelanggan.map((p) => ({
        NoPelanggan: p.noPelanggan,
        Nama: p.nama,
        Area: p.area,
        Alamat: p.alamat,
        Golongan: p.golongan,
        TempatPemasangan: p.tempatPemasangan,
        TglPasang: p.tglPasang,
        MeterAwal: p.meterAwal,
        Telepon: p.telepon,
        Status: p.status,
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Pelanggan');

      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `pelanggan_pamsdigi_${dateStr}.xlsx`;

      XLSX.writeFile(workbook, fileName);
      addLog('success', `Exported ${exportData.length} pelanggan rows to Excel file "${fileName}"`);
      showToast('Export Excel berhasil didownload!', 'success');
    } catch (err: any) {
      addLog('error', `Failed to export to Excel: ${err.message}`);
      showToast(`Export Gagal: ${err.message}`, 'error');
    }
  };

  const handleDownloadTemplate = () => {
    try {
      const templateData = [
        {
          NoPelanggan: 'P001',
          Nama: 'Ahmad Dahlan',
          Area: areas.length > 0 ? areas[0].nama : 'Dusun Krajan',
          Alamat: 'RT 01 RW 02',
          Golongan: tarifs.length > 0 ? tarifs[0].golongan : 'Rumah Tangga A',
          TempatPemasangan: 'Dapur Samping',
          TglPasang: '2026-06-26',
          MeterAwal: 10,
          Telepon: '081234567890',
          Status: 'Aktif',
        },
        {
          NoPelanggan: 'P002',
          Nama: 'Siti Aminah',
          Area: areas.length > 1 ? areas[1].nama : 'Dusun Mulyo',
          Alamat: 'RT 03 RW 01',
          Golongan: tarifs.length > 0 ? tarifs[0].golongan : 'Rumah Tangga A',
          TempatPemasangan: 'Kamar Mandi Belakang',
          TglPasang: '2026-06-25',
          MeterAwal: 15,
          Telepon: '085712345678',
          Status: 'Aktif',
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(templateData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Pelanggan');

      const fileName = 'template_pelanggan_pamsdigi.xlsx';
      XLSX.writeFile(workbook, fileName);
      addLog('success', `Downloaded import template: "${fileName}"`);
      showToast('Template Excel berhasil didownload!', 'success');
    } catch (err: any) {
      addLog('error', `Failed to download template: ${err.message}`);
      showToast(`Gagal download template: ${err.message}`, 'error');
    }
  };

  const handleImportExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    addLog('info', `Selected import file: "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (jsonData.length === 0) {
          showToast('File Excel kosong atau tidak valid!', 'error');
          addLog('error', 'Import Excel failed: File is empty.');
          return;
        }

        validateImportData(jsonData);
      } catch (err: any) {
        showToast('Gagal membaca file Excel!', 'error');
        addLog('error', `Import Excel reading error: ${err.message}`);
      }
    };
    reader.onerror = () => {
      showToast('Gagal membaca file!', 'error');
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const validateImportData = (rawRows: any[]) => {
    const validated: ExcelImportRow[] = [];
    const existingNoPel = new Set(pelanggan.map((p) => String(p.noPelanggan || '').trim().toLowerCase()));
    const fileNoPel = new Set<string>();

    rawRows.forEach((row, index) => {
      const rowNum = index + 2;
      const errors: string[] = [];

      const getVal = (possibleKeys: string[]): string => {
        for (const k of possibleKeys) {
          if (row[k] !== undefined && row[k] !== null) return String(row[k]).trim();
          const foundKey = Object.keys(row).find(x => x.toLowerCase() === k.toLowerCase());
          if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
            return String(row[foundKey]).trim();
          }
        }
        return '';
      };

      const rawNoPel = getVal(['NoPelanggan', 'no_pelanggan', 'no_pel', 'nopelanggan']);
      const rawNama = getVal(['Nama', 'nama_pelanggan', 'nama']);
      const rawArea = getVal(['Area', 'wilayah', 'dusun', 'area']) || (areas.length > 0 ? areas[0].nama : 'Dusun Krajan');
      const rawAlamat = getVal(['Alamat', 'alamat_lengkap', 'alamat']);
      const rawGolongan = getVal(['Golongan', 'golongan_tarif', 'golongan']) || (tarifs.length > 0 ? tarifs[0].golongan : 'Rumah Tangga A');
      const rawTempat = getVal(['TempatPemasangan', 'tempat_pemasangan', 'tempat', 'tempatpemasangan']);
      const rawTgl = getVal(['TglPasang', 'tanggal_pasang', 'tgl_pasang', 'tglpasang']) || new Date().toISOString().split('T')[0];
      const rawMeter = row['MeterAwal'] !== undefined ? row['MeterAwal'] : (row['meter_awal'] !== undefined ? row['meter_awal'] : row['meterawal']);
      const rawTelepon = getVal(['Telepon', 'hp', 'no_telepon', 'no_hp', 'telepon']);
      const rawStatus = getVal(['Status', 'status_keaktifan', 'status']) || 'Aktif';

      if (!rawNoPel) {
        errors.push('No. Pelanggan wajib diisi.');
      } else {
        const lowerNoPel = rawNoPel.toLowerCase();
        if (fileNoPel.has(lowerNoPel)) {
          errors.push(`No. Pelanggan duplikat dalam file Excel: "${rawNoPel}".`);
        } else {
          fileNoPel.add(lowerNoPel);
        }

        if (existingNoPel.has(lowerNoPel)) {
          errors.push(`No. Pelanggan sudah terdaftar di database: "${rawNoPel}".`);
        }
      }

      if (!rawNama) {
        errors.push('Nama wajib diisi.');
      }

      if (rawMeter === undefined || rawMeter === null || String(rawMeter).trim() === '') {
        errors.push('Meter awal wajib diisi.');
      } else if (isNaN(Number(rawMeter))) {
        errors.push(`Meter awal harus berupa angka, dapat: "${rawMeter}".`);
      }

      validated.push({
        NoPelanggan: rawNoPel,
        Nama: rawNama,
        Area: rawArea,
        Alamat: rawAlamat,
        Golongan: rawGolongan,
        TempatPemasangan: rawTempat,
        TglPasang: rawTgl,
        MeterAwal: rawMeter !== undefined ? Number(rawMeter) : 0,
        Telepon: rawTelepon,
        Status: rawStatus === 'Nonaktif' || rawStatus === 'nonaktif' ? 'Nonaktif' : 'Aktif',
        rowNum,
        isValid: errors.length === 0,
        errors,
      });
    });

    setImportRows(validated);
    setIsImportPreviewOpen(true);
    addLog('info', `Validated ${validated.length} rows. Valid: ${validated.filter(r => r.isValid).length}, Errors: ${validated.filter(r => !r.isValid).length}`);
  };

  const handleConfirmImport = () => {
    const validRows = importRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      showToast('Tidak ada data valid untuk diimport!', 'error');
      return;
    }

    const confirmResult = window.confirm("Import data akan mengganti seluruh data pelanggan lama. Lanjutkan?");
    if (!confirmResult) {
      return;
    }

    setIsImportPreviewOpen(false);
    setIsLoading(true);

    const mappedData = validRows.map(r => ({
      noPelanggan: r.NoPelanggan || '',
      nama: r.Nama || '',
      area: r.Area || 'Dusun Krajan',
      alamat: r.Alamat || '',
      golongan: r.Golongan || 'Rumah Tangga A',
      tempatPemasangan: r.TempatPemasangan || '',
      tglPasang: r.TglPasang || new Date().toISOString().split('T')[0],
      meterAwal: Number(r.MeterAwal) || 0,
      telepon: r.Telepon || '',
      status: r.Status as 'Aktif' | 'Nonaktif',
      latitude: -7.8012,
      longitude: 110.3644,
      createdAt: new Date().toISOString()
    }));

    runGoogleScript(
      'bulkImportPelanggan',
      mappedData,
      (response) => {
        setIsLoading(false);
        if (response.success) {
          showToast(response.message, 'success');
          refreshStats();
        } else {
          showToast(response.message, 'error');
        }
      },
      (error) => {
        setIsLoading(false);
        showToast(`Import Gagal: ${error.message}`, 'error');
      }
    );
  };

  const openEditModal = (p: PelangganRow) => {
    if (!canPerformAction('editPelanggan')) {
      showToast('Akses Ditolak: Anda tidak memiliki hak akses untuk mengedit pelanggan.', 'error');
      return;
    }
    setFormNoPelanggan(p.noPelanggan);
    setFormNama(p.nama);
    setFormArea(p.area);
    setFormAlamat(p.alamat);
    setFormGolongan(p.golongan);
    setFormTempat(p.tempatPemasangan);
    setFormTgl(p.tglPasang);
    setFormMeter(p.meterAwal);
    setFormTelepon(p.telepon);
    setFormLat(p.latitude);
    setFormLong(p.longitude);
    setFormStatus(p.status);
    setIsEditPelanggan(true);
    setIsModalOpen(true);
  };

  const handleAutofillDemoPelanggan = () => {
    const randomNames = ["Eko Prasetyo", "Bambang Wijaya", "Sri Wahyuni", "Dewi Lestari", "Hendra Wijaya", "Siti Aminah", "Rian Hidayat", "Mega Utami", "Adi Nugroho", "Indah Permatasari"];
    const randomPlaces = ["Samping Rumah", "Dapur", "Kamar Mandi", "Depan Pagar", "Taman Belakang", "Samping Garasi"];
    const randomAlamat = ["RT 02 RW 01 Dusun Krajan", "RT 05 RW 02 Dusun Mawar", "RT 01 RW 04 Dusun Melati", "RT 03 RW 03 Dusun Rejo"];
    
    const randomName = randomNames[Math.floor(Math.random() * randomNames.length)];
    const randomPlace = randomPlaces[Math.floor(Math.random() * randomPlaces.length)];
    const randomAdd = randomAlamat[Math.floor(Math.random() * randomAlamat.length)];
    const randomPhone = "08" + Math.floor(100000000 + Math.random() * 900000000);
    const randomMeterVal = Math.floor(Math.random() * 150);
    
    setFormNama(randomName);
    setFormAlamat(randomAdd);
    setFormTempat(randomPlace);
    setFormTelepon(randomPhone);
    setFormMeter(randomMeterVal);
    setFormTgl(new Date().toISOString().split('T')[0]);
    if (areas.length > 0) {
      setFormArea(areas[Math.floor(Math.random() * areas.length)].nama);
    }
    if (tarifs.length > 0) {
      setFormGolongan(tarifs[Math.floor(Math.random() * tarifs.length)].golongan);
    }
    
    showToast('Berhasil mengisi data simulasi demo!', 'success');
  };

  const generateAutomaticNoPelanggan = (): string => {
    const todayWib = getWibDateString();
    let datePrefix = '260630'; // default fallback if split fails
    if (todayWib && todayWib.includes('-')) {
      const parts = todayWib.split('-');
      if (parts.length >= 3) {
        const yy = parts[0].slice(-2);
        const mm = parts[1];
        const dd = parts[2];
        datePrefix = yy + mm + dd;
      }
    }

    const matchingIds = pelanggan
      .map(p => String(p.noPelanggan || '').trim())
      .filter(no => no.startsWith(datePrefix));

    let nextSeq = 1;
    if (matchingIds.length > 0) {
      const seqNumbers = matchingIds.map(no => {
        const seqStr = no.slice(datePrefix.length);
        const parsed = parseInt(seqStr, 10);
        return isNaN(parsed) ? 0 : parsed;
      });
      const maxSeq = Math.max(...seqNumbers, 0);
      nextSeq = maxSeq + 1;
    }

    let finalId = datePrefix + String(nextSeq).padStart(4, '0');
    while (pelanggan.some(p => p.noPelanggan === finalId)) {
      nextSeq++;
      finalId = datePrefix + String(nextSeq).padStart(4, '0');
    }

    return finalId;
  };

  const openAddModal = () => {
    if (!canPerformAction('tambahPelanggan')) {
      showToast('Akses Ditolak: Anda tidak memiliki hak akses untuk mendaftarkan pelanggan baru.', 'error');
      return;
    }
    const autoNo = generateAutomaticNoPelanggan();
    setFormNoPelanggan(autoNo);
    setFormNama('');
    setFormArea(areas.length > 0 ? areas[0].nama : '');
    setFormAlamat('');
    setFormGolongan(tarifs.length > 0 ? tarifs[0].golongan : '');
    setFormTempat('');
    setFormTgl(new Date().toISOString().split('T')[0]);
    setFormMeter(0);
    setFormTelepon('');
    setFormLat(-7.8012);
    setFormLong(110.3644);
    setFormStatus('Aktif');
    setIsEditPelanggan(false);
    setIsModalOpen(true);
  };

  const handleLogout = () => {
    const isDemo = !dbGasUrl || dbSyncStatus !== 'Connected';
    if (isDemo) {
      // Clear all demo data from local storage for the current sheetId (or 'default')
      const sheetId = dbSpreadsheetId || 'default';
      localStorage.removeItem(`pams_data_users_${sheetId}`);
      localStorage.removeItem(`pams_data_pelanggan_${sheetId}`);
      localStorage.removeItem(`pams_data_areas_${sheetId}`);
      localStorage.removeItem(`pams_data_tarifs_${sheetId}`);
      localStorage.removeItem(`pams_data_abonemen_${sheetId}`);
      localStorage.removeItem(`pams_data_denda_${sheetId}`);
      localStorage.removeItem(`pams_data_readings_${sheetId}`);
      localStorage.removeItem(`pams_data_billing_${sheetId}`);
      localStorage.removeItem(`pams_data_cash_${sheetId}`);
      
      // Reset state to default initial values
      onResetData();
      setReadings([]);
      setBillingList([]);
      setCashTransactions([]);
      addLog('info', 'Seluruh data demo dibersihkan karena user logout pada MODE DEMO.');
    }

    localStorage.removeItem('pamsdigi_session');
    if (typeof window !== 'undefined' && window.location.hash) {
      window.location.hash = '';
    }
    // Kosongkan form login (username & password) agar tidak tersisa saat logout
    setUsername('');
    setPassword('');
    setShowPassword(false);
    setCurrentUser(null);
    setCurrentView('login');
    showToast('Logout Berhasil!', 'success');
    addLog('info', 'User logged out. Simulator session reset.');
  };

  // Helper to determine if a given area is accessible by the current user
  const isAreaAccessible = (areaName: any): boolean => {
    if (!currentUser) return true;
    if (currentUser.role === 'Admin' || currentUser.role === 'SUPER_ADMIN') return true;
    if (!currentUser.areaAkses || currentUser.areaAkses === 'ALL') return true;
    const allowedAreas = currentUser.areaAkses.split(',').map(a => a.trim().toLowerCase());
    return allowedAreas.includes(String(areaName || '').trim().toLowerCase());
  };

  // Filter pelanggan list based on area coverage first!
  const myPelanggan = pelanggan.filter(p => isAreaAccessible(p.area));

  // Filter list based on search query
  const filteredPelanggan = myPelanggan.filter(p => 
    String(p.nama || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    String(p.noPelanggan || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(p.area || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const myReadings = readings.filter(r => isAreaAccessible(r.area));
  const myBillingList = billingList.filter(b => isAreaAccessible(b.area));
  const myCashTransactions = cashTransactions.filter(t => !t.area || t.area === 'ALL' || isAreaAccessible(t.area));

  // --- SPRINT 2 MASTER OPERATIONS ---
  const handleSaveAreaClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!areaInputId.trim() || !areaInputNama.trim()) return;

    if (!canPerformAction('ubahMasterData')) {
      showToast('Akses Ditolak: Anda tidak memiliki hak akses untuk mengubah data wilayah/dusun!', 'error');
      return;
    }

    const idClean = areaInputId.trim().toUpperCase();
    
    if (areaEditId) {
      // Edit
      setIsLoading(true);
      runGoogleScript(
        'updateArea',
        { id: areaEditId, nama: areaInputNama.trim() },
        (resp) => {
          setIsLoading(false);
          if (resp.success) {
            showToast(resp.message, 'success');
            setAreaEditId(null);
            setAreaInputId('');
            setAreaInputNama('');
          }
        },
        (err) => {
          setIsLoading(false);
          showToast(`Gagal: ${err.message}`, 'error');
        }
      );
    } else {
      // Add
      if (areas.some(a => a.id.toUpperCase() === idClean)) {
        showToast('Gagal: ID Area sudah digunakan!', 'error');
        return;
      }
      setIsLoading(true);
      runGoogleScript(
        'saveArea',
        { id: idClean, nama: areaInputNama.trim() },
        (resp) => {
          setIsLoading(false);
          if (resp.success) {
            showToast(resp.message, 'success');
            setAreaInputId('');
            setAreaInputNama('');
          }
        },
        (err) => {
          setIsLoading(false);
          showToast(`Gagal: ${err.message}`, 'error');
        }
      );
    }
  };

  const handleDeleteAreaClick = (id: string) => {
    if (!canPerformAction('hapusWilayah')) {
      showToast('Akses Ditolak: Anda tidak memiliki hak akses untuk menghapus wilayah/dusun!', 'error');
      return;
    }
    if (window.confirm('Yakin ingin menghapus data?')) {
      setIsLoading(true);
      runGoogleScript(
        'deleteArea',
        id,
        (resp) => {
          setIsLoading(false);
          if (resp.success) {
            showToast(resp.message, 'success');
          }
        },
        (err) => {
          setIsLoading(false);
          showToast(`Gagal: ${err.message}`, 'error');
        }
      );
    }
  };

  const handleSaveTarifClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tarifInputId.trim() || !tarifInputGolongan.trim()) return;

    if (!canPerformAction('ubahMasterData')) {
      showToast('Akses Ditolak: Anda tidak memiliki hak akses untuk mengubah data tarif!', 'error');
      return;
    }

    const cleanId = tarifInputId.trim().toUpperCase();

    if (tarifInputTipe === 'Bertingkat') {
      // Validate dynamic levels
      // 1. Must have at least one level
      if (!tarifInputLevels || tarifInputLevels.length === 0) {
        showToast('Gagal: Minimal harus ada satu level tarif!', 'error');
        return;
      }

      // Check each level
      for (let i = 0; i < tarifInputLevels.length; i++) {
        const lvl = tarifInputLevels[i];
        const dari = lvl.dari;
        const sampai = lvl.sampai;
        const tarifVal = lvl.tarif;

        if (dari === undefined || dari === null || isNaN(dari) || dari < 0) {
          showToast(`Gagal: Nilai Dari pada Level ${i + 1} tidak valid!`, 'error');
          return;
        }

        if (tarifVal === undefined || tarifVal === null || isNaN(tarifVal) || tarifVal < 0) {
          showToast(`Gagal: Nilai Harga pada Level ${i + 1} tidak valid!`, 'error');
          return;
        }

        // If not the last level, "sampai" must be filled and greater than "dari"
        if (i < tarifInputLevels.length - 1) {
          if (sampai === undefined || sampai === null || isNaN(sampai) || sampai <= dari) {
            showToast(`Gagal: Nilai Sampai pada Level ${i + 1} harus diisi dan lebih besar dari Dari!`, 'error');
            return;
          }
        } else {
          // For the last level, if "sampai" is filled, it must be greater than "dari"
          if (sampai !== undefined && sampai !== null && sampai > 0 && sampai <= dari) {
            showToast(`Gagal: Nilai Sampai pada Level ${i + 1} harus lebih besar dari Dari!`, 'error');
            return;
          }
        }
      }

      // Check for overlapping intervals
      for (let i = 0; i < tarifInputLevels.length; i++) {
        const lowI = Number(tarifInputLevels[i].dari);
        const highI = tarifInputLevels[i].sampai ? Number(tarifInputLevels[i].sampai) : Infinity;

        for (let j = i + 1; j < tarifInputLevels.length; j++) {
          const lowJ = Number(tarifInputLevels[j].dari);
          const highJ = tarifInputLevels[j].sampai ? Number(tarifInputLevels[j].sampai) : Infinity;

          // Overlap check: max(lowI, lowJ) <= min(highI, highJ)
          const overlapLow = Math.max(lowI, lowJ);
          const overlapHigh = Math.min(highI, highJ);

          if (overlapLow <= overlapHigh) {
            showToast(`Gagal: Interval tarif tidak valid! Level ${i + 1} dan Level ${j + 1} bertumpuk/bertabrakan.`, 'error');
            return;
          }
        }
      }
    }

    const payload: TarifRow = {
      id: cleanId,
      golongan: tarifInputGolongan.trim(),
      tipe: tarifInputTipe,
      tarifFlat: Number(tarifInputFlat) || 0,
      range1Max: tarifInputTipe === 'Bertingkat' ? (tarifInputLevels[0]?.sampai || 10) : 0,
      range1Tarif: tarifInputTipe === 'Bertingkat' ? (tarifInputLevels[0]?.tarif || 3000) : 0,
      range2Max: tarifInputTipe === 'Bertingkat' ? (tarifInputLevels[1]?.sampai || 20) : 0,
      range2Tarif: tarifInputTipe === 'Bertingkat' ? (tarifInputLevels[1]?.tarif || 3500) : 0,
      range3Tarif: tarifInputTipe === 'Bertingkat' ? (tarifInputLevels[2]?.tarif || tarifInputLevels[1]?.tarif || 5000) : 0,
      levels: tarifInputTipe === 'Bertingkat' ? JSON.stringify(tarifInputLevels) : undefined,
      status: 'Aktif'
    };

    setIsLoading(true);
    if (tarifEditId) {
      runGoogleScript(
        'updateTarif',
        payload,
        (resp) => {
          setIsLoading(false);
          if (resp.success) {
            showToast(resp.message, 'success');
            setTarifEditId(null);
            setTarifInputId('');
            setTarifInputGolongan('');
            setTarifInputLevels([{ dari: 0, sampai: 10, tarif: 3000 }]);
          }
        },
        (err) => {
          setIsLoading(false);
          showToast(`Gagal: ${err.message}`, 'error');
        }
      );
    } else {
      if (tarifs.some(t => t.id.toUpperCase() === cleanId)) {
        setIsLoading(false);
        showToast('Gagal: ID Tarif sudah digunakan!', 'error');
        return;
      }
      runGoogleScript(
        'saveTarif',
        payload,
        (resp) => {
          setIsLoading(false);
          if (resp.success) {
            showToast(resp.message, 'success');
            setTarifInputId('');
            setTarifInputGolongan('');
            setTarifInputLevels([{ dari: 0, sampai: 10, tarif: 3000 }]);
          }
        },
        (err) => {
          setIsLoading(false);
          showToast(`Gagal: ${err.message}`, 'error');
        }
      );
    }
  };

  const handleDeleteTarifClick = (id: string) => {
    if (!canPerformAction('ubahMasterData')) {
      showToast('Akses Ditolak: Anda tidak memiliki hak akses untuk menghapus data tarif!', 'error');
      return;
    }
    if (window.confirm('Yakin ingin menghapus data?')) {
      setIsLoading(true);
      runGoogleScript(
        'deleteTarif',
        id,
        (resp) => {
          setIsLoading(false);
          if (resp.success) {
            showToast(resp.message, 'success');
          }
        },
        (err) => {
          setIsLoading(false);
          showToast(`Gagal: ${err.message}`, 'error');
        }
      );
    }
  };

  const handleSaveAbonemenClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPerformAction('ubahMasterData')) {
      showToast('Akses Ditolak: Anda tidak memiliki hak akses untuk mengubah data abonemen!', 'error');
      return;
    }
    setIsLoading(true);
    runGoogleScript(
      'saveAbonemen',
      { nominal: Number(aboInputNominal) || 0, status: aboInputStatus },
      (resp) => {
        setIsLoading(false);
        if (resp.success) showToast(resp.message, 'success');
      },
      (err) => {
        setIsLoading(false);
        showToast(`Gagal: ${err.message}`, 'error');
      }
    );
  };

  const handleSaveDendaClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPerformAction('ubahMasterData')) {
      showToast('Akses Ditolak: Anda tidak memiliki hak akses untuk mengubah ketentuan denda!', 'error');
      return;
    }
    setIsLoading(true);
    runGoogleScript(
      'saveDenda',
      { status: dendaInputStatus, nominal: Number(dendaInputNominal) || 0, hariKeterlambatan: Number(dendaInputHari) || 0 },
      (resp) => {
        setIsLoading(false);
        if (resp.success) showToast(resp.message, 'success');
      },
      (err) => {
        setIsLoading(false);
        showToast(`Gagal: ${err.message}`, 'error');
      }
    );
  };

  const handleSaveUserClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser?.role === 'Petugas') {
      showToast('Akses Ditolak: Hanya Admin yang bisa mengelola user!', 'error');
      return;
    }

    const usernameClean = userInputUsername.trim().toLowerCase();
    if (usernameClean === 'superadmin' || userInputRole === 'SUPER_ADMIN') {
      showToast('Akses Ditolak: Tidak dapat memodifikasi akun Super Admin!', 'error');
      return;
    }
    const namaClean = userInputNama.trim();
    const passwordClean = userInputPassword.trim();

    if (!usernameClean || !namaClean) {
      showToast('Gagal: Username dan Nama wajib diisi!', 'error');
      return;
    }

    if (!userEditUsername && !passwordClean) {
      showToast('Gagal: Password wajib diisi untuk user baru!', 'error');
      return;
    }

    const finalAreaAkses = userInputRole === 'Admin' 
      ? 'ALL' 
      : userInputAreaAkses.includes('ALL') 
        ? 'ALL' 
        : userInputAreaAkses.length === 0 
          ? '' 
          : userInputAreaAkses.join(',');

    const payload: UserRow = {
      username: usernameClean,
      nama: namaClean,
      role: userInputRole,
      status: userInputStatus,
      areaAkses: finalAreaAkses,
    };
    if (passwordClean) {
      payload.password = passwordClean;
    }

    setIsLoading(true);
    if (userEditUsername) {
      runGoogleScript(
        'updateUser',
        payload,
        (resp) => {
          setIsLoading(false);
          if (resp.success) {
            showToast(resp.message, 'success');
            setUserEditUsername(null);
            setUserInputUsername('');
            setUserInputNama('');
            setUserInputPassword('');
            setUserInputRole(configDefaultRole);
            setUserInputStatus('Aktif');
            setUserInputAreaAkses(['ALL']);
          }
        },
        (err) => {
          setIsLoading(false);
          showToast(`Gagal: ${err.message}`, 'error');
        }
      );
    } else {
      if (users.some(u => u.username.toLowerCase() === usernameClean)) {
        setIsLoading(false);
        showToast('Gagal: Username sudah digunakan!', 'error');
        return;
      }
      runGoogleScript(
        'saveUser',
        payload,
        (resp) => {
          setIsLoading(false);
          if (resp.success) {
            showToast(resp.message, 'success');
            setUserInputUsername('');
            setUserInputNama('');
            setUserInputPassword('');
            setUserInputRole(configDefaultRole);
            setUserInputStatus('Aktif');
            setUserInputAreaAkses(['ALL']);
          }
        },
        (err) => {
          setIsLoading(false);
          showToast(`Gagal: ${err.message}`, 'error');
        }
      );
    }
  };

  const handleDeleteUserClick = (username: string) => {
    if (currentUser?.role === 'Petugas') {
      showToast('Akses Ditolak: Petugas tidak bisa menghapus data!', 'error');
      return;
    }
    if (username.toLowerCase() === 'superadmin') {
      showToast('Akses Ditolak: Tidak dapat menghapus akun Super Admin!', 'error');
      return;
    }
    if (currentUser?.username.toLowerCase() === username.toLowerCase()) {
      showToast('Gagal: Tidak dapat menghapus akun Anda sendiri!', 'error');
      return;
    }
    if (window.confirm('Yakin ingin menghapus data?')) {
      setIsLoading(true);
      runGoogleScript(
        'deleteUser',
        username,
        (resp) => {
          setIsLoading(false);
          if (resp.success) {
            showToast(resp.message, 'success');
          }
        },
        (err) => {
          setIsLoading(false);
          showToast(`Gagal: ${err.message}`, 'error');
        }
      );
    }
  };

  const handleResetUserPassword = (username: string) => {
    if (currentUser?.role === 'Petugas') {
      showToast('Akses Ditolak: Petugas tidak bisa mereset password!', 'error');
      return;
    }
    if (username.toLowerCase() === 'superadmin') {
      showToast('Akses Ditolak: Tidak dapat mengubah password Super Admin!', 'error');
      return;
    }
    const newPass = window.prompt(`Masukkan password baru untuk user "${username}":`);
    if (newPass === null) return; // user cancelled
    if (!newPass.trim()) {
      showToast('Password tidak boleh kosong!', 'error');
      return;
    }

    const u = users.find(usr => usr.username.toLowerCase() === username.toLowerCase());
    if (!u) return;

    const payload: UserRow = {
      ...u,
      password: newPass.trim()
    };

    setIsLoading(true);
    runGoogleScript(
      'updateUser',
      payload,
      (resp) => {
        setIsLoading(false);
        if (resp.success) {
          showToast(`Berhasil mereset password untuk ${username}!`, 'success');
        }
      },
      (err) => {
        setIsLoading(false);
        showToast(`Gagal: ${err.message}`, 'error');
      }
    );
  };

  const handleToggleUserStatus = (username: string) => {
    if (currentUser?.role === 'Petugas') {
      showToast('Akses Ditolak: Petugas tidak bisa mengubah status!', 'error');
      return;
    }
    if (username.toLowerCase() === 'superadmin') {
      showToast('Akses Ditolak: Tidak dapat menonaktifkan akun Super Admin!', 'error');
      return;
    }
    if (currentUser?.username.toLowerCase() === username.toLowerCase()) {
      showToast('Gagal: Tidak dapat menonaktifkan akun Anda sendiri!', 'error');
      return;
    }

    const u = users.find(usr => usr.username.toLowerCase() === username.toLowerCase());
    if (!u) return;

    const newStatus: 'Aktif' | 'Nonaktif' = u.status === 'Aktif' ? 'Nonaktif' : 'Aktif';
    const payload: UserRow = {
      ...u,
      status: newStatus
    };

    setIsLoading(true);
    runGoogleScript(
      'updateUser',
      payload,
      (resp) => {
        setIsLoading(false);
        if (resp.success) {
          showToast(`Status user ${username} diubah menjadi ${newStatus}!`, 'success');
        }
      },
      (err) => {
        setIsLoading(false);
        showToast(`Gagal: ${err.message}`, 'error');
      }
    );
  };

  // --- CAMERA AND WEBCAM FUNCTIONS ---
  const startWebcam = async (isEdit: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } 
      });
      if (isEdit) {
        setEditWebcamStream(stream);
        setShowEditWebcam(true);
        setTimeout(() => {
          if (editWebcamVideoRef.current) {
            editWebcamVideoRef.current.srcObject = stream;
          }
        }, 150);
      } else {
        setWebcamStream(stream);
        setShowWebcam(true);
        setTimeout(() => {
          if (webcamVideoRef.current) {
            webcamVideoRef.current.srcObject = stream;
          }
        }, 150);
      }
      addLog('info', 'Started raw device webcam stream using navigator.mediaDevices.getUserMedia.');
    } catch (err: any) {
      showToast(`Gagal mengakses kamera: ${err.message || err}`, 'error');
      addLog('error', `getUserMedia failed: ${err.message || err}`);
    }
  };

  const stopWebcam = (isEdit: boolean) => {
    if (isEdit) {
      if (editWebcamStream) {
        editWebcamStream.getTracks().forEach(track => track.stop());
        setEditWebcamStream(null);
      }
      setShowEditWebcam(false);
    } else {
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        setWebcamStream(null);
      }
      setShowWebcam(false);
    }
    addLog('info', 'Stopped camera stream.');
  };

  const capturePhoto = async (isEdit: boolean) => {
    const videoEl = isEdit ? editWebcamVideoRef.current : webcamVideoRef.current;
    if (!videoEl) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 640;
      canvas.height = videoEl.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const snapshotUrl = canvas.toDataURL('image/jpeg');

        // Compress webcam snapshot
        const res = await compressImage(snapshotUrl, {
          maxWidth: 1600,
          maxHeight: 1600,
          maxSizeKB: 200,
          mimeType: 'image/jpeg'
        });

        if (isEdit) {
          setEditReadingFoto(res.dataUrl);
          stopWebcam(true);
        } else {
          setMeterFotoPreview(res.dataUrl);
          stopWebcam(false);
        }
        showToast(`Foto webcam dikompresi (${res.compressedSizeKB} KB)`, 'success');
        addLog('success', res.message);
      }
    } catch (err: any) {
      showToast(`Gagal mengambil foto: ${err.message || err}`, 'error');
    }
  };

  const handleDesktopFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      showToast('Mengompresi gambar...', 'success');
      const res = await compressImage(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        maxSizeKB: 200,
        mimeType: 'image/jpeg'
      });

      if (isEdit) {
        setEditReadingFoto(res.dataUrl);
      } else {
        setMeterFotoPreview(res.dataUrl);
      }

      const toastMsg = res.isCompressed
        ? `Foto dikompresi: ${res.originalSizeKB} KB → ${res.compressedSizeKB} KB`
        : `Foto berhasil diunggah! (${res.compressedSizeKB} KB)`;
      showToast(toastMsg, 'success');
      addLog('success', res.message);
    } catch (err: any) {
      showToast(`Gagal memproses gambar: ${err.message || err}`, 'error');
    }
  };

  const handleMobilePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      showToast('Mengompresi foto kamera...', 'success');
      const res = await compressImage(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        maxSizeKB: 200,
        mimeType: 'image/jpeg'
      });

      if (isEdit) {
        setEditReadingFoto(res.dataUrl);
      } else {
        setMeterFotoPreview(res.dataUrl);
      }

      const toastMsg = res.isCompressed
        ? `Foto kamera dikompresi: ${res.originalSizeKB} KB → ${res.compressedSizeKB} KB`
        : `Foto kamera berhasil diambil! (${res.compressedSizeKB} KB)`;
      showToast(toastMsg, 'success');
      addLog('success', res.message);
    } catch (err: any) {
      showToast(`Gagal memproses foto kamera: ${err.message || err}`, 'error');
    }
  };

  const triggerMobileCamera = (isEdit: boolean) => {
    const el = document.getElementById(isEdit ? "edit-mobile-camera-input" : "mobile-camera-input");
    if (el) {
      el.click();
    }
  };

  // --- HANDLER: CATAT METER ---
  const handleSaveMeterReading = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPerformAction('catatMeter')) {
      showToast('Akses Ditolak: Anda tidak memiliki hak akses untuk mencatat meteran.', 'error');
      return;
    }
    if (!selectedMeterPelanggan || !inputMeterKini) {
      showToast('Pilih pelanggan dan masukkan angka meteran!', 'error');
      return;
    }

    if (!meterFotoPreview) {
      showToast('Foto meter wajib diambil.', 'error');
      return;
    }

    const p = pelanggan.find(cust => cust.noPelanggan === selectedMeterPelanggan);
    if (!p) return;

    // Check duplicate in same month and same year
    const todayWib = getWibDateString();
    const targetYearMonth = todayWib.substring(0, 7); // e.g. "2026-06"
    const hasDuplicate = readings.some(r => 
      r.noPelanggan === p.noPelanggan && 
      r.tglBaca && r.tglBaca.substring(0, 7) === targetYearMonth
    );

    if (hasDuplicate) {
      showToast('Catat meter bulan ini sudah dilakukan.', 'error');
      return;
    }

    // find latest reading to get meterLalu
    const lastReading = readings.find(r => r.noPelanggan === p.noPelanggan);
    const meterLalu = lastReading ? lastReading.meterKini : p.meterAwal;
    const meterKiniVal = Number(inputMeterKini);

    if (meterKiniVal < meterLalu) {
      showToast(`Angka meter baru (${meterKiniVal} m³) tidak boleh lebih rendah dari meter lalu (${meterLalu} m³)!`, 'error');
      return;
    }

    const usage = meterKiniVal - meterLalu;
    
    setIsLoading(true);

    // Flow: Save base64 image to Google Drive, then save link/URL to Google Sheets
    addLog('request', `google.script.run.uploadPhotoToDrive(base64Image, "METER_${p.noPelanggan}_${targetYearMonth}.jpg")`);
    
    setTimeout(() => {
      const simulatedFileId = `drive-file-${Date.now()}`;
      const simulatedDriveUrl = `https://drive.google.com/file/d/${simulatedFileId}/view`;
      
      addLog('success', `Returned uploadPhotoToDrive: Successfully uploaded image to Google Drive folder "PAMSDIGI_Bukti_Meter". File ID: ${simulatedFileId}. URL: ${simulatedDriveUrl}`);
      
      addLog('request', `google.script.run.saveMeterReading(${JSON.stringify({ 
        noPelanggan: p.noPelanggan, 
        meterKini: meterKiniVal,
        fotoUrl: simulatedDriveUrl 
      })})`);

      setTimeout(() => {
        setIsLoading(false);
        
        const newReading = {
          id: `R-${Date.now()}`,
          noPelanggan: p.noPelanggan,
          nama: p.nama,
          area: p.area,
          meterLalu,
          meterKini: meterKiniVal,
          usage,
          tglBaca: todayWib,
          foto: meterFotoPreview, // Keep base64 so it previews perfectly in browser!
          status: 'Belum Bayar' as const,
        };

        setReadings(prev => [newReading, ...prev]);

        // Generate the bill
        const t = tarifs.find(tr => tr.golongan === p.golongan) || tarifs[0] || ({ id: 'FALLBACK', golongan: p.golongan || 'Umum', tipe: 'Flat', tarifFlat: 3000, status: 'Aktif' } as TarifRow);
        const nominalAbo = abonemen.status === 'Aktif' ? abonemen.nominal : 0;
        const calcDetails = calculateBillingDetails(usage, t, nominalAbo, 0);
        const kubikasiBiaya = calcDetails.kubikasiBiaya;
        const totalAmount = calcDetails.total;

        const newBill = {
          id: `B-${Date.now()}`,
          noPelanggan: p.noPelanggan,
          nama: p.nama,
          area: p.area,
          meterLalu,
          meterKini: meterKiniVal,
          usage,
          kubikasiBiaya,
          abonemen: nominalAbo,
          denda: 0,
          total: totalAmount,
          status: 'Belum Bayar' as const,
          periode: 'Juni 2026',
          tglJatuhTempo: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        };

        // update billing state
        setBillingList(prev => [newBill, ...prev.filter(b => b.noPelanggan !== p.noPelanggan)]);

        showToast(`Sukses mencatat meteran untuk ${p.nama}: ${usage} m³ terbaca!`, 'success');
        addLog('success', `Returned saveMeterReading: Successfully saved meter reading row to Google Sheets database for Customer "${p.nama}" - usage ${usage} m³.`);

        // Reset form
        setSelectedMeterPelanggan('');
        setInputMeterKini('');
        setMeterFotoPreview(null);
        setIsAddReadingModalOpen(false);
      }, 500);
    }, 500);
  };

  const openEditReadingModal = (r: any) => {
    if (!configIzinkanEditMeter) {
      showToast('Akses Ditolak: Pengubahan data meter dinonaktifkan di pengaturan sistem!', 'error');
      return;
    }
    setEditingReading(r);
    setEditReadingMeterKini(String(r.meterKini));
    setEditReadingFoto(null); // Clear previous photo so they must take/upload a new one!
    setEditReadingAlasan('');
    setIsEditReadingModalOpen(true);
    addLog('info', `Opened edit meter modal for Customer "${r.nama}". Previous photo cleared. Re-upload mandatory.`);
  };

  const handleSaveEditReading = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReading) return;

    if (!editReadingFoto) {
      showToast('Foto meter wajib diambil.', 'error');
      return;
    }

    const newMeterKini = Number(editReadingMeterKini);
    if (isNaN(newMeterKini)) {
      showToast('Masukkan angka meter yang valid!', 'error');
      return;
    }

    const meterLalu = editingReading.meterLalu;
    if (newMeterKini < meterLalu) {
      showToast(`Angka meter baru (${newMeterKini} m³) tidak boleh lebih rendah dari meter lalu (${meterLalu} m³)!`, 'error');
      return;
    }

    const newUsage = Math.max(0, newMeterKini - meterLalu);
    const operatorName = currentUser?.nama || 'Petugas Lapangan';
    const todayWib = getWibDateString();

    const historyItem = {
      meterLama: editingReading.meterKini,
      meterBaru: newMeterKini,
      editedBy: operatorName,
      waktuEdit: new Date().toISOString().replace('T', ' ').slice(0, 19),
      alasanEdit: editReadingAlasan.trim() || 'Revisi data catat meter',
    };

    const updatedHistory = editingReading.history ? [...editingReading.history, historyItem] : [historyItem];

    setIsLoading(true);

    const targetYearMonth = todayWib.substring(0, 7);

    // Save edited photo to Google Drive, then save link/URL to Google Sheets
    addLog('request', `google.script.run.uploadPhotoToDrive(base64Image, "METER_${editingReading.noPelanggan}_${targetYearMonth}_EDIT.jpg")`);

    setTimeout(() => {
      const simulatedFileId = `drive-file-${Date.now()}`;
      const simulatedDriveUrl = `https://drive.google.com/file/d/${simulatedFileId}/view`;
      
      addLog('success', `Returned uploadPhotoToDrive: Successfully uploaded edited image to Google Drive folder "PAMSDIGI_Bukti_Meter". File ID: ${simulatedFileId}. URL: ${simulatedDriveUrl}`);
      
      addLog('request', `google.script.run.updateMeterReading(${JSON.stringify({ 
        readingId: editingReading.id,
        meterKini: newMeterKini,
        fotoUrl: simulatedDriveUrl,
        alasanEdit: editReadingAlasan
      })})`);

      setTimeout(() => {
        setIsLoading(false);

        // Update reading in list
        setReadings(prev => prev.map(r => {
          if (r.id === editingReading.id) {
            return {
              ...r,
              meterKini: newMeterKini,
              usage: newUsage,
              foto: editReadingFoto, // Keep base64 so it previews perfectly in browser!
              isEdited: true,
              tglBaca: todayWib, // update timestamp edit
              history: updatedHistory,
            };
          }
          return r;
        }));

        // Update corresponding bill
        setBillingList(prev => prev.map(b => {
          if (b.noPelanggan === editingReading.noPelanggan && b.periode === 'Juni 2026') {
            const p = pelanggan.find(cust => cust.noPelanggan === b.noPelanggan);
            const t = p ? (tarifs.find(tr => tr.golongan === p.golongan) || tarifs[0]) : tarifs[0];
            const nominalAbo = b.abonemen || (abonemen.status === 'Aktif' ? abonemen.nominal : 0);
            const nominalDenda = b.denda || 0;

            const calc = calculateBillingDetails(newUsage, t, nominalAbo, nominalDenda);

            return {
              ...b,
              meterLalu,
              meterKini: newMeterKini,
              usage: newUsage,
              kubikasiBiaya: calc.kubikasiBiaya,
              total: calc.total,
            };
          }
          return b;
        }));

        addLog('success', `Successfully updated and replaced meter reading row in Google Sheets database for "${editingReading.nama}" with new meter reading: ${newMeterKini} m³.`);
        showToast('Berhasil memperbarui catatan meter!', 'success');
        setIsEditReadingModalOpen(false);
        setEditingReading(null);
      }, 500);
    }, 500);
  };

  // --- HANDLER: GENERATE BILLS IN BULK ---
  const handleGenerateBillsBulk = () => {
    setIsGeneratingBills(true);
    addLog('request', `google.script.run.generateBillsBulk()`);

    setTimeout(() => {
      setIsGeneratingBills(false);
      let count = 0;
      
      const updatedBills = [...billingList];
      
      pelanggan.forEach(p => {
        const hasBill = updatedBills.some(b => b.noPelanggan === p.noPelanggan && b.periode === 'Juni 2026');
        if (!hasBill && p.status === 'Aktif') {
          // generate computed bill
          const lastReading = readings.find(r => r.noPelanggan === p.noPelanggan);
          const usage = lastReading ? lastReading.usage : Math.floor(Math.random() * 12) + 4; // simulated consumption
          
          const meterLalu = lastReading ? lastReading.meterLalu : p.meterAwal;
          const meterKini = lastReading ? lastReading.meterKini : (meterLalu + usage);

          const t = tarifs.find(tr => tr.golongan === p.golongan) || tarifs[0] || ({ id: 'FALLBACK', golongan: p.golongan || 'Umum', tipe: 'Flat', tarifFlat: 3000, status: 'Aktif' } as TarifRow);
          const nominalAbo = abonemen.status === 'Aktif' ? abonemen.nominal : 0;
          const calcDetails = calculateBillingDetails(usage, t, nominalAbo, 0);
          const kubikasiBiaya = calcDetails.kubikasiBiaya;
          const totalAmount = calcDetails.total;

          updatedBills.push({
            id: `B-${p.noPelanggan}-${Date.now()}`,
            noPelanggan: p.noPelanggan,
            nama: p.nama,
            area: p.area,
            meterLalu,
            meterKini,
            usage,
            kubikasiBiaya,
            abonemen: nominalAbo,
            denda: 0,
            total: totalAmount,
            status: 'Belum Bayar',
            periode: 'Juni 2026',
            tglJatuhTempo: '2026-06-25',
          });
          count++;
        }
      });

      setBillingList(updatedBills);
      showToast(`Sukses men-generate ${count} tagihan baru untuk periode Juni 2026!`, 'success');
      addLog('success', `Returned: Bulk billing generation succeeded. Created ${count} bills.`);
    }, 1200);
  };

  // --- HANDLER: BAYAR TAGIHAN (PAYMENT SETUP MODAL) ---
  const openPaymentSetupModal = (b: any) => {
    if (!canPerformAction('bayarTagihan')) {
      showToast('Akses Ditolak: Anda tidak memiliki hak akses untuk memproses pembayaran tagihan.', 'error');
      return;
    }
    setPayingBill(b);
    setPaymentMethod('Tunai');
    setIsPayModalOpen(true);
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPerformAction('bayarTagihan')) {
      showToast('Akses Ditolak: Anda tidak memiliki hak akses untuk memproses pembayaran tagihan.', 'error');
      return;
    }
    if (!payingBill) return;

    const billId = payingBill.id;
    const bill = billingList.find(b => b.id === billId);
    if (!bill) return;

    setIsLoading(true);
    addLog('request', `google.script.run.recordPayment("${billId}", "${paymentMethod}")`);

    setTimeout(() => {
      setIsLoading(false);

      // Update bill state
      setBillingList(prev => prev.map(b => b.id === billId ? { 
        ...b, 
        status: 'Lunas', 
        metodeBayar: paymentMethod, 
        tglBayar: new Date().toISOString().split('T')[0] 
      } : b));
      // Update reading state if exists
      setReadings(prev => prev.map(r => r.noPelanggan === bill.noPelanggan ? { ...r, status: 'Lunas' } : r));

      // Record transaction
      const newTx = {
        id: `T-${Date.now().toString().slice(-4)}`,
        tanggal: new Date().toISOString().split('T')[0],
        deskripsi: `Pembayaran Air No ${bill.noPelanggan} (${bill.nama}) via ${paymentMethod}`,
        tipe: 'Masuk' as const,
        jumlah: bill.total,
        area: bill.area || 'ALL',
        kategoriId: 'cat-1',
        kategori: 'Pembayaran Air',
      };
      setCashTransactions(prev => [newTx, ...prev]);

      showToast(`Pembayaran tagihan ${bill.nama} sukses divalidasi via ${paymentMethod}!`, 'success');
      addLog('success', `Returned payment status: recorded payment Rp ${bill.total.toLocaleString('id-ID')} via ${paymentMethod} for invoice "${billId}".`);
      
      // Auto-open receipt/struk modal!
      setSelectedBillForStruk({ 
        ...bill, 
        status: 'Lunas', 
        metodeBayar: paymentMethod, 
        tglBayar: new Date().toISOString().split('T')[0] 
      });

      setIsPayModalOpen(false);
      setPayingBill(null);
    }, 500);
  };

  // --- HANDLER: DOWNLOAD RECEIPT PDF (58mm / 80mm THERMAL SPRINT 2) ---
  const downloadReceiptPDF = (bill: any, size: '58mm' | '80mm') => {
    const p = pelanggan.find(cust => cust.noPelanggan === bill.noPelanggan);
    const t = p ? (tarifs.find(tr => tr.golongan === p.golongan) || tarifs[0]) : tarifs[0];
    const nominalAbo = bill.abonemen || 0;
    const nominalDenda = bill.denda || 0;
    const calc = calculateBillingDetails(bill.usage, t, nominalAbo, nominalDenda);

    const m_lalu = bill.meterLalu !== undefined ? bill.meterLalu : (p ? p.meterAwal : 0);
    const m_kini = bill.meterKini !== undefined ? bill.meterKini : (m_lalu + bill.usage);

    const width = size === '58mm' ? 58 : 80;
    // Estimate heights dynamically
    const breakdownCount = calc.breakdown.length;
    const height = 125 + (breakdownCount * 6) + (nominalDenda > 0 ? 6 : 0);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [width, height],
    });

    doc.setFont('courier', 'bold');
    doc.setFontSize(size === '58mm' ? 10 : 12);
    
    let y = 10;
    doc.text(systemNama.toUpperCase(), width / 2, y, { align: 'center' });
    y += size === '58mm' ? 4 : 5;
    
    doc.setFont('courier', 'normal');
    doc.setFontSize(size === '58mm' ? 7 : 9);
    doc.text(`PAMS Digital Air Bersih ${systemNamaDesa}`, width / 2, y, { align: 'center' });
    y += size === '58mm' ? 3 : 4;
    doc.text(`Hp: ${systemHp}`, width / 2, y, { align: 'center' });
    y += size === '58mm' ? 4 : 5;

    const lineChar = size === '58mm' ? '--------------------------------' : '--------------------------------------------';
    doc.text(lineChar, width / 2, y, { align: 'center' });
    y += size === '58mm' ? 4 : 5;

    const leftMargin = size === '58mm' ? 4 : 6;
    const rightMargin = size === '58mm' ? width - 4 : width - 6;

    const printRow = (label: string, value: string) => {
      doc.text(label, leftMargin, y);
      doc.text(value, rightMargin, y, { align: 'right' });
      y += size === '58mm' ? 3.5 : 4.5;
    };

    printRow('No Pel   :', bill.noPelanggan);
    printRow('Nama     :', bill.nama.substring(0, 18));
    printRow('Golongan :', p ? p.golongan : '-');
    printRow('Dusun    :', bill.area);
    printRow('Bulan    :', bill.periode || 'Juni 2026');
    printRow('Status   :', bill.status.toUpperCase());
    
    if (bill.tglBayar) {
      printRow('Tgl Bayar:', bill.tglBayar);
    }
    if (bill.metodeBayar) {
      printRow('Metode   :', bill.metodeBayar);
    }
    printRow('Petugas  :', currentUser?.nama || 'Petugas Kasir');

    doc.text(lineChar, width / 2, y, { align: 'center' });
    y += size === '58mm' ? 4 : 5;

    printRow('Meter Lalu:', `${m_lalu} m3`);
    printRow('Meter Kini:', `${m_kini} m3`);
    doc.setFont('courier', 'bold');
    printRow('Pemakaian :', `${bill.usage} m3`);
    doc.setFont('courier', 'normal');

    doc.text(lineChar, width / 2, y, { align: 'center' });
    y += size === '58mm' ? 4 : 5;

    doc.setFont('courier', 'bold');
    doc.text('RINCIAN TARIF:', leftMargin, y);
    y += size === '58mm' ? 4 : 5;
    doc.setFont('courier', 'normal');

    calc.breakdown.forEach(item => {
      printRow(`${item.level} :`, `${item.vol}x${item.rate.toLocaleString('id-ID')} = ${item.total.toLocaleString('id-ID')}`);
    });
    printRow('Abonemen :', `Rp ${nominalAbo.toLocaleString('id-ID')}`);
    if (nominalDenda > 0) {
      printRow('Denda    :', `Rp ${nominalDenda.toLocaleString('id-ID')}`);
    }

    doc.text(lineChar, width / 2, y, { align: 'center' });
    y += size === '58mm' ? 4 : 5;

    doc.setFont('courier', 'bold');
    doc.setFontSize(size === '58mm' ? 9 : 11);
    printRow('TOTAL    :', `Rp ${calc.total.toLocaleString('id-ID')}`);
    doc.setFontSize(size === '58mm' ? 7 : 9);
    doc.setFont('courier', 'normal');

    doc.text(lineChar, width / 2, y, { align: 'center' });
    y += size === '58mm' ? 5 : 6;

    doc.setFont('courier', 'bold');
    doc.text('*** LUNAS / PAID ***', width / 2, y, { align: 'center' });
    y += size === '58mm' ? 5 : 6;
    doc.setFont('courier', 'normal');

    doc.setFontSize(size === '58mm' ? 5 : 7);
    doc.text('Struk ini bukti pembayaran sah.', width / 2, y, { align: 'center' });
    y += size === '58mm' ? 3 : 4;
    
    const footerLines = doc.splitTextToSize(systemFooterStruk, width - 10);
    footerLines.forEach((fl: string) => {
      doc.text(fl, width / 2, y, { align: 'center' });
      y += size === '58mm' ? 2.5 : 3.5;
    });
    
    y += size === '58mm' ? 1.5 : 2.5;
    doc.text('PAMSDIGI SYSTEM v2.0', width / 2, y, { align: 'center' });

    const filename = `STRUK-${bill.noPelanggan}-${(bill.periode || 'Juni-2026').replace(' ', '-')}-${size}.pdf`;
    doc.save(filename);
    showToast(`Struk PDF (${size}) berhasil diunduh: ${filename}`, 'success');
    addLog('success', `PDF receipt downloaded for customer ${bill.nama} (${size})`);
  };

  // --- HANDLER: MANAGE CASH LEDGER ---
  const handleAddTransactionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPerformAction('catatKeuangan')) {
      showToast('Akses Ditolak: Anda tidak memiliki hak akses mencatat transaksi kas!', 'error');
      return;
    }

    if (!inputTransDeskripsi || !inputTransJumlah) {
      showToast('Harap isi deskripsi dan nominal transaksi!', 'error');
      return;
    }

    const cleanJumlah = Number(inputTransJumlah);
    if (isNaN(cleanJumlah) || cleanJumlah <= 0) {
      showToast('Nominal transaksi harus angka positif!', 'error');
      return;
    }

    const finalArea = inputTransArea || ((currentUser?.role === 'Admin' || currentUser?.role === 'SUPER_ADMIN') ? 'ALL' : (currentUser?.areaAkses?.split(',')[0] || 'ALL'));

    const matchedCategory = categories.find(c => c.id === inputTransKategoriId);
    const categoryName = matchedCategory ? matchedCategory.nama : (inputTransTipe === 'Masuk' ? 'Pemasukan Lain' : 'Operasional');

    const newTx = {
      id: `T-${Date.now().toString().slice(-4)}`,
      tanggal: inputTransTanggal,
      deskripsi: inputTransDeskripsi.trim(),
      tipe: inputTransTipe,
      jumlah: cleanJumlah,
      area: finalArea,
      kategoriId: inputTransKategoriId || (matchedCategory ? matchedCategory.id : ''),
      kategori: categoryName,
    };

    setCashTransactions(prev => [newTx, ...prev]);
    showToast(`Berhasil mencatat transaksi ${inputTransTipe}: ${inputTransDeskripsi.trim()}`, 'success');
    addLog('success', `Cashbook update: Added ${inputTransTipe} entry: "${inputTransDeskripsi.trim()}" (Kategori: ${categoryName}) in ${finalArea} - Rp ${cleanJumlah.toLocaleString('id-ID')}`);

    // Reset inputs
    setInputTransDeskripsi('');
    setInputTransJumlah('');
    setInputTransArea('');
  };

  // --- HANDLER: EDIT, DELETE, AUDIT CASH LEDGER TRANSACTIONS ---
  const handleOpenEditTransaction = (tx: any) => {
    if (!configIzinkanEditKas) {
      showToast('Akses Ditolak: Pengubahan transaksi kas dinonaktifkan di pengaturan sistem!', 'error');
      return;
    }
    if (currentUser?.role !== 'Admin' && currentUser?.role !== 'SUPER_ADMIN') {
      showToast('Akses Ditolak: Hanya Admin yang dapat mengedit transaksi kas!', 'error');
      return;
    }
    setEditingTransaction(tx);
    setEditTransDeskripsi(tx.deskripsi || '');
    setEditTransTipe(tx.tipe || 'Masuk');
    setEditTransKategoriId(tx.kategoriId || '');
    setEditTransTanggal(tx.tanggal || new Date().toISOString().split('T')[0]);
    setEditTransArea(tx.area || 'ALL');
    setEditTransJumlah(tx.jumlah ? String(tx.jumlah) : '');
    setIsEditTransModalOpen(true);
  };

  const handleSaveEditTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransaction) return;

    if (currentUser?.role !== 'Admin' && currentUser?.role !== 'SUPER_ADMIN') {
      showToast('Akses Ditolak: Hanya Admin yang dapat mengedit transaksi kas!', 'error');
      return;
    }

    if (!editTransDeskripsi.trim() || !editTransJumlah) {
      showToast('Harap isi deskripsi dan nominal transaksi!', 'error');
      return;
    }

    const cleanJumlah = Number(editTransJumlah);
    if (isNaN(cleanJumlah) || cleanJumlah <= 0) {
      showToast('Nominal transaksi harus angka positif!', 'error');
      return;
    }

    const matchedCategory = categories.find(c => c.id === editTransKategoriId);
    const categoryName = matchedCategory ? matchedCategory.nama : (editTransTipe === 'Masuk' ? 'Pemasukan Lain' : 'Operasional');

    // Compile change log
    const changes: string[] = [];
    if (editingTransaction.deskripsi !== editTransDeskripsi.trim()) {
      changes.push(`Mengubah deskripsi: "${editingTransaction.deskripsi}" → "${editTransDeskripsi.trim()}"`);
    }
    if (editingTransaction.tipe !== editTransTipe) {
      changes.push(`Mengubah jenis: ${editingTransaction.tipe} → ${editTransTipe}`);
    }
    if (editingTransaction.jumlah !== cleanJumlah) {
      changes.push(`Mengubah nominal: Rp ${editingTransaction.jumlah.toLocaleString('id-ID')} → Rp ${cleanJumlah.toLocaleString('id-ID')}`);
    }
    if (editingTransaction.kategoriId !== editTransKategoriId) {
      const oldCatName = categories.find(c => c.id === editingTransaction.kategoriId)?.nama || editingTransaction.kategori || 'Kas';
      const newCatName = categoryName;
      changes.push(`Mengubah kategori: ${oldCatName} → ${newCatName}`);
    }
    if (editingTransaction.area !== editTransArea) {
      changes.push(`Mengubah wilayah: ${editingTransaction.area || 'ALL'} → ${editTransArea}`);
    }
    if (editingTransaction.tanggal !== editTransTanggal) {
      changes.push(`Mengubah tanggal: ${editingTransaction.tanggal} → ${editTransTanggal}`);
    }

    if (changes.length === 0) {
      setIsEditTransModalOpen(false);
      setEditingTransaction(null);
      return;
    }

    const now = new Date();
    const formattedTimestamp = now.toLocaleString('id-ID', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).replace(/\//g, '/'); // format standard 28/06/2026 08:12

    const newHistoryItem = {
      user: currentUser?.nama || currentUser?.username || 'Admin',
      timestamp: formattedTimestamp,
      changeLog: changes.join(', ')
    };

    const updatedHistory = [...(editingTransaction.history || []), newHistoryItem];
    const editCount = (editingTransaction.editCount || 0) + 1;

    setCashTransactions(prev => prev.map(t => {
      if (t.id === editingTransaction.id) {
        return {
          ...t,
          deskripsi: editTransDeskripsi.trim(),
          tipe: editTransTipe,
          jumlah: cleanJumlah,
          kategoriId: editTransKategoriId,
          kategori: categoryName,
          tanggal: editTransTanggal,
          area: editTransArea,
          editCount,
          history: updatedHistory
        };
      }
      return t;
    }));

    showToast('Berhasil menyimpan perubahan transaksi kas', 'success');
    addLog('success', `Cashbook edit: Updated transaction ${editingTransaction.id} by Admin: ${changes.join(' | ')}`);
    setIsEditTransModalOpen(false);
    setEditingTransaction(null);
  };

  const handlePrintReport = (title: string, headers: string[], rows: any[][]) => {
    const printDiv = document.createElement('div');
    printDiv.id = 'pamsdigi-print-area';
    printDiv.className = 'absolute inset-0 bg-white z-50 p-8 flex flex-col text-slate-800 text-xs';
    
    printDiv.innerHTML = `
      <div class="flex justify-between items-center border-b-2 border-slate-900 pb-4 mb-6">
        <div>
          <h1 class="text-xl font-extrabold tracking-tight">KPSPAMS DESA MANDIRI</h1>
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-widest text-[9px]">PAMSDIGI - PENGELOLAAN AIR BERSIH PEDESAAN</p>
          <p class="text-[9px] text-slate-400 mt-1">Sistem Otomatis Akuntabilitas Lapangan &amp; Arus Kas</p>
        </div>
        <div class="text-right">
          <span class="inline-block border border-blue-600 text-blue-600 text-[10px] font-black px-3 py-1 rounded">PAMSDIGI SECURE</span>
          <p class="text-[9px] text-slate-400 mt-2">Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}</p>
        </div>
      </div>
      
      <div class="mb-4 text-center">
        <h2 class="text-sm font-black uppercase text-slate-800 tracking-wider">${title}</h2>
        <p class="text-[10px] text-slate-500 font-bold uppercase mt-0.5">Filter: Bulan: ${reportFilterBulan} | Tahun: ${reportFilterTahun} | Area: ${reportFilterArea} | Status: ${reportFilterStatus}</p>
      </div>

      <table class="w-full border-collapse border border-slate-300 text-[10px] my-4">
        <thead>
          <tr class="bg-slate-100">
            ${headers.map(h => `<th class="border border-slate-300 px-2 py-1.5 text-left font-extrabold uppercase text-slate-700">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr class="border-b border-slate-200">
              ${r.map(cell => `<td class="border border-slate-300 px-2 py-1.5 font-medium">${cell}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="mt-12 flex justify-between items-start">
        <div class="text-center w-40">
          <p class="text-[10px] text-slate-400">Mengetahui,</p>
          <p class="text-[10px] font-bold text-slate-800 mt-1">Kepala Dusun / KPSPAMS</p>
          <div class="h-16"></div>
          <p class="text-[10px] font-extrabold border-t border-slate-400 pt-1 text-slate-800">( ............................ )</p>
        </div>
        <div class="text-center w-40">
          <p class="text-[10px] text-slate-400">Dicetak Oleh,</p>
          <p class="text-[10px] font-bold text-slate-800 mt-1">Administrator PAMSDIGI</p>
          <div class="h-16"></div>
          <p class="text-[10px] font-extrabold border-t border-slate-400 pt-1 text-slate-800">( ${currentUser?.nama || 'Petugas'} )</p>
        </div>
      </div>
    `;

    document.body.appendChild(printDiv);
    window.print();
    setTimeout(() => {
      const el = document.getElementById('pamsdigi-print-area');
      if (el) el.remove();
    }, 1000);
  };

  const handleDownloadPDFReport = (title: string, headers: string[], rows: any[][]) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const width = 210;
    const margin = 15;
    let y = 15;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(systemNama.toUpperCase(), margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`PAMSDIGI - SISTEM DIGITAL PENGELOLAAN AIR BERSIH ${systemNamaDesa.toUpperCase()}`, margin, y);
    y += 4;
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')} | Dicetak oleh: ${currentUser?.nama || 'Admin'}`, margin, y);
    
    y += 3;
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.5);
    doc.line(margin, y, width - margin, y);
    y += 10;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(title.toUpperCase(), width / 2, y, { align: 'center' });
    y += 5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.text(`Filter: Bulan: ${reportFilterBulan} | Tahun: ${reportFilterTahun} | Area: ${reportFilterArea} | Status: ${reportFilterStatus}`, width / 2, y, { align: 'center' });
    y += 10;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    
    const colCount = headers.length;
    const colWidth = (width - (margin * 2)) / colCount;

    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y - 4, width - (margin * 2), 6, 'F');
    
    headers.forEach((h, idx) => {
      doc.text(h.substring(0, 15), margin + (idx * colWidth) + 1, y);
    });
    
    y += 4;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(margin, y - 1, width - margin, y - 1);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);

    rows.forEach((row) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
        doc.setFillColor(241, 245, 249);
        doc.rect(margin, y - 4, width - (margin * 2), 6, 'F');
        doc.setFont('helvetica', 'bold');
        headers.forEach((h, idx) => {
          doc.text(h.substring(0, 15), margin + (idx * colWidth) + 1, y);
        });
        y += 4;
        doc.line(margin, y - 1, width - margin, y - 1);
        doc.setFont('helvetica', 'normal');
      }

      row.forEach((cell, cellIdx) => {
        const textVal = String(cell);
        doc.text(textVal.substring(0, 18), margin + (cellIdx * colWidth) + 1, y);
      });

      y += 5;
      doc.line(margin, y - 1, width - margin, y - 1);
    });

    y += 12;
    if (y > 250) {
      doc.addPage();
      y = 25;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Mengetahui,', margin + 10, y);
    doc.text('Dicetak Oleh,', width - margin - 50, y);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text(`Ketua ${systemNama}`, margin + 10, y);
    doc.text('Administrator PAMSDIGI', width - margin - 50, y);
    
    y += 18;
    doc.text(`( ${systemKetua || '.........................................'} )`, margin + 10, y);
    doc.text(`( ${currentUser?.nama || 'Petugas'} )`, width - margin - 50, y);

    doc.save(`PAMSDIGI_Laporan_${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.pdf`);
    showToast(`PDF Laporan ${title} berhasil diunduh!`, 'success');
  };

  const handleExportExcelReport = (title: string, headers: string[], rows: any[][]) => {
    const data = rows.map((r) => {
      const obj: any = {};
      headers.forEach((h, idx) => {
        obj[h] = r[idx];
      });
      return obj;
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.writeFile(workbook, `PAMSDIGI_Laporan_${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast(`Excel Laporan ${title} berhasil diunduh!`, 'success');
  };

  const handleDeleteTransaction = (txId: string) => {
    if (!configIzinkanEditKas) {
      showToast('Akses Ditolak: Penghapusan transaksi kas dinonaktifkan di pengaturan sistem!', 'error');
      return;
    }
    if (currentUser?.role !== 'Admin' && currentUser?.role !== 'SUPER_ADMIN') {
      showToast('Akses Ditolak: Hanya Admin yang dapat menghapus transaksi kas!', 'error');
      return;
    }

    const match = cashTransactions.find(t => t.id === txId);
    if (!match) return;

    const confirmDelete = window.confirm(`Apakah Anda yakin ingin menghapus transaksi "${match.deskripsi}" senilai Rp ${match.jumlah.toLocaleString('id-ID')}? Tindakan ini tidak dapat dibatalkan.`);
    if (!confirmDelete) return;

    setCashTransactions(prev => prev.filter(t => t.id !== txId));
    showToast('Transaksi kas berhasil dihapus', 'success');
    addLog('success', `Cashbook delete: Deleted transaction ${txId} by Admin: "${match.deskripsi}" (Rp ${match.jumlah.toLocaleString('id-ID')})`);
  };

  const handleOpenAuditTrail = (tx: any) => {
    setSelectedTxDesc(tx.deskripsi || '');
    setSelectedTxHistory(tx.history || []);
    setIsAuditModalOpen(true);
  };

  // --- HANDLER: MANAGE CATEGORIES (AKUN TRANSAKSI SPRINT 2) ---
  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryInputNama.trim()) {
      showToast('Nama kategori tidak boleh kosong!', 'error');
      return;
    }

    if (currentUser?.role !== 'Admin' && currentUser?.role !== 'SUPER_ADMIN') {
      showToast('Akses Ditolak: Hanya Admin yang boleh mengelola kategori akun transaksi!', 'error');
      return;
    }

    if (editingCategory) {
      if (editingCategory.id === 'cat-1' && (categoryInputNama.trim() !== 'Pembayaran Air' || categoryInputTipe !== 'Masuk')) {
        showToast('Kategori utama Pembayaran Air tidak boleh diubah tipe atau namanya!', 'error');
        return;
      }

      setCategories(prev => prev.map(c => c.id === editingCategory.id ? { ...c, nama: categoryInputNama.trim(), tipe: categoryInputTipe } : c));
      showToast('Berhasil mengubah kategori akun transaksi', 'success');
      addLog('success', `Kategori update: Edited category: "${categoryInputNama.trim()}" (${categoryInputTipe})`);
      setEditingCategory(null);
    } else {
      const newCatId = `cat-${Date.now().toString().slice(-4)}`;
      const newCat = {
        id: newCatId,
        nama: categoryInputNama.trim(),
        tipe: categoryInputTipe,
      };
      setCategories(prev => [...prev, newCat]);
      showToast('Berhasil menambahkan kategori akun transaksi', 'success');
      addLog('success', `Kategori update: Added category: "${categoryInputNama.trim()}" (${categoryInputTipe})`);
    }

    setCategoryInputNama('');
    setCategoryInputTipe('Masuk');
  };

  const handleDeleteCategory = (catId: string) => {
    if (currentUser?.role !== 'Admin' && currentUser?.role !== 'SUPER_ADMIN') {
      showToast('Akses Ditolak: Hanya Admin yang boleh mengelola kategori akun transaksi!', 'error');
      return;
    }

    if (catId === 'cat-1') {
      showToast('Kategori utama "Pembayaran Air" tidak boleh dihapus!', 'error');
      return;
    }

    const inUse = cashTransactions.some(t => t.kategoriId === catId);
    if (inUse) {
      showToast('Kategori ini sedang digunakan dalam transaksi kas dan tidak bisa dihapus!', 'error');
      return;
    }

    const catToDelete = categories.find(c => c.id === catId);
    setCategories(prev => prev.filter(c => c.id !== catId));
    showToast('Kategori akun transaksi berhasil dihapus', 'success');
    addLog('success', `Kategori update: Deleted category: "${catToDelete?.nama}"`);
  };

  // Render Login view directly on full screen if not logged in
  if (!currentUser || currentView === 'login') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 p-4 font-sans text-slate-800 relative w-full">
        {/* TOAST NOTIFICATION */}
        {toast && (
          <div 
            className={`fixed top-10 left-1/2 transform -translate-x-1/2 w-[85%] max-w-sm px-4 py-2.5 rounded-xl shadow-xl text-white text-xs font-semibold z-50 flex items-center gap-2 animate-bounce ${
              toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
            }`}
          >
            <div className="p-1 rounded-full bg-white/20">
              {toast.type === 'success' ? <CheckCircle size={14} /> : <ShieldAlert size={14} />}
            </div>
            <span>{toast.message}</span>
          </div>
        )}

        {/* GLOBAL LOADING OVERLAY */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/80 z-50 flex flex-col justify-center items-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-blue-600 mb-3"></div>
            <p className="text-xs font-semibold text-slate-600 animate-pulse">Menghubungkan Spreadsheet...</p>
          </div>
        )}

        {/* Login Card */}
        <div className="w-full max-w-md bg-white rounded-3xl p-8 text-slate-850 shadow-2xl space-y-6 border border-slate-100">
          <div className="text-center">
            <div className="bg-blue-600 border border-blue-500 shadow-blue-500/30 p-3.5 rounded-2xl inline-block shadow-lg mb-3 animate-pulse">
              <Droplet className="text-white w-8 h-8" fill="white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">PAMSDIGI</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mt-1">
              PAMS Digital Indonesia • KPSPAMS & Pengelola Air Desa
            </p>
            <div className="h-[3px] w-10 mx-auto mt-2.5 rounded-full bg-blue-600"></div>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            {/* USERNAME */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Username</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                  <User size={16} />
                </span>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required 
                  autoComplete="off"
                  className="w-full bg-slate-50 pl-11 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition" 
                  placeholder="Masukkan username"
                />
              </div>
            </div>

            {/* PASSWORD */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                  <ShieldAlert size={16} />
                </span>
                <input 
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                  autoComplete="new-password"
                  className="w-full bg-slate-50 pl-11 pr-11 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition" 
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              className="w-full text-white font-bold py-3 px-4 rounded-xl text-xs transition duration-200 shadow-md cursor-pointer flex justify-center items-center gap-1.5 bg-blue-600 hover:bg-blue-700"
            >
              <Play size={12} fill="white" />
              Masuk Aplikasi
            </button>
          </form>

          <div className="text-center pt-3 border-t border-slate-100 text-[9px] text-slate-400 font-bold uppercase">
            <span>PAMS Digital Indonesia</span>
          </div>
        </div>

        {/* Developer Personal Branding */}
        <div className="mt-8 text-center space-y-2.5 max-w-xs">
          <div className="text-[10px] text-slate-500 font-medium tracking-wide leading-relaxed">
            Powered by<br />
            <span className="font-extrabold text-slate-400 text-xs tracking-wider uppercase">Sarana Multimedia Center (SMC)</span><br />
            <span className="text-slate-500 italic text-[10px]">Smart Digital Solution</span>
          </div>
          <div>
            <a 
              href="https://wa.me/6285331962077"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-700 hover:border-slate-500 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg text-[10px] font-bold tracking-wide transition duration-150 shadow-sm outline-none cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Hubungi Kami
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Render Full-Screen Responsive Web Dashboard
  return (
    <div id="pamsdigi-dashboard-layout" className="min-h-screen bg-slate-100 font-sans text-slate-800 flex overflow-hidden h-screen w-screen relative">
      
      {/* TOAST NOTIFICATION */}
      {toast && (
        <div 
          className={`fixed top-10 left-1/2 transform -translate-x-1/2 w-[85%] max-w-sm px-4 py-2.5 rounded-xl shadow-xl text-white text-xs font-semibold z-50 flex items-center gap-2 animate-bounce ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          <div className="p-1 rounded-full bg-white/20">
            {toast.type === 'success' ? <CheckCircle size={14} /> : <ShieldAlert size={14} />}
          </div>
          <span>{toast.message}</span>
        </div>
      )}

      {/* GLOBAL LOADING OVERLAY */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 z-50 flex flex-col justify-center items-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-blue-600 mb-3"></div>
          <p className="text-xs font-semibold text-slate-600 animate-pulse">Menghubungkan Spreadsheet...</p>
        </div>
      )}

      {/* LEFT SIDEBAR (Desktop) */}
      <aside className="w-64 bg-slate-900 text-white hidden md:flex flex-col h-full shrink-0 border-r border-slate-850">
        <div className="bg-gradient-to-br from-blue-700 to-indigo-900 p-5 border-b border-slate-800 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-md border border-white/20">
            {systemLogo ? (
              <img src={systemLogo} alt="Logo KPSPAMS" className="w-full h-full object-cover" />
            ) : (
              <div className="p-2 bg-blue-50 rounded-lg">
                <Droplet className="text-blue-600 w-5 h-5" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-black text-xs uppercase tracking-wider text-white leading-snug truncate">
              {systemNama}
            </h4>
            <span className="text-[8.5px] text-blue-100 font-bold block mt-0.5 leading-tight line-clamp-1 uppercase">
              {systemAlamat}
            </span>
          </div>
        </div>

        {/* Sidebar Nav List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-2 mb-2">Menu Utama</p>
          {[
            { view: 'dashboard', label: 'Dashboard', icon: <Home size={16} /> },
            { view: 'pelanggan', label: 'Pelanggan', icon: <Users size={16} /> },
            { view: 'catat-meter', label: 'Catat Meter', icon: <FileText size={16} /> },
            { view: 'tagihan', label: 'Tagihan', icon: <CreditCard size={16} /> },
            { view: 'keuangan', label: 'Keuangan', icon: <DollarSign size={16} /> },
            { view: 'laporan', label: 'Laporan', icon: <PieChart size={16} /> },
            { view: 'master-data', label: 'Master Data', icon: <Settings size={16} /> },
            { view: 'pengaturan', label: 'Pengaturan', icon: <Shield size={16} /> },
          ]
            .filter(item => isMenuVisible(item.view))
            .map((item) => (
            <button
              key={item.view}
              onClick={() => setCurrentView(item.view as any)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                currentView === item.view
                  ? 'bg-blue-600 text-white shadow-md font-bold'
                  : 'text-slate-400 hover:bg-slate-850 hover:text-slate-200'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}


        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
          >
            <LogOut size={16} />
            <span>Keluar / Logout</span>
          </button>
        </div>
      </aside>

      {/* MOBILE DRAWER SIDEBAR NAVIGATION OVERLAY */}
      {isDrawerOpen && (
        <div id="sidebar-drawer-overlay" className="fixed inset-0 bg-black/60 z-50 flex md:hidden animate-fade-in">
          <div className="w-72 bg-slate-900 text-white flex flex-col h-full animate-slide-right shadow-2xl">
            {/* Institution / KPSPAMS Profile inside Drawer */}
            <div className="bg-gradient-to-br from-blue-700 to-indigo-900 p-5 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-md border border-white/20">
                  {systemLogo ? (
                    <img src={systemLogo} alt="Logo KPSPAMS" className="w-full h-full object-cover" />
                  ) : (
                    <div className="p-1.5 bg-blue-50 rounded-lg">
                      <Droplet className="text-blue-600 w-4 h-4" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-black text-xs uppercase tracking-wider text-white leading-snug truncate">
                    {systemNama}
                  </h4>
                  <span className="text-[8px] text-blue-100 font-bold block mt-0.5 leading-none truncate uppercase">
                    {systemAlamat}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Navigation List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-2 mb-2">Menu Utama</p>
              {[
                { view: 'dashboard', label: 'Dashboard', icon: <Home size={16} /> },
                { view: 'pelanggan', label: 'Pelanggan', icon: <Users size={16} /> },
                { view: 'catat-meter', label: 'Catat Meter', icon: <FileText size={16} /> },
                { view: 'tagihan', label: 'Tagihan', icon: <CreditCard size={16} /> },
                { view: 'keuangan', label: 'Keuangan', icon: <DollarSign size={16} /> },
                { view: 'laporan', label: 'Laporan', icon: <PieChart size={16} /> },
                { view: 'master-data', label: 'Master Data', icon: <Settings size={16} /> },
                { view: 'pengaturan', label: 'Pengaturan', icon: <Shield size={16} /> },
              ]
                .filter(item => isMenuVisible(item.view))
                .map((item) => (
                <button
                  key={item.view}
                  onClick={() => {
                    setCurrentView(item.view as any);
                    setIsDrawerOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                    currentView === item.view
                      ? 'bg-blue-600 text-white shadow-md font-bold'
                      : 'text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}


            </div>

            {/* Drawer Footer / Logout Button */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 shrink-0">
              <button
                onClick={() => {
                  setIsDrawerOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
              >
                <LogOut size={16} />
                <span>Keluar / Logout</span>
              </button>
            </div>
          </div>
          <div className="flex-1 cursor-pointer" onClick={() => setIsDrawerOpen(false)}></div>
        </div>
      )}

      {/* RIGHT SIDE MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        
        {/* TOP NAVBAR */}
        <header id="app-header-bar" className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-xs shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-700 transition md:hidden cursor-pointer"
              title="Buka Menu"
            >
              <Menu size={20} />
            </button>
            <span className="text-lg font-black tracking-widest text-blue-600">PAMSDIGI</span>
            {configModeDemo && (
              <span className="text-[9px] font-black tracking-widest bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md uppercase">
                DEMO MODE
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {/* Offline Queue Badge with Quick Drain Action (jika ada transaksi offline tertunda) */}
            {offlineQueueCount > 0 && (
              <button
                onClick={handleDrainQueue}
                title="Ada transaksi saat offline. Klik untuk sinkronkan ke Spreadsheet sekarang."
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500 hover:bg-amber-600 text-white shadow-xs cursor-pointer animate-pulse transition"
              >
                <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
                <span>Antrean Offline ({offlineQueueCount})</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <h4 className="font-extrabold text-sm text-slate-800 leading-none truncate max-w-[160px]">
                {currentUser.nama}
              </h4>
              <span className="text-[10px] text-slate-500 font-bold block mt-1 leading-none uppercase tracking-wider">
                {currentUser.role}
              </span>
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-black uppercase shadow-sm border border-slate-100 shrink-0 select-none">
              {currentUser.nama.slice(0, 2)}
            </div>
          </div>
        </header>

        {/* MAIN FULL-WIDTH CONTENT BODY */}
        <main className="flex-1 bg-slate-50 overflow-y-auto p-6 md:p-8 min-w-0 relative">

          {/* --- NEW INTEGRATED VIEWS --- */}
          {currentView === 'spreadsheet' && (
            <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-xs space-y-4">
              <div className="border-b border-slate-200 pb-4">
                <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="text-emerald-600" size={24} />
                  Google Sheets Database Simulator
                </h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Simulasi interaktif tabel database Google Sheets. Semua perubahan data (create, update, delete) pada simulator aplikasi akan langsung tersinkronisasi ke baris sel spreadsheet di bawah ini secara real-time.
                </p>
              </div>
              <SpreadsheetView 
                users={users} 
                pelanggan={pelanggan}
                areas={areas}
                tarifs={tarifs}
                abonemen={abonemen}
                denda={denda}
                readings={readings}
                billingList={billingList}
                cashTransactions={cashTransactions}
                onAddUser={onAddUser}
                onUpdateUser={onUpdateUser}
                onDeleteUser={onDeleteUser}
                onAddPelanggan={onAddPelanggan}
                onDeletePelanggan={onDeletePelanggan}
                onAddArea={onAddArea}
                onUpdateArea={onUpdateArea}
                onDeleteArea={onDeleteArea}
                onAddTarif={onAddTarif}
                onUpdateTarif={onUpdateTarif}
                onDeleteTarif={onDeleteTarif}
                onUpdateAbonemen={onUpdateAbonemen}
                onUpdateDenda={onUpdateDenda}
                onResetData={onResetData}
                onRestoreAllData={onRestoreAllData}
                onRestoreTransactionalData={(r, b, c) => {
                  setReadings(r);
                  setBillingList(b);
                  setCashTransactions(c);
                }}
              />
            </div>
          )}

          {currentView === 'code' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-xs">
                <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                  <FileCode className="text-indigo-600" size={24} />
                  Google Apps Script Deployment Code
                </h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Salin seluruh kode aslinya di bawah ini dan tempelkan langsung ke lembar proyek Apps Script Anda. Pastikan nama file di Apps Script sama persis dengan tab file di bawah ini untuk menghubungkan aplikasi Anda ke Google Sheet asli.
                </p>
              </div>
              <CodeExporter />
            </div>
          )}

          {currentView === 'guide' && (
            <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-xs">
              <DeploymentGuide />
            </div>
          )}

          {/* --- OPERATIONAL VIEWS --- */}
            
            {/* IN-APP TOAST NOTIFICATION */}
            {toast && (
              <div 
                className={`fixed top-10 left-1/2 transform -translate-x-1/2 w-[85%] px-4 py-2.5 rounded-xl shadow-xl text-white text-xs font-semibold z-50 flex items-center gap-2 animate-bounce ${
                  toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
              >
                <div className="p-1 rounded-full bg-white/20">
                  {toast.type === 'success' ? <CheckCircle size={14} /> : <ShieldAlert size={14} />}
                </div>
                <span>{toast.message}</span>
              </div>
            )}

            {/* IN-APP GLOBAL LOADING OVERLAY */}
            {isLoading && (
              <div className="absolute inset-0 bg-white/80 z-50 flex flex-col justify-center items-center">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-blue-600 mb-3"></div>
                <p className="text-xs font-semibold text-slate-600 animate-pulse">Menghubungkan Spreadsheet...</p>
              </div>
            )}

            {/* --- VIEW: LOGIN --- */}
            {currentView === 'login' && (
              <div className="flex-1 flex flex-col justify-center px-5 py-8 bg-gradient-to-b from-blue-600 to-indigo-800 text-white fade-in h-full">
                <div className="text-center mb-6">
                  <div className="bg-white/10 p-3.5 rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-3 border border-white/20 shadow-inner">
                    <svg className="w-10 h-10 text-blue-200 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                  </div>
                  <h1 className="text-2xl font-black tracking-tight mb-0.5">PAMSDIGI</h1>
                  <p className="text-blue-200 text-[10px] font-bold uppercase tracking-wider">PAMS Digital Indonesia • Sprint 2</p>
                  <div className="h-[3px] w-8 bg-sky-400 mx-auto mt-2 rounded-full"></div>
                </div>

                {/* Login Card */}
                <div className="bg-white rounded-2xl p-5 text-slate-800 shadow-xl space-y-4">
                  <div className="text-center mb-1">
                    <h2 className="text-sm font-bold text-slate-800">Login KPSPAMS Desa</h2>
                    <p className="text-[10px] text-slate-400 mt-0.5">Gunakan Akun Pengelola yang Terdaftar</p>
                  </div>

                  <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Username</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                          <User size={14} />
                        </span>
                        <input 
                          type="text" 
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          required 
                          autoComplete="off"
                          className="w-full bg-slate-50 pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-1.5 focus:ring-blue-500 outline-none transition" 
                          placeholder="Masukkan username"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Password</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                          <ShieldAlert size={14} />
                        </span>
                        <input 
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required 
                          autoComplete="new-password"
                          className="w-full bg-slate-50 pl-9 pr-9 py-2 rounded-xl border border-slate-200 text-xs focus:ring-1.5 focus:ring-blue-500 outline-none transition" 
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                        >
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs hover:from-blue-700 hover:to-indigo-700 transition duration-200 shadow-md cursor-pointer flex justify-center items-center gap-1.5"
                    >
                      <Play size={12} fill="white" />
                      Masuk Aplikasi
                    </button>
                  </form>

                  <div className="text-center pt-2.5 border-t border-slate-100">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">PAMS Digital • KPSPAMS Indonesia</span>
                  </div>
                </div>

                {/* Info Credentials in app */}
                <div className="mt-4 bg-slate-900/40 p-2.5 rounded-xl border border-white/10 text-[9px] text-blue-200">
                  <p className="font-bold mb-0.5 text-sky-300">Akun Uji Coba (Beda Hak Akses):</p>
                  <div className="grid grid-cols-2 gap-1.5 font-mono">
                    <div>
                      <span className="text-slate-300 font-sans font-bold">Admin (Full Akses):</span><br />
                      <span className="font-bold text-white">admin</span> / <span className="text-slate-200">admin123</span>
                    </div>
                    <div>
                      <span className="text-slate-300 font-sans font-bold">Petugas (No Delete/Edit):</span><br />
                      <span className="font-bold text-white">petugas1</span> / <span className="text-slate-200">user123</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* --- OPERATIONAL VIEWS --- */}

            {/* --- VIEW: DASHBOARD (Operational Stats, Charts, Notifications only) --- */}
            {currentView === 'dashboard' && currentUser && (
              <div id="dashboard-view-panel" className="flex-1 flex flex-col fade-in bg-slate-50 overflow-y-auto">
                {/* Compact Date Top Bar */}
                <div className="bg-blue-900 text-white px-4 py-2.5 flex justify-end items-center text-[10px] font-mono font-black tracking-widest uppercase shrink-0 border-b border-blue-800">
                  28 - 06 - 2026
                </div>

                {/* 3. CARD MONITORING ARUS KAS */}
                <div className="px-4 py-2">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                    {/* Header Card */}
                    <div className="text-center mb-4">
                      <h4 className="text-[11px] font-black uppercase text-slate-800 tracking-widest">ARUS KAS</h4>
                      <div className="flex justify-center items-center gap-4 mt-1.5 text-[9px] font-bold text-slate-500">
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>
                          Pemasukan
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span>
                          Pengeluaran
                        </span>
                      </div>
                    </div>

                    {/* Chart & Table Container with horizontal scroll */}
                    <div className="overflow-x-auto select-none pb-2 scrollbar-thin">
                      <div className="min-w-[580px] px-1">
                        {/* Vertical Bar Chart */}
                        {(() => {
                          const monthlyCashFlow = Array.from({ length: 12 }, (_, i) => {
                            let income = 0;
                            let expense = 0;

                            // Add real-time transactions from myCashTransactions
                            myCashTransactions.forEach(t => {
                              const dateParts = t.tanggal.split('-');
                              if (dateParts.length === 3) {
                                const tYear = parseInt(dateParts[0]);
                                const tMonth = parseInt(dateParts[1]) - 1; // 0-indexed
                                if (tYear === 2026 && tMonth === i) {
                                  if (t.tipe === 'Masuk') {
                                    income += t.jumlah;
                                  } else if (t.tipe === 'Keluar') {
                                    expense += t.jumlah;
                                  }
                                }
                              }
                            });

                            return {
                              monthIndex: i,
                              monthName: ['Jan', 'Feb', 'Mar', 'April', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][i],
                              pemasukan: income,
                              pengeluaran: expense,
                            };
                          });

                          // Compute cumulative Saldo
                          let cumulativeBalance = 0;
                          const cashFlowWithSaldo = monthlyCashFlow.map(item => {
                            cumulativeBalance += (item.pemasukan - item.pengeluaran);
                            return {
                              ...item,
                              saldo: cumulativeBalance,
                            };
                          });

                          const maxValFlow = Math.max(...cashFlowWithSaldo.map(item => Math.max(item.pemasukan, item.pengeluaran)), 1000000);
                          return (
                            <>
                              <div className="h-44 flex items-end justify-between border-b border-slate-200 pb-2 relative px-2">
                                {/* Guideline Y-axis markers */}
                                <div className="absolute left-0 right-0 top-[20%] border-t border-dashed border-slate-100"></div>
                                <div className="absolute left-0 right-0 top-[50%] border-t border-dashed border-slate-100"></div>
                                <div className="absolute left-0 right-0 top-[80%] border-t border-dashed border-slate-100"></div>

                                {cashFlowWithSaldo.map((item, idx) => {
                                  const hIncome = (item.pemasukan / maxValFlow) * 90;
                                  const hExpense = (item.pengeluaran / maxValFlow) * 90;

                                  return (
                                    <div key={idx} className="flex flex-col items-center flex-1 h-full justify-end px-1 group">
                                      {/* Tooltip */}
                                      <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-slate-900 text-white text-[8px] font-bold py-1 px-2 rounded shadow-md pointer-events-none transition-all z-20 whitespace-nowrap">
                                        <span className="text-blue-400 font-extrabold">Pemasukan: Rp {item.pemasukan.toLocaleString('id-ID')}</span><br />
                                        <span className="text-rose-400 font-extrabold">Pengeluaran: Rp {item.pengeluaran.toLocaleString('id-ID')}</span>
                                      </div>

                                      {/* The side-by-side bars */}
                                      <div className="flex items-end gap-1 w-full justify-center h-full">
                                        {/* Income Bar (Blue) */}
                                        <div 
                                          style={{ height: `${Math.max(2, hIncome)}%` }} 
                                          className="w-3 sm:w-3.5 bg-blue-600 rounded-t-sm hover:opacity-85 transition-all duration-300 shadow-xs"
                                        ></div>
                                        {/* Expense Bar (Red) */}
                                        <div 
                                          style={{ height: `${Math.max(2, hExpense)}%` }} 
                                          className="w-3 sm:w-3.5 bg-rose-600 rounded-t-sm hover:opacity-85 transition-all duration-300 shadow-xs"
                                        ></div>
                                      </div>
                                      {/* Month label below bars */}
                                      <span className="text-[8px] font-extrabold text-slate-500 mt-1.5 uppercase">{item.monthName}</span>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Transposed Data Table */}
                              <div className="mt-3 border border-blue-200/60 rounded-xl overflow-hidden shadow-2xs">
                                <table className="w-full text-center border-collapse text-[9px] font-bold">
                                  <thead>
                                    {/* Month Headers */}
                                    <tr className="bg-blue-100/80 text-blue-800 border-b border-blue-200">
                                      <td className="px-2 py-1.5 text-left border-r border-blue-200 font-extrabold uppercase bg-blue-200/60 text-[8px] w-20">Bulan</td>
                                      {cashFlowWithSaldo.map((item, idx) => (
                                        <td key={idx} className="px-1.5 py-1.5 border-r border-blue-200 font-black">{item.monthName}</td>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {/* Pemasukan row */}
                                    <tr className="bg-blue-50/40 text-blue-900 border-b border-blue-200/60">
                                      <td className="px-2 py-1.5 text-left border-r border-blue-200 font-extrabold uppercase bg-blue-100/40 text-[8px]">Pemasukan</td>
                                      {cashFlowWithSaldo.map((item, idx) => (
                                        <td key={idx} className={`px-1.5 py-1.5 border-r border-blue-200/60 font-mono ${item.pemasukan > 0 ? 'text-blue-700 font-extrabold' : 'text-slate-400 font-medium'}`}>
                                          {item.pemasukan > 0 ? item.pemasukan.toLocaleString('id-ID') : '-'}
                                        </td>
                                      ))}
                                    </tr>
                                    {/* Pengeluaran row */}
                                    <tr className="bg-rose-50/10 text-rose-900 border-b border-blue-200/60">
                                      <td className="px-2 py-1.5 text-left border-r border-blue-200 font-extrabold uppercase bg-blue-100/40 text-[8px]">Pengeluaran</td>
                                      {cashFlowWithSaldo.map((item, idx) => (
                                        <td key={idx} className={`px-1.5 py-1.5 border-r border-blue-200/60 font-mono ${item.pengeluaran > 0 ? 'text-rose-600 font-extrabold' : 'text-slate-400 font-medium'}`}>
                                          {item.pengeluaran > 0 ? item.pengeluaran.toLocaleString('id-ID') : '-'}
                                        </td>
                                      ))}
                                    </tr>
                                    {/* Saldo row */}
                                    <tr className="bg-emerald-50/20 text-emerald-950 font-black">
                                      <td className="px-2 py-1.5 text-left border-r border-blue-200 font-extrabold uppercase bg-blue-100/40 text-[8px]">Saldo</td>
                                      {cashFlowWithSaldo.map((item, idx) => (
                                        <td key={idx} className="px-1.5 py-1.5 border-r border-blue-200/60 font-mono text-emerald-700">
                                          {item.saldo.toLocaleString('id-ID')}
                                        </td>
                                      ))}
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. MONITORING PELANGGAN PER AREA/DUSUN */}
                <div className="px-4 py-2">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                    {(() => {
                      const areaMonitoringData = areas.filter(a => isAreaAccessible(a.nama)).map(a => {
                        const areaName = a.nama;
                        const areaCustomers = myPelanggan.filter(p => p.area === areaName);
                        const aktifCount = areaCustomers.filter(p => p.status === 'Aktif').length;
                        const nonaktifCount = areaCustomers.filter(p => p.status === 'Nonaktif').length;
                        const totalCount = areaCustomers.length;

                        // Filter bills of the current month ('Juni 2026') for this area
                        const areaBills = myBillingList.filter(b => b.area === areaName && b.periode === 'Juni 2026');
                        const lunasCount = areaBills.filter(b => b.status === 'Lunas').length;
                        const belumBayarCount = areaBills.filter(b => b.status === 'Belum Bayar' && b.denda === 0).length;
                        const nunggakCount = areaBills.filter(b => b.status === 'Menunggak' || (b.status === 'Belum Bayar' && b.denda > 0)).length;

                        return {
                          area: areaName,
                          aktif: aktifCount,
                          nonaktif: nonaktifCount,
                          total: totalCount,
                          lunas: lunasCount,
                          belumBayar: belumBayarCount,
                          nunggak: nunggakCount,
                        };
                      });

                      // Sum totals
                      const totalMetrics = {
                        aktif: areaMonitoringData.reduce((sum, item) => sum + item.aktif, 0),
                        nonaktif: areaMonitoringData.reduce((sum, item) => sum + item.nonaktif, 0),
                        total: areaMonitoringData.reduce((sum, item) => sum + item.total, 0),
                        lunas: areaMonitoringData.reduce((sum, item) => sum + item.lunas, 0),
                        belumBayar: areaMonitoringData.reduce((sum, item) => sum + item.belumBayar, 0),
                        nunggak: areaMonitoringData.reduce((sum, item) => sum + item.nunggak, 0),
                      };

                      return (
                        <>
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="text-[11px] font-black uppercase text-blue-700 tracking-wider">Monitoring Pelanggan</h4>
                            <span className="text-[9px] font-extrabold text-blue-500 uppercase tracking-widest bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200/50">
                              Periode: Juni 2026
                            </span>
                          </div>

                          <div className="overflow-x-auto scrollbar-thin pb-1">
                            <table className="w-full border-collapse text-[10px] select-none text-center font-bold min-w-[500px]">
                              <thead>
                                <tr className="text-white text-[9px] font-extrabold uppercase">
                                  {/* Blue heading for Data Pelanggan */}
                                  <th className="bg-blue-600 border border-slate-200 px-2 py-2 text-left rounded-tl-xl">Data Pelanggan</th>
                                  {/* Coral/pink headings for details */}
                                  <th className="bg-rose-400 border border-slate-200 px-1 py-2">Aktif</th>
                                  <th className="bg-rose-400 border border-slate-200 px-1 py-2">Non Aktif</th>
                                  <th className="bg-rose-400 border border-slate-200 px-1 py-2">Jumlah</th>
                                  <th className="bg-rose-400 border border-slate-200 px-1 py-2">Lunas</th>
                                  <th className="bg-rose-400 border border-slate-200 px-1 py-2">Blm.Lunas</th>
                                  <th className="bg-rose-400 border border-slate-200 px-1 py-2 rounded-tr-xl">Nunggak</th>
                                </tr>
                              </thead>
                              <tbody>
                                {/* Row 1: Total Pelanggan (Sum totals) exactly like reference */}
                                <tr className="bg-rose-50 text-slate-900 border-b border-slate-200 font-extrabold">
                                  <td className="border border-slate-200 px-2 py-2 text-left font-black">Total Pelanggan</td>
                                  <td className="border border-slate-200 px-1 py-2 text-slate-800">{totalMetrics.aktif}</td>
                                  <td className="border border-slate-200 px-1 py-2 text-slate-500">{totalMetrics.nonaktif}</td>
                                  <td className="border border-slate-200 px-1 py-2 text-indigo-900 font-black">{totalMetrics.total}</td>
                                  <td className="border border-slate-200 px-1 py-2 text-emerald-700">{totalMetrics.lunas}</td>
                                  <td className="border border-slate-200 px-1 py-2 text-amber-600">{totalMetrics.belumBayar}</td>
                                  <td className="border border-slate-200 px-1 py-2 text-rose-600">{totalMetrics.nunggak}</td>
                                </tr>

                                {/* Area rows */}
                                {areaMonitoringData.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50/50 text-slate-700 border-b border-slate-200 transition">
                                    <td className="border border-slate-200 px-2 py-2 text-left font-extrabold text-slate-800">📍 Dusun {item.area}</td>
                                    <td className="border border-slate-200 px-1 py-2 text-slate-800 bg-rose-50/20">{item.aktif}</td>
                                    <td className="border border-slate-200 px-1 py-2 text-slate-500 bg-rose-50/20">{item.nonaktif}</td>
                                    <td className="border border-slate-200 px-1 py-2 text-slate-900 font-extrabold bg-rose-50/20">{item.total}</td>
                                    <td className="border border-slate-200 px-1 py-2 text-emerald-700 bg-rose-50/20">{item.lunas}</td>
                                    <td className="border border-slate-200 px-1 py-2 text-amber-600 bg-rose-50/20">{item.belumBayar}</td>
                                    <td className="border border-slate-200 px-1 py-2 text-rose-600 bg-rose-50/20">{item.nunggak}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* 5. MONITORING STATUS PEMBAYARAN PER AREA (RUPIAH) */}
                <div className="px-4 py-2">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                    {(() => {
                      const areaPaymentData = areas.filter(a => isAreaAccessible(a.nama)).map(a => {
                        const areaName = a.nama;
                        const areaBills = myBillingList.filter(b => b.area === areaName && b.periode === 'Juni 2026');
                        
                        const lunasRp = areaBills.filter(b => b.status === 'Lunas').reduce((sum, b) => sum + b.total, 0);
                        const belumBayarRp = areaBills.filter(b => b.status === 'Belum Bayar' && b.denda === 0).reduce((sum, b) => sum + b.total, 0);
                        const nunggakRp = areaBills.filter(b => b.status === 'Menunggak' || (b.status === 'Belum Bayar' && b.denda > 0)).reduce((sum, b) => sum + b.total, 0);

                        return {
                          area: areaName,
                          lunas: lunasRp,
                          belumBayar: belumBayarRp,
                          nunggak: nunggakRp,
                        };
                      });

                      const paymentTotals = {
                        lunas: areaPaymentData.reduce((sum, item) => sum + item.lunas, 0),
                        belumBayar: areaPaymentData.reduce((sum, item) => sum + item.belumBayar, 0),
                        nunggak: areaPaymentData.reduce((sum, item) => sum + item.nunggak, 0),
                      };

                      return (
                        <div className="overflow-x-auto scrollbar-thin pb-1">
                          <table className="w-full border-collapse text-[10px] select-none text-center font-bold min-w-[500px]">
                            <thead>
                              <tr className="text-white text-[9px] font-extrabold uppercase">
                                <th className="bg-slate-500 border border-slate-200 px-2 py-2 text-left rounded-tl-xl">Status Pembayaran</th>
                                <th className="bg-sky-400 text-sky-950 border border-slate-200 px-1 py-2">Lunas (Rp)</th>
                                <th className="bg-amber-300 text-amber-950 border border-slate-200 px-1 py-2">Belum Bayar (Rp)</th>
                                <th className="bg-rose-400 text-rose-950 border border-slate-200 px-1 py-2 rounded-tr-xl">Nunggak (Rp)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {/* Row 1: Total Row (Grey bg) */}
                              <tr className="bg-slate-300 text-slate-900 border-b border-slate-200 font-extrabold">
                                <td className="border border-slate-200 px-2 py-2 text-left font-black uppercase text-[9px]">Total</td>
                                <td className="border border-slate-200 px-1 py-2 font-mono text-slate-900">Rp {paymentTotals.lunas.toLocaleString('id-ID')}</td>
                                <td className="border border-slate-200 px-1 py-2 font-mono text-amber-900">Rp {paymentTotals.belumBayar.toLocaleString('id-ID')}</td>
                                <td className="border border-slate-200 px-1 py-2 font-mono text-rose-950">Rp {paymentTotals.nunggak.toLocaleString('id-ID')}</td>
                              </tr>

                              {/* Area rows with styled cell backgrounds matching reference exactly */}
                              {areaPaymentData.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 border-b border-slate-200 transition">
                                  <td className="border border-slate-200 px-2 py-2 text-left font-extrabold text-slate-800">📍 Dusun {item.area}</td>
                                  {/* Blue pill bg */}
                                  <td className="border border-slate-200 px-1.5 py-2 text-sky-900 bg-sky-100/90 font-mono">
                                    Rp {item.lunas.toLocaleString('id-ID')}
                                  </td>
                                  {/* Yellow pill bg */}
                                  <td className="border border-slate-200 px-1.5 py-2 text-amber-900 bg-amber-100/90 font-mono">
                                    Rp {item.belumBayar.toLocaleString('id-ID')}
                                  </td>
                                  {/* Red pill bg */}
                                  <td className="border border-slate-200 px-1.5 py-2 text-rose-900 bg-rose-100/90 font-mono">
                                    Rp {item.nunggak.toLocaleString('id-ID')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* 6. MONITORING PEMAKAIAN AIR */}
                <div className="px-4 py-2 pb-6">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-[11px] font-black uppercase text-blue-700 tracking-wider">Monitoring Pemakaian Air</h4>
                      <span className="text-[9px] font-extrabold text-blue-500 uppercase tracking-widest bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200/50">
                        Periode: 2026
                      </span>
                    </div>

                    {(() => {
                      const monthlyWaterUsage = Array.from({ length: 12 }, (_, i) => {
                        let volume = 0;

                        // Add real-time usage from myReadings for index matching month
                        myReadings.forEach(r => {
                          if (r.periode) {
                            const parts = r.periode.split(' ');
                            if (parts.length === 2 && parts[1] === '2026') {
                              const mName = parts[0];
                              const mIdx = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].indexOf(mName);
                              if (mIdx === i) {
                                volume += r.usage;
                              }
                            }
                          }
                        });

                        return {
                          monthIndex: i,
                          monthName: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][i],
                          shortName: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][i],
                          volume,
                        };
                      });

                      const activeMonths = monthlyWaterUsage.filter(m => m.volume > 0);
                      const totalWaterUsage = monthlyWaterUsage.reduce((sum, m) => sum + m.volume, 0);
                      const avgWaterUsage = activeMonths.length > 0 ? Math.round(totalWaterUsage / activeMonths.length) : 0;

                      const barColors = [
                        'bg-sky-400',
                        'bg-indigo-300',
                        'bg-slate-400',
                        'bg-purple-500',
                        'bg-rose-500',
                        'bg-amber-800',
                        'bg-orange-400',
                        'bg-blue-400',
                        'bg-teal-400',
                        'bg-indigo-400',
                        'bg-violet-400',
                        'bg-amber-500',
                      ];

                      return (
                        <div className="flex flex-col gap-3">
                          {/* Full-width Bar Chart Container */}
                          <div className="border border-slate-150 rounded-xl p-3 bg-slate-50/50 w-full">
                            <div className="overflow-x-auto select-none pb-1 scrollbar-thin">
                              <div className="min-w-[340px] px-1">
                                {(() => {
                                  const maxUsage = Math.max(...monthlyWaterUsage.map(m => m.volume), 10);
                                  return (
                                    <div className="h-44 flex items-end justify-between border-b border-slate-200 pb-1.5 relative px-1 pt-6">
                                      {/* Guidelines */}
                                      <div className="absolute left-0 right-0 top-[25%] border-t border-dashed border-slate-200/60"></div>
                                      <div className="absolute left-0 right-0 top-[50%] border-t border-dashed border-slate-200/60"></div>
                                      <div className="absolute left-0 right-0 top-[75%] border-t border-dashed border-slate-200/60"></div>

                                      {monthlyWaterUsage.map((m, idx) => {
                                        const pctHeight = (m.volume / maxUsage) * 85;
                                        const colorClass = barColors[idx] || 'bg-blue-400';

                                        return (
                                          <div key={idx} className="flex flex-col items-center flex-1 h-full justify-end group px-0.5 relative">
                                            {/* Tooltip */}
                                            <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-slate-900 text-white text-[8px] font-bold py-1 px-1.5 rounded shadow pointer-events-none transition-all z-20 whitespace-nowrap">
                                              {m.monthName}: {m.volume.toLocaleString('id-ID')} m³
                                            </div>

                                            {/* Bar with dynamic height and specified bar color */}
                                            <div 
                                              style={{ height: `${Math.max(2, pctHeight)}%` }}
                                              className={`w-3.5 sm:w-4.5 rounded-t-sm ${colorClass} hover:opacity-85 transition-all duration-300 shadow-3xs cursor-pointer relative`}
                                            >
                                              {/* Value label on top of bar */}
                                              {m.volume > 0 && (
                                                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 text-[7.5px] sm:text-[8.5px] font-black text-slate-800 bg-white/95 px-1 rounded border border-slate-200/60 shadow-3xs whitespace-nowrap tracking-tighter">
                                                  {m.volume.toLocaleString('id-ID')}
                                                </div>
                                              )}
                                            </div>

                                            <span className="text-[7.5px] font-black text-slate-500 mt-1 uppercase tracking-tighter">{m.shortName}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>

                          {/* Total Volume Pemakaian Air label underneath */}
                          <div className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1 px-1">
                            <span>Total Pemakaian Air :</span>
                            <span className="text-slate-900 font-mono font-black">{totalWaterUsage.toLocaleString('id-ID')} M3</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

              </div>
            )}

            {/* --- VIEW: PELANGGAN (Stable complete customer list with Excel actions) --- */}
            {currentView === 'pelanggan' && (
              <div id="pelanggan-view-panel" className="flex-1 flex flex-col fade-in h-full bg-slate-50">
                <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between sticky top-0 z-10 shadow-3xs">
                  <div>
                    <h2 className="font-extrabold text-slate-800 text-sm">Data Pelanggan</h2>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">KPSPAMS Desa</p>
                  </div>
                  {canPerformAction('tambahPelanggan') && (
                    <button 
                      onClick={openAddModal}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] px-3 py-1.5 rounded-lg transition flex items-center gap-1 shadow-sm cursor-pointer"
                    >
                      <Plus size={12} />
                      Baru
                    </button>
                  )}
                </div>

                <div className="p-3 bg-white border-b border-slate-200 flex flex-col gap-2">
                  {/* Search Bar */}
                  <div className="relative w-full">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <Search size={14} />
                    </span>
                    <input 
                      type="text" 
                      placeholder="Cari nama, No. Pelanggan..." 
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="w-full bg-slate-50 pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-1.5 focus:ring-blue-500 outline-none transition"
                    />
                  </div>

                  {/* Area/Dusun Filter */}
                  <div className="flex gap-2">
                    <select
                      value={pelangganFilterArea}
                      onChange={(e) => setPelangganFilterArea(e.target.value)}
                      className="flex-1 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-1.5 focus:ring-blue-500 outline-none font-bold"
                    >
                      <option value="Semua">Semua Wilayah</option>
                      {areas.filter(a => isAreaAccessible(a.nama)).map(a => <option key={a.id} value={a.nama}>{a.nama}</option>)}
                    </select>
                  </div>

                  {/* Excel Import/Export stays robust and stable! */}
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-1">
                    <button
                      onClick={handleExportExcel}
                      className="flex-1 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 border border-emerald-200/80 text-[10px] font-black px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 transition shadow-2xs cursor-pointer shrink-0"
                    >
                      <FileSpreadsheet size={12} className="text-emerald-600" />
                      Export Excel
                    </button>
                    
                    <button
                      onClick={handleDownloadTemplate}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 border border-slate-200 text-[10px] font-black px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 transition shadow-2xs cursor-pointer shrink-0"
                    >
                      <Download size={12} className="text-slate-500" />
                      Template
                    </button>

                    <label className="flex-1 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-800 border border-blue-200/80 text-[10px] font-black px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 transition shadow-2xs cursor-pointer shrink-0">
                      <Upload size={12} className="text-blue-600" />
                      Import
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept=".xlsx, .xls"
                        onChange={handleImportExcelFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Customer List Container */}
                <div className="p-3 flex-1 overflow-y-auto space-y-2.5">
                  {(() => {
                    const finalFiltered = filteredPelanggan.filter(p => pelangganFilterArea === 'Semua' || p.area === pelangganFilterArea);
                    if (finalFiltered.length === 0) {
                      return (
                        <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                          <User size={28} className="text-slate-300 mx-auto mb-2" />
                          <p className="text-xs text-slate-400 font-medium">Pelanggan tidak ditemukan.</p>
                        </div>
                      );
                    }
                    return finalFiltered.map((p) => (
                      <div 
                        key={p.noPelanggan} 
                        className="bg-white rounded-xl p-3 border border-slate-200/60 shadow-xs flex justify-between items-start gap-2 hover:border-slate-300 transition duration-150"
                      >
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{p.noPelanggan}</span>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                              (p.status || 'Aktif') === 'Aktif' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {String(p.status || 'Aktif').toUpperCase()}
                            </span>
                          </div>
                          
                          <h4 className="font-extrabold text-slate-800 text-xs leading-snug">{p.nama}</h4>
                          
                          <div className="text-[10px] text-slate-500 flex items-center gap-1">
                            <MapPin size={11} className="text-slate-400 shrink-0" />
                            <span className="truncate">{p.area} • {p.alamat}</span>
                          </div>

                          <div className="text-[10px] text-slate-400 grid grid-cols-2 gap-1 pt-1 border-t border-slate-50">
                            <div>Golongan: <span className="font-bold text-slate-600">{p.golongan}</span></div>
                            <div>Meter Awal: <span className="font-bold text-slate-600">{p.meterAwal} m³</span></div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 self-center">
                          {canPerformAction('editPelanggan') && (
                            <button 
                              onClick={() => openEditModal(p)}
                              title="Edit Pelanggan"
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            >
                              <Edit size={13} />
                            </button>
                          )}
                          {canPerformAction('hapusPelanggan') && (
                            <button 
                              onClick={() => {
                                if (window.confirm(`Yakin ingin menghapus data pelanggan ${p.nama} (${p.noPelanggan})?`)) {
                                  setIsLoading(true);
                                  runGoogleScript('deletePelanggan', p.noPelanggan, (resp) => {
                                    setIsLoading(false);
                                    if (resp.success) {
                                      showToast(resp.message || 'Pelanggan berhasil dihapus!', 'success');
                                      refreshStats();
                                    } else {
                                      showToast(resp.message || 'Gagal menghapus pelanggan', 'error');
                                    }
                                  });
                                }
                              }}
                              title="Hapus Pelanggan"
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* --- VIEW: CATAT METER (Operator field tool for recording monthly meter dials) --- */}
            {currentView === 'catat-meter' && (
              <div id="catat-meter-view-panel" className="flex-1 flex flex-col fade-in h-full bg-slate-50">
                {/* Header halaman */}
                <div className="bg-white border-b border-slate-200 px-4 py-2.5 sticky top-0 z-10 shadow-3xs flex items-center justify-between">
                  <div>
                    <h2 className="font-extrabold text-slate-800 text-sm tracking-tight">CATAT METER AIR</h2>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider truncate max-w-[200px]" title={systemNama}>
                      {systemNama || 'KPSPAMS Desa Mandiri'}
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedMeterPelanggan('');
                      setInputMeterKini('');
                      setMeterFotoPreview(null);
                      setIsAddReadingModalOpen(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[11px] px-3 py-1.5 rounded-lg transition flex items-center gap-1 shadow-sm cursor-pointer"
                  >
                    <Plus size={12} />
                    + Baru
                  </button>
                </div>

                {/* Toolbar atas */}
                <div className="p-3 bg-white border-b border-slate-200 flex flex-col gap-2 shadow-3xs">
                  <div className="grid grid-cols-2 gap-2">
                    {/* Area Filter */}
                    <div>
                      <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">Dusun / Area</label>
                      {(() => {
                        const isLockedArea = currentUser && currentUser.role === 'Petugas' && currentUser.areaAkses && currentUser.areaAkses !== 'ALL';
                        if (isLockedArea) {
                          const allowedArea = currentUser.areaAkses.split(',')[0].trim();
                          return (
                            <div className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-black text-slate-800 flex items-center gap-1 h-[28px] overflow-hidden truncate">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0"></span>
                              <span className="truncate">{allowedArea}</span>
                            </div>
                          );
                        } else {
                          return (
                            <select
                              value={meterFilterArea}
                              onChange={(e) => setMeterFilterArea(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg text-xs font-bold outline-none h-[28px]"
                            >
                              <option value="Semua">Semua Area</option>
                              {areas.filter(a => isAreaAccessible(a.nama)).map(a => (
                                <option key={a.id} value={a.nama}>{a.nama}</option>
                              ))}
                            </select>
                          );
                        }
                      })()}
                    </div>

                    {/* Search Column */}
                    <div>
                      <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cari Pelanggan</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Nama/No..."
                          value={meterSearchInput}
                          onChange={(e) => setMeterSearchInput(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 pl-7 pr-2.5 py-1 rounded-lg text-xs outline-none h-[28px]"
                        />
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                          <Search size={11} />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Legacy Inline Form (Now hidden in favor of popup modal, keeping search logic) */}
                <div className="hidden">
                  <form onSubmit={handleSaveMeterReading} className="space-y-3">
                    {/* Area filter and customer list */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">Filter Dusun</label>
                        <select
                          value={meterFilterArea}
                          onChange={(e) => setMeterFilterArea(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-bold outline-none"
                        >
                          <option value="Semua">Semua Area</option>
                          {areas.filter(a => isAreaAccessible(a.nama)).map(a => <option key={a.id} value={a.nama}>{a.nama}</option>)}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cari Pelanggan</label>
                        <input
                          type="text"
                          placeholder="Ketik nama..."
                          value={meterSearchInput}
                          onChange={(e) => setMeterSearchInput(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs outline-none"
                        >
                        </input>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pilih Pelanggan Belum Catat Meter *</label>
                      {(() => {
                        const todayWib = getWibDateString();
                        const targetYearMonth = todayWib.substring(0, 7);

                        const filteredPelangganForDropdown = pelanggan.filter(p => {
                          if (String(p.status || 'Aktif') !== 'Aktif') return false;
                          if (!isAreaAccessible(p.area)) return false;
                          if (meterFilterArea !== 'Semua' && p.area !== meterFilterArea) return false;
                          
                          // Search query active
                          if (meterSearchQuery.trim() !== '') {
                            const query = meterSearchQuery.toLowerCase();
                            return String(p.nama || '').toLowerCase().includes(query) || String(p.noPelanggan || '').toLowerCase().includes(query);
                          }
                          
                          // No search query: filter out who have already recorded in the current running month & year
                          const isRecorded = readings.some(r => 
                            r.noPelanggan === p.noPelanggan && 
                            r.tglBaca && r.tglBaca.substring(0, 7) === targetYearMonth
                          );
                          return !isRecorded;
                        });

                        return (
                          <select
                            value={selectedMeterPelanggan}
                            onChange={(e) => {
                              setSelectedMeterPelanggan(e.target.value);
                              // Clear previous input
                              setInputMeterKini('');
                            }}
                            className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-extrabold outline-none"
                            required
                          >
                            <option value="">-- Pilih Nama Pelanggan --</option>
                            {filteredPelangganForDropdown.map(p => {
                              const isRecorded = readings.some(r => 
                                r.noPelanggan === p.noPelanggan && 
                                r.tglBaca && r.tglBaca.substring(0, 7) === targetYearMonth
                              );
                              return (
                                <option key={p.noPelanggan} value={p.noPelanggan}>
                                  [{p.noPelanggan}] {p.nama} ({p.area}){isRecorded ? ' - SUDAH CATAT' : ''}
                                </option>
                              );
                            })}
                          </select>
                        );
                      })()}
                    </div>

                    {selectedMeterPelanggan && (() => {
                      const p = pelanggan.find(cust => cust.noPelanggan === selectedMeterPelanggan);
                      if (!p) return null;
                      const lastReading = readings.find(r => r.noPelanggan === p.noPelanggan);
                      const meterLalu = lastReading ? lastReading.meterKini : p.meterAwal;
                      const meterKiniVal = Number(inputMeterKini) || 0;
                      const usage = Math.max(0, meterKiniVal - meterLalu);
                      const isError = meterKiniVal > 0 && meterKiniVal < meterLalu;

                      return (
                        <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-2">
                          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 font-medium">
                            <div>Meter Lalu: <span className="font-extrabold text-slate-800">{meterLalu} m³</span></div>
                            <div>Golongan: <span className="font-bold text-slate-600">{p.golongan}</span></div>
                          </div>

                          <div>
                            <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Angka Meteran Kini (m³)</label>
                            <input
                              type="number"
                              placeholder={`Harus >= ${meterLalu}`}
                              value={inputMeterKini}
                              onChange={(e) => setInputMeterKini(e.target.value)}
                              className={`w-full bg-white border px-3 py-1.5 rounded-lg text-xs font-mono font-bold outline-none ${
                                isError ? 'border-rose-500 focus:ring-1.5 focus:ring-rose-500' : 'border-slate-200 focus:ring-1.5 focus:ring-blue-500'
                              }`}
                              required
                            />
                            {isError && (
                              <p className="text-[9px] text-rose-600 font-bold mt-1">
                                Error: Angka meter kini tidak boleh lebih rendah dari meter lalu!
                              </p>
                            )}
                          </div>

                          {/* Consumption Preview calculation in real-time */}
                          {meterKiniVal >= meterLalu && (
                            <div className="p-2 bg-blue-50/60 border border-blue-100 rounded-lg text-blue-800 text-[10px] font-bold flex justify-between items-center">
                              <span>Konsumsi Air Bulan Ini:</span>
                              <span className="text-xs font-black">{usage} m³</span>
                            </div>
                          )}

                          {/* Foto upload simulator */}
                          <div className="space-y-1.5">
                            <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider">Foto Bukti Meteran <span className="text-red-500">*</span></span>
                            
                            {(() => {
                              const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                              return (
                                <div>
                                  {isMobile ? (
                                    <div>
                                      {/* Mobile Camera Access Trigger */}
                                      <button
                                        type="button"
                                        onClick={() => triggerMobileCamera(false)}
                                        className={`w-full py-2.5 px-3 rounded-xl border text-xs font-extrabold transition flex items-center justify-center gap-2 cursor-pointer ${
                                          meterFotoPreview 
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' 
                                            : 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100'
                                        }`}
                                      >
                                        <Camera size={16} />
                                        {meterFotoPreview ? '✓ Foto Terlampir (Ketuk untuk Ganti)' : 'Ambil Foto Kamera HP'}
                                      </button>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        id="mobile-camera-input"
                                        className="hidden"
                                        onChange={(e) => handleMobilePhotoCapture(e, false)}
                                      />
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      {/* Desktop Dual Mode (File Upload / Live Webcam Stream) */}
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const el = document.getElementById("desktop-file-input");
                                            if (el) el.click();
                                          }}
                                          className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                            meterFotoPreview 
                                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100/60' 
                                              : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                          }`}
                                        >
                                          <Upload size={14} />
                                          Pilih File Foto
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (showWebcam) {
                                              stopWebcam(false);
                                            } else {
                                              startWebcam(false);
                                            }
                                          }}
                                          className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                            showWebcam 
                                              ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100' 
                                              : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                          }`}
                                        >
                                          <Camera size={14} />
                                          {showWebcam ? 'Tutup Webcam' : 'Ambil via Webcam'}
                                        </button>
                                      </div>
                                      
                                      <input
                                        type="file"
                                        accept="image/*"
                                        id="desktop-file-input"
                                        className="hidden"
                                        onChange={(e) => handleDesktopFileSelect(e, false)}
                                      />

                                      {/* Live Webcam Video Frame for Desktop */}
                                      {showWebcam && (
                                        <div className="border border-slate-300 rounded-xl overflow-hidden bg-black relative">
                                          <video
                                            ref={webcamVideoRef}
                                            autoPlay
                                            playsInline
                                            className="w-full h-40 object-cover"
                                          />
                                          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => capturePhoto(false)}
                                              className="bg-blue-600 text-white font-extrabold text-[10px] px-3 py-1.5 rounded-lg hover:bg-blue-700 shadow-md flex items-center gap-1 cursor-pointer"
                                            >
                                              <Camera size={12} />
                                              Ambil Snapshot
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => stopWebcam(false)}
                                              className="bg-slate-800 text-white font-extrabold text-[10px] px-3 py-1.5 rounded-lg hover:bg-slate-700 shadow-md cursor-pointer"
                                            >
                                              Batal
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Real Captured/Uploaded Photo Preview */}
                                  {meterFotoPreview ? (
                                    <div className="mt-2.5 border border-emerald-200 p-2 rounded-xl bg-emerald-50/50 relative flex items-center gap-3">
                                      <img
                                        src={meterFotoPreview}
                                        alt="Pratinjau Bukti Meter"
                                        className="w-14 h-14 object-cover rounded-lg border border-emerald-300 shrink-0 shadow-3xs"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-1">
                                          <p className="text-[9.5px] font-extrabold text-slate-800 truncate">Foto_Bukti_Meteran.jpg</p>
                                          <span className="text-[8px] font-black text-emerald-700 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded shrink-0">
                                            {getBase64SizeKB(meterFotoPreview)} KB
                                          </span>
                                        </div>
                                        <p className="text-[8px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
                                          <CheckCircle size={10} className="shrink-0 text-emerald-500" />
                                          Terkompresi & Ready to Upload (&le; 200 KB)
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => setMeterFotoPreview(null)}
                                        className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-full transition shrink-0 cursor-pointer"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="mt-1.5 flex flex-col gap-1">
                                      <p className="text-[9px] text-rose-600 font-extrabold flex items-center gap-1 animate-pulse">
                                        <AlertTriangle size={11} className="shrink-0" />
                                        Foto meter wajib diambil.
                                      </p>
                                      <p className="text-[8px] text-slate-400 leading-normal">
                                        Unggah bukti fisik visual pembacaan meteran air saat ini agar meteran dapat diverifikasi oleh admin.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          {/* Prevent Duplicate Checking Alert */}
                          {(() => {
                            const todayWib = getWibDateString();
                            const targetYearMonth = todayWib.substring(0, 7);
                            const existingReading = readings.find(r => 
                              r.noPelanggan === selectedMeterPelanggan && 
                              r.tglBaca && r.tglBaca.substring(0, 7) === targetYearMonth
                            );
                            
                            if (existingReading) {
                              return (
                                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[9px] font-extrabold flex flex-col gap-1.5 mt-1 leading-relaxed">
                                  <span className="flex items-center gap-1 text-rose-700">
                                    <AlertTriangle size={12} className="shrink-0" />
                                    Catat meter bulan ini sudah dilakukan.
                                  </span>
                                  <span className="text-[8px] font-normal text-rose-600">
                                    Setiap pelanggan hanya boleh dilakukan catat meter 1x dalam sebulan. Silakan gunakan tombol di bawah untuk langsung merevisi catatan meteran.
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openEditReadingModal(existingReading)}
                                    className="w-full mt-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold py-1.5 px-3 rounded-md text-[9px] transition cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                                  >
                                    <Edit size={12} />
                                    Edit Catatan Meter {p.nama}
                                  </button>
                                </div>
                              );
                            }
                            return null;
                          })()}

                          <button
                            type="submit"
                            disabled={isError || !meterFotoPreview || (() => {
                              const todayWib = getWibDateString();
                              const targetYearMonth = todayWib.substring(0, 7);
                              return readings.some(r => 
                                r.noPelanggan === selectedMeterPelanggan && 
                                r.tglBaca && r.tglBaca.substring(0, 7) === targetYearMonth
                              );
                            })()}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold py-2.5 rounded-lg text-xs transition shadow-sm mt-1 cursor-pointer"
                          >
                            Simpan Hasil Catat Meter
                          </button>
                        </div>
                      );
                    })()}
                  </form>
                </div>

                {/* Main Content Area */}
                <div className="p-3 flex-1 overflow-y-auto space-y-2.5">
                  {(() => {
                    const isSearching = meterSearchQuery.trim() !== '';
                    const todayWib = getWibDateString();
                    const targetYearMonth = todayWib.substring(0, 7);

                    const displayReadings = myReadings
                      .filter(r => meterFilterArea === 'Semua' || r.area === meterFilterArea)
                      .sort((a, b) => new Date(b.tglBaca || '').getTime() - new Date(a.tglBaca || '').getTime());

                    if (isSearching) {
                      const searchResults = pelanggan.filter(p => {
                        if (String(p.status || 'Aktif') !== 'Aktif') return false;
                        if (!isAreaAccessible(p.area)) return false;
                        if (meterFilterArea !== 'Semua' && p.area !== meterFilterArea) return false;
                        const query = meterSearchQuery.toLowerCase();
                        return String(p.nama || '').toLowerCase().includes(query) || String(p.noPelanggan || '').toLowerCase().includes(query);
                      });

                      return (
                        <div className="space-y-2">
                          <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">
                            Hasil Pencarian Pelanggan ({searchResults.length})
                          </span>
                          {searchResults.length === 0 ? (
                            <p className="text-slate-400 text-xs text-center py-4 bg-white rounded-xl border border-dashed border-slate-200">
                              Pelanggan tidak ditemukan.
                            </p>
                          ) : (
                            searchResults.map((p) => {
                              const r = readings.find(read => 
                                read.noPelanggan === p.noPelanggan && 
                                read.tglBaca && read.tglBaca.substring(0, 7) === targetYearMonth
                              );

                              if (r) {
                                return (
                                  <div key={p.noPelanggan} className="bg-emerald-50/40 p-3 rounded-xl border border-emerald-200/80 shadow-3xs flex gap-3 items-center text-xs">
                                    {r.foto ? (
                                      <img src={r.foto} alt="Foto" className="w-12 h-12 object-cover rounded-lg border border-slate-200 shrink-0" referrerPolicy="no-referrer" />
                                    ) : (
                                      <div className="w-12 h-12 bg-slate-50 flex items-center justify-center rounded-lg text-slate-300 border border-slate-100 shrink-0">
                                        <Camera size={14} />
                                      </div>
                                    )}

                                    <div className="flex-1 min-w-0 space-y-0.5">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-bold text-slate-800 text-xs truncate">{p.nama}</span>
                                        <span className="text-[8px] bg-slate-100 text-slate-500 font-bold px-1 rounded truncate">{p.area}</span>
                                        <span className="text-[8px] bg-emerald-100 text-emerald-850 font-black px-1 rounded uppercase tracking-wide">SUDAH DICATAT</span>
                                        {r.isEdited && (
                                          <span className="text-[8px] bg-rose-50 border border-rose-100 text-rose-600 font-black px-1 rounded uppercase tracking-wide">REVISI</span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-slate-500 font-mono">
                                        Meter: {r.meterLalu} &rarr; <span className="font-extrabold text-slate-800">{r.meterKini}</span> (<strong className="text-blue-600">+{r.usage} m³</strong>)
                                      </div>
                                      <p className="text-[9px] text-slate-400">Tgl Baca: {r.tglBaca}</p>
                                    </div>

                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                                        r.status === 'Lunas' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                                      }`}>
                                        {r.status}
                                      </span>
                                      <button
                                        onClick={() => openEditReadingModal(r)}
                                        className="p-1 bg-white hover:bg-blue-50 text-blue-600 rounded-lg transition border border-slate-200 hover:border-blue-200 flex items-center justify-center cursor-pointer"
                                        title="Edit Catatan"
                                      >
                                        <Edit size={12} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              } else {
                                return (
                                  <div key={p.noPelanggan} className="bg-white p-3 rounded-xl border border-slate-200 shadow-3xs flex gap-3 items-center text-xs">
                                    <div className="w-12 h-12 bg-blue-50 flex items-center justify-center rounded-lg text-blue-500 border border-blue-100 shrink-0">
                                      <FileText size={16} />
                                    </div>

                                    <div className="flex-1 min-w-0 space-y-0.5">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-bold text-slate-800 text-xs truncate">{p.nama}</span>
                                        <span className="text-[8px] bg-slate-100 text-slate-500 font-bold px-1 rounded truncate">{p.area}</span>
                                        <span className="text-[8px] bg-amber-50 text-amber-700 border border-amber-200 font-bold px-1 rounded uppercase tracking-wide">Belum Dicatat</span>
                                      </div>
                                      <div className="text-[10px] text-slate-500">
                                        ID: <span className="font-mono font-bold text-slate-700">{p.noPelanggan}</span> • Golongan: <span className="font-bold text-slate-700">{p.golongan}</span>
                                      </div>
                                      <p className="text-[8px] text-slate-400">Ambil foto meteran nyata untuk mencatat</p>
                                    </div>

                                    <div className="shrink-0">
                                      <button
                                        onClick={() => {
                                          setSelectedMeterPelanggan(p.noPelanggan);
                                          setInputMeterKini('');
                                          setMeterFotoPreview(null);
                                          setIsAddReadingModalOpen(true);
                                        }}
                                        className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] rounded-lg transition flex items-center gap-1 shadow-sm cursor-pointer"
                                      >
                                        <Plus size={11} />
                                        Catat
                                      </button>
                                    </div>
                                  </div>
                                );
                              }
                            })
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">
                          Riwayat Pencatatan Terkini ({displayReadings.length})
                        </span>
                        {displayReadings.length === 0 ? (
                          <p className="text-slate-400 text-xs text-center py-4 bg-white rounded-xl border border-dashed border-slate-200">
                            Belum ada pencatatan meter di dusun/area ini.
                          </p>
                        ) : (
                          displayReadings.map((r) => (
                            <div key={r.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-3xs flex gap-3 items-center text-xs">
                              {r.foto ? (
                                <img src={r.foto} alt="Foto" className="w-12 h-12 object-cover rounded-lg border border-slate-200 shrink-0" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-12 h-12 bg-slate-50 flex items-center justify-center rounded-lg text-slate-300 border border-slate-100 shrink-0">
                                  <Camera size={14} />
                                </div>
                              )}

                              <div className="flex-1 min-w-0 space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-slate-800 text-xs truncate">{r.nama}</span>
                                  <span className="text-[8px] bg-slate-100 text-slate-500 font-bold px-1 rounded truncate">{r.area}</span>
                                  {r.isEdited && (
                                    <span className="text-[8px] bg-rose-50 border border-rose-100 text-rose-600 font-black px-1 rounded uppercase tracking-wide">REVISI</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  Meter: {r.meterLalu} &rarr; <span className="font-extrabold text-slate-800">{r.meterKini}</span> (<strong className="text-blue-600">+{r.usage} m³</strong>)
                                </div>
                                <p className="text-[9px] text-slate-400">Tgl Baca: {r.tglBaca}</p>
                              </div>

                              <div className="flex flex-col items-end gap-1.5 shrink-0">
                                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                                  r.status === 'Lunas' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {r.status}
                                </span>
                                <button
                                  onClick={() => openEditReadingModal(r)}
                                  className="p-1 bg-slate-50 hover:bg-blue-50 text-blue-600 rounded-lg transition border border-slate-200 hover:border-blue-200 flex items-center justify-center cursor-pointer"
                                  title="Edit Catatan"
                                >
                                  <Edit size={12} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* --- VIEW: TAGIHAN (Invoices, bulk generation, payment ledger, and receipts POS) --- */}
            {currentView === 'tagihan' && (
              <div id="tagihan-view-panel" className="flex-1 flex flex-col fade-in h-full bg-slate-50">
                <div className="bg-white border-b border-slate-200 px-4 py-2.5 sticky top-0 z-10 shadow-3xs flex items-center justify-between">
                  <div>
                    <h2 className="font-extrabold text-slate-800 text-sm">Tagihan Air KPSPAMS</h2>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Periode Berjalan: Juni 2026</p>
                  </div>
                  
                  <button
                    onClick={handleGenerateBillsBulk}
                    disabled={isGeneratingBills}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[10px] font-black px-2.5 py-1.5 rounded-lg transition flex items-center gap-1 shadow-sm cursor-pointer shrink-0"
                  >
                    {isGeneratingBills ? <RefreshCw size={12} className="animate-spin" /> : <Play size={10} fill="white" />}
                    Kalkulasi Tagihan
                  </button>
                </div>

                <div className="p-3 bg-white border-b border-slate-200 flex flex-col gap-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Cari nama..."
                      value={billSearchInput}
                      onChange={(e) => setBillSearchInput(e.target.value)}
                      className="bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs outline-none"
                    />
                    <select
                      value={billFilterArea}
                      onChange={(e) => setBillFilterArea(e.target.value)}
                      className="bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-bold outline-none"
                    >
                      <option value="Semua">Semua Area</option>
                      {areas.filter(a => isAreaAccessible(a.nama)).map(a => <option key={a.id} value={a.nama}>{a.nama}</option>)}
                    </select>
                    <select
                      value={billFilterStatus}
                      onChange={(e) => setBillFilterStatus(e.target.value)}
                      className="bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-bold outline-none text-slate-700"
                    >
                      <option value="Semua">Semua Status</option>
                      <option value="Lunas">Lunas</option>
                      <option value="Belum Bayar">Belum Bayar</option>
                      <option value="Menunggak">Menunggak</option>
                    </select>
                  </div>
                </div>

                {/* Bulk Invoice List */}
                <div className="p-3 flex-1 overflow-y-auto space-y-2.5">
                  {(() => {
                    const finalInvoices = myBillingList
                      .filter(b => billFilterArea === 'Semua' || b.area === billFilterArea)
                      .filter(b => {
                        if (billFilterStatus === 'Semua') return true;
                        if (billFilterStatus === 'Lunas') return b.status === 'Lunas';
                        if (billFilterStatus === 'Belum Bayar') {
                          return b.status === 'Belum Bayar' && !(b.denda > 0 || b.status === 'Menunggak');
                        }
                        if (billFilterStatus === 'Menunggak') {
                          return b.status === 'Menunggak' || (b.status === 'Belum Bayar' && b.denda > 0);
                        }
                        return true;
                      })
                      .filter(b => String(b.nama || '').toLowerCase().includes(billSearchQuery.toLowerCase()) || String(b.noPelanggan || '').includes(billSearchQuery));
                    
                    if (finalInvoices.length === 0) {
                      return (
                        <div className="text-center py-8 bg-white border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
                          Tidak ada data tagihan air. Klik "Kalkulasi Tagihan" di atas untuk kalkulasi tagihan pelanggan yang baru tercatat.
                        </div>
                      );
                    }

                    return finalInvoices.map((b) => {
                      const p = pelanggan.find(cust => cust.noPelanggan === b.noPelanggan);
                      const t = p ? (tarifs.find(tr => tr.golongan === p.golongan) || tarifs[0]) : tarifs[0];
                      const nominalAbo = b.abonemen || 0;
                      const nominalDenda = b.denda || 0;
                      const calc = calculateBillingDetails(b.usage, t, nominalAbo, nominalDenda);

                      // Ensure meter markers are handled safely
                      const m_lalu = b.meterLalu !== undefined ? b.meterLalu : (p ? p.meterAwal : 0);
                      const m_kini = b.meterKini !== undefined ? b.meterKini : (m_lalu + b.usage);

                      return (
                        <div key={b.id} className="bg-white border border-slate-200 p-3 rounded-xl shadow-3xs space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center flex-wrap gap-1 mb-0.5">
                                <span className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-md">{b.noPelanggan}</span>
                                <span className="text-xs font-extrabold text-slate-800">{b.nama}</span>
                                <span className="text-[8px] bg-blue-50 text-blue-600 font-bold px-1 rounded uppercase">{b.area}</span>
                              </div>
                              <div className="text-[9.5px] text-slate-500 font-medium">
                                Golongan: <span className="font-bold text-slate-700">{p ? p.golongan : '-'}</span>
                              </div>
                            </div>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                              b.status === 'Lunas' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {b.status.toUpperCase()}
                            </span>
                          </div>

                          <div className="text-[10px] bg-slate-50/70 border border-slate-100 p-2.5 rounded-lg space-y-1.5 font-mono text-slate-500">
                            <div className="grid grid-cols-2 gap-y-1 border-b border-slate-200/60 pb-1.5">
                              <div>Meter Awal: <strong className="text-slate-800 font-bold">{m_lalu} m³</strong></div>
                              <div>Meter Akhir: <strong className="text-slate-800 font-bold">{m_kini} m³</strong></div>
                              <div className="col-span-2">Pemakaian: <strong className="text-blue-700 font-extrabold">{b.usage} m³</strong></div>
                            </div>

                            <div className="space-y-1">
                              <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-wide">Rincian Tarif:</span>
                              {calc.breakdown.map((item, idx) => (
                                <div key={idx} className="flex justify-between pl-1">
                                  <span>{item.level} ({item.range}):</span>
                                  <span className="font-bold text-slate-700">{item.vol} x {item.rate.toLocaleString('id-ID')} = Rp {item.total.toLocaleString('id-ID')}</span>
                                </div>
                              ))}
                              <div className="flex justify-between pl-1">
                                <span>Abonemen:</span>
                                <span className="font-bold text-slate-700">Rp {nominalAbo.toLocaleString('id-ID')}</span>
                              </div>
                              {nominalDenda > 0 && (
                                <div className="flex justify-between pl-1 text-rose-600 font-bold">
                                  <span>Denda:</span>
                                  <span>Rp {nominalDenda.toLocaleString('id-ID')}</span>
                                </div>
                              )}
                            </div>

                            <div className="pt-1.5 mt-1 border-t border-slate-200 text-slate-800 font-bold flex justify-between text-[11px]">
                              <span>TOTAL TAGIHAN:</span>
                              <span className="text-blue-700 font-extrabold">Rp {calc.total.toLocaleString('id-ID')}</span>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            {b.status === 'Belum Bayar' ? (
                              canPerformAction('bayarTagihan') ? (
                                <button
                                  onClick={() => openPaymentSetupModal(b)}
                                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] py-1.5 rounded-lg transition text-center shadow-xs cursor-pointer flex items-center justify-center gap-1"
                                >
                                  💵 Proses Pembayaran
                                </button>
                              ) : (
                                <div className="flex-1 bg-slate-100 text-slate-400 font-bold text-[10px] py-1.5 rounded-lg text-center border border-slate-200">
                                  Menunggu Pembayaran
                                </div>
                              )
                            ) : (
                              <button
                                onClick={() => setSelectedBillForStruk(b)}
                                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] py-1.5 rounded-lg transition text-center border border-slate-200 cursor-pointer flex items-center justify-center gap-1"
                              >
                                📄 Cetak Struk Kasir
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* --- VIEW: KEUANGAN (Simulated general ledger and cashbook tracker - SPRINT 2 REVISED) --- */}
            {currentView === 'keuangan' && (
              <div id="keuangan-view-panel" className="flex-1 flex flex-col fade-in h-full bg-slate-50">
                <div className="bg-white border-b border-slate-200 px-4 py-2.5 sticky top-0 z-10 shadow-3xs">
                  <h2 className="font-extrabold text-slate-800 text-sm">Buku Kas &amp; Keuangan</h2>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Kas Operasional Air Desa</p>
                </div>

                {/* Submenu Tabs Segmented Control */}
                <div className="bg-white border-b border-slate-200 px-3 py-1.5 flex gap-1 sticky top-[45px] z-10">
                  <button
                    type="button"
                    onClick={() => setKeuanganSubmenu('transaksi')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      keuanganSubmenu === 'transaksi'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                  >
                    📊 TRANSAKSI
                  </button>
                  <button
                    type="button"
                    onClick={() => setKeuanganSubmenu('akun-transaksi')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      keuanganSubmenu === 'akun-transaksi'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                  >
                    🏷️ AKUN TRANSAKSI
                  </button>
                </div>

                {keuanganSubmenu === 'transaksi' ? (
                  <div className="flex-1 flex flex-col overflow-y-auto">
                    {/* Form to add custom entry */}
                    <div className="p-3">
                      {!canPerformAction('catatKeuangan') ? (
                        <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-[10px] text-amber-700 font-bold space-y-1 shadow-3xs">
                          <p className="flex items-center gap-1.5">⚠️ Penginputan Terkunci</p>
                          <p className="font-medium text-slate-500 leading-normal text-[9px]">Akses Anda untuk mencatat transaksi kas dinonaktifkan oleh pengaturan hak akses sistem. Silakan hubungi Admin jika memerlukan izin penginputan kas.</p>
                        </div>
                      ) : (
                        <form onSubmit={handleAddTransactionSubmit} className="bg-white border border-slate-200 p-3 rounded-xl shadow-2xs space-y-2.5">
                          <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Catat Transaksi Manual</span>
                          
                          <div className="space-y-2 text-[10px]">
                            <div>
                              <label className="text-[8px] font-extrabold text-slate-400 block uppercase mb-0.5">Keterangan Transaksi</label>
                              <input
                                type="text"
                                placeholder="Deskripsi (e.g., Pembelian Pipa atau Pulsa Listrik)"
                                value={inputTransDeskripsi}
                                onChange={(e) => setInputTransDeskripsi(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs outline-none font-bold text-slate-800"
                                required
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[8px] font-extrabold text-slate-400 block uppercase mb-0.5">Jenis Aliran</label>
                                <select
                                  value={inputTransTipe}
                                  onChange={(e) => setInputTransTipe(e.target.value as 'Masuk' | 'Keluar')}
                                  className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-bold outline-none cursor-pointer text-slate-800"
                                >
                                  <option value="Masuk">Kas Masuk (+)</option>
                                  <option value="Keluar">Kas Keluar (-)</option>
                                </select>
                              </div>

                              <div>
                                <label className="text-[8px] font-extrabold text-slate-400 block uppercase mb-0.5">Kategori Akun</label>
                                <select
                                  value={inputTransKategoriId}
                                  onChange={(e) => setInputTransKategoriId(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-bold text-blue-700 outline-none cursor-pointer"
                                  required
                                >
                                  {categories.filter(c => c.tipe === inputTransTipe).map(c => (
                                    <option key={c.id} value={c.id}>{c.nama}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[8px] font-extrabold text-slate-400 block uppercase mb-0.5">Tanggal</label>
                                <input
                                  type="date"
                                  value={inputTransTanggal}
                                  onChange={(e) => setInputTransTanggal(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs outline-none font-mono font-bold text-slate-800"
                                  required
                                />
                              </div>

                              <div>
                                <label className="text-[8px] font-extrabold text-slate-400 block uppercase mb-0.5">Wilayah Dusun</label>
                                <select
                                  value={inputTransArea}
                                  onChange={(e) => setInputTransArea(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-bold outline-none cursor-pointer text-slate-800"
                                >
                                  {(currentUser?.role === 'Admin' || currentUser?.role === 'SUPER_ADMIN') && <option value="ALL">ALL AREA</option>}
                                  {areas.filter(a => isAreaAccessible(a.nama)).map(a => (
                                    <option key={a.id} value={a.nama}>{a.nama}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="text-[8px] font-extrabold text-slate-400 block uppercase mb-0.5">Nominal Transaksi (Rp)</label>
                              <input
                                type="number"
                                placeholder="Nominal (Rp)"
                                value={inputTransJumlah}
                                onChange={(e) => setInputTransJumlah(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold outline-none text-blue-700"
                                required
                              />
                            </div>
                          </div>

                          <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white font-extrabold py-2 rounded-lg text-xs transition cursor-pointer shadow-sm">
                            💾 Simpan Transaksi Kas
                          </button>
                        </form>
                      )}
                    </div>

                    {/* Transaction history - Expanded */}
                    <div className="p-3 flex-1 overflow-y-auto space-y-2.5 bg-white rounded-t-2xl border-t border-slate-200">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Riwayat Transaksi Buku Kas</span>
                        <span className="text-[9px] font-extrabold text-slate-400 font-mono">Total: {myCashTransactions.length} item</span>
                      </div>
                      
                      {myCashTransactions.length === 0 ? (
                        <div className="py-8 text-center text-slate-400 text-[10px] border border-dashed border-slate-200 rounded-xl">
                          Belum ada transaksi kas tercatat.
                        </div>
                      ) : (
                        myCashTransactions.map((t) => (
                          <div key={t.id} className="border-b border-slate-100 pb-2.5 flex justify-between items-center text-xs">
                            <div className="space-y-1 max-w-[70%]">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-extrabold text-slate-800">{t.deskripsi}</p>
                                <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded font-bold">{t.area || 'ALL'}</span>
                                <span className="text-[8px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.2 rounded font-black uppercase tracking-wider">{t.kategori || 'Kas'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-[9px] text-slate-400 font-mono">
                                <span>{t.tanggal} • Ref: {t.id}</span>
                                {t.editCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAuditTrail(t)}
                                    className="text-indigo-600 hover:text-indigo-800 hover:underline font-extrabold bg-indigo-50 px-1 rounded cursor-pointer"
                                  >
                                    Edit: {t.editCount}x
                                  </button>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <span className={`font-mono font-black ${
                                t.tipe === 'Masuk' ? 'text-emerald-600' : 'text-rose-600'
                              }`}>
                                {t.tipe === 'Masuk' ? '+' : '-'} Rp {t.jumlah.toLocaleString('id-ID')}
                              </span>

                              {(currentUser?.role === 'Admin' || currentUser?.role === 'SUPER_ADMIN') && (
                                <div className="flex items-center gap-1 bg-slate-50 border border-slate-100 p-0.5 rounded-lg ml-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditTransaction(t)}
                                    className="p-1 text-blue-600 hover:bg-blue-100 rounded transition cursor-pointer"
                                    title="Edit Transaksi"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTransaction(t.id)}
                                    className="p-1 text-rose-600 hover:bg-rose-100 rounded transition cursor-pointer"
                                    title="Hapus Transaksi"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  /* SUBMENU: AKUN TRANSAKSI */
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {currentUser?.role !== 'Admin' && currentUser?.role !== 'SUPER_ADMIN' ? (
                      <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-700 font-bold space-y-1 shadow-3xs leading-normal">
                        <p className="flex items-center gap-1">⚠️ Hak Akses Terbatas</p>
                        <p className="text-[10px] font-medium text-slate-500">Hanya pengguna dengan peran <strong>ADMINISTRATOR</strong> yang diizinkan untuk mengelola atau menyetel master kategori akun transaksi.</p>
                      </div>
                    ) : (
                      /* Kategori Form (Admin Only) */
                      <form onSubmit={handleSaveCategory} className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs space-y-3 animate-fade-in">
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">
                          {editingCategory ? '📝 Edit Kategori Akun' : '➕ Tambah Kategori Akun'}
                        </span>
                        
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div className="col-span-2">
                            <label className="text-[8px] font-extrabold text-slate-400 block uppercase mb-0.5">Nama Kategori</label>
                            <input
                              type="text"
                              placeholder="e.g., Hibah Desa / Biaya Konsumsi"
                              value={categoryInputNama}
                              onChange={(e) => setCategoryInputNama(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs outline-none font-bold text-slate-800"
                              required
                            />
                          </div>
                          
                          <div className="col-span-2">
                            <label className="text-[8px] font-extrabold text-slate-400 block uppercase mb-0.5">Tipe Aliran Kas</label>
                            <select
                              value={categoryInputTipe}
                              onChange={(e) => setCategoryInputTipe(e.target.value as 'Masuk' | 'Keluar')}
                              className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-bold outline-none cursor-pointer"
                            >
                              <option value="Masuk">PEMASUKAN (Kas Masuk)</option>
                              <option value="Keluar">PENGELUARAN (Kas Keluar)</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button
                            type="submit"
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-2 rounded-lg text-xs transition cursor-pointer shadow-md"
                          >
                            {editingCategory ? '✔️ Simpan Perubahan' : '➕ Daftarkan Kategori'}
                          </button>
                          {editingCategory && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategory(null);
                                setCategoryInputNama('');
                                setCategoryInputTipe('Masuk');
                              }}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 rounded-lg text-xs font-bold cursor-pointer"
                            >
                              Batal
                            </button>
                          )}
                        </div>
                      </form>
                    )}

                    {/* Categories List (Visible to all, but edit/delete only for Admin) */}
                    <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs space-y-2.5">
                      <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Daftar Akun Transaksi</span>
                      
                      <div className="space-y-2">
                        {categories.map(c => (
                          <div key={c.id} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-150 text-xs hover:border-slate-300 transition-all">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-extrabold text-slate-800">{c.nama}</span>
                                <span className={`text-[8px] font-black px-1.5 py-0.2 rounded uppercase tracking-wider ${
                                  c.tipe === 'Masuk' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                                }`}>
                                  {c.tipe === 'Masuk' ? 'Pemasukan' : 'Pengeluaran'}
                                </span>
                              </div>
                              <span className="text-[9px] text-slate-400 font-mono block">ID: {c.id}</span>
                            </div>
                            
                            {(currentUser?.role === 'Admin' || currentUser?.role === 'SUPER_ADMIN') && (
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCategory(c);
                                    setCategoryInputNama(c.nama);
                                    setCategoryInputTipe(c.tipe);
                                  }}
                                  disabled={c.id === 'cat-1'}
                                  className="px-2 py-1 text-[9px] font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={c.id === 'cat-1' ? 'Kategori utama Pembayaran Air tidak boleh diubah' : 'Edit Kategori'}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCategory(c.id)}
                                  disabled={c.id === 'cat-1'}
                                  className="px-2 py-1 text-[9px] font-bold text-rose-600 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={c.id === 'cat-1' ? 'Kategori utama Pembayaran Air tidak boleh dihapus' : 'Hapus Kategori'}
                                >
                                  Hapus
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* --- VIEW: LAPORAN (Comprehensive SPRINT 3 reporting suite) --- */}
            {currentView === 'laporan' && (
              <div id="laporan-view-panel" className="flex-1 flex flex-col fade-in h-full bg-slate-50 overflow-y-auto">
                {/* Header */}
                <div className="bg-white border-b border-slate-200 px-4 py-2.5 sticky top-0 z-10 shadow-xs flex justify-between items-center shrink-0">
                  <div>
                    <h2 className="font-extrabold text-slate-800 text-sm">Laporan &amp; Akuntabilitas</h2>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">KPSPAMS Desa Mandiri • PAMSDIGI</p>
                  </div>
                  <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-1 rounded-lg font-black font-mono">
                    SPRINT 3 ACTIVE
                  </span>
                </div>

                {/* Submenu Tabs Bar - Horizontal Scrollable */}
                <div className="bg-slate-900 px-3 py-2 flex gap-1.5 overflow-x-auto sticky top-[45px] z-10 shrink-0 shadow-sm scrollbar-thin">
                  {[
                    { key: 'ringkasan', label: '📊 Ringkasan' },
                    { key: 'tagihan', label: '📋 Lap. Tagihan' },
                    { key: 'pembayaran', label: '💵 Lap. Pembayaran' },
                    { key: 'tunggakan', label: '⚠️ Lap. Tunggakan' },
                    { key: 'pemakaian-air', label: '💧 Lap. Pemakaian Air' },
                    { key: 'pemasukan', label: '📥 Lap. Pemasukan' },
                    { key: 'pengeluaran', label: '📤 Lap. Pengeluaran' },
                    { key: 'arus-kas', label: '📈 Lap. Arus Kas' },
                    { key: 'rekap-area', label: '📍 Rekap Area' },
                    { key: 'rekap-petugas', label: '👤 Rekap Petugas' },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setLaporanActiveTab(tab.key as any)}
                      className={`text-[10px] font-extrabold px-3 py-1.5 rounded-xl transition whitespace-nowrap cursor-pointer ${
                        laporanActiveTab === tab.key
                          ? 'bg-blue-600 text-white shadow-md scale-102'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="p-4 space-y-4 flex-1">
                  
                  {/* GLOBAL FILTER CARD (Always shown on all report submenus except Ringkasan) */}
                  {laporanActiveTab !== 'ringkasan' && (
                    <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        ⚙️ Filter Data Laporan Otomatis
                      </span>
                      
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                        {/* Filter Bulan */}
                        <div>
                          <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Bulan</label>
                          <select
                            value={reportFilterBulan}
                            onChange={(e) => setReportFilterBulan(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold outline-none cursor-pointer text-slate-800"
                          >
                            <option value="ALL">SEMUA BULAN</option>
                            {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>

                        {/* Filter Tahun */}
                        <div>
                          <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Tahun</label>
                          <select
                            value={reportFilterTahun}
                            onChange={(e) => setReportFilterTahun(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold outline-none cursor-pointer text-slate-800"
                          >
                            <option value="ALL">SEMUA TAHUN</option>
                            <option value="2025">2025</option>
                            <option value="2026">2026</option>
                            <option value="2027">2027</option>
                          </select>
                        </div>

                        {/* Filter Area */}
                        <div>
                          <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Wilayah Area/Dusun</label>
                          <select
                            value={reportFilterArea}
                            onChange={(e) => setReportFilterArea(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold outline-none cursor-pointer text-slate-800"
                          >
                            <option value="ALL">SEMUA AREA</option>
                            {areas.filter(a => isAreaAccessible(a.nama)).map((a) => (
                              <option key={a.id} value={a.nama}>Dusun {a.nama}</option>
                            ))}
                          </select>
                        </div>

                        {/* Filter Petugas */}
                        <div>
                          <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Petugas Pencatat</label>
                          <select
                            value={reportFilterPetugas}
                            onChange={(e) => setReportFilterPetugas(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold outline-none cursor-pointer text-slate-800"
                          >
                            <option value="ALL">SEMUA PETUGAS</option>
                            {users.filter(u => u.role !== 'SUPER_ADMIN').map((u) => (
                              <option key={u.username} value={u.nama}>{u.nama} ({u.role})</option>
                            ))}
                          </select>
                        </div>

                        {/* Filter Status */}
                        <div>
                          <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Status Pembayaran</label>
                          <select
                            value={reportFilterStatus}
                            onChange={(e) => setReportFilterStatus(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold outline-none cursor-pointer text-slate-800"
                          >
                            <option value="ALL">SEMUA STATUS</option>
                            <option value="Lunas">Lunas</option>
                            <option value="Belum Bayar">Belum Bayar</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DATASET CALCULATION BLOCK FOR ALL SELECTED FILTERS */}
                  {(() => {
                    // Filter arrays on-the-fly based on selected filters
                    let bills = [...myBillingList];
                    let readingsList = [...myReadings];
                    let txList = [...myCashTransactions];

                    // Filter by Month
                    if (reportFilterBulan !== 'ALL') {
                      const mShort = reportFilterBulan.substring(0, 3).toLowerCase();
                      bills = bills.filter(b => b.periode.toLowerCase().includes(mShort));
                      readingsList = readingsList.filter(r => (r.tglBaca && r.tglBaca.toLowerCase().includes(`-06-`)) || (r.periode && r.periode.toLowerCase().includes(mShort)));
                      
                      const monthNumMap: { [key: string]: string } = {
                        'Januari': '-01-', 'Februari': '-02-', 'Maret': '-03-', 'April': '-04-', 'Mei': '-05-', 'Juni': '-06-',
                        'Juli': '-07-', 'Agustus': '-08-', 'September': '-09-', 'Oktober': '-10-', 'November': '-11-', 'Desember': '-12-'
                      };
                      const code = monthNumMap[reportFilterBulan];
                      if (code) {
                        txList = txList.filter(t => t.tanggal.includes(code));
                      }
                    }

                    // Filter by Year
                    if (reportFilterTahun !== 'ALL') {
                      bills = bills.filter(b => b.periode.includes(reportFilterTahun));
                      readingsList = readingsList.filter(r => r.tglBaca && r.tglBaca.includes(reportFilterTahun));
                      txList = txList.filter(t => t.tanggal.includes(reportFilterTahun));
                    }

                    // Filter by Area
                    if (reportFilterArea !== 'ALL') {
                      bills = bills.filter(b => b.area === reportFilterArea);
                      readingsList = readingsList.filter(r => r.area === reportFilterArea);
                      txList = txList.filter(t => t.area === reportFilterArea || t.area === 'ALL');
                    }

                    // Filter by Status
                    if (reportFilterStatus !== 'ALL') {
                      bills = bills.filter(b => b.status === reportFilterStatus);
                    }

                    // TAB: RINGKASAN (Gauge and summary charts)
                    if (laporanActiveTab === 'ringkasan') {
                      return (
                        <div className="space-y-4 animate-fade-in">
                          {/* Gauge dial */}
                          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-3xs text-center space-y-2">
                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Kolektibilitas Pembayaran Air</span>
                            {(() => {
                              const lunasCount = myBillingList.filter(b => b.status === 'Lunas').length;
                              const totalCount = myBillingList.length || 1;
                              const pct = Math.round((lunasCount / totalCount) * 100);
                              return (
                                <div className="flex flex-col items-center">
                                  <span className="text-5xl font-black text-blue-600 font-mono tracking-tight">{pct}%</span>
                                  <p className="text-[10px] text-slate-500 font-bold max-w-sm mt-1.5 leading-relaxed">
                                    Sebanyak <strong className="text-blue-600">{lunasCount} pelanggan</strong> dari total {totalCount} KK telah menyelesaikan tagihan PAMSDIGI bulan berjalan.
                                  </p>
                                </div>
                              );
                            })()}
                          </div>

                          {/* Area distribution card */}
                          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs space-y-3">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Distribusi Konsumsi Air Per Dusun</span>
                            
                            <div className="space-y-3 pt-1">
                              {areas.filter(a => isAreaAccessible(a.nama)).map((a) => {
                                const areaCustomers = myPelanggan.filter(p => p.area === a.nama).map(p => p.noPelanggan);
                                const areaUsage = myReadings
                                  .filter(r => areaCustomers.includes(r.noPelanggan))
                                  .reduce((sum, r) => sum + r.usage, 0);

                                return (
                                  <div key={a.id} className="space-y-1.5 text-xs text-slate-700">
                                    <div className="flex justify-between font-bold">
                                      <span className="text-slate-800">Dusun {a.nama}</span>
                                      <span className="font-mono text-slate-600 font-black">{areaUsage} m³</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                      <div className="bg-indigo-500 h-full transition-all" style={{ width: `${Math.min(100, (areaUsage / 120) * 100)}%` }}></div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Quick Stats Summary */}
                          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs text-xs space-y-3">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Parameter Aktif Sistem</span>
                            <div className="grid grid-cols-2 gap-3 text-[11px]">
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col justify-between">
                                <span className="text-slate-400 text-[9px] font-bold block uppercase">Nominal Abonemen</span>
                                <strong className="text-slate-800 text-xs mt-1">{abonemen.status === 'Aktif' ? `Rp ${abonemen.nominal.toLocaleString('id-ID')}` : 'Nonaktif'}</strong>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col justify-between">
                                <span className="text-slate-400 text-[9px] font-bold block uppercase">Aturan Denda Overdue</span>
                                <strong className="text-slate-800 text-xs mt-1">{denda.status === 'Aktif' ? `Rp ${denda.nominal.toLocaleString('id-ID')}` : 'Nonaktif'}</strong>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Map specific submenu view datasets
                    let title = '';
                    let headers: string[] = [];
                    let rows: any[][] = [];
                    let onExportExcel = () => {};
                    let onDownloadPDF = () => {};
                    let onPrint = () => {};

                    if (laporanActiveTab === 'tagihan') {
                      title = 'Laporan Tagihan Pelanggan';
                      headers = ['No Pelanggan', 'Nama Pelanggan', 'Dusun/Area', 'Periode', 'M. Lalu', 'M. Kini', 'Usage (m³)', 'Kubikasi', 'Abonemen', 'Denda', 'Total Tagihan', 'Status'];
                      rows = bills.map(b => [
                        b.noPelanggan, b.nama, b.area, b.periode, b.meterLalu, b.meterKini, b.usage,
                        `Rp ${b.kubikasiBiaya.toLocaleString('id-ID')}`, `Rp ${b.abonemen.toLocaleString('id-ID')}`,
                        `Rp ${b.denda.toLocaleString('id-ID')}`, `Rp ${b.total.toLocaleString('id-ID')}`, b.status
                      ]);
                    } else if (laporanActiveTab === 'pembayaran') {
                      title = 'Laporan Pembayaran Air';
                      headers = ['No Pelanggan', 'Nama Pelanggan', 'Dusun/Area', 'Periode', 'Volume (m³)', 'Total Bayar', 'Status', 'Metode Bayar'];
                      rows = bills.filter(b => b.status === 'Lunas').map(b => [
                        b.noPelanggan, b.nama, b.area, b.periode, b.usage,
                        `Rp ${b.total.toLocaleString('id-ID')}`, 'LUNAS', 'Tunai'
                      ]);
                    } else if (laporanActiveTab === 'tunggakan') {
                      title = 'Laporan Tunggakan Otomatis';
                      headers = ['No Pelanggan', 'Nama Pelanggan', 'Dusun/Area', 'Periode Tertunggak', 'Bulan Menunggak', 'Total Tunggakan', 'Tingkat Risiko'];
                      
                      // Calculate dynamic automatic arrears
                      const tunggakanData = myPelanggan
                        .filter(p => reportFilterArea === 'ALL' || p.area === reportFilterArea)
                        .map((p) => {
                          const bill = myBillingList.find(b => b.noPelanggan === p.noPelanggan);
                          const isUnpaid = bill ? bill.status === 'Belum Bayar' : true;
                          
                          let monthsUnpaid = 0;
                          let totalDue = 0;
                          let periodes = '-';
                          let indicator = 'Aman (Hijau)';

                          if (isUnpaid) {
                            const noNum = parseInt(p.noPelanggan.replace(/\D/g, '')) || 0;
                            if (noNum % 3 === 0) {
                              monthsUnpaid = 3;
                              totalDue = (bill ? bill.total : 45000) * 3;
                              periodes = 'Juni, Mei, April';
                              indicator = 'Bahaya (Merah)';
                            } else if (noNum % 3 === 1) {
                              monthsUnpaid = 2;
                              totalDue = (bill ? bill.total : 45000) * 2;
                              periodes = 'Juni, Mei';
                              indicator = 'Bahaya (Merah)';
                            } else {
                              monthsUnpaid = 1;
                              totalDue = bill ? bill.total : 45000;
                              periodes = 'Juni';
                              indicator = 'Peringatan (Kuning)';
                            }
                          } else {
                            indicator = 'Aman (Hijau)';
                          }

                          return { p, monthsUnpaid, totalDue, periodes, indicator };
                        });

                      // Apply status filter to arrears list
                      let filteredArrears = [...tunggakanData];
                      if (reportFilterStatus === 'Lunas') {
                        filteredArrears = filteredArrears.filter(t => t.monthsUnpaid === 0);
                      } else if (reportFilterStatus === 'Belum Bayar') {
                        filteredArrears = filteredArrears.filter(t => t.monthsUnpaid > 0);
                      }

                      rows = filteredArrears.map(t => [
                        t.p.noPelanggan, t.p.nama, t.p.area, t.periodes, `${t.monthsUnpaid} Bulan`,
                        `Rp ${t.totalDue.toLocaleString('id-ID')}`, t.indicator
                      ]);
                    } else if (laporanActiveTab === 'pemakaian-air') {
                      title = 'Laporan Pemakaian Volume Air';
                      headers = ['No Pelanggan', 'Nama Pelanggan', 'Dusun/Area', 'Tgl Baca', 'Meter Lalu', 'Meter Kini', 'Konsumsi (m³)', 'Status'];
                      rows = readingsList.map(r => [
                        r.noPelanggan, r.nama, r.area, r.tglBaca || '2026-06-20', r.meterLalu, r.meterKini, `${r.usage} m³`, r.status
                      ]);
                    } else if (laporanActiveTab === 'pemasukan') {
                      title = 'Laporan Buku Kas Pemasukan';
                      headers = ['Ref ID', 'Tanggal', 'Keterangan Transaksi', 'Kategori', 'Area/Dusun', 'Jumlah Pemasukan'];
                      rows = txList.filter(t => t.tipe === 'Masuk').map(t => [
                        t.id, t.tanggal, t.deskripsi, t.kategori || 'Kas Air', t.area || 'ALL', `Rp ${t.jumlah.toLocaleString('id-ID')}`
                      ]);
                    } else if (laporanActiveTab === 'pengeluaran') {
                      title = 'Laporan Buku Kas Pengeluaran';
                      headers = ['Ref ID', 'Tanggal', 'Deskripsi Pengeluaran', 'Kategori', 'Area/Dusun', 'Jumlah Pengeluaran'];
                      rows = txList.filter(t => t.tipe === 'Keluar').map(t => [
                        t.id, t.tanggal, t.deskripsi, t.kategori || 'Operasional', t.area || 'ALL', `Rp ${t.jumlah.toLocaleString('id-ID')}`
                      ]);
                    } else if (laporanActiveTab === 'arus-kas') {
                      title = 'Laporan Arus Kas Ringkas';
                      headers = ['Kategori Akuntansi', 'Keterangan', 'Aliran Masuk', 'Aliran Keluar', 'Saldo'];
                      
                      // Calculate consolidated automated cash flow
                      const startBalance = 0;
                      const paidBillsSum = bills.filter(b => b.status === 'Lunas').reduce((sum, b) => sum + b.total, 0);
                      const otherIncomeSum = txList.filter(t => t.tipe === 'Masuk' && t.kategori !== 'Pembayaran Air').reduce((sum, t) => sum + t.jumlah, 0);
                      
                      const opExpSum = txList.filter(t => t.tipe === 'Keluar' && t.kategori === 'Operasional').reduce((sum, t) => sum + t.jumlah, 0);
                      const maintExpSum = txList.filter(t => t.tipe === 'Keluar' && t.kategori === 'Maintenance').reduce((sum, t) => sum + t.jumlah, 0);
                      const electExpSum = txList.filter(t => t.tipe === 'Keluar' && t.kategori === 'Listrik').reduce((sum, t) => sum + t.jumlah, 0);
                      const salaryExpSum = txList.filter(t => t.tipe === 'Keluar' && t.kategori === 'Gaji').reduce((sum, t) => sum + t.jumlah, 0);

                      const totalIncome = paidBillsSum + otherIncomeSum;
                      const totalExpense = opExpSum + maintExpSum + electExpSum + salaryExpSum;
                      const endBalance = startBalance + totalIncome - totalExpense;

                      rows = [
                        ['[+] Pembayaran Rekening Air', 'Kas Masuk dari Pembayaran Pelanggan', `Rp ${paidBillsSum.toLocaleString('id-ID')}`, '-', '-'],
                        ['[+] Pemasukan Kas Lainnya', 'Kas Masuk dari Hibah/Kas Dusun', `Rp ${otherIncomeSum.toLocaleString('id-ID')}`, '-', '-'],
                        ['[-] Biaya Operasional PAM', 'Pengeluaran untuk operasional desa', '-', `Rp ${opExpSum.toLocaleString('id-ID')}`, '-'],
                        ['[-] Biaya Pemeliharaan/Pipa', 'Pengeluaran material & kebocoran', '-', `Rp ${maintExpSum.toLocaleString('id-ID')}`, '-'],
                        ['[-] Biaya Token Listrik', 'Pengeluaran pompa mesin utama', '-', `Rp ${electExpSum.toLocaleString('id-ID')}`, '-'],
                        ['[-] Honor & Gaji Pengelola', 'Gaji petugas catat meter & kasir', '-', `Rp ${salaryExpSum.toLocaleString('id-ID')}`, '-'],
                        ['RINGKASAN AKHIR', `Saldo Awal: Rp ${startBalance.toLocaleString('id-ID')}`, `Total Masuk: Rp ${totalIncome.toLocaleString('id-ID')}`, `Total Keluar: Rp ${totalExpense.toLocaleString('id-ID')}`, `Saldo Buku Akhir: Rp ${endBalance.toLocaleString('id-ID')}`]
                      ];
                    } else if (laporanActiveTab === 'rekap-area') {
                      title = 'Rekapitulasi Konsumsi Per Dusun';
                      headers = ['Dusun/Area', 'Total KK', 'KK Aktif', 'Total Air (m³)', 'Jumlah Tagihan', 'Sdh Bayar', 'Tunggakan'];
                      rows = areas.filter(a => reportFilterArea === 'ALL' || a.nama === reportFilterArea).map((a) => {
                        const areaCust = myPelanggan.filter(p => p.area === a.nama);
                        const actCust = areaCust.filter(p => p.status === 'Aktif').length;
                        const areaUsage = readingsList.filter(r => r.area === a.nama).reduce((sum, r) => sum + r.usage, 0);
                        const areaBills = bills.filter(b => b.area === a.nama);
                        const billTotal = areaBills.reduce((sum, b) => sum + b.total, 0);
                        const billPaid = areaBills.filter(b => b.status === 'Lunas').reduce((sum, b) => sum + b.total, 0);
                        const billUnpaid = areaBills.filter(b => b.status === 'Belum Bayar').reduce((sum, b) => sum + b.total, 0);

                        return [
                          `Dusun ${a.nama}`, `${areaCust.length} KK`, `${actCust} KK`, `${areaUsage} m³`,
                          `Rp ${billTotal.toLocaleString('id-ID')}`, `Rp ${billPaid.toLocaleString('id-ID')}`, `Rp ${billUnpaid.toLocaleString('id-ID')}`
                        ];
                      });
                    } else if (laporanActiveTab === 'rekap-petugas') {
                      title = 'Laporan Kinerja Petugas';
                      headers = ['Nama Pengelola', 'Role', 'Wilayah Tugas', 'Daftar Pelanggan', 'Meter Tercatat', 'Pembayaran Diterima', 'Kas Masuk Area'];
                      rows = users.filter(u => u.role !== 'SUPER_ADMIN').map((u) => {
                        const accessibleArea = u.areaAkses || 'ALL';
                        const areaList = accessibleArea === 'ALL' ? areas.map(ar => ar.nama) : accessibleArea.split(',');
                        
                        const custCount = myPelanggan.filter(p => areaList.includes(p.area)).length;
                        const readCount = readingsList.filter(r => areaList.includes(r.area)).length;
                        const payCount = bills.filter(b => b.status === 'Lunas' && areaList.includes(b.area)).length;
                        const cashIn = bills.filter(b => b.status === 'Lunas' && areaList.includes(b.area)).reduce((sum, b) => sum + b.total, 0);

                        return [
                          u.nama, u.role, accessibleArea, `${custCount} KK`, `${readCount} Meter`, `${payCount} Transaksi`, `Rp ${cashIn.toLocaleString('id-ID')}`
                        ];
                      });
                    }

                    // Setup export bindings
                    onExportExcel = () => handleExportExcelReport(title, headers, rows);
                    onDownloadPDF = () => handleDownloadPDFReport(title, headers, rows);
                    onPrint = () => handlePrintReport(title, headers, rows);

                    return (
                      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4 animate-fade-in flex flex-col">
                        
                        {/* Title & Action Buttons */}
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-b border-slate-100 pb-3">
                          <div>
                            <h3 className="font-extrabold text-slate-800 text-[13px]">{title}</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">SINKRON SPREADSHEET OK</p>
                          </div>
                          
                          <div className="flex flex-wrap gap-1.5">
                            {/* Export Excel */}
                            <button
                              onClick={onExportExcel}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition shadow-3xs"
                            >
                              <FileSpreadsheet size={12} />
                              Excel
                            </button>

                            {/* Download PDF */}
                            <button
                              onClick={onDownloadPDF}
                              className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition shadow-3xs"
                            >
                              <Download size={12} />
                              PDF
                            </button>

                            {/* Print */}
                            <button
                              onClick={onPrint}
                              className="bg-slate-800 hover:bg-slate-950 text-white font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition shadow-3xs"
                            >
                              <FileText size={12} />
                              Cetak (Print)
                            </button>
                          </div>
                        </div>

                        {/* DATA ARUS KAS GRAPHICAL DISPLAY */}
                        {laporanActiveTab === 'arus-kas' && (
                          <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl grid grid-cols-1 md:grid-cols-4 gap-3 text-center">
                            {(() => {
                              const startBalance = 0;
                              const paidBillsSum = bills.filter(b => b.status === 'Lunas').reduce((sum, b) => sum + b.total, 0);
                              const otherIncomeSum = txList.filter(t => t.tipe === 'Masuk' && t.kategori !== 'Pembayaran Air').reduce((sum, t) => sum + t.jumlah, 0);
                              
                              const opExpSum = txList.filter(t => t.tipe === 'Keluar' && t.kategori === 'Operasional').reduce((sum, t) => sum + t.jumlah, 0);
                              const maintExpSum = txList.filter(t => t.tipe === 'Keluar' && t.kategori === 'Maintenance').reduce((sum, t) => sum + t.jumlah, 0);
                              const electExpSum = txList.filter(t => t.tipe === 'Keluar' && t.kategori === 'Listrik').reduce((sum, t) => sum + t.jumlah, 0);
                              const salaryExpSum = txList.filter(t => t.tipe === 'Keluar' && t.kategori === 'Gaji').reduce((sum, t) => sum + t.jumlah, 0);

                              const totalIncome = paidBillsSum + otherIncomeSum;
                              const totalExpense = opExpSum + maintExpSum + electExpSum + salaryExpSum;
                              const endBalance = startBalance + totalIncome - totalExpense;

                              return (
                                <>
                                  <div className="p-3 bg-white border border-slate-150 rounded-xl">
                                    <span className="text-[8px] text-slate-400 font-extrabold uppercase">Saldo Awal</span>
                                    <span className="text-sm font-black text-slate-800 block mt-1">Rp {startBalance.toLocaleString('id-ID')}</span>
                                  </div>
                                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                                    <span className="text-[8px] text-emerald-700 font-extrabold uppercase">Pemasukan (+)</span>
                                    <span className="text-sm font-black text-emerald-800 block mt-1">Rp {totalIncome.toLocaleString('id-ID')}</span>
                                  </div>
                                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                                    <span className="text-[8px] text-rose-700 font-extrabold uppercase">Pengeluaran (-)</span>
                                    <span className="text-sm font-black text-rose-800 block mt-1">Rp {totalExpense.toLocaleString('id-ID')}</span>
                                  </div>
                                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                                    <span className="text-[8px] text-blue-700 font-extrabold uppercase">Saldo Akhir</span>
                                    <span className="text-sm font-black text-blue-900 block mt-1">Rp {endBalance.toLocaleString('id-ID')}</span>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}

                        {/* Main Data Table */}
                        <div className="overflow-x-auto w-full border border-slate-100 rounded-xl">
                          {rows.length === 0 ? (
                            <div className="py-10 text-center text-slate-400 text-[11px] border border-dashed border-slate-200 rounded-xl">
                              Tidak ada rekaman data laporan yang cocok dengan kombinasi filter Anda.
                            </div>
                          ) : (
                            <table className="w-full border-collapse text-left text-[11px]">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-black uppercase text-[8px] tracking-wider">
                                  {headers.map((h, idx) => (
                                    <th key={idx} className="px-3 py-2">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {rows.map((row, rowIdx) => (
                                  <tr key={rowIdx} className="hover:bg-slate-50/50 transition">
                                    {row.map((cell, cellIdx) => {
                                      // Render status denda/tunggakan colors dynamically for SPRINT 3
                                      if (laporanActiveTab === 'tunggakan' && cellIdx === 6) {
                                        const isMerah = cell.includes('Merah');
                                        const isKuning = cell.includes('Kuning');
                                        return (
                                          <td key={cellIdx} className="px-3 py-2.5 font-bold">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                                              isMerah ? 'bg-rose-100 text-rose-700' : isKuning ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                                            }`}>
                                              {cell}
                                            </span>
                                          </td>
                                        );
                                      }

                                      // Normal cell
                                      const isStatus = cell === 'Lunas' || cell === 'Belum Bayar' || cell === 'LUNAS';
                                      return (
                                        <td key={cellIdx} className={`px-3 py-2.5 font-medium ${isStatus ? 'font-black' : 'text-slate-700'}`}>
                                          {isStatus ? (
                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${
                                              cell === 'Lunas' || cell === 'LUNAS' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
                                            }`}>
                                              {cell}
                                            </span>
                                          ) : (
                                            cell
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>

                      </div>
                    );
                  })()}

                </div>
              </div>
            )}

            {/* --- VIEW: MASTER DATA (Refactored tabbed master data management) --- */}
            {currentView === 'master-data' && (
              <div id="master-data-view-panel" className="flex-1 flex flex-col fade-in h-full bg-slate-50">
                {/* Mobile-friendly navigation tabs for Master Data */}
                <div className="bg-white border-b border-slate-200 px-3 py-2.5 flex flex-wrap items-center gap-1.5 sticky top-0 z-10 shadow-xs shrink-0">
                  {[
                    { tab: 'area', label: 'Dusun/Area' },
                    { tab: 'tarif', label: 'Skema Tarif' },
                    { tab: 'abonemen', label: 'Abonemen' },
                    { tab: 'denda', label: 'Aturan Denda' },
                    { tab: 'users', label: 'Users' },
                    { tab: 'hak-akses', label: 'Akses' },
                  ].map((t) => (
                    <button
                      key={t.tab}
                      onClick={() => setActiveMasterTab(t.tab as any)}
                      className={`text-[10px] font-extrabold px-2.5 py-1.5 rounded-xl transition cursor-pointer ${
                        activeMasterTab === t.tab
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Subview contents of Master Data based on active tab */}
                <div className="flex-1 overflow-y-auto p-3.5">
                  {/* TAB SUBVIEW: AREA / DUSUN */}
                  {activeMasterTab === 'area' && (
                    <div className="space-y-3.5 animate-fade-in">
                      {currentUser?.role === 'Petugas' && (
                        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-[10px] text-rose-700 font-medium flex gap-2">
                          <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                          <span>Akses Terbatas: Role Petugas hanya diizinkan melihat data wilayah dusun.</span>
                        </div>
                      )}

                      {(currentUser?.role === 'Admin' || currentUser?.role === 'SUPER_ADMIN') && (
                        <form onSubmit={handleSaveAreaClick} className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs space-y-2.5">
                          <span className="text-[9px] font-extrabold text-blue-600 block uppercase">{areaEditId ? 'Edit Area / Dusun' : 'Tambah Area Baru'}</span>
                          <div className="grid grid-cols-2 gap-2">
                            <input 
                              type="text"
                              placeholder="ID (e.g., A004)"
                              disabled={!!areaEditId}
                              value={areaInputId}
                              onChange={(e) => setAreaInputId(e.target.value)}
                              className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none"
                              required
                            />
                            <input 
                              type="text"
                              placeholder="Nama Dusun"
                              value={areaInputNama}
                              onChange={(e) => setAreaInputNama(e.target.value)}
                              className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none"
                              required
                            />
                          </div>
                          <div className="flex gap-2">
                            <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 rounded-lg text-xs cursor-pointer">
                              {areaEditId ? 'Simpan Perubahan' : 'Simpan Dusun Baru'}
                            </button>
                            {areaEditId && (
                              <button type="button" onClick={() => { setAreaEditId(null); setAreaInputId(''); setAreaInputNama(''); }} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 rounded-lg text-xs">
                                Batal
                              </button>
                            )}
                          </div>
                        </form>
                      )}

                      <div className="space-y-2">
                        {areas.map((a) => (
                          <div key={a.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-3xs flex justify-between items-center">
                            <div>
                              <span className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded mr-1.5">{a.id}</span>
                              <span className="text-xs font-extrabold text-slate-800">{a.nama}</span>
                            </div>
                            {(currentUser?.role === 'Admin' || currentUser?.role === 'SUPER_ADMIN') && (
                              <div className="flex gap-1">
                                <button 
                                  onClick={() => { setAreaEditId(a.id); setAreaInputId(a.id); setAreaInputNama(a.nama); }}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                  title="Edit"
                                >
                                  <Edit size={12} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteAreaClick(a.id)}
                                  className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                                  title="Hapus"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB SUBVIEW: SKEMA TARIF (FLAT & BERTINGKAT) */}
                  {activeMasterTab === 'tarif' && (
                    <div className="space-y-3.5 animate-fade-in">
                      {currentUser?.role === 'Petugas' && (
                        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-[10px] text-rose-700 font-medium flex gap-2">
                          <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                          <span>Akses Terbatas: Role Petugas hanya diizinkan membaca skema tarif air.</span>
                        </div>
                      )}

                      {(currentUser?.role === 'Admin' || currentUser?.role === 'SUPER_ADMIN') && (
                        <form onSubmit={handleSaveTarifClick} className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs space-y-2.5">
                          <span className="text-[9px] font-extrabold text-amber-600 block uppercase">{tarifEditId ? 'Edit Skema Tarif' : 'Tambah Skema Tarif'}</span>
                          <div className="grid grid-cols-2 gap-2">
                            <input 
                              type="text" placeholder="ID (T005)" disabled={!!tarifEditId} required value={tarifInputId} onChange={(e) => setTarifInputId(e.target.value)}
                              className="bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs outline-none"
                            />
                            <input 
                              type="text" placeholder="Golongan" required value={tarifInputGolongan} onChange={(e) => setTarifInputGolongan(e.target.value)}
                              className="bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs outline-none"
                            />
                          </div>
                           <div className={tarifInputTipe === 'Flat' ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"}>
                            <div>
                              <label className="text-[8px] font-extrabold text-slate-400 block uppercase mb-0.5">Model Tarif</label>
                              <select 
                                value={tarifInputTipe} onChange={(e) => setTarifInputTipe(e.target.value as 'Flat' | 'Bertingkat')}
                                className="w-full bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none font-bold"
                              >
                                <option value="Flat">Flat (Satu Harga)</option>
                                <option value="Bertingkat">Bertingkat (Progresif)</option>
                              </select>
                            </div>
                            {tarifInputTipe === 'Flat' && (
                              <div>
                                <label className="text-[8px] font-extrabold text-slate-400 block uppercase mb-0.5">Tarif Flat (Rp)</label>
                                <input 
                                  type="number" placeholder="3000" required value={tarifInputFlat} onChange={(e) => setTarifInputFlat(Number(e.target.value))}
                                  className="w-full bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs outline-none"
                                />
                              </div>
                            )}
                          </div>

                          {tarifInputTipe === 'Bertingkat' && (
                            <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                              <span className="text-[10px] font-extrabold text-slate-500 uppercase block tracking-wider">Tingkatan Tarif (Progresif)</span>
                              
                              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                {tarifInputLevels.map((lvl, index) => (
                                  <div key={index} className="bg-white border border-slate-200 p-2.5 rounded-lg space-y-1.5 relative shadow-2xs">
                                    <div className="flex justify-between items-center border-b border-slate-100 pb-1 mb-1">
                                      <span className="text-[9px] font-bold text-slate-600 uppercase">Level {index + 1}</span>
                                      {index > 0 && (
                                        <button 
                                          type="button" 
                                          onClick={() => {
                                            setTarifInputLevels(prev => prev.filter((_, i) => i !== index));
                                          }}
                                          className="text-rose-500 hover:text-rose-700 text-[9px] font-extrabold flex items-center gap-0.5 cursor-pointer"
                                        >
                                          <Trash2 size={10} /> Hapus Level
                                        </button>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5">
                                      <div>
                                        <label className="text-[8px] font-bold text-slate-400 block mb-0.5">Dari (m³)</label>
                                        <input 
                                          type="number" 
                                          min={0}
                                          required 
                                          value={lvl.dari} 
                                          onChange={(e) => {
                                            const val = Number(e.target.value);
                                            setTarifInputLevels(prev => prev.map((item, i) => i === index ? { ...item, dari: val } : item));
                                          }}
                                          className="w-full bg-slate-50 px-2 py-1 rounded border border-slate-200 text-xs outline-none font-mono"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[8px] font-bold text-slate-400 block mb-0.5">Sampai (m³)</label>
                                        <input 
                                          type="number" 
                                          min={0}
                                          placeholder={index === tarifInputLevels.length - 1 ? "∞" : "m³"}
                                          required={index < tarifInputLevels.length - 1}
                                          value={lvl.sampai === undefined || lvl.sampai === null ? '' : lvl.sampai} 
                                          onChange={(e) => {
                                            const rawVal = e.target.value;
                                            const val = rawVal === '' ? undefined : Number(rawVal);
                                            setTarifInputLevels(prev => prev.map((item, i) => i === index ? { ...item, sampai: val } : item));
                                          }}
                                          className="w-full bg-slate-50 px-2 py-1 rounded border border-slate-200 text-xs outline-none font-mono"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[8px] font-bold text-slate-400 block mb-0.5 font-sans">Harga per m³</label>
                                        <input 
                                          type="number" 
                                          min={0}
                                          required 
                                          value={lvl.tarif} 
                                          onChange={(e) => {
                                            const val = Number(e.target.value);
                                            setTarifInputLevels(prev => prev.map((item, i) => i === index ? { ...item, tarif: val } : item));
                                          }}
                                          className="w-full bg-slate-50 px-2 py-1 rounded border border-slate-200 text-xs outline-none font-bold font-mono text-amber-700"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <button 
                                type="button"
                                onClick={() => {
                                  setTarifInputLevels(prev => {
                                    const last = prev[prev.length - 1];
                                    const nextDari = last && last.sampai ? Number(last.sampai) + 1 : 0;
                                    const nextSampai = last && last.sampai ? Number(last.sampai) + 10 : undefined;
                                    const nextTarif = last ? Number(last.tarif) + 500 : 3000;
                                    return [...prev, { dari: nextDari, sampai: nextSampai, tarif: nextTarif }];
                                  });
                                }}
                                className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-extrabold py-1.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-colors"
                              >
                                <span>+ Tambah Level</span>
                              </button>
                            </div>
                          )}

                          <div className="flex gap-2 pt-1">
                            <button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-1.5 rounded-lg text-xs cursor-pointer">
                              {tarifEditId ? 'Simpan Skema' : 'Simpan Tarif Baru'}
                            </button>
                            {tarifEditId && (
                              <button type="button" onClick={() => { setTarifEditId(null); setTarifInputId(''); setTarifInputGolongan(''); setTarifInputLevels([{ dari: 0, sampai: 10, tarif: 3000 }]); }} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 rounded-lg text-xs">
                                Batal
                              </button>
                            )}
                          </div>
                        </form>
                      )}

                      <div className="space-y-2.5">
                        {tarifs.map((t) => (
                          <div key={t.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-3xs space-y-1.5">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="text-[8px] bg-slate-100 text-slate-500 font-bold px-1 rounded mr-1.5">{t.id}</span>
                                <span className="text-xs font-black text-slate-800">{t.golongan}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  disabled={currentUser?.role === 'Petugas'}
                                  onClick={() => {
                                    onUpdateTarif({ ...t, status: t.status === 'Aktif' ? 'Nonaktif' : 'Aktif' });
                                    showToast(`Status tarif ${t.golongan} diubah!`, 'success');
                                  }}
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold ${
                                    t.status === 'Aktif' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                                  }`}
                                >
                                  {t.status}
                                </button>
                                {(currentUser?.role === 'Admin' || currentUser?.role === 'SUPER_ADMIN') && (
                                  <button 
                                    onClick={() => {
                                      setTarifEditId(t.id);
                                      setTarifInputId(t.id);
                                      setTarifInputGolongan(t.golongan);
                                      setTarifInputTipe(t.tipe);
                                      setTarifInputFlat(t.tarifFlat);
                                      setTarifInputR1Max(t.range1Max);
                                      setTarifInputR1Tarif(t.range1Tarif);
                                      setTarifInputR2Max(t.range2Max);
                                      setTarifInputR2Tarif(t.range2Tarif);
                                      setTarifInputR3Tarif(t.range3Tarif);
                                      if (t.levels) {
                                        try {
                                          setTarifInputLevels(JSON.parse(t.levels));
                                        } catch (e) {
                                          setTarifInputLevels([
                                            { dari: 0, sampai: t.range1Max || 10, tarif: t.range1Tarif || 3000 },
                                            { dari: (t.range1Max || 10) + 1, sampai: t.range2Max || 20, tarif: t.range2Tarif || 3500 },
                                            { dari: (t.range2Max || 20) + 1, sampai: undefined, tarif: t.range3Tarif || 5000 }
                                          ]);
                                        }
                                      } else {
                                        setTarifInputLevels([
                                          { dari: 0, sampai: t.range1Max || 10, tarif: t.range1Tarif || 3000 },
                                          { dari: (t.range1Max || 10) + 1, sampai: t.range2Max || 20, tarif: t.range2Tarif || 3500 },
                                          { dari: (t.range2Max || 20) + 1, sampai: undefined, tarif: t.range3Tarif || 5000 }
                                        ]);
                                      }
                                    }}
                                    className="text-blue-600 hover:text-blue-800"
                                  >
                                    <Edit size={11} />
                                  </button>
                                )}
                                {(currentUser?.role === 'Admin' || currentUser?.role === 'SUPER_ADMIN') && (
                                  <button onClick={() => handleDeleteTarifClick(t.id)} className="text-rose-500 hover:text-rose-700">
                                    <Trash2 size={11} />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="text-[10px] bg-slate-50 p-1.5 rounded border border-slate-100 font-mono text-slate-600">
                              {t.tipe === 'Flat' ? (
                                <span>Harga Flat: <strong>Rp {t.tarifFlat.toLocaleString('id-ID')} / m³</strong></span>
                              ) : (
                                (() => {
                                  let displayLevels: { dari: number; sampai?: number; tarif: number; }[] | null = null;
                                  if (t.levels) {
                                    try { displayLevels = JSON.parse(t.levels); } catch(e) {}
                                  }
                                  if (displayLevels && Array.isArray(displayLevels) && displayLevels.length > 0) {
                                    return (
                                      <div className="space-y-0.5 text-[9px]">
                                        {displayLevels.map((lvl, index) => (
                                          <div key={index} className="flex justify-between border-b border-dashed border-slate-200 last:border-b-0 py-0.5">
                                            <span>Level {index + 1} ({lvl.dari} - {lvl.sampai !== undefined && lvl.sampai !== null && lvl.sampai !== 0 ? lvl.sampai : '∞'} m³):</span>
                                            <strong className="text-slate-800">Rp {lvl.tarif.toLocaleString('id-ID')} / m³</strong>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="grid grid-cols-3 gap-1 text-[9px]">
                                      <div>0-10: <strong>{t.range1Tarif}</strong></div>
                                      <div>11-20: <strong>{t.range2Tarif}</strong></div>
                                      <div>&gt;20: <strong>{t.range3Tarif}</strong></div>
                                    </div>
                                  );
                                })()
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB SUBVIEW: ABONEMEN CONFIG */}
                  {activeMasterTab === 'abonemen' && (
                    <div className="space-y-4 animate-fade-in">
                      <div className="bg-gradient-to-tr from-emerald-600 to-teal-700 text-white rounded-2xl p-4 shadow-md space-y-1">
                        <span className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-100">Status Aktif Saat Ini</span>
                        <h3 className="text-xl font-black">Rp {abonemen.nominal.toLocaleString('id-ID')} <span className="text-xs font-normal">/ Bulan</span></h3>
                        <div className="pt-2">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                            abonemen.status === 'Aktif' ? 'bg-white text-emerald-700' : 'bg-white/20 text-emerald-100'
                          }`}>
                            {abonemen.status === 'Aktif' ? 'AKTIF (Dikenakan Tagihan)' : 'NONAKTIF (Bebas Biaya)'}
                          </span>
                        </div>
                      </div>

                      {currentUser?.role === 'Petugas' ? (
                        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-[10px] text-rose-700 font-medium">
                          🔒 Akses Ditolak: Hanya Admin yang dapat memodifikasi parameter abonemen bulanan.
                        </div>
                      ) : (
                        <form onSubmit={handleSaveAbonemenClick} className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs space-y-3">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Konfigurasi Parameter</span>
                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 mb-1">Status Keaktifan</label>
                            <select 
                              value={aboInputStatus} onChange={(e) => setAboInputStatus(e.target.value as 'Aktif' | 'Nonaktif')}
                              className="w-full bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs outline-none"
                            >
                              <option value="Aktif">Aktif (Dikenakan)</option>
                              <option value="Nonaktif">Nonaktif (Bebas Biaya)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 mb-1">Nominal Abonemen (Rp / Bulan)</label>
                            <input 
                              type="number" required value={aboInputNominal} onChange={(e) => setAboInputNominal(Number(e.target.value))}
                              className="w-full bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-bold outline-none"
                              placeholder="10000"
                            />
                          </div>
                          <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2 rounded-lg text-xs transition shadow-sm cursor-pointer">
                            Simpan Parameter Abonemen
                          </button>
                        </form>
                      )}
                    </div>
                  )}

                  {/* TAB SUBVIEW: ATURAN DENDA */}
                  {activeMasterTab === 'denda' && (
                    <div className="space-y-4 animate-fade-in">
                      <div className="bg-gradient-to-tr from-rose-600 to-pink-700 text-white rounded-2xl p-4 shadow-md space-y-1.5">
                        <span className="text-[9px] font-extrabold uppercase tracking-wider text-rose-100">Aturan Denda Aktif</span>
                        <h3 className="text-xl font-black">
                          {denda.status === 'Aktif' ? `Rp ${denda.nominal.toLocaleString('id-ID')}` : 'Rp 0'}
                        </h3>
                        <p className="text-[10px] text-rose-100">Diberlakukan setelah melewati <strong>Hari ke-{denda.hariKeterlambatan}</strong> tiap bulan.</p>
                        <div className="pt-1">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                            denda.status === 'Aktif' ? 'bg-white text-rose-700' : 'bg-white/20 text-rose-200'
                          }`}>
                            Status: {denda.status === 'Aktif' ? 'ON (Aktif)' : 'OFF (Mati)'}
                          </span>
                        </div>
                      </div>

                      {currentUser?.role === 'Petugas' ? (
                        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-[10px] text-rose-700 font-medium">
                          🔒 Akses Ditolak: Hanya Admin yang dapat memodifikasi parameter denda keterlambatan.
                        </div>
                      ) : (
                        <form onSubmit={handleSaveDendaClick} className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs space-y-3">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Ubah Parameter Denda</span>
                          
                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 mb-1">Status Denda</label>
                            <select 
                              value={dendaInputStatus} onChange={(e) => setDendaInputStatus(e.target.value as 'Aktif' | 'Nonaktif')}
                              className="w-full bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs outline-none"
                            >
                              <option value="Aktif">ON (Aktif)</option>
                              <option value="Nonaktif">OFF (Mati)</option>
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[9px] font-bold text-slate-500 mb-1">Nominal (Rp)</label>
                              <input 
                                type="number" required value={dendaInputNominal} onChange={(e) => setDendaInputNominal(Number(e.target.value))}
                                className="w-full bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-500 mb-1">Batas Hari</label>
                              <input 
                                type="number" required value={dendaInputHari} onChange={(e) => setDendaInputHari(Number(e.target.value))}
                                className="w-full bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono outline-none"
                              />
                            </div>
                          </div>

                          <button type="submit" className="w-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold py-2 rounded-lg text-xs transition shadow-sm cursor-pointer">
                            Simpan Parameter Denda
                          </button>
                        </form>
                      )}
                    </div>
                  )}

                  {/* TAB SUBVIEW: USERS LIST */}
                  {activeMasterTab === 'users' && (
                    <div className="space-y-3.5 animate-fade-in">
                      {currentUser?.role === 'Petugas' && (
                        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-[10px] text-rose-700 font-medium flex gap-2">
                          <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                          <span>Akses Terbatas: Role Petugas hanya diizinkan membaca daftar akun pengelola.</span>
                        </div>
                      )}

                      {(currentUser?.role === 'Admin' || currentUser?.role === 'SUPER_ADMIN') && (
                        <form onSubmit={handleSaveUserClick} className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs space-y-2.5">
                          <span className="text-[9px] font-extrabold text-indigo-600 block uppercase">
                            {userEditUsername ? 'Edit Akun Pengelola' : 'Tambah Akun Pengelola Baru'}
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <input 
                              type="text"
                              placeholder="Username (e.g., kurnia)"
                              disabled={!!userEditUsername}
                              value={userInputUsername}
                              onChange={(e) => setUserInputUsername(e.target.value)}
                              className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none font-mono"
                              required
                            />
                            <input 
                              type="text"
                              placeholder="Nama Lengkap"
                              value={userInputNama}
                              onChange={(e) => setUserInputNama(e.target.value)}
                              className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none"
                              required
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[8px] font-extrabold text-slate-400 block uppercase mb-0.5">Role Pengelola</label>
                              <select 
                                value={userInputRole}
                                onChange={(e) => setUserInputRole(e.target.value as 'Admin' | 'Petugas')}
                                className="w-full bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none font-bold"
                              >
                                <option value="Petugas">Petugas (Operasional)</option>
                                <option value="Admin">Admin (Full Akses)</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[8px] font-extrabold text-slate-400 block uppercase mb-0.5">Status Akun</label>
                              <select 
                                value={userInputStatus}
                                onChange={(e) => setUserInputStatus(e.target.value as 'Aktif' | 'Nonaktif')}
                                className="w-full bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none font-bold"
                              >
                                <option value="Aktif">Aktif</option>
                                <option value="Nonaktif">Nonaktif</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="text-[8px] font-extrabold text-slate-400 block uppercase mb-0.5">
                              {userEditUsername ? 'Password Baru (Kosongkan jika tidak diubah)' : 'Password'}
                            </label>
                            <input 
                              type="password"
                              placeholder={userEditUsername ? "••••••••" : "Password akun"}
                              value={userInputPassword}
                              onChange={(e) => setUserInputPassword(e.target.value)}
                              className="w-full bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none"
                              required={!userEditUsername}
                            />
                          </div>

                          <div>
                            <label className="text-[8px] font-extrabold text-slate-400 block uppercase mb-1">
                              Area Akses (Wilayah Kerja)
                            </label>
                            {userInputRole === 'Admin' ? (
                              <div className="bg-indigo-50 border border-indigo-100 p-2.5 rounded-lg text-[10px] text-indigo-700 font-bold flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                                <span>Otomatis ALL AREA (Full Akses)</span>
                              </div>
                            ) : (
                              <div className="bg-slate-50 border border-slate-200 p-2 rounded-lg space-y-1.5 max-h-36 overflow-y-auto">
                                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer pl-1 py-0.5">
                                  <input 
                                    type="checkbox"
                                    checked={userInputAreaAkses.includes('ALL')}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setUserInputAreaAkses(['ALL']);
                                      } else {
                                        setUserInputAreaAkses([]);
                                      }
                                    }}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                  />
                                  <span>Semua Wilayah (ALL AREA)</span>
                                </label>
                                
                                <div className="border-t border-slate-200 my-1"></div>
                                
                                {areas.map((a) => {
                                  const isChecked = userInputAreaAkses.includes(a.nama);
                                  return (
                                    <label key={a.id} className="flex items-center gap-2 text-[11px] font-medium text-slate-600 cursor-pointer pl-1 py-0.5">
                                      <input 
                                        type="checkbox"
                                        disabled={userInputAreaAkses.includes('ALL')}
                                        checked={userInputAreaAkses.includes('ALL') || isChecked}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setUserInputAreaAkses((prev) => [...prev.filter(item => item !== 'ALL'), a.nama]);
                                          } else {
                                            setUserInputAreaAkses((prev) => prev.filter(item => item !== a.nama && item !== 'ALL'));
                                          }
                                        }}
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                      />
                                      <span>{a.nama}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2 pt-1">
                            <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 rounded-lg text-xs cursor-pointer">
                              {userEditUsername ? 'Simpan Perubahan' : 'Daftarkan Pengelola'}
                            </button>
                            {userEditUsername && (
                              <button 
                                type="button" 
                                onClick={() => { 
                                  setUserEditUsername(null); 
                                  setUserInputUsername(''); 
                                  setUserInputNama(''); 
                                  setUserInputPassword(''); 
                                  setUserInputRole(configDefaultRole);
                                  setUserInputStatus('Aktif');
                                  setUserInputAreaAkses(['ALL']);
                                }} 
                                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 rounded-lg text-xs"
                              >
                                Batal
                              </button>
                            )}
                          </div>
                        </form>
                      )}

                      <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Daftar Akun Pengelola Terdaftar</span>
                      <div className="space-y-2">
                        {users.filter(u => u.role !== 'SUPER_ADMIN').map((u) => (
                          <div key={u.username} className="bg-white p-3 rounded-xl border border-slate-200 shadow-3xs flex justify-between items-center text-xs">
                            <div className="space-y-0.5">
                              <p className="font-extrabold text-slate-800 flex items-center gap-1.5">
                                {u.nama}
                                {currentUser?.username.toLowerCase() === u.username.toLowerCase() && (
                                  <span className="text-[8px] bg-blue-50 text-blue-600 border border-blue-200 font-extrabold px-1 py-0.2 rounded">Anda</span>
                                )}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-slate-400 text-[9px]">uname: {u.username}</span>
                                <span className={`text-[8px] font-black px-1.5 py-0.2 rounded ${
                                  u.role === 'Admin' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {u.role.toUpperCase()}
                                </span>
                                <button
                                  disabled={(currentUser?.role !== 'Admin' && currentUser?.role !== 'SUPER_ADMIN') || currentUser?.username.toLowerCase() === u.username.toLowerCase()}
                                  onClick={() => handleToggleUserStatus(u.username)}
                                  className={`text-[8px] font-black px-1.5 py-0.2 rounded transition ${
                                    u.status === 'Aktif' 
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100' 
                                      : 'bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100'
                                  } disabled:opacity-75 disabled:hover:bg-slate-50`}
                                >
                                  {u.status.toUpperCase()}
                                </button>
                              </div>
                              <div className="text-[9px] text-slate-500 font-medium">
                                Area: <span className="text-indigo-600 font-bold">{u.areaAkses || 'ALL'}</span>
                              </div>
                            </div>
                            
                            {(currentUser?.role === 'Admin' || currentUser?.role === 'SUPER_ADMIN') && (
                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => { 
                                    setUserEditUsername(u.username); 
                                    setUserInputUsername(u.username); 
                                    setUserInputNama(u.nama); 
                                    setUserInputPassword(''); 
                                    setUserInputRole(u.role);
                                    setUserInputStatus(u.status);
                                    setUserInputAreaAkses(u.areaAkses ? u.areaAkses.split(',') : ['ALL']);
                                  }}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                  title="Edit Akun"
                                >
                                  <Edit size={12} />
                                </button>
                                <button 
                                  onClick={() => handleResetUserPassword(u.username)}
                                  className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"
                                  title="Reset Password"
                                >
                                  <Clock size={12} />
                                </button>
                                {currentUser?.username.toLowerCase() !== u.username.toLowerCase() && (
                                  <button 
                                    onClick={() => handleDeleteUserClick(u.username)}
                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                                    title="Hapus Akun"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB SUBVIEW: HAK AKSES MATRIX & MENU VISIBILITY */}
                  {activeMasterTab === 'hak-akses' && (
                    <div id="hak-akses-matrix-panel" className="space-y-4 animate-fade-in text-xs text-slate-700 pb-6">
                      {/* SECTION 1: MATRIKS HAK AKSES FITUR / OPERASI */}
                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-3xs">
                        <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200">
                          <h4 className="font-extrabold text-slate-800 text-xs">
                            1. Matriks Hak Akses Fitur & Operasi
                          </h4>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-[10px]">
                            <thead>
                              <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-bold">
                                <th className="p-2.5 w-1/2">Nama Fitur / Operasi</th>
                                <th className="p-2.5 text-center w-1/4 font-extrabold text-slate-700">Admin</th>
                                <th className="p-2.5 text-center w-1/4 font-extrabold text-slate-700">Petugas</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {[
                                {
                                  key: 'catatMeter' as keyof FeaturePermissions,
                                  title: 'Catat Meter Pelanggan'
                                },
                                {
                                  key: 'bayarTagihan' as keyof FeaturePermissions,
                                  title: 'Tagihan / Penarikan Langsung & Input Pembayaran'
                                },
                                {
                                  key: 'tambahPelanggan' as keyof FeaturePermissions,
                                  title: 'Pendaftaran Pelanggan Baru'
                                },
                                {
                                  key: 'editPelanggan' as keyof FeaturePermissions,
                                  title: 'Edit Profil Pelanggan'
                                },
                                {
                                  key: 'hapusPelanggan' as keyof FeaturePermissions,
                                  title: 'Hapus Pelanggan'
                                },
                                {
                                  key: 'ubahMasterData' as keyof FeaturePermissions,
                                  title: 'Ubah Master Data Tarif/Abo/Denda'
                                },
                                {
                                  key: 'hapusWilayah' as keyof FeaturePermissions,
                                  title: 'Hapus Wilayah Dusun'
                                },
                                {
                                  key: 'catatKeuangan' as keyof FeaturePermissions,
                                  title: 'Catat Transaksi Kas Keuangan'
                                },
                              ].map((item) => {
                                const adminChecked = featureAccess.admin[item.key];
                                const petugasChecked = featureAccess.petugas[item.key];
                                const isPermittedToEdit = currentUser?.role === 'Admin' || currentUser?.role === 'SUPER_ADMIN';

                                return (
                                  <tr key={item.key} className="hover:bg-slate-50/70 transition">
                                    <td className="p-2.5 font-bold text-slate-800">
                                      {item.title}
                                    </td>
                                    <td className="p-2.5 text-center align-middle">
                                      <input
                                        type="checkbox"
                                        checked={adminChecked}
                                        disabled={!isPermittedToEdit}
                                        onChange={() => handleToggleFeatureAccess('admin', item.key)}
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-60"
                                      />
                                    </td>
                                    <td className="p-2.5 text-center align-middle">
                                      <input
                                        type="checkbox"
                                        checked={petugasChecked}
                                        disabled={!isPermittedToEdit}
                                        onChange={() => handleToggleFeatureAccess('petugas', item.key)}
                                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-60"
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* SECTION 2: AKSES MENU NAVIGASI */}
                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-3xs">
                        <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200">
                          <h4 className="font-extrabold text-slate-800 text-xs">
                            2. Akses Menu Navigasi
                          </h4>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-[10px]">
                            <thead>
                              <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-bold">
                                <th className="p-2.5 w-1/2">Nama Menu Navigasi</th>
                                <th className="p-2.5 text-center w-1/4 font-extrabold text-slate-700">Admin</th>
                                <th className="p-2.5 text-center w-1/4 font-extrabold text-slate-700">Petugas</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {[
                                {
                                  key: 'dashboard' as keyof MenuPermissions,
                                  label: 'Dashboard'
                                },
                                {
                                  key: 'pelanggan' as keyof MenuPermissions,
                                  label: 'Pelanggan'
                                },
                                {
                                  key: 'catat-meter' as keyof MenuPermissions,
                                  label: 'Catat Meter'
                                },
                                {
                                  key: 'tagihan' as keyof MenuPermissions,
                                  label: 'Tagihan'
                                },
                                {
                                  key: 'keuangan' as keyof MenuPermissions,
                                  label: 'Keuangan'
                                },
                                {
                                  key: 'laporan' as keyof MenuPermissions,
                                  label: 'Laporan'
                                },
                                {
                                  key: 'master-data' as keyof MenuPermissions,
                                  label: 'Master Data'
                                },
                                {
                                  key: 'pengaturan' as keyof MenuPermissions,
                                  label: 'Pengaturan'
                                },
                              ].map((menuItem) => {
                                const adminChecked = menuAccess.admin[menuItem.key];
                                const petugasChecked = menuAccess.petugas[menuItem.key];
                                const isPermittedToEdit = currentUser?.role === 'Admin' || currentUser?.role === 'SUPER_ADMIN';

                                return (
                                  <tr key={menuItem.key} className="hover:bg-slate-50/70 transition">
                                    <td className="p-2.5 font-bold text-slate-800">
                                      {menuItem.label}
                                    </td>
                                    <td className="p-2.5 text-center align-middle">
                                      <input
                                        type="checkbox"
                                        checked={adminChecked}
                                        disabled={!isPermittedToEdit}
                                        onChange={() => handleToggleMenuAccess('admin', menuItem.key)}
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-60"
                                      />
                                    </td>
                                    <td className="p-2.5 text-center align-middle">
                                      <input
                                        type="checkbox"
                                        checked={petugasChecked}
                                        disabled={!isPermittedToEdit}
                                        onChange={() => handleToggleMenuAccess('petugas', menuItem.key)}
                                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-60"
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- VIEW: PENGATURAN (Simulator control panel, role switches, server simulation) --- */}
            {currentView === 'pengaturan' && (
              <div id="pengaturan-view-panel" className="flex-1 flex flex-col fade-in h-full bg-slate-50">
                <div className="bg-white border-b border-slate-200 px-4 py-2.5 sticky top-0 z-10 shadow-3xs">
                  <h2 className="font-extrabold text-slate-800 text-sm">Pengaturan Sistem</h2>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">PamsDigi Configurator</p>
                </div>

                {/* Submenu Tabs Navigation */}
                <div className="bg-white border-b border-slate-200 px-3 py-2 flex gap-1 overflow-x-auto scrollbar-none sticky top-[42px] z-10 shrink-0">
                  {[
                    { id: 'profil', label: 'Profil KPSPAMS' },
                    { id: 'aplikasi', label: 'Pengaturan Aplikasi' },
                    { id: 'backup', label: 'Backup & Restore' },
                    { id: 'database', label: 'Integrasi Database' },
                    { id: 'lisensi', label: 'Lisensi Sistem' },
                  ].filter((tab) => {
                    const role = currentUser?.role;
                    if (role === 'SUPER_ADMIN') return true;
                    if (role === 'Admin' || role === 'Petugas') {
                      return tab.id === 'profil' || tab.id === 'aplikasi' || tab.id === 'backup' || tab.id === 'database' || tab.id === 'lisensi';
                    }
                    return false;
                  }).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveSettingsTab(tab.id as any)}
                      className={`whitespace-nowrap px-3 py-1.5 text-[10px] font-bold rounded-lg transition ${
                        activeSettingsTab === tab.id
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                  {/* TAB 1: PROFIL KPSPAMS */}
                  {activeSettingsTab === 'profil' && (
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      localStorage.setItem('pams_system_nama', systemNama);
                      localStorage.setItem('pams_system_nama_desa', systemNamaDesa);
                      localStorage.setItem('pams_system_kecamatan', systemKecamatan);
                      localStorage.setItem('pams_system_kabupaten', systemKabupaten);
                      localStorage.setItem('pams_system_provinsi', systemProvinsi);
                      localStorage.setItem('pams_system_alamat', systemAlamat);
                      localStorage.setItem('pams_system_hp', systemHp);
                      localStorage.setItem('pams_system_email', systemEmail);
                      localStorage.setItem('pams_system_ketua', systemKetua);
                      localStorage.setItem('pams_system_bendahara', systemBendahara);
                      localStorage.setItem('pams_system_footer_struk', systemFooterStruk);
                      if (systemLogo) localStorage.setItem('pams_system_logo', systemLogo);
                      else localStorage.removeItem('pams_system_logo');
                      if (systemStempel) localStorage.setItem('pams_system_stempel', systemStempel);
                      else localStorage.removeItem('pams_system_stempel');

                      try {
                        await pushDataToSheets({
                          users,
                          pelanggan,
                          areas,
                          tarifs,
                          abonemen,
                          denda,
                          readings,
                          billingList,
                          cashTransactions,
                          profil: getProfilPayload()
                        });
                        showToast('Profil KPSPAMS berhasil disimpan & disinkronkan ke Google Spreadsheet!', 'success');
                        addLog('success', 'Profile: Saved and synced KPSPAMS profile information to Google Spreadsheet.');
                      } catch (err: any) {
                        showToast('Profil disimpan lokal, gagal sinkron ke Spreadsheet: ' + err.message, 'error');
                      }
                    }} className="space-y-4 animate-fade-in">
                      <fieldset disabled={currentUser?.role === 'Petugas'} className="space-y-4">
                        {/* Section: Identitas KPSPAMS */}
                      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-3xs space-y-3">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1.5">Identitas Lembaga</span>
                        
                        <div>
                          <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nama KPSPAMS</label>
                          <input
                            type="text"
                            required
                            value={systemNama}
                            onChange={(e) => setSystemNama(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 focus:ring-1.5 focus:ring-blue-500 outline-none"
                            placeholder="KPSPAMS DESA MANDIRI"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nama Desa</label>
                            <input
                              type="text"
                              required
                              value={systemNamaDesa}
                              onChange={(e) => setSystemNamaDesa(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 focus:ring-1.5 focus:ring-blue-500 outline-none"
                              placeholder="Desa Mandiri"
                            />
                          </div>
                          <div>
                            <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">Kecamatan</label>
                            <input
                              type="text"
                              required
                              value={systemKecamatan}
                              onChange={(e) => setSystemKecamatan(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 focus:ring-1.5 focus:ring-blue-500 outline-none"
                              placeholder="Kecamatan Makmur"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">Kabupaten</label>
                            <input
                              type="text"
                              required
                              value={systemKabupaten}
                              onChange={(e) => setSystemKabupaten(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 focus:ring-1.5 focus:ring-blue-500 outline-none"
                              placeholder="Kabupaten Sejahtera"
                            />
                          </div>
                          <div>
                            <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">Provinsi</label>
                            <input
                              type="text"
                              required
                              value={systemProvinsi}
                              onChange={(e) => setSystemProvinsi(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 focus:ring-1.5 focus:ring-blue-500 outline-none"
                              placeholder="Provinsi Lestari"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">Alamat Lengkap (RT/RW/Jalan)</label>
                          <input
                            type="text"
                            required
                            value={systemAlamat}
                            onChange={(e) => setSystemAlamat(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 focus:ring-1.5 focus:ring-blue-500 outline-none"
                            placeholder="Jl. Raya Desa Mandiri, RT 01/RW 02"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nomor HP</label>
                            <input
                              type="tel"
                              required
                              value={systemHp}
                              onChange={(e) => setSystemHp(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 focus:ring-1.5 focus:ring-blue-500 outline-none"
                              placeholder="081234567890"
                            />
                          </div>
                          <div>
                            <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">Email</label>
                            <input
                              type="email"
                              required
                              value={systemEmail}
                              onChange={(e) => setSystemEmail(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 focus:ring-1.5 focus:ring-blue-500 outline-none"
                              placeholder="kpspams.mandiri@desa.go.id"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Section: Struktur Pengurus */}
                      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-3xs space-y-3">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1.5">Struktur Pengurus</span>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nama Ketua</label>
                            <input
                              type="text"
                              required
                              value={systemKetua}
                              onChange={(e) => setSystemKetua(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 focus:ring-1.5 focus:ring-blue-500 outline-none"
                              placeholder="Agus Setiawan"
                            />
                          </div>
                          <div>
                            <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nama Bendahara</label>
                            <input
                              type="text"
                              required
                              value={systemBendahara}
                              onChange={(e) => setSystemBendahara(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 focus:ring-1.5 focus:ring-blue-500 outline-none"
                              placeholder="Siti Rahayu"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Section: Footer Struk */}
                      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-3xs space-y-3">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1.5">Format Struk Pembayaran</span>
                        <div>
                          <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">Catatan Footer Struk</label>
                          <textarea
                            required
                            rows={2}
                            value={systemFooterStruk}
                            onChange={(e) => setSystemFooterStruk(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 focus:ring-1.5 focus:ring-blue-500 outline-none resize-none"
                            placeholder="Pesan di bagian bawah struk..."
                          />
                        </div>
                      </div>

                      {/* Section: Logo & Stempel */}
                      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-3xs space-y-4">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1.5">Media &amp; Dokumen Resmi</span>
                        
                        {/* Logo Upload & Preview */}
                        <div className="space-y-2">
                          <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider">Logo KPSPAMS / Desa</label>
                          <div className="flex items-center gap-3">
                            <div className="w-14 h-14 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 shadow-3xs">
                              {systemLogo ? (
                                <img src={systemLogo} alt="Logo KPSPAMS" className="w-full h-full object-cover" />
                              ) : (
                                <div className="p-2.5 bg-blue-50 rounded-lg text-blue-600">
                                  <Droplet size={18} />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <input
                                type="file"
                                accept="image/*"
                                id="logo-uploader-profile"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    try {
                                      showToast('Mengompresi logo...', 'success');
                                      const res = await compressImage(file, {
                                        maxWidth: 1600,
                                        maxHeight: 1600,
                                        maxSizeKB: 200,
                                        mimeType: file.type === 'image/png' ? 'image/png' : 'auto'
                                      });
                                      setSystemLogo(res.dataUrl);
                                      localStorage.setItem('pams_system_logo', res.dataUrl);
                                      const msg = res.isCompressed
                                        ? `Logo dikompresi: ${res.originalSizeKB} KB → ${res.compressedSizeKB} KB`
                                        : `Logo diunggah (${res.compressedSizeKB} KB)`;
                                      showToast(msg, 'success');
                                      addLog('success', res.message);
                                    } catch (err: any) {
                                      showToast(`Gagal mengompresi logo: ${err.message || err}`, 'error');
                                    }
                                  }
                                }}
                              />
                              <div className="flex gap-1.5">
                                <label
                                  htmlFor="logo-uploader-profile"
                                  className={`px-2.5 py-1.5 bg-slate-100 text-slate-700 text-[10px] font-extrabold rounded-lg border border-slate-200 transition text-center ${
                                    currentUser?.role === 'Petugas' ? 'opacity-55 cursor-not-allowed' : 'hover:bg-slate-200 cursor-pointer'
                                  }`}
                                >
                                  Pilih Logo
                                </label>
                                {systemLogo && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSystemLogo(null);
                                      localStorage.removeItem('pams_system_logo');
                                      showToast('Logo dihapus', 'success');
                                    }}
                                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-extrabold rounded-lg border border-rose-200 cursor-pointer transition"
                                  >
                                    Hapus
                                  </button>
                                )}
                              </div>
                              <span className="text-[8px] text-slate-400 block mt-1">
                                Format persegi (1:1), maks 200 KB. {systemLogo && <strong className="text-emerald-600 font-extrabold ml-1">Ukuran: {getBase64SizeKB(systemLogo)} KB</strong>}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Stempel Upload & Preview */}
                        <div className="space-y-2 border-t border-slate-100 pt-3">
                          <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider">Stempel Resmi KPSPAMS</label>
                          <div className="flex items-center gap-3">
                            <div className="w-14 h-14 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 shadow-3xs">
                              {systemStempel ? (
                                <img src={systemStempel} alt="Stempel Resmi" className="w-full h-full object-contain p-1" />
                              ) : (
                                <div className="p-2.5 bg-slate-100 rounded-lg text-slate-400">
                                  <Shield size={18} />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <input
                                type="file"
                                accept="image/*"
                                id="stempel-uploader-profile"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    try {
                                      showToast('Mengompresi stempel...', 'success');
                                      const res = await compressImage(file, {
                                        maxWidth: 1600,
                                        maxHeight: 1600,
                                        maxSizeKB: 200,
                                        mimeType: file.type === 'image/png' ? 'image/png' : 'auto'
                                      });
                                      setSystemStempel(res.dataUrl);
                                      localStorage.setItem('pams_system_stempel', res.dataUrl);
                                      const msg = res.isCompressed
                                        ? `Stempel dikompresi: ${res.originalSizeKB} KB → ${res.compressedSizeKB} KB`
                                        : `Stempel diunggah (${res.compressedSizeKB} KB)`;
                                      showToast(msg, 'success');
                                      addLog('success', res.message);
                                    } catch (err: any) {
                                      showToast(`Gagal mengompresi stempel: ${err.message || err}`, 'error');
                                    }
                                  }
                                }}
                              />
                              <div className="flex gap-1.5">
                                <label
                                  htmlFor="stempel-uploader-profile"
                                  className={`px-2.5 py-1.5 bg-slate-100 text-slate-700 text-[10px] font-extrabold rounded-lg border border-slate-200 transition text-center ${
                                    currentUser?.role === 'Petugas' ? 'opacity-55 cursor-not-allowed' : 'hover:bg-slate-200 cursor-pointer'
                                  }`}
                                >
                                  Pilih Stempel
                                </label>
                                {systemStempel && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSystemStempel(null);
                                      localStorage.removeItem('pams_system_stempel');
                                      showToast('Stempel dihapus', 'success');
                                    }}
                                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-extrabold rounded-lg border border-rose-200 cursor-pointer transition"
                                  >
                                    Hapus
                                  </button>
                                )}
                              </div>
                              <span className="text-[8px] text-slate-400 block mt-1">
                                Disarankan PNG transparan, maks 200 KB. {systemStempel && <strong className="text-emerald-600 font-extrabold ml-1">Ukuran: {getBase64SizeKB(systemStempel)} KB</strong>}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      </fieldset>

                      {/* Submit Action */}
                      {currentUser?.role !== 'Petugas' ? (
                        <button
                          type="submit"
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs transition shadow-md cursor-pointer text-center"
                        >
                          Simpan Profil Lembaga
                        </button>
                      ) : (
                        <div className="text-center p-3.5 bg-amber-50 text-amber-800 text-[10px] font-bold rounded-xl border border-amber-200/50">
                          Petugas hanya diperbolehkan melihat profil lembaga dan tidak dapat mengubah konfigurasi sistem.
                        </div>
                      )}
                    </form>
                  )}

                  {/* TAB 2: PENGATURAN APLIKASI */}
                  {activeSettingsTab === 'aplikasi' && (currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'Admin') && (
                    <div className="space-y-4 animate-fade-in">
                      
                      {/* Section: Aturan Penagihan & Pelanggan */}
                      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-3xs space-y-4">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1.5">Sistem Penagihan &amp; Pelanggan</span>
                        
                        <div>
                          <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tanggal Tutup Buku Bulanan</label>
                          <select
                            value={configTglTutupBuku}
                            onChange={(e) => setConfigTglTutupBuku(Number(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 focus:ring-1.5 focus:ring-blue-500 outline-none"
                          >
                            {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                              <option key={day} value={day}>Setiap Tanggal {day}</option>
                            ))}
                          </select>
                          <span className="text-[8px] text-slate-400 block mt-1">Tanggal penentuan jatuh tempo tagihan dan kalkulasi denda otomatis.</span>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[10px] font-bold text-slate-700 block">No. Pelanggan Otomatis</span>
                              <span className="text-[8px] text-slate-400 block mt-0.5">Buat nomor pelanggan baru secara auto-increment</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={configFormatOtomatis}
                                onChange={(e) => setConfigFormatOtomatis(e.target.checked)}
                                className="sr-only peer" 
                              />
                              <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">Prefix No. Pelanggan</label>
                          <input
                            type="text"
                            value={configPrefixPelanggan}
                            disabled={!configFormatOtomatis}
                            onChange={(e) => setConfigPrefixPelanggan(e.target.value.toUpperCase())}
                            className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 focus:ring-1.5 focus:ring-blue-500 outline-none disabled:opacity-50"
                            placeholder="PLG"
                          />
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <label className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">Default Role User Baru</label>
                          <select
                            value={configDefaultRole}
                            onChange={(e) => setConfigDefaultRole(e.target.value as any)}
                            className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 focus:ring-1.5 focus:ring-blue-500 outline-none"
                          >
                            <option value="Petugas">Petugas Lapangan</option>
                            <option value="Admin">Administrator</option>
                          </select>
                        </div>
                      </div>

                      {/* Section: Validasi Transaksi & Kebijakan Input */}
                      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-3xs space-y-3.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1.5">Validasi &amp; Kebijakan Aplikasi</span>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-slate-700 block">Wajib Upload Foto Meter</span>
                            <span className="text-[8px] text-slate-400 block mt-0.5">Harus unggah foto meteran saat mencatat angka meter</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={configWajibFotoMeter}
                              onChange={(e) => setConfigWajibFotoMeter(e.target.checked)}
                              className="sr-only peer" 
                            />
                            <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-slate-700 block">Izinkan Edit Catat Meter</span>
                            <span className="text-[8px] text-slate-400 block mt-0.5">Perbolehkan mengubah data meter yang sudah disimpan</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={configIzinkanEditMeter}
                              onChange={(e) => setConfigIzinkanEditMeter(e.target.checked)}
                              className="sr-only peer" 
                            />
                            <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-slate-700 block">Izinkan Edit Transaksi Kas</span>
                            <span className="text-[8px] text-slate-400 block mt-0.5">Perbolehkan koreksi histori pencatatan kas masuk/keluar</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={configIzinkanEditKas}
                              onChange={(e) => setConfigIzinkanEditKas(e.target.checked)}
                              className="sr-only peer" 
                            />
                            <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        <div className="border-t border-slate-100 pt-3 flex items-center justify-between bg-amber-50/50 p-2 rounded-lg border border-amber-100">
                          <div>
                            <span className="text-[10px] font-extrabold text-amber-800 block">Mode Demo / Sandbox Trial</span>
                            <span className="text-[8px] text-amber-600 block mt-0.5">Mengaktifkan data dummy dan menyimulasikan transaksi cepat</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={configModeDemo}
                              onChange={(e) => setConfigModeDemo(e.target.checked)}
                              className="sr-only peer" 
                            />
                            <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-600"></div>
                          </label>
                        </div>
                      </div>

                      {/* Save Button */}
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.setItem('pams_config_tgl_tutup_buku', String(configTglTutupBuku));
                          localStorage.setItem('pams_config_format_otomatis', String(configFormatOtomatis));
                          localStorage.setItem('pams_config_prefix_pelanggan', configPrefixPelanggan);
                          localStorage.setItem('pams_config_default_role', configDefaultRole);
                          localStorage.setItem('pams_config_wajib_foto_meter', String(configWajibFotoMeter));
                          localStorage.setItem('pams_config_izinkan_edit_meter', String(configIzinkanEditMeter));
                          localStorage.setItem('pams_config_izinkan_edit_kas', String(configIzinkanEditKas));
                          localStorage.setItem('pams_config_mode_demo', String(configModeDemo));
                          showToast('Konfigurasi aplikasi disimpan!', 'success');
                          addLog('success', 'Settings: Updated app-wide validation configurations.');
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs transition shadow-md cursor-pointer text-center"
                      >
                        Simpan Pengaturan Aplikasi
                      </button>
                    </div>
                  )}

                  {/* TAB 3: BACKUP & RESTORE */}
                  {activeSettingsTab === 'backup' && (currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'Admin') && (
                    <div className="space-y-4 animate-fade-in">
                      {currentUser?.role !== 'Admin' && currentUser?.role !== 'SUPER_ADMIN' ? (
                        <div className="bg-white border border-slate-200 p-6 rounded-xl text-center space-y-3">
                          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto border border-rose-100">
                            <ShieldAlert size={20} />
                          </div>
                          <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Akses Terbatas (Admin Saja)</h3>
                          <p className="text-[10px] text-slate-500 leading-snug">
                            Maaf, tab Backup &amp; Restore hanya dapat diakses oleh pengguna dengan role <strong>Admin</strong>. Silakan beralih akun ke Admin pada sandbox di atas.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Export Card */}
                          <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-3xs space-y-3">
                            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                              <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                                <Download size={14} />
                              </div>
                              <div>
                                <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider block">Ekspor Cadangan / Backup</span>
                                <span className="text-[8px] text-slate-400 font-bold block mt-0.5 uppercase">Simpan database lokal ke JSON file</span>
                              </div>
                            </div>

                            <p className="text-[10px] text-slate-500 leading-normal">
                              Unduh seluruh salinan data KPSPAMS, mulai dari data Pelanggan, Dusun/Area, Tarif, Log Keuangan, hingga data Profil lembaga ke format file JSON yang aman.
                            </p>

                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1.5 font-mono text-[9px] text-slate-600">
                              <div className="flex justify-between">
                                <span>Backup Terakhir:</span>
                                <span className="font-bold text-slate-800">{lastBackupDate}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Ukuran File:</span>
                                <span className="font-bold text-slate-800">{lastBackupSize}</span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                const backupPayload = {
                                  version: '2.0',
                                  timestamp: new Date().toISOString(),
                                  users,
                                  pelanggan,
                                  areas,
                                  tarifs,
                                  abonemen,
                                  denda,
                                  settings: {
                                    systemNama,
                                    systemNamaDesa,
                                    systemKecamatan,
                                    systemKabupaten,
                                    systemProvinsi,
                                    systemAlamat,
                                    systemHp,
                                    systemEmail,
                                    systemKetua,
                                    systemBendahara,
                                    systemFooterStruk,
                                    systemLogo,
                                    systemStempel,
                                    configTglTutupBuku,
                                    configFormatOtomatis,
                                    configPrefixPelanggan,
                                    configDefaultRole,
                                    configWajibFotoMeter,
                                    configIzinkanEditMeter,
                                    configIzinkanEditKas,
                                    configModeDemo
                                  }
                                };

                                const jsonString = JSON.stringify(backupPayload, null, 2);
                                const blob = new Blob([jsonString], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                const dStr = new Date().toISOString().split('T')[0];
                                link.download = `PAMSDIGI_Backup_${dStr}.json`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);

                                const sizeKB = (blob.size / 1024).toFixed(2) + ' KB';
                                const localeNow = new Date().toLocaleString('id-ID');
                                setLastBackupDate(localeNow);
                                setLastBackupSize(sizeKB);
                                localStorage.setItem('pams_last_backup_date', localeNow);
                                localStorage.setItem('pams_last_backup_size', sizeKB);
                                showToast('Backup berhasil diunduh!', 'success');
                                addLog('success', `Backup: Exported system and billing tables (${sizeKB})`);
                              }}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-2 rounded-lg text-[10px] transition text-center cursor-pointer flex items-center justify-center gap-1.5 shadow-3xs"
                            >
                              <Download size={11} />
                              Unduh Cadangan JSON
                            </button>
                          </div>

                          {/* Import Card */}
                          <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-3xs space-y-3">
                            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                              <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
                                <Upload size={14} />
                              </div>
                              <div>
                                <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider block">Pulihkan Data / Restore</span>
                                <span className="text-[8px] text-slate-400 font-bold block mt-0.5 uppercase">Unggah berkas cadangan JSON</span>
                              </div>
                            </div>

                            <p className="text-[10px] text-slate-500 leading-normal">
                              Pilih file cadangan JSON PAMSDIGI yang valid untuk memulihkan seluruh konfigurasi KPSPAMS seketika.
                            </p>

                            <div className="relative">
                              <input
                                type="file"
                                accept=".json"
                                id="restore-file-uploader"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;

                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    try {
                                      const data = JSON.parse(event.target?.result as string);
                                      if (!data.users || !data.pelanggan || !data.areas || !data.tarifs) {
                                        alert('File JSON tidak valid atau format tidak didukung oleh PamsDigi.');
                                        return;
                                      }

                                      if (window.confirm(`KONFIRMASI RESTORE DATA?\n\nSemua data pelanggan, area, tarif, dan profil akan digantikan dengan data cadangan tanggal: ${data.timestamp ? new Date(data.timestamp).toLocaleString('id-ID') : 'Tidak diketahui'}.\n\nApakah Anda yakin ingin memulihkan data?`)) {
                                        if (data.settings) {
                                          const s = data.settings;
                                          if (s.systemNama) { setSystemNama(s.systemNama); localStorage.setItem('pams_system_nama', s.systemNama); }
                                          if (s.systemNamaDesa) { setSystemNamaDesa(s.systemNamaDesa); localStorage.setItem('pams_system_nama_desa', s.systemNamaDesa); }
                                          if (s.systemKecamatan) { setSystemKecamatan(s.systemKecamatan); localStorage.setItem('pams_system_kecamatan', s.systemKecamatan); }
                                          if (s.systemKabupaten) { setSystemKabupaten(s.systemKabupaten); localStorage.setItem('pams_system_kabupaten', s.systemKabupaten); }
                                          if (s.systemProvinsi) { setSystemProvinsi(s.systemProvinsi); localStorage.setItem('pams_system_provinsi', s.systemProvinsi); }
                                          if (s.systemAlamat) { setSystemAlamat(s.systemAlamat); localStorage.setItem('pams_system_alamat', s.systemAlamat); }
                                          if (s.systemHp) { setSystemHp(s.systemHp); localStorage.setItem('pams_system_hp', s.systemHp); }
                                          if (s.systemEmail) { setSystemEmail(s.systemEmail); localStorage.setItem('pams_system_email', s.systemEmail); }
                                          if (s.systemKetua) { setSystemKetua(s.systemKetua); localStorage.setItem('pams_system_ketua', s.systemKetua); }
                                          if (s.systemBendahara) { setSystemBendahara(s.systemBendahara); localStorage.setItem('pams_system_bendahara', s.systemBendahara); }
                                          if (s.systemFooterStruk) { setSystemFooterStruk(s.systemFooterStruk); localStorage.setItem('pams_system_footer_struk', s.systemFooterStruk); }
                                          if (s.systemLogo) { setSystemLogo(s.systemLogo); localStorage.setItem('pams_system_logo', s.systemLogo); }
                                          if (s.systemStempel) { setSystemStempel(s.systemStempel); localStorage.setItem('pams_system_stempel', s.systemStempel); }

                                          if (s.configTglTutupBuku) { setConfigTglTutupBuku(Number(s.configTglTutupBuku)); localStorage.setItem('pams_config_tgl_tutup_buku', String(s.configTglTutupBuku)); }
                                          if (s.configFormatOtomatis !== undefined) { setConfigFormatOtomatis(s.configFormatOtomatis); localStorage.setItem('pams_config_format_otomatis', String(s.configFormatOtomatis)); }
                                          if (s.configPrefixPelanggan) { setConfigPrefixPelanggan(s.configPrefixPelanggan); localStorage.setItem('pams_config_prefix_pelanggan', s.configPrefixPelanggan); }
                                          if (s.configDefaultRole) { setConfigDefaultRole(s.configDefaultRole); localStorage.setItem('pams_config_default_role', s.configDefaultRole); }
                                          if (s.configWajibFotoMeter !== undefined) { setConfigWajibFotoMeter(s.configWajibFotoMeter); localStorage.setItem('pams_config_wajib_foto_meter', String(s.configWajibFotoMeter)); }
                                          if (s.configIzinkanEditMeter !== undefined) { setConfigIzinkanEditMeter(s.configIzinkanEditMeter); localStorage.setItem('pams_config_izinkan_edit_meter', String(s.configIzinkanEditMeter)); }
                                          if (s.configIzinkanEditKas !== undefined) { setConfigIzinkanEditKas(s.configIzinkanEditKas); localStorage.setItem('pams_config_izinkan_edit_kas', String(s.configIzinkanEditKas)); }
                                          if (s.configModeDemo !== undefined) { setConfigModeDemo(s.configModeDemo); localStorage.setItem('pams_config_mode_demo', String(s.configModeDemo)); }
                                        }

                                        if (onRestoreAllData) {
                                          onRestoreAllData({
                                            users: data.users,
                                            pelanggan: data.pelanggan,
                                            areas: data.areas,
                                            tarifs: data.tarifs,
                                            abonemen: data.abonemen,
                                            denda: data.denda
                                          });
                                        }
                                        showToast('Database berhasil dipulihkan!', 'success');
                                        addLog('success', 'Backup: Successfully imported database from backup file.');
                                      }
                                    } catch (err) {
                                      alert('Format file cadangan tidak valid!');
                                    }
                                  };
                                  reader.readAsText(file);
                                }}
                              />
                              <label
                                htmlFor="restore-file-uploader"
                                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-xs font-extrabold border-2 border-dashed border-slate-300 cursor-pointer transition text-center flex flex-col items-center justify-center gap-1.5 p-4"
                              >
                                <Upload size={18} className="text-slate-400" />
                                <span>Pilih Berkas Backup (.json)</span>
                                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wide">Maks berkas 5MB</span>
                              </label>
                            </div>
                          </div>

                          {/* Reset Database Trigger */}
                          <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-3xs space-y-2.5">
                            <span className="text-[9px] font-extrabold text-rose-500 uppercase tracking-widest block">Hapus &amp; Reset Database</span>
                            <p className="text-[10px] text-slate-500 leading-snug">Kembalikan semua tabel spreadsheet (Pelanggan, Area, Tarif, Abonemen, Denda) ke format awal bawaan pabrik.</p>
                            
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm('PERINGATAN! Ini akan mengembalikan data simulasi ke format awal bawaan. Reset sekarang?')) {
                                  onResetData();
                                  showToast('Berhasil me-reset data simulasi!', 'success');
                                  addLog('info', 'Simulated Database Reset: Reverted spreadsheet state to defaults.');
                                }
                              }}
                              className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 py-2 rounded-xl text-xs font-extrabold transition text-center cursor-pointer"
                            >
                              Reset Spreadsheet ke Default
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* TAB 3.5: INTEGRASI DATABASE */}
                  {activeSettingsTab === 'database' && currentUser && (
                    currentUser?.role === 'SUPER_ADMIN' ? (
                      <div className="space-y-4 animate-fade-in text-white">
                      
                      {/* Main Integration Config Card (Dark theme) */}
                      <div className="bg-slate-900 text-white border border-slate-800 p-5 rounded-2xl shadow-xl space-y-5">
                        <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="bg-emerald-500/10 p-2.5 rounded-xl text-emerald-400 border border-emerald-500/20">
                              <Database size={16} />
                            </div>
                            <div>
                              <span className="text-xs font-extrabold text-slate-100 uppercase tracking-wider block">Integrasi Google Spreadsheet</span>
                              <span className="text-[9px] text-slate-400 font-bold block mt-0.5 uppercase">Aplikasi Tunggal Ke Google Sheets Langsung</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowSpreadsheetApiModal(true)}
                            className="bg-emerald-600 hover:bg-emerald-750 text-white font-extrabold text-[10px] px-3 py-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer border border-emerald-500/30 shadow-sm"
                          >
                            <Sparkles size={11} />
                            Spreadsheet API
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-4 text-slate-800">
                          
                          {/* Field 0: Nama Lembaga */}
                          <div className="space-y-1.5 text-left">
                            <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Nama Lembaga</label>
                            <input
                              type="text"
                              value={systemNama}
                              onChange={(e) => {
                                setSystemNama(e.target.value);
                                localStorage.setItem('pams_system_nama', e.target.value);
                              }}
                              disabled={currentUser?.role !== 'SUPER_ADMIN'}
                              className="w-full bg-slate-950/60 border border-slate-800 px-3 py-2 rounded-xl text-xs font-bold text-slate-200 focus:border-emerald-500 outline-none transition disabled:opacity-60 disabled:cursor-not-allowed"
                              placeholder="Contoh: KPSPAMS DESA SIAGA"
                            />
                            <p className="text-[8.5px] text-slate-400 font-medium">
                              Nama pengelola atau lembaga KPSPAMS Anda yang akan dicetak di kuitansi dan struk.
                            </p>
                          </div>

                          {/* Field 1.5: Apps Script Web App URL */}
                          <div className="space-y-1.5 text-left">
                            <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider font-sans">URL Google Apps Script</label>
                            <input
                              type="text"
                              value={dbGasUrl}
                              onChange={(e) => {
                                setDbGasUrl(e.target.value);
                                localStorage.setItem('pams_google_gas_url', e.target.value);
                              }}
                              disabled={currentUser?.role !== 'SUPER_ADMIN'}
                              className="w-full bg-slate-950/60 border border-slate-800 px-3 py-2 rounded-xl text-xs font-mono font-bold text-slate-200 focus:border-emerald-500 outline-none transition disabled:opacity-60 disabled:cursor-not-allowed"
                              placeholder="Contoh: https://script.google.com/macros/s/.../exec"
                            />
                            <p className="text-[8.5px] text-slate-400 font-medium font-sans">
                              Masukkan URL Web App dari Apps Script untuk sinkronisasi menulis dan membaca data secara realtime.
                            </p>
                          </div>

                          {/* Field 2: Status Koneksi */}
                          <div className="flex items-center justify-between bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
                            <div className="text-left">
                              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Status Koneksi Database</span>
                              <p className="text-[9.5px] text-slate-400 mt-0.5 font-medium font-sans">Kondisi sinkronisasi cloud real-time saat ini.</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {dbSyncStatus === 'Connected' && dbGasUrl ? (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase tracking-wider">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                  CONNECTED
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-full uppercase tracking-wider">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                                  BELUM TERHUBUNG
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Warning Alert when Database is Not Configured / Reset */}
                          {(dbSyncStatus !== 'Connected' || !dbGasUrl) && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3 text-left font-sans animate-fadeIn">
                              <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                              <div className="space-y-1">
                                <h4 className="text-xs font-black text-amber-300 uppercase tracking-wide">
                                  Database belum dikonfigurasi.
                                </h4>
                                <p className="text-[11px] text-slate-300 font-medium leading-relaxed font-sans">
                                  Seluruh proses sinkronisasi real-time CRUD ke Google Spreadsheet saat ini dinonaktifkan. Masukkan URL Google Apps Script client baru pada kolom di atas lalu klik <strong className="text-emerald-400 font-bold">"Simpan / Cek Database"</strong> untuk mendaftarkan dan menghubungkan database baru.
                                </p>
                              </div>
                            </div>
                          )}

                        </div>

                        {/* DB Verification Progress Checklist */}
                        {dbCheckSteps.length > 0 && (
                          <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3.5 space-y-2.5 text-left font-sans animate-fadeIn">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Progres Verifikasi Database</span>
                              {isCheckingDb ? (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-400 animate-pulse bg-amber-500/10 px-2 py-0.5 rounded-full uppercase">
                                  <span className="w-1 h-1 rounded-full bg-amber-400 animate-ping"></span>
                                  Memproses...
                                </span>
                              ) : dbCheckSteps.some(s => s.status === 'error') ? (
                                <span className="text-[9px] font-extrabold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full uppercase">
                                  Gagal
                                </span>
                              ) : (
                                <span className="text-[9px] font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase">
                                  Selesai
                                </span>
                              )}
                            </div>
                            <div className="space-y-2">
                              {dbCheckSteps.map((step, idx) => (
                                <div key={step.id} className="flex items-start gap-2.5 text-xs">
                                  <div className="mt-0.5">
                                    {step.status === 'idle' && (
                                      <div className="w-3.5 h-3.5 rounded-full border border-slate-700 flex items-center justify-center text-[8px] text-slate-500 font-bold">
                                        {idx + 1}
                                      </div>
                                    )}
                                    {step.status === 'loading' && (
                                      <div className="w-3.5 h-3.5 rounded-full border border-amber-500 border-t-transparent animate-spin flex items-center justify-center"></div>
                                    )}
                                    {step.status === 'success' && (
                                      <div className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-[8px] text-emerald-400 font-bold">
                                        ✓
                                      </div>
                                    )}
                                    {step.status === 'error' && (
                                      <div className="w-3.5 h-3.5 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-[8px] text-rose-400 font-bold">
                                        ✗
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-[11px] font-bold transition-colors ${
                                      step.status === 'success' ? 'text-slate-300' :
                                      step.status === 'loading' ? 'text-amber-400 font-extrabold' :
                                      step.status === 'error' ? 'text-rose-400 font-extrabold' :
                                      'text-slate-500 font-medium'
                                    }`}>
                                      {step.label}
                                    </p>
                                    {step.status === 'error' && step.errorDetail && (
                                      <div className="mt-1 bg-rose-500/5 p-2 rounded-lg border border-rose-500/10">
                                        {step.errorDetail.includes('======================================================') ? (
                                          <pre className="text-[10px] text-rose-300 font-mono leading-relaxed select-all whitespace-pre-wrap break-all bg-slate-950 p-3 rounded-lg border border-rose-500/20 max-h-96 overflow-y-auto">
                                            {step.errorDetail}
                                          </pre>
                                        ) : (
                                          <p className="text-[9px] text-rose-400 font-medium leading-relaxed select-text">
                                            Penyebab: {step.errorDetail}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Buttons Action Group */}
                        <div className="flex flex-wrap gap-2.5 pt-2.5 border-t border-slate-850">
                          <button
                            type="button"
                            onClick={handleCheckDatabase}
                            disabled={currentUser?.role !== 'SUPER_ADMIN' || isCheckingDb}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] px-4 py-2.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-950/30 font-sans disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isCheckingDb ? (
                              <RefreshCw size={12} className="animate-spin" />
                            ) : (
                              <Check size={12} />
                            )}
                            Simpan / Cek Database
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const newUrl = prompt('Masukkan URL Google Apps Script Baru:', dbGasUrl);
                              if (newUrl === null) return;
                              const trimmed = newUrl.trim();
                              setDbGasUrl(trimmed);
                              localStorage.setItem('pams_google_gas_url', trimmed);
                              setDbCheckSteps([]); // Clear checklist
                              showToast('URL Google Apps Script diperbarui. Silakan klik "Simpan / Cek Database" untuk menguji koneksi.', 'success');
                            }}
                            disabled={currentUser?.role !== 'SUPER_ADMIN' || isCheckingDb}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-extrabold text-[10px] px-3.5 py-2.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Edit size={12} />
                            Ganti URL Apps Script
                          </button>

                          {/* 🔴 DISCONNECT DATABASE BUTTON */}
                          <button
                            type="button"
                            onClick={() => setShowResetDbModal(true)}
                            disabled={currentUser?.role !== 'SUPER_ADMIN' || isCheckingDb}
                            className="bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-extrabold text-[10px] px-3.5 py-2.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 sm:ml-auto disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <RotateCcw size={12} className="text-rose-400" />
                            🔌 Disconnect Database
                          </button>
                        </div>
                      </div>

                      {/* --- DISCONNECT DATABASE CONFIRMATION MODAL --- */}
                      {showResetDbModal && (
                        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 animate-fadeIn font-sans text-slate-100">
                          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 text-left">
                            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                              <div className="bg-rose-500/20 p-2.5 rounded-xl border border-rose-500/30 text-rose-400">
                                <AlertTriangle size={20} />
                              </div>
                              <div>
                                <h3 className="font-extrabold text-sm text-slate-100">Konfirmasi Disconnect Database</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">PAMSDIGI Multi-Client Onboarding</p>
                              </div>
                            </div>

                            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-850 space-y-2">
                              <p className="text-xs font-bold text-rose-300 leading-relaxed">
                                Memutus koneksi aktif aplikasi dari Google Apps Script.
                              </p>
                              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                                Aplikasi akan berubah menjadi status <strong className="text-rose-400">BELUM TERHUBUNG</strong>. Data dan identitas aplikasi tetap aman dan tidak dihapus.
                              </p>
                              <p className="text-[11px] text-slate-400 font-semibold pt-1 border-t border-slate-850">
                                Lanjutkan Disconnect?
                              </p>
                            </div>

                            <div className="flex items-center justify-end gap-2.5 pt-2">
                              <button
                                type="button"
                                onClick={() => setShowResetDbModal(false)}
                                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold text-xs transition cursor-pointer border border-slate-700 font-sans"
                              >
                                Batal
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  handleResetDatabase();
                                  setShowResetDbModal(false);
                                }}
                                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition cursor-pointer shadow-md shadow-rose-950/40 flex items-center gap-1.5 font-sans"
                              >
                                <RotateCcw size={13} />
                                Ya, Disconnect Database
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Info Card: Database Aktif */}
                      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md space-y-3">
                        <div className="flex items-center gap-1.5 border-b border-slate-850 pb-1.5">
                          <Link2 size={12} className="text-amber-400" />
                          <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider block">
                            DATABASE AKTIF
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs text-left">
                          <div>
                            <span className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wider block">Nama Database</span>
                            <span className="font-extrabold text-slate-100 block mt-0.5">{dbSpreadsheetName}</span>
                          </div>

                          <div>
                            <span className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wider block">Tanggal Koneksi Terakhir:</span>
                            <span className="font-extrabold text-slate-100 block mt-0.5">{dbLastConnected}</span>
                          </div>

                          <div>
                            <span className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wider block">Status Sinkronisasi:</span>
                            <span className="font-extrabold text-slate-100 block mt-0.5 flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${dbSyncStatus === 'Connected' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`}></span>
                              {dbSyncStatus === 'Connected' ? 'Tersinkronisasi' : 'Offline / Standalone'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* --- GOOGLE APPS SCRIPT SPREADSHEET API MODAL --- */}
                      {showSpreadsheetApiModal && (
                        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in text-slate-100 font-sans">
                          <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl w-full max-w-lg p-5 max-h-[95%] overflow-y-auto shadow-2xl relative space-y-4 flex flex-col text-left font-sans">
                            
                            {/* Modal Header */}
                            <div className="flex justify-between items-center pb-3 border-b border-slate-800 shrink-0">
                              <div className="flex items-center gap-2">
                                <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-400 border border-emerald-500/20">
                                  <FileCode size={16} />
                                </div>
                                <div>
                                  <h3 className="font-extrabold text-slate-100 text-sm">Spreadsheet API</h3>
                                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Single Source of Truth</p>
                                </div>
                              </div>
                              <button 
                                onClick={() => {
                                  setShowSpreadsheetApiModal(false);
                                  setCopiedState(false);
                                }} 
                                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-full transition cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>

                            {/* API Info / Metadata section */}
                            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850/80 grid grid-cols-3 gap-2 text-center shrink-0">
                              <div>
                                <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider block">API Version</span>
                                <span className="text-xs font-black text-emerald-400 mt-1 block">v2.3.1</span>
                              </div>
                              <div>
                                <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider block">Last Update</span>
                                <span className="text-xs font-black text-slate-100 mt-1 block">05 Sep 2026</span>
                              </div>
                              <div>
                                <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider block">Status</span>
                                <span className="inline-block text-[9px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full mt-1">
                                  Production Ready
                                </span>
                              </div>
                            </div>

                            {/* CHANGE LOG Section */}
                            <div className="bg-slate-950/40 border border-slate-850/50 rounded-xl p-3 space-y-1.5 shrink-0">
                              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">CHANGE LOG</span>
                              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide">Daftar Perubahan API Terbaru (v2.3.1)</p>
                              <div className="space-y-1 text-[10.5px] text-slate-300 font-sans">
                                <div className="flex items-start gap-1.5">
                                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                                  <span><strong>[LIVE DYNAMIC SPREADSHEET NAME (Db_pamsdigi)]</strong> Memastikan nama database langsung membaca nama live file Google Spreadsheet (<code>Db_pamsdigi</code>) secara dinamis melalui <code>db.getName()</code> dan menyimpannya ke sheet <code>Konfigurasi</code>.</span>
                                </div>
                                <div className="flex items-start gap-1.5">
                                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                                  <span><strong>[SINGLE SOURCE OF TRUTH SHEET KONFIGURASI]</strong> URL Apps Script, Spreadsheet ID, dan status sinkronisasi global kini disimpan langsung ke sheet <code>Konfigurasi</code> di Google Spreadsheet sehingga semua perangkat langsung sinkron tanpa config manual.</span>
                                </div>
                                <div className="flex items-start gap-1.5">
                                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                                  <span><strong>[HIGH-SPEED READ VIA GOOGLE GVIZ API]</strong> Pembacaan seluruh data sheet menggunakan GViz Query API secara paralel tanpa batas kuota execution Apps Script.</span>
                                </div>
                                <div className="flex items-start gap-1.5">
                                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                                  <span><strong>[NON-DESTRUCTIVE AUTO-CREATE SHEETS]</strong> Otomatis membuat seluruh tab/sheet yang dibutuhkan aplikasi saat spreadsheet baru/kosong dihubungkan, termasuk sheet Konfigurasi, Profil, Users, Pelanggan, Area, Tarif, Abonemen, Denda, Meter, Tagihan, dan Pembayaran tanpa menghapus data lama.</span>
                                </div>
                                <div className="flex items-start gap-1.5">
                                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                                  <span><strong>[FULL SPREADSHEET DATABASE CRUD]</strong> Seluruh operasi create, read, update, dan delete tersimpan permanen di Google Spreadsheet.</span>
                                </div>
                                <div className="flex items-start gap-1.5">
                                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                                  <span><strong>[LIVE AUTHENTICATION SPREADSHEET]</strong> Validasi login user petugas dan admin langsung diverifikasi ke baris sheet <code>Users</code> di Google Spreadsheet secara real-time.</span>
                                </div>
                                <div className="flex items-start gap-1.5">
                                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                                  <span><strong>[GLOBAL SYNC MULTI-DEVICE]</strong> Ketika Superadmin menyambungkan atau memperbarui konfigurasi di satu perangkat, seluruh device lain (HP petugas, kasir) otomatis terkoneksi ke spreadsheet yang sama.</span>
                                </div>
                              </div>
                            </div>

                            {/* Panduan Update */}
                            <div className="space-y-1.5 shrink-0">
                              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Panduan Instalasi &amp; Deploy</span>
                              <div className="bg-slate-950/40 border border-slate-850/50 rounded-xl p-3 text-[10.5px] text-slate-300 space-y-1 font-sans leading-relaxed">
                                <p><strong className="text-emerald-400">1.</strong> Buka Google Spreadsheet &amp; klik menu <strong className="text-slate-100">Extensions &rarr; Apps Script</strong>.</p>
                                <p><strong className="text-emerald-400">2.</strong> Hapus seluruh isi dari file <strong className="text-slate-100">Code.gs</strong> lama di Apps Script editor.</p>
                                <p><strong className="text-emerald-400">3.</strong> Klik tombol <strong className="text-emerald-400 font-bold">COPY CODE</strong> di bawah untuk menyalin seluruh isi Code.gs baru.</p>
                                <p><strong className="text-emerald-400">4.</strong> Paste seluruh kode baru tersebut ke dalam file <strong className="text-slate-100">Code.gs</strong>.</p>
                                <p><strong className="text-emerald-400">5.</strong> Klik ikon disket untuk <strong className="text-slate-100">Simpan</strong> proyek.</p>
                                <p><strong className="text-emerald-400">6.</strong> Klik tombol <strong className="text-emerald-400 font-bold">Terapkan &rarr; Penerapan Baru</strong> (Deploy &rarr; New Deployment).</p>
                                <p><strong className="text-emerald-400">7.</strong> Pilih jenis <strong className="text-slate-100">Aplikasi Web</strong> (Web App) jika belum terpilih.</p>
                                <p><strong className="text-emerald-400">8.</strong> Ubah opsi <strong className="text-slate-100">"Yang memiliki akses" (Who has access)</strong> menjadi <strong className="text-emerald-400 font-bold">Siapa saja (Anyone)</strong>, lalu klik <strong className="text-slate-100 font-bold">Terapkan</strong>.</p>
                                <p><strong className="text-emerald-400">9.</strong> Salin <strong className="text-slate-100 font-bold">URL Aplikasi Web</strong> yang dihasilkan.</p>
                                <p><strong className="text-emerald-400">10.</strong> Kembali ke aplikasi PAMSDIGI, klik <strong className="text-slate-100">Ganti URL Apps Script</strong>, paste URL, klik <strong className="text-slate-100">Simpan URL</strong>, dan lakukan <strong className="text-slate-100">Test Koneksi</strong>.</p>
                              </div>
                            </div>

                            {/* Code Block Section */}
                            <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
                              <div className="flex justify-between items-center shrink-0">
                                <div className="flex flex-col max-w-[70%]">
                                  <span className="text-[9px] font-extrabold text-slate-300 uppercase tracking-wider truncate">
                                    File: Code.gs
                                  </span>
                                  <span className="text-[8.5px] text-slate-500 font-bold truncate">
                                    Full REST API &amp; CRUD database integration
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const codeToCopy = gasFiles[0]?.content || '';
                                    navigator.clipboard.writeText(codeToCopy);
                                    setCopiedState(true);
                                    setTimeout(() => setCopiedState(false), 2000);
                                  }}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[9px] px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer border border-emerald-500/25 shrink-0"
                                >
                                  {copiedState ? <Check size={10} /> : <Copy size={10} />}
                                  {copiedState ? 'COPIED' : 'COPY CODE'}
                                </button>
                              </div>

                              <div className="bg-slate-950 border border-slate-850 rounded-xl p-3 flex-1 overflow-y-auto max-h-[160px] font-mono text-[9px] text-slate-300 whitespace-pre-wrap select-all leading-relaxed">
                                {gasFiles[0]?.content}
                              </div>
                            </div>

                            {/* Close button at bottom */}
                            <button
                              onClick={() => {
                                setShowSpreadsheetApiModal(false);
                                setCopiedState(false);
                              }}
                              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-750 font-extrabold text-[11px] py-2.5 rounded-xl transition cursor-pointer text-center shrink-0"
                            >
                              Tutup Panduan
                            </button>

                          </div>
                        </div>
                      )}

                    </div>
                  ) : (
                    /* TAMPILAN SELAIN SUPERUSER (ADMIN, PETUGAS): HANYA TAMPILKAN STATUS KONEKSI (GAMBAR 2) DAN DATABASE AKTIF (GAMBAR 3) */
                    <div className="space-y-4 animate-fade-in text-white font-sans">
                      {/* Gambar 2: STATUS KONEKSI DATABASE */}
                      <div className="bg-slate-900 text-white border border-slate-800 p-4 rounded-2xl shadow-xl">
                        <div className="flex items-center justify-between bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                          <div className="text-left">
                            <span className="text-[10px] font-extrabold text-slate-300 uppercase tracking-wider block">Status Koneksi Database</span>
                            <p className="text-[9.5px] text-slate-400 mt-0.5 font-medium font-sans">Kondisi sinkronisasi cloud real-time saat ini.</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {dbSyncStatus === 'Connected' && dbGasUrl ? (
                              <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1.5 rounded-full uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                CONNECTED
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3.5 py-1.5 rounded-full uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                                BELUM TERHUBUNG
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Gambar 3: DATABASE AKTIF */}
                      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md space-y-3">
                        <div className="flex items-center gap-1.5 border-b border-slate-850 pb-1.5">
                          <Link2 size={12} className="text-amber-400" />
                          <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider block">
                            DATABASE AKTIF
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs text-left">
                          <div>
                            <span className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wider block">Nama Database</span>
                            <span className="font-extrabold text-slate-100 block mt-0.5">{dbSpreadsheetName}</span>
                          </div>

                          <div>
                            <span className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wider block">Tanggal Koneksi Terakhir:</span>
                            <span className="font-extrabold text-slate-100 block mt-0.5">{dbLastConnected}</span>
                          </div>

                          <div>
                            <span className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wider block">Status Sinkronisasi:</span>
                            <span className="font-extrabold text-slate-100 block mt-0.5 flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${dbSyncStatus === 'Connected' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`}></span>
                              {dbSyncStatus === 'Connected' ? 'Tersinkronisasi' : 'Offline / Standalone'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                )}

                  {/* TAB 4: LISENSI SISTEM */}
                  {activeSettingsTab === 'lisensi' && currentUser && (
                    <div className="space-y-4 animate-fade-in text-slate-800">
                      {currentUser?.role === 'SUPER_ADMIN' ? (
                        <>
                          <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-3xs space-y-4">
                            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                              <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                                <Shield size={14} />
                              </div>
                              <div>
                                <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider block">LISENSI PAMSDIGI</span>
                                <span className="text-[8px] text-slate-400 font-bold block mt-0.5 uppercase">Sistem Aktivasi &amp; Status</span>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div className="space-y-3">
                                <div>
                                  <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Status Operasi:</span>
                                  <span className={`inline-block text-[11px] font-black px-2.5 py-0.5 rounded-md mt-1 ${
                                    currentMode === 'LIFETIME'
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : currentMode === 'TRIAL'
                                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                        : 'bg-slate-100 text-slate-800 border border-slate-200'
                                  }`}>
                                    {currentMode === 'LIFETIME' ? 'MODE LIFETIME' : currentMode === 'TRIAL' ? 'MODE TRIAL' : 'MODE DEMO'}
                                  </span>
                                  <p className="text-[9px] text-slate-500 mt-1 leading-snug">
                                    {currentMode === 'LIFETIME'
                                      ? 'Sistem aktif penuh selamanya dengan integrasi Google Spreadsheet.'
                                      : currentMode === 'TRIAL'
                                        ? 'Sistem terhubung penuh ke Google Spreadsheet (Masa Trial Aktif).'
                                        : 'Sistem berjalan standalone (Demo). Data sementara akan dibersihkan saat Logout.'}
                                  </p>
                                </div>

                                {currentMode === 'TRIAL' && (
                                  <div>
                                    <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Sisa Trial:</span>
                                    <span className="text-[11px] text-slate-800 font-black">
                                      {getTrialRemainingDays()} hari
                                    </span>
                                  </div>
                                )}

                                {licenseStatus === 'LIFETIME' && (
                                  <div>
                                    <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Serial Aktif:</span>
                                    <span className="text-[11px] font-mono text-emerald-600 font-extrabold block mt-0.5">
                                      {licenseKey}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="border-t border-slate-100 pt-4 space-y-2.5">
                                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider">Input Serial</label>
                                <input
                                  type="text"
                                  value={licenseKey}
                                  onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs font-mono font-bold text-slate-700 focus:ring-1.5 focus:ring-indigo-500 outline-none"
                                  placeholder="PAMSDIGI-XXXX-001"
                                />
                                
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const trimmedKey = licenseKey.trim();
                                      if (!trimmedKey) {
                                        showToast('Silakan masukkan serial key terlebih dahulu!', 'error');
                                        return;
                                      }
                                      
                                      if (validSerials.includes(trimmedKey) || trimmedKey.match(/^PAMSDIGI-[A-Z0-9]{4}-001$/)) {
                                        setLicenseStatus('LIFETIME');
                                        localStorage.setItem('pams_license_status', 'LIFETIME');
                                        localStorage.setItem('pams_license_key', trimmedKey);
                                        
                                        const logEntry = `${new Date().toLocaleString('id-ID')}: Aktivasi sukses menggunakan serial ${trimmedKey}`;
                                        const updatedLogs = [logEntry, ...activationLogs];
                                        setActivationLogs(updatedLogs);
                                        localStorage.setItem('pams_activation_logs', JSON.stringify(updatedLogs));

                                        showToast('Aktivasi Berhasil! Status berubah menjadi LIFETIME ACTIVE.', 'success');
                                        addLog('success', 'License: Activated system license with code: ' + trimmedKey);
                                      } else {
                                        showToast('Kode serial tidak valid atau tidak terdaftar!', 'error');
                                      }
                                    }}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-2 rounded-xl text-xs transition text-center cursor-pointer shadow-3xs"
                                  >
                                    Aktivasi
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* SUPER_ADMIN DEVELOPER PANEL */}
                          <div className="bg-slate-900 text-white border border-slate-800 p-4 rounded-xl shadow-md space-y-4">
                            <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
                              <div className="bg-amber-500/10 p-2 rounded-lg text-amber-400 border border-amber-500/25">
                                <Terminal size={14} />
                              </div>
                              <div>
                                <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider block">DEVELOPER PANEL</span>
                                <span className="text-[8px] text-slate-400 font-bold block mt-0.5 uppercase">Akses Khusus Super Admin</span>
                              </div>
                            </div>

                            <div className="space-y-4 text-xs">
                              {/* Action 1: Generate Serial Lifetime */}
                              <div className="bg-slate-800/50 border border-slate-800 p-2.5 rounded-lg space-y-2">
                                <span className="text-[9px] font-bold text-slate-400 uppercase block">1. Generate Serial Lifetime</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                                    let randPart = '';
                                    for (let i = 0; i < 4; i++) {
                                      randPart += chars.charAt(Math.floor(Math.random() * chars.length));
                                    }
                                    const generatedKey = `PAMSDIGI-${randPart}-001`;
                                    
                                    const updatedSerials = [...validSerials, generatedKey];
                                    setValidSerials(updatedSerials);
                                    localStorage.setItem('pams_valid_serials', JSON.stringify(updatedSerials));
                                    setLicenseKey(generatedKey);
                                    
                                    showToast(`Berhasil Generate Serial: ${generatedKey}`, 'success');
                                    addLog('success', `Developer: Generated license serial: ${generatedKey}`);
                                  }}
                                  className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-1.5 px-3 rounded-lg text-[10px] transition text-center cursor-pointer"
                                >
                                  Buat Serial Key Baru
                                </button>

                                {validSerials.length > 0 && (
                                  <div className="space-y-1 mt-1">
                                    <span className="text-[8px] text-slate-500 font-bold uppercase block">Daftar Serial Terdaftar:</span>
                                    <div className="max-h-20 overflow-y-auto text-[9px] font-mono text-slate-300 space-y-0.5 bg-slate-950/40 p-1 rounded border border-slate-800">
                                      {validSerials.map((s, idx) => (
                                        <div key={idx} className="flex justify-between items-center px-1">
                                          <span>{s}</span>
                                          <span className="text-[7px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded">VALID</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Action 2 & 3: Reset Trial / Suspend */}
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const todayStr = new Date().toISOString().split('T')[0];
                                    setTrialStartDate(todayStr);
                                    localStorage.setItem('pams_trial_start_date', todayStr);
                                    setLicenseStatus('TRIAL');
                                    localStorage.setItem('pams_license_status', 'TRIAL');
                                    showToast('Masa Trial Berhasil Direset ke 7 Hari!', 'success');
                                    addLog('info', 'Developer: Reset trial duration to day 1 (7 days remaining).');
                                  }}
                                  className="bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 py-1.5 rounded-lg text-[10px] font-bold transition text-center cursor-pointer"
                                >
                                  Reset Trial
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setLicenseStatus('TRIAL');
                                    localStorage.setItem('pams_license_status', 'TRIAL');
                                    showToast('Lisensi Berhasil Ditangguhkan!', 'success');
                                    addLog('info', 'Developer: Suspended system license status.');
                                  }}
                                  className="bg-rose-950/45 hover:bg-rose-950 text-rose-300 border border-rose-900/40 py-1.5 rounded-lg text-[10px] font-bold transition text-center cursor-pointer"
                                >
                                  Suspend Lisensi
                                </button>
                              </div>

                              {/* Action 4: Data Aktivasi Logs */}
                              <div className="bg-slate-800/50 border border-slate-800 p-2.5 rounded-lg space-y-1.5">
                                <span className="text-[9px] font-bold text-slate-400 uppercase block">4. Data Aktivasi</span>
                                <div className="max-h-24 overflow-y-auto text-[9px] font-mono text-slate-300 space-y-1 bg-slate-950/40 p-1.5 rounded border border-slate-800">
                                  {activationLogs.length === 0 ? (
                                    <span className="text-slate-500 italic">Belum ada aktivitas lisensi.</span>
                                  ) : (
                                    activationLogs.map((log, idx) => (
                                      <div key={idx} className="border-b border-slate-800/35 pb-1 last:border-0 leading-normal">
                                        {log}
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-3xs space-y-4">
                          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                            <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                              <Shield size={14} />
                            </div>
                            <div>
                              <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider block">LISENSI PAMSDIGI</span>
                              <span className="text-[8px] text-slate-400 font-bold block mt-0.5 uppercase">Status &amp; Informasi Lisensi</span>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-3">
                              <div>
                                <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Status Lisensi:</span>
                                {licenseStatus === 'LIFETIME' ? (
                                  <div className="mt-1">
                                    <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      Lifetime Active
                                    </span>
                                    <p className="text-[9px] text-slate-500 mt-1 leading-snug">
                                      Sistem PAMSDIGI Anda telah aktif sepenuhnya dengan lisensi seumur hidup. Seluruh fitur utama dan sinkronisasi data dapat digunakan tanpa batasan waktu.
                                    </p>
                                  </div>
                                ) : (
                                  <div className="mt-1">
                                    <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                                      Trial
                                    </span>
                                    <p className="text-[9px] text-slate-500 mt-1 leading-snug">
                                      Sistem Anda berjalan dalam masa uji coba (Trial). Silakan hubungi pengurus atau Super Admin untuk aktivasi lisensi penuh.
                                    </p>
                                  </div>
                                )}
                              </div>

                              {licenseStatus !== 'LIFETIME' && (
                                <div>
                                  <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Sisa Hari Trial:</span>
                                  <span className="text-[12px] text-slate-800 font-black block mt-1">
                                    {getTrialRemainingDays()} hari
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- BOTTOM SHEET MODAL (Pelanggan Form Add/Edit) --- */}
            {isModalOpen && (
              <div className="absolute inset-0 bg-black/60 z-40 flex items-end">
                <div className="bg-white rounded-t-2xl w-full p-4 max-h-[90%] overflow-y-auto shadow-2xl relative space-y-3.5 flex flex-col">
                  <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto"></div>
                  
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <div className="space-y-0.5">
                      <h3 className="font-extrabold text-slate-800 text-sm">
                        {pelanggan.some(p => p.noPelanggan === formNoPelanggan) ? `Edit Pelanggan: ${formNoPelanggan}` : 'Pendaftaran Pelanggan Baru'}
                      </h3>
                      {!pelanggan.some(p => p.noPelanggan === formNoPelanggan) && configModeDemo && (
                        <button
                          type="button"
                          onClick={handleAutofillDemoPelanggan}
                          className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[8.5px] font-extrabold py-0.5 px-2 rounded-md flex items-center gap-1 transition mt-0.5 shadow-3xs cursor-pointer"
                        >
                          ⚡ Isi Data Demo Otomatis
                        </button>
                      )}
                    </div>
                    <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:bg-slate-50 rounded-full">✕</button>
                  </div>

                  <form onSubmit={handlePelangganFormSubmit} className="space-y-3 flex-1">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        ID Pelanggan (Sistem Auto-Generate) *
                      </label>
                      <input 
                        type="text" 
                        required
                        readOnly={true} 
                        value={formNoPelanggan}
                        className="w-full border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono font-bold outline-none bg-slate-100 text-slate-500 cursor-not-allowed"
                        placeholder="YYMMDD0001"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nama Lengkap *</label>
                      <input 
                        type="text" required value={formNama} onChange={(e) => setFormNama(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs focus:ring-1.5 focus:ring-blue-500 outline-none"
                        placeholder="Contoh: Ahmad Dahlan"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Area / Dusun *</label>
                        <select 
                          value={formArea} onChange={(e) => setFormArea(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg text-xs focus:ring-1.5 focus:ring-blue-500 outline-none font-bold"
                        >
                          {areas.map(a => <option key={a.id} value={a.nama}>{a.nama}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Golongan Tarif *</label>
                        <select 
                          value={formGolongan} onChange={(e) => setFormGolongan(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg text-xs focus:ring-1.5 focus:ring-blue-500 outline-none font-bold"
                        >
                          {tarifs.map(t => <option key={t.id} value={t.golongan}>{t.golongan}</option>)}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Alamat Lengkap (RT/RW) *</label>
                      <input 
                        type="text" required value={formAlamat} onChange={(e) => setFormAlamat(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs focus:ring-1.5 focus:ring-blue-500 outline-none"
                        placeholder="RT 01 RW 02"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tempat Pasang Meter *</label>
                        <input 
                          type="text" required value={formTempat} onChange={(e) => setFormTempat(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs focus:ring-1.5 focus:ring-blue-500 outline-none"
                          placeholder="Kamar Mandi"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">HP / Telepon</label>
                        <input 
                          type="tel" value={formTelepon} onChange={(e) => setFormTelepon(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs focus:ring-1.5 focus:ring-blue-500 outline-none"
                          placeholder="0812345..."
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tgl Pasang *</label>
                        <input 
                          type="date" required value={formTgl} onChange={(e) => setFormTgl(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg text-xs focus:ring-1.5 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Meter Awal (m³) *</label>
                        <input 
                          type="number" min="0" required value={formMeter} onChange={(e) => setFormMeter(Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs focus:ring-1.5 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status Keaktifan *</label>
                      <select 
                        value={formStatus} onChange={(e) => setFormStatus(e.target.value as 'Aktif' | 'Nonaktif')}
                        className="w-full bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg text-xs focus:ring-1.5 focus:ring-blue-500 outline-none"
                      >
                        <option value="Aktif">Aktif</option>
                        <option value="Nonaktif">Nonaktif</option>
                      </select>
                    </div>

                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold p-2.5 rounded-xl text-xs shadow-md transition duration-150 mt-2 cursor-pointer">
                      {formNoPelanggan ? 'Simpan Perubahan' : 'Daftarkan Pelanggan Baru'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* --- BOTTOM SHEET MODAL (Edit Transaksi Kas) --- */}
            {isEditTransModalOpen && editingTransaction && (
              <div className="absolute inset-0 bg-black/60 z-40 flex items-end">
                <div className="bg-white rounded-t-2xl w-full p-4 max-h-[90%] overflow-y-auto shadow-2xl relative space-y-3.5 flex flex-col">
                  <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto"></div>
                  
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <h3 className="font-extrabold text-slate-800 text-sm">
                      Edit Transaksi: {editingTransaction.id}
                    </h3>
                    <button onClick={() => { setIsEditTransModalOpen(false); setEditingTransaction(null); }} className="p-1 text-slate-400 hover:bg-slate-50 rounded-full text-xs font-black">✕</button>
                  </div>

                  <form onSubmit={handleSaveEditTransaction} className="space-y-3 flex-1 text-[11px]">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Keterangan Transaksi *</label>
                      <input 
                        type="text" required value={editTransDeskripsi} onChange={(e) => setEditTransDeskripsi(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs outline-none focus:ring-1.5 focus:ring-blue-500 font-bold text-slate-800"
                        placeholder="Deskripsi transaksi"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Jenis Aliran *</label>
                        <select 
                          value={editTransTipe} onChange={(e) => setEditTransTipe(e.target.value as 'Masuk' | 'Keluar')}
                          className="w-full bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg text-xs outline-none font-bold text-slate-800"
                        >
                          <option value="Masuk">Kas Masuk (+)</option>
                          <option value="Keluar">Kas Keluar (-)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Kategori Akun *</label>
                        <select 
                          value={editTransKategoriId} onChange={(e) => setEditTransKategoriId(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg text-xs outline-none font-bold text-blue-700"
                          required
                        >
                          <option value="">-- Pilih Kategori --</option>
                          {categories.filter(c => c.tipe === editTransTipe).map(c => (
                            <option key={c.id} value={c.id}>{c.nama}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tanggal Transaksi *</label>
                        <input 
                          type="date" required value={editTransTanggal} onChange={(e) => setEditTransTanggal(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold text-slate-800 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Wilayah Dusun *</label>
                        <select 
                          value={editTransArea} onChange={(e) => setEditTransArea(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-800 outline-none"
                        >
                          <option value="ALL">ALL AREA</option>
                          {areas.map(a => (
                            <option key={a.id} value={a.nama}>{a.nama}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nominal Transaksi (Rp) *</label>
                      <input 
                        type="number" required value={editTransJumlah} onChange={(e) => setEditTransJumlah(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-blue-700 outline-none"
                        placeholder="Rp 0"
                      />
                    </div>

                    <div className="flex gap-2 pt-1.5">
                      <button 
                        type="button" 
                        onClick={() => { setIsEditTransModalOpen(false); setEditingTransaction(null); }}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold p-2.5 rounded-xl text-xs transition cursor-pointer"
                      >
                        Batal
                      </button>
                      <button 
                        type="submit" 
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold p-2.5 rounded-xl text-xs shadow-md transition cursor-pointer"
                      >
                        Simpan Perubahan
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* --- BOTTOM SHEET MODAL (Histori Edit / Audit Trail) --- */}
            {isAuditModalOpen && (
              <div className="absolute inset-0 bg-black/60 z-40 flex items-end">
                <div className="bg-white rounded-t-2xl w-full p-4 max-h-[80%] overflow-y-auto shadow-2xl relative space-y-3.5 flex flex-col">
                  <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto"></div>
                  
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-sm">
                        HISTORI EDIT TRANSAKSI
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-bold uppercase truncate max-w-[220px]">
                        "{selectedTxDesc}"
                      </p>
                    </div>
                    <button onClick={() => { setIsAuditModalOpen(false); setSelectedTxHistory(null); }} className="p-1 text-slate-400 hover:bg-slate-50 rounded-full text-xs font-black">✕</button>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 py-1">
                    {!selectedTxHistory || selectedTxHistory.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-[10px]">
                        Belum ada riwayat perubahan tercatat untuk transaksi ini.
                      </div>
                    ) : (
                      selectedTxHistory.map((item, index) => (
                        <div key={index} className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="font-extrabold text-indigo-700 flex items-center gap-1.5">
                              👤 {item.user}
                            </span>
                            <span className="font-mono text-slate-400 font-bold">
                              📅 {item.timestamp}
                            </span>
                          </div>
                          
                          <div className="space-y-1">
                            {item.changeLog.split(', ').map((change: string, idx: number) => (
                              <p key={idx} className="text-[10px] text-slate-600 pl-2.5 border-l-2 border-indigo-200 leading-normal font-medium">
                                {change}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <button 
                    type="button" 
                    onClick={() => { setIsAuditModalOpen(false); setSelectedTxHistory(null); }}
                    className="w-full bg-slate-800 hover:bg-slate-950 text-white font-extrabold p-2.5 rounded-xl text-xs transition cursor-pointer"
                  >
                    Tutup Histori Audit
                  </button>
                </div>
              </div>
            )}
            {isImportPreviewOpen && (
              <div className="absolute inset-0 bg-black/60 z-50 flex items-end">
                <div className="bg-white rounded-t-2xl w-full p-4 max-h-[92%] overflow-y-auto shadow-2xl relative space-y-3.5 flex flex-col">
                  <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto"></div>
                  
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
                        <FileSpreadsheet size={16} className="text-blue-600" />
                        Preview Import Excel
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Validasi otomatis data pelanggan</p>
                    </div>
                    <button onClick={() => setIsImportPreviewOpen(false)} className="p-1 text-slate-400 hover:bg-slate-50 rounded-full text-xs font-black">✕</button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl flex items-center gap-2">
                      <div className="p-1 rounded-full bg-emerald-500 text-white"><Check size={12} /></div>
                      <div>
                        <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-wider">Valid</span>
                        <span className="text-sm font-black text-emerald-800">{importRows.filter(r => r.isValid).length} baris</span>
                      </div>
                    </div>
                    
                    <div className="bg-rose-50 border border-rose-100 p-2.5 rounded-xl flex items-center gap-2">
                      <div className="p-1 rounded-full bg-rose-500 text-white"><X size={12} /></div>
                      <div>
                        <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-wider">Error</span>
                        <span className="text-sm font-black text-rose-800">{importRows.filter(r => !r.isValid).length} baris</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 max-h-[250px] pr-1">
                    {importRows.map((r, idx) => (
                      <div key={idx} className={`p-2.5 rounded-lg border text-xs ${r.isValid ? 'bg-slate-50/50 border-slate-100' : 'bg-rose-50/40 border-rose-100'}`}>
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Baris {r.rowNum}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${r.isValid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {r.isValid ? 'Valid' : 'Error'}
                          </span>
                        </div>

                        <div className="mt-1">
                          <p className="font-bold text-slate-800 text-[11px]">{r.Nama || '(Nama Kosong)'}</p>
                          <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-500 mt-0.5">
                            <div>No: <span className="font-bold text-slate-600">{r.NoPelanggan || '-'}</span></div>
                            <div>Meter: <span className="font-bold text-slate-600">{r.MeterAwal} m³</span></div>
                          </div>
                        </div>

                        {!r.isValid && r.errors.length > 0 && (
                          <div className="mt-2 p-1.5 bg-rose-100/50 rounded border border-rose-100 space-y-0.5 text-[9px] text-rose-700">
                            {r.errors.map((err, errIdx) => (
                              <div key={errIdx} className="flex items-start gap-1">
                                <span className="text-rose-500 font-bold">•</span>
                                <span className="font-medium">{err}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-[10px] text-amber-800 space-y-1">
                    <p className="font-extrabold flex items-center gap-1 uppercase">
                      <AlertTriangle size={12} className="text-amber-600" />
                      Konfirmasi Replace Data
                    </p>
                    <p className="font-medium text-slate-500 leading-relaxed">
                      Import data akan mengganti seluruh data pelanggan lama. Semua data lama akan dihapus dan digantikan oleh baris-baris valid di atas.
                    </p>
                  </div>

                  <div className="flex gap-2.5 pt-2 border-t border-slate-100">
                    <button onClick={() => setIsImportPreviewOpen(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-xl text-center">Batal</button>
                    <button
                      onClick={handleConfirmImport}
                      disabled={importRows.filter(r => r.isValid).length === 0}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-extrabold py-2.5 rounded-xl text-center flex justify-center items-center gap-1 shadow-md"
                    >
                      <CheckCircle size={14} />
                      Import Sekarang
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* --- BOTTOM SHEET MODAL (Menerima Pembayaran - SPRINT 2) --- */}
            {isPayModalOpen && payingBill && (() => {
              const b = payingBill;
              const p = pelanggan.find(cust => cust.noPelanggan === b.noPelanggan);
              const t = p ? (tarifs.find(tr => tr.golongan === p.golongan) || tarifs[0]) : tarifs[0];
              const nominalAbo = b.abonemen || 0;
              const nominalDenda = b.denda || 0;
              const calc = calculateBillingDetails(b.usage, t, nominalAbo, nominalDenda);

              // Ensure meter markers are handled safely
              const m_lalu = b.meterLalu !== undefined ? b.meterLalu : (p ? p.meterAwal : 0);
              const m_kini = b.meterKini !== undefined ? b.meterKini : (m_lalu + b.usage);

              return (
                <div className="absolute inset-0 bg-black/60 z-40 flex items-end">
                  <div className="bg-white rounded-t-2xl w-full p-4 max-h-[90%] overflow-y-auto shadow-2xl relative space-y-4 flex flex-col">
                    <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto"></div>

                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <div>
                        <h3 className="font-extrabold text-slate-800 text-sm">
                          Terima Pembayaran Air
                        </h3>
                        <span className="text-[9px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded uppercase mt-0.5 inline-block">ID: {b.id}</span>
                      </div>
                      <button onClick={() => { setIsPayModalOpen(false); setPayingBill(null); }} className="p-1 text-slate-400 hover:bg-slate-50 rounded-full">✕</button>
                    </div>

                    <form onSubmit={handleSavePayment} className="space-y-4 flex-1">
                      {/* Customer Summary Card */}
                      <div className="p-3 bg-slate-50 border border-slate-150 rounded-lg text-[10px] space-y-1.5 text-slate-600 font-medium font-mono">
                        <div>Nama Pelanggan: <span className="font-extrabold text-slate-800">{b.nama} ({b.noPelanggan})</span></div>
                        <div>Wilayah Dusun: <span className="font-bold text-slate-700">{b.area}</span></div>
                        <div className="border-t border-slate-200/60 my-1 pt-1"></div>
                        <div className="flex justify-between">
                          <span>Meter Lalu / Sekarang:</span>
                          <span className="font-bold text-slate-800">{m_lalu} / {m_kini} m³</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Konsumsi Air:</span>
                          <span className="font-bold text-blue-600">{b.usage} m³</span>
                        </div>
                        <div className="border-t border-slate-200/60 my-1 pt-1"></div>
                        
                        {/* Breakdown */}
                        <div className="space-y-1 pl-1.5 text-slate-500">
                          {calc.breakdown.map((item, idx) => (
                            <div key={idx} className="flex justify-between">
                              <span>{item.level} ({item.range}):</span>
                              <span>{item.vol} x {item.rate.toLocaleString('id-ID')} = Rp {item.total.toLocaleString('id-ID')}</span>
                            </div>
                          ))}
                          <div className="flex justify-between">
                            <span>Abonemen:</span>
                            <span>Rp {nominalAbo.toLocaleString('id-ID')}</span>
                          </div>
                          {nominalDenda > 0 && (
                            <div className="flex justify-between text-rose-600 font-bold">
                              <span>Denda Keterlambatan:</span>
                              <span>Rp {nominalDenda.toLocaleString('id-ID')}</span>
                            </div>
                          )}
                        </div>

                        <div className="border-t border-slate-200 pt-1.5 mt-1 text-slate-800 font-extrabold flex justify-between text-xs">
                          <span>TOTAL TAGIHAN:</span>
                          <span className="text-blue-700">Rp {calc.total.toLocaleString('id-ID')}</span>
                        </div>
                      </div>

                      {/* Payment Method Selector */}
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Metode Pembayaran</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['Tunai', 'Transfer', 'QRIS'] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setPaymentMethod(m)}
                              className={`py-2 px-1 text-xs rounded-xl font-bold border transition text-center cursor-pointer flex flex-col items-center justify-center gap-1 ${
                                paymentMethod === m
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-102'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <span>{m === 'Tunai' ? '💵' : m === 'Transfer' ? '🏦' : '📱'}</span>
                              <span className="text-[10px]">{m}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Info / Warning text */}
                      {paymentMethod === 'QRIS' && (
                        <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-[9px] text-blue-700 leading-normal flex items-start gap-1.5">
                          <span className="text-[12px]">ℹ️</span>
                          <p><strong>Simulasi QRIS Aktif:</strong> Tampilkan QR Code dinamis ke pelanggan untuk discan via e-wallet. Transaksi akan langsung terverifikasi lunas saat pembayaran diterima.</p>
                        </div>
                      )}
                      {paymentMethod === 'Transfer' && (
                        <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-[9px] text-indigo-700 leading-normal flex items-start gap-1.5">
                          <span className="text-[12px]">🏦</span>
                          <p><strong>Transfer Bank:</strong> Gunakan rekening bank KPSPAMS Desa Mandiri (BNI 123456789). Konfirmasi mutasi masuk sebelum memvalidasi struk ini.</p>
                        </div>
                      )}

                      <div className="flex gap-2.5 pt-2 border-t border-slate-100">
                        <button 
                          type="button" 
                          onClick={() => { setIsPayModalOpen(false); setPayingBill(null); }} 
                          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-xl text-center cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-2.5 rounded-xl text-center shadow-md cursor-pointer flex items-center justify-center gap-1"
                        >
                          ✔️ Simpan &amp; Lunas
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              );
            })()}

            {/* --- BOTTOM SHEET MODAL (Catat Meter Air Baru) --- */}
            {isAddReadingModalOpen && (() => {
              const todayWib = getWibDateString();
              const targetYearMonth = todayWib.substring(0, 7);

              const filteredPelangganForDropdown = pelanggan.filter(p => {
                if (p.status !== 'Aktif') return false;
                if (!isAreaAccessible(p.area)) return false;
                if (meterFilterArea !== 'Semua' && p.area !== meterFilterArea) return false;
                
                if (selectedMeterPelanggan === p.noPelanggan) return true;

                const isRecorded = readings.some(r => 
                  r.noPelanggan === p.noPelanggan && 
                  r.tglBaca && r.tglBaca.substring(0, 7) === targetYearMonth
                );
                return !isRecorded;
              });

              const selectedP = pelanggan.find(cust => cust.noPelanggan === selectedMeterPelanggan);
              let meterLalu = 0;
              let golongan = '';
              let usage = 0;
              let isError = false;

              if (selectedP) {
                const lastReading = readings.find(r => r.noPelanggan === selectedP.noPelanggan);
                meterLalu = lastReading ? lastReading.meterKini : selectedP.meterAwal;
                const meterKiniVal = Number(inputMeterKini) || 0;
                usage = Math.max(0, meterKiniVal - meterLalu);
                isError = meterKiniVal > 0 && meterKiniVal < meterLalu;
              }

              return (
                <div className="absolute inset-0 bg-black/60 z-40 flex items-end">
                  <div className="bg-white rounded-t-2xl w-full p-4 max-h-[95%] overflow-y-auto shadow-2xl relative space-y-3.5 flex flex-col">
                    <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto"></div>

                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <div>
                        <h3 className="font-extrabold text-slate-800 text-sm">
                          Catat Baru Meteran Air
                        </h3>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                          Petugas Lapangan {systemNama || 'KPSPAMS Desa Mandiri'}
                        </p>
                      </div>
                      <button 
                        onClick={() => {
                          setSelectedMeterPelanggan('');
                          setInputMeterKini('');
                          setMeterFotoPreview(null);
                          setIsAddReadingModalOpen(false);
                        }}
                        className="text-slate-400 hover:text-rose-500 transition p-1 cursor-pointer"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSaveMeterReading(e);
                      }} 
                      className="space-y-3"
                    >
                      {/* Customer Selection */}
                      <div>
                        <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                          Pilih Pelanggan Belum Catat Meter *
                        </label>
                        <select
                          value={selectedMeterPelanggan}
                          onChange={(e) => {
                            setSelectedMeterPelanggan(e.target.value);
                            setInputMeterKini('');
                          }}
                          className="w-full bg-slate-50 border border-slate-200 px-2.5 py-2 rounded-lg text-xs font-extrabold outline-none"
                          required
                        >
                          <option value="">-- Pilih Nama Pelanggan --</option>
                          {filteredPelangganForDropdown.map(p => (
                            <option key={p.noPelanggan} value={p.noPelanggan}>
                              [{p.noPelanggan}] {p.nama} ({p.area})
                            </option>
                          ))}
                        </select>
                      </div>

                      {selectedP && (
                        <div className="space-y-3">
                          {/* Info Panel */}
                          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                            <div>
                              <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wide">Meter Lalu</span>
                              <span className="font-extrabold text-slate-800 text-xs">{meterLalu} m³</span>
                            </div>
                            <div>
                              <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wide">Golongan Tarif</span>
                              <span className="font-extrabold text-slate-700 text-xs">{selectedP.golongan}</span>
                            </div>
                          </div>

                          {/* Current Meter Input */}
                          <div>
                            <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                              Angka Meteran Kini (m³) *
                            </label>
                            <input
                              type="number"
                              placeholder={`Harus >= ${meterLalu}`}
                              value={inputMeterKini}
                              onChange={(e) => setInputMeterKini(e.target.value)}
                              className={`w-full bg-slate-50 border px-3 py-2 rounded-lg text-xs font-mono font-bold outline-none ${
                                isError ? 'border-rose-500 focus:ring-1.5 focus:ring-rose-500 text-rose-700' : 'border-slate-200 focus:ring-1.5 focus:ring-blue-500'
                              }`}
                              required
                            />
                            {isError && (
                              <p className="text-[9px] text-rose-600 font-bold mt-1">
                                Error: Angka meter kini tidak boleh lebih rendah dari meter lalu!
                              </p>
                            )}
                          </div>

                          {/* Consumption Preview calculation in real-time */}
                          {Number(inputMeterKini) >= meterLalu && (
                            <div className="p-2.5 bg-blue-50/60 border border-blue-100 rounded-lg text-blue-800 text-[10px] font-bold flex justify-between items-center">
                              <span>Konsumsi Air Bulan Ini:</span>
                              <span className="text-xs font-black">{usage} m³</span>
                            </div>
                          )}

                          {/* Camera/Upload Section */}
                          <div className="space-y-2">
                            <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                              Foto Bukti Meteran <span className="text-red-500">*</span>
                            </span>

                            {(() => {
                              const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                              return (
                                <div className="space-y-2">
                                  {isMobile ? (
                                    <div>
                                      <button
                                        type="button"
                                        onClick={() => triggerMobileCamera(false)}
                                        className={`w-full py-2.5 px-3 rounded-xl border text-xs font-extrabold transition flex items-center justify-center gap-2 cursor-pointer ${
                                          meterFotoPreview 
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' 
                                            : 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100'
                                        }`}
                                      >
                                        <Camera size={16} />
                                        {meterFotoPreview ? '✓ Foto Terlampir (Ketuk untuk Ganti)' : 'Ambil Foto Kamera HP'}
                                      </button>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        id="mobile-camera-input"
                                        className="hidden"
                                        onChange={(e) => handleMobilePhotoCapture(e, false)}
                                      />
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const el = document.getElementById("desktop-file-input");
                                            if (el) el.click();
                                          }}
                                          className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                            meterFotoPreview 
                                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100/60' 
                                              : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                          }`}
                                        >
                                          <Upload size={14} />
                                          Pilih File Foto
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (showWebcam) {
                                              stopWebcam(false);
                                            } else {
                                              startWebcam(false);
                                            }
                                          }}
                                          className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                            showWebcam 
                                              ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100' 
                                              : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                          }`}
                                        >
                                          <Camera size={14} />
                                          {showWebcam ? 'Tutup Webcam' : 'Ambil via Webcam'}
                                        </button>
                                      </div>
                                      
                                      <input
                                        type="file"
                                        accept="image/*"
                                        id="desktop-file-input"
                                        className="hidden"
                                        onChange={(e) => handleDesktopFileSelect(e, false)}
                                      />

                                      {showWebcam && (
                                        <div className="border border-slate-300 rounded-xl overflow-hidden bg-black relative">
                                          <video
                                            ref={webcamVideoRef}
                                            autoPlay
                                            playsInline
                                            className="w-full h-40 object-cover"
                                          />
                                          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => capturePhoto(false)}
                                              className="bg-blue-600 text-white font-extrabold text-[10px] px-3 py-1.5 rounded-lg hover:bg-blue-700 shadow-md flex items-center gap-1 cursor-pointer"
                                            >
                                              <Camera size={12} />
                                              Ambil Snapshot
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => stopWebcam(false)}
                                              className="bg-slate-800 text-white font-extrabold text-[10px] px-3 py-1.5 rounded-lg hover:bg-slate-700 shadow-md cursor-pointer"
                                            >
                                              Batal
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Photo Preview Card */}
                                  {meterFotoPreview ? (
                                    <div className="border border-emerald-200 p-2 rounded-xl bg-emerald-50/50 relative flex items-center gap-3">
                                      <img
                                        src={meterFotoPreview}
                                        alt="Pratinjau Bukti Meter"
                                        className="w-14 h-14 object-cover rounded-lg border border-emerald-300 shrink-0 shadow-3xs"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-1">
                                          <p className="text-[9.5px] font-extrabold text-slate-800 truncate">Foto_Bukti_Meteran.jpg</p>
                                          <span className="text-[8px] font-black text-emerald-700 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded shrink-0">
                                            {getBase64SizeKB(meterFotoPreview)} KB
                                          </span>
                                        </div>
                                        <p className="text-[8px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
                                          <CheckCircle size={10} className="shrink-0 text-emerald-500" />
                                          Terkompresi & Ready to Upload (&le; 200 KB)
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => setMeterFotoPreview(null)}
                                        className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-full transition shrink-0 cursor-pointer"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="p-2 border border-dashed border-rose-200 rounded-xl bg-rose-50/30 flex flex-col gap-1">
                                      <p className="text-[9px] text-rose-600 font-extrabold flex items-center gap-1 animate-pulse">
                                        <AlertTriangle size={11} className="shrink-0" />
                                        Foto meter wajib dilampirkan sebelum menyimpan.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Modal Footer Buttons */}
                      <div className="flex gap-2.5 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMeterPelanggan('');
                            setInputMeterKini('');
                            setMeterFotoPreview(null);
                            setIsAddReadingModalOpen(false);
                          }}
                          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-xl text-center cursor-pointer"
                        >
                          BATAL
                        </button>
                        <button
                          type="submit"
                          disabled={!selectedMeterPelanggan || isError || !meterFotoPreview || !inputMeterKini}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black py-2.5 rounded-xl text-center shadow-md cursor-pointer flex items-center justify-center gap-1"
                        >
                          SIMPAN
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              );
            })()}

            {/* --- BOTTOM SHEET MODAL (Edit Catat Meter / Revisi Catatan) --- */}
            {isEditReadingModalOpen && editingReading && (() => {
              const r = editingReading;
              const meterLalu = r.meterLalu;
              const curMeterKini = Number(editReadingMeterKini) || 0;
              const hasWarning = curMeterKini < meterLalu;

              return (
                <div className="absolute inset-0 bg-black/60 z-40 flex items-end">
                  <div className="bg-white rounded-t-2xl w-full p-4 max-h-[90%] overflow-y-auto shadow-2xl relative space-y-3.5 flex flex-col">
                    <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto"></div>

                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <div>
                        <h3 className="font-extrabold text-slate-800 text-xs">
                          Edit Catat Meter: {r.nama}
                        </h3>
                        <span className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded uppercase mt-0.5 inline-block">{r.area}</span>
                      </div>
                      <button onClick={() => { setIsEditReadingModalOpen(false); setEditingReading(null); }} className="p-1 text-slate-400 hover:bg-slate-50 rounded-full">✕</button>
                    </div>

                    <form onSubmit={handleSaveEditReading} className="space-y-3 flex-1">
                      <div className="p-2.5 bg-slate-50 border border-slate-150 rounded-lg text-[10px] space-y-1 text-slate-500 font-medium">
                        <div>No. Pelanggan: <span className="font-bold text-slate-700">{r.noPelanggan}</span></div>
                        <div>Meter Lalu: <span className="font-bold text-slate-700">{meterLalu} m³</span></div>
                        <div>Konsumsi Saat Ini: <span className="font-bold text-blue-600">{Math.max(0, curMeterKini - r.meterLalu)} m³</span></div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Angka Meteran Baru (m³)</label>
                        <input
                          type="number"
                          value={editReadingMeterKini}
                          onChange={(e) => setEditReadingMeterKini(e.target.value)}
                          className={`w-full bg-slate-50 border px-3 py-1.5 rounded-lg text-xs font-mono font-bold outline-none ${
                            hasWarning ? 'border-amber-500 focus:ring-1.5 focus:ring-amber-500' : 'border-slate-200 focus:ring-1.5 focus:ring-blue-500'
                          }`}
                          required
                        />
                        {hasWarning && (
                          <p className="text-[9px] text-amber-600 font-bold mt-1 flex items-center gap-1">
                            <AlertTriangle size={10} />
                            Angka meter lebih kecil dari bulan sebelumnya
                          </p>
                        )}
                      </div>

                      {/* Foto upload simulator for Edit */}
                      <div className="space-y-1.5">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Foto Bukti Meteran Terbaru <span className="text-red-500">*</span></span>
                        
                        {(() => {
                          const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                          return (
                            <div>
                              {isMobile ? (
                                <div>
                                  {/* Mobile Camera Access Trigger for Edit */}
                                  <button
                                    type="button"
                                    onClick={() => triggerMobileCamera(true)}
                                    className={`w-full py-2.5 px-3 rounded-xl border text-xs font-extrabold transition flex items-center justify-center gap-2 cursor-pointer ${
                                      editReadingFoto 
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' 
                                        : 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100'
                                    }`}
                                  >
                                    <Camera size={16} />
                                    {editReadingFoto ? '✓ Foto Terlampir (Ketuk untuk Ganti)' : 'Ambil Foto Kamera HP'}
                                  </button>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    id="edit-mobile-camera-input"
                                    className="hidden"
                                    onChange={(e) => handleMobilePhotoCapture(e, true)}
                                  />
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {/* Desktop Dual Mode for Edit */}
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const el = document.getElementById("edit-desktop-file-input");
                                        if (el) el.click();
                                      }}
                                      className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                        editReadingFoto 
                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100/60' 
                                          : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                      }`}
                                    >
                                      <Upload size={14} />
                                      Pilih File Foto
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (showEditWebcam) {
                                          stopWebcam(true);
                                        } else {
                                          startWebcam(true);
                                        }
                                      }}
                                      className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                        showEditWebcam 
                                          ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100' 
                                          : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                      }`}
                                    >
                                      <Camera size={14} />
                                      {showEditWebcam ? 'Tutup Webcam' : 'Ambil via Webcam'}
                                    </button>
                                  </div>
                                  
                                  <input
                                    type="file"
                                    accept="image/*"
                                    id="edit-desktop-file-input"
                                    className="hidden"
                                    onChange={(e) => handleDesktopFileSelect(e, true)}
                                  />

                                  {/* Live Webcam Video Frame for Desktop Edit */}
                                  {showEditWebcam && (
                                    <div className="border border-slate-300 rounded-xl overflow-hidden bg-black relative">
                                      <video
                                        ref={editWebcamVideoRef}
                                        autoPlay
                                        playsInline
                                        className="w-full h-40 object-cover"
                                      />
                                      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => capturePhoto(true)}
                                          className="bg-blue-600 text-white font-extrabold text-[10px] px-3 py-1.5 rounded-lg hover:bg-blue-700 shadow-md flex items-center gap-1 cursor-pointer"
                                        >
                                          <Camera size={12} />
                                          Ambil Snapshot
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => stopWebcam(true)}
                                          className="bg-slate-800 text-white font-extrabold text-[10px] px-3 py-1.5 rounded-lg hover:bg-slate-700 shadow-md cursor-pointer"
                                        >
                                          Batal
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Real Captured/Uploaded Photo Preview for Edit */}
                              {editReadingFoto ? (
                                <div className="mt-2.5 border border-slate-200 p-2 rounded-xl bg-slate-50 relative flex items-center gap-3">
                                  <img
                                    src={editReadingFoto}
                                    alt="Pratinjau Ganti Meter"
                                    className="w-14 h-14 object-cover rounded-lg border border-slate-300 shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1">
                                      <p className="text-[9.5px] font-extrabold text-slate-800 truncate">Foto_Edit_Meteran.jpg</p>
                                      <span className="text-[8px] font-black text-emerald-700 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded shrink-0">
                                        {getBase64SizeKB(editReadingFoto)} KB
                                      </span>
                                    </div>
                                    <p className="text-[8px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
                                      <CheckCircle size={10} className="shrink-0 text-emerald-500" />
                                      Terkompresi & Ready to Upload (&le; 200 KB)
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setEditReadingFoto(null)}
                                    className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-full transition shrink-0 cursor-pointer"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <div className="mt-1.5 flex flex-col gap-1">
                                  <p className="text-[9px] text-rose-600 font-extrabold flex items-center gap-1 animate-pulse">
                                    <AlertTriangle size={11} className="shrink-0" />
                                    Foto meter wajib diambil.
                                  </p>
                                  <p className="text-[8px] text-slate-400 leading-normal">
                                    Wajib mengambil/unggah foto meteran terbaru yang sesuai saat melakukan koreksi data meteran air.
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Catatan Revisi / Alasan Edit *</label>
                        <input
                          type="text"
                          required
                          value={editReadingAlasan}
                          onChange={(e) => setEditReadingAlasan(e.target.value)}
                          placeholder="Contoh: Koreksi salah input digit meteran"
                          className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs focus:ring-1.5 focus:ring-blue-500 outline-none"
                        />
                      </div>

                      {/* Change history log for this specific reading (if any) */}
                      {r.history && r.history.length > 0 && (
                        <div className="pt-2 border-t border-slate-100">
                          <span className="block text-[8px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Histori Edit Sebelumnya</span>
                          <div className="space-y-1.5 max-h-[80px] overflow-y-auto">
                            {r.history.map((hist: any, hIdx: number) => (
                              <div key={hIdx} className="p-1.5 bg-slate-50 rounded text-[9px] border border-slate-100 text-slate-500">
                                <div className="flex justify-between font-bold text-slate-700">
                                  <span>{hist.editedBy}</span>
                                  <span>{hist.waktuEdit}</span>
                                </div>
                                <div className="font-mono mt-0.5">
                                  Meter: {hist.meterLama} &rarr; {hist.meterBaru}
                                </div>
                                <p className="italic mt-0.5 text-slate-400">"{hist.alasanEdit}"</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2.5 pt-2 border-t border-slate-100">
                        <button type="button" onClick={() => { setIsEditReadingModalOpen(false); setEditingReading(null); }} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 rounded-xl text-center">Batal</button>
                        <button
                          type="submit"
                          disabled={!editReadingFoto || hasWarning}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-extrabold py-2 rounded-xl text-center shadow-md cursor-pointer"
                        >
                          Simpan Revisi
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              );
            })()}

            {/* --- BOTTOM SHEET MODAL (Thermal Receipt / POS Print Voucher - SPRINT 2 REVISED) --- */}
            {selectedBillForStruk && (() => {
              const b = selectedBillForStruk;
              const p = pelanggan.find(cust => cust.noPelanggan === b.noPelanggan);
              const t = p ? (tarifs.find(tr => tr.golongan === p.golongan) || tarifs[0]) : tarifs[0];
              const nominalAbo = b.abonemen || 0;
              const nominalDenda = b.denda || 0;
              const calc = calculateBillingDetails(b.usage, t, nominalAbo, nominalDenda);

              // Safe meter fallback
              const m_lalu = b.meterLalu !== undefined ? b.meterLalu : (p ? p.meterAwal : 0);
              const m_kini = b.meterKini !== undefined ? b.meterKini : (m_lalu + b.usage);

              return (
                <div id="receipt-modal-overlay" className="absolute inset-0 bg-black/60 z-40 flex items-center justify-center p-3 overflow-y-auto">
                  <div className="bg-slate-100 rounded-2xl w-full max-w-sm p-4 shadow-2xl flex flex-col gap-3 border border-slate-200 my-auto max-h-[95%] overflow-y-auto">
                    
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                      <div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Cetak Struk Thermal</span>
                        <div className="text-[8px] text-slate-400 font-mono">ID: {b.id}</div>
                      </div>
                      <button 
                        onClick={() => setSelectedBillForStruk(null)}
                        className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Paper Size Selector (58mm vs 80mm) */}
                    <div className="flex items-center justify-between bg-slate-200/60 p-1.5 rounded-xl">
                      <span className="text-[10px] font-extrabold text-slate-600 pl-2">Ukuran Kertas:</span>
                      <div className="flex gap-1.5">
                        {(['58mm', '80mm'] as const).map((sz) => (
                          <button
                            key={sz}
                            onClick={() => setReceiptSize(sz)}
                            className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                              receiptSize === sz
                                ? 'bg-white text-blue-700 shadow-xs'
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Thermal Paper Print Sheet Mockup */}
                    <div className={`bg-white p-4 rounded-lg shadow-inner border border-slate-200 font-mono text-[10px] text-slate-800 space-y-3 relative overflow-hidden mx-auto transition-all duration-300 ${
                      receiptSize === '58mm' ? 'max-w-[240px]' : 'w-full'
                    }`}>
                      {/* Decorative serrated print tear */}
                      <div className="absolute top-0 inset-x-0 h-1 bg-repeat-x bg-[radial-gradient(circle_at_center,_#f1f5f9_2px,_transparent_3px)] bg-[size:8px_8px] opacity-20"></div>

                      <div className="text-center space-y-0.5">
                        <h3 className="font-extrabold text-[11px] uppercase tracking-wider text-slate-900">KPSPAMS DESA MANDIRI</h3>
                        <p className="text-[8px] text-slate-400">PAMS Digital Air Bersih Desa</p>
                        <p className="text-[8px] text-slate-400">Telp/Hp: 0812-3456-7890</p>
                      </div>

                      <div className="border-t border-dashed border-slate-300 my-1.5"></div>

                      <div className="space-y-0.5 text-[9px] text-slate-600">
                        <div className="flex justify-between">
                          <span>No Pel :</span>
                          <span className="font-bold text-slate-800">{b.noPelanggan}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Nama   :</span>
                          <span className="font-bold text-slate-800 truncate max-w-[120px]">{b.nama}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Golongan:</span>
                          <span className="font-bold text-slate-800">{p ? p.golongan : '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Dusun  :</span>
                          <span className="font-bold text-slate-800">{b.area}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Bulan  :</span>
                          <span className="font-bold text-slate-800">{b.periode || 'Juni 2026'}</span>
                        </div>
                        {b.tglBayar && (
                          <div className="flex justify-between">
                            <span>Tgl Bayar:</span>
                            <span className="font-bold text-slate-800">{b.tglBayar}</span>
                          </div>
                        )}
                        {b.metodeBayar && (
                          <div className="flex justify-between">
                            <span>Metode :</span>
                            <span className="font-bold text-slate-800">{b.metodeBayar}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Petugas:</span>
                          <span className="font-bold text-slate-800">{currentUser?.nama || 'Petugas Kasir'}</span>
                        </div>
                      </div>

                      <div className="border-t border-dashed border-slate-300 my-1.5"></div>

                      <div className="space-y-0.5 text-[9px]">
                        <div className="flex justify-between">
                          <span>Meter Lalu :</span>
                          <span>{m_lalu} m³</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Meter Kini :</span>
                          <span>{m_kini} m³</span>
                        </div>
                        <div className="flex justify-between font-bold text-slate-800">
                          <span>Pemakaian  :</span>
                          <span className="text-blue-700">{b.usage} m³</span>
                        </div>
                      </div>

                      <div className="border-t border-dashed border-slate-300 my-1.5"></div>

                      {/* Rincian Tarif Per Level */}
                      <div className="space-y-1 text-[8.5px]">
                        <span className="font-bold text-slate-700">RINCIAN TARIF:</span>
                        {calc.breakdown.map((item, idx) => (
                          <div key={idx} className="flex justify-between pl-1 text-slate-600">
                            <span>{item.level} ({item.range}):</span>
                            <span>{item.vol}x{item.rate.toLocaleString('id-ID')} = {item.total.toLocaleString('id-ID')}</span>
                          </div>
                        ))}
                        <div className="flex justify-between pl-1 text-slate-600">
                          <span>Abonemen:</span>
                          <span>{nominalAbo.toLocaleString('id-ID')}</span>
                        </div>
                        {nominalDenda > 0 && (
                          <div className="flex justify-between pl-1 text-rose-600 font-bold">
                            <span>Denda:</span>
                            <span>{nominalDenda.toLocaleString('id-ID')}</span>
                          </div>
                        )}
                        
                        <div className="flex justify-between font-extrabold text-slate-900 border-t border-slate-200 pt-1.5 mt-1 text-[10px]">
                          <span>TOTAL BAYAR:</span>
                          <span className="text-blue-700">Rp {calc.total.toLocaleString('id-ID')}</span>
                        </div>
                      </div>

                      <div className="border-t border-dashed border-slate-300 my-1.5"></div>

                      {/* LUNAS status watermark */}
                      <div className="py-1 px-3 rounded-lg border-2 border-emerald-500/30 bg-emerald-500/5 text-center text-emerald-600 font-extrabold text-[11px] tracking-widest transform rotate-[-1deg] my-1.5">
                        LUNAS / PAID
                      </div>

                      <div className="text-center text-[7px] text-slate-400 space-y-0.5 leading-normal">
                        <p>Struk ini adalah bukti pembayaran sah.</p>
                        <p>Simpan sebagai bukti transaksi Anda.</p>
                        <p className="font-bold text-[6px] tracking-wider uppercase pt-0.5 text-slate-500">PAMSDIGI SYSTEM v2.0</p>
                      </div>
                    </div>

                    {/* Actions and PDF download button */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-200">
                      <button 
                        onClick={() => downloadReceiptPDF(b, receiptSize)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-2 rounded-xl text-center shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        📥 Download PDF ({receiptSize})
                      </button>

                      <div className="flex gap-2">
                        <button 
                          onClick={() => setSelectedBillForStruk(null)}
                          className="flex-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-bold py-2 rounded-xl text-center shadow-xs cursor-pointer"
                        >
                          Tutup
                        </button>
                        <button 
                          onClick={() => {
                            alert(`Simulasi Cetak: Mengirim data thermal struk ukuran ${receiptSize} ke printer Bluetooth POS...`);
                            setSelectedBillForStruk(null);
                            showToast(`Sukses mengirim print job (${receiptSize}) ke Bluetooth Printer!`, 'success');
                          }}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black py-2 rounded-xl text-center shadow-md cursor-pointer flex items-center justify-center gap-1"
                        >
                          🖨️ Cetak Struk
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })()}

        </main>
      </div>

    </div>
  );
}
