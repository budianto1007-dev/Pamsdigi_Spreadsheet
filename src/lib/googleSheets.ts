import { UserRow, PelangganRow, AreaRow, TarifRow, AbonemenRow, DendaRow } from '../types';

export interface User {
  email: string;
  displayName?: string;
}

// Simulated/Cache storage for the spreadsheet sync status
let cachedAccessToken: string | null = 'public-access';

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export function setAccessToken(token: string | null) {
  cachedAccessToken = token;
}

export const GOOGLE_SCOPES: string[] = [];

export interface GasConfigResult {
  syncStatus: 'Connected' | 'Disconnected';
  gasUrl: string;
  spreadsheetName: string;
  lastConnected: string;
  spreadsheetId: string;
}

// Multi-tenant environment configuration:
// When deploying from 1 Repository to multiple Vercel instances (e.g. Vercel 1 -> Sheet 1, Vercel 2 -> Sheet 2):
// Set VITE_GAS_URL and VITE_SPREADSHEET_ID in each Vercel project's Environment Variables.
export const ENV_GAS_URL = (((import.meta as any).env?.VITE_GAS_URL as string) || '').trim();
export const ENV_SPREADSHEET_ID = (((import.meta as any).env?.VITE_SPREADSHEET_ID as string) || '').trim();

export const FALLBACK_GAS_URL = 'https://script.google.com/macros/s/AKfycbzDwmkxUigIyaMGL8R8MH_k0qjx7Q0imFJ20uWwlzbAzHCNWthD_hQot66M_cyuYI6umQ/exec';
export const FALLBACK_SPREADSHEET_ID = '17k6KwADlEFVtLv1KW7VK6a42KBZXmb1wWez0ou2EfOc';

export const DEFAULT_GAS_URL = ENV_GAS_URL || FALLBACK_GAS_URL;
export const DEFAULT_SPREADSHEET_ID = ENV_SPREADSHEET_ID || FALLBACK_SPREADSHEET_ID;

// Offline queue key using standardized prefix
const OFFLINE_QUEUE_KEY = 'pams_offline_queue';

export interface OfflineAction {
  id: string;
  timestamp: string;
  type: 'pushAll' | 'saveData';
  data: any;
}

export function getOfflineQueue(): OfflineAction[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export function getOfflineQueueCount(): number {
  return getOfflineQueue().length;
}

export function enqueueOfflineAction(action: Omit<OfflineAction, 'id' | 'timestamp'>): void {
  try {
    const queue = getOfflineQueue();
    queue.push({
      ...action,
      id: 'OFFLINE-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString()
    });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (_) {}
}

export function clearOfflineQueue(): void {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch (_) {}
}

/**
 * Otomatis memproses antrean offline saat internet kembali menyala
 */
export async function drainOfflineQueue(): Promise<{ processed: number; success: boolean }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { processed: 0, success: true };

  const gasUrl = await getSavedGasUrl();
  if (!gasUrl || !gasUrl.startsWith('http')) {
    return { processed: 0, success: false };
  }

  let processedCount = 0;
  // Ambil data payload terbaru dari antrean terakhir untuk efisiensi
  const lastAction = queue[queue.length - 1];

  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'pushAll',
        data: lastAction.data
      })
    });
    if (res.ok) {
      clearOfflineQueue();
      processedCount = queue.length;
      return { processed: processedCount, success: true };
    }
  } catch (_) {}

  return { processed: 0, success: false };
}

// Auto drain listener saat browser / HP mendeteksi koneksi online kembali
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    drainOfflineQueue().catch(_ => {});
  });
}

/**
 * Autentikasi user live langsung ke sheet Users di Google Spreadsheet
 */
export async function authenticateWithSheets(username: string, password: string): Promise<{
  success: boolean;
  message: string;
  user?: UserRow;
}> {
  const gasUrl = await getSavedGasUrl();
  if (!gasUrl || !gasUrl.startsWith('http')) {
    return { success: false, message: 'Database Google Spreadsheet belum terhubung.' };
  }

  try {
    const targetUrl = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=login&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&t=${Date.now()}`;
    const res = await fetch(targetUrl, { method: 'GET', redirect: 'follow' });
    if (!res.ok) {
      return { success: false, message: 'Gagal menghubungi server Google Apps Script.' };
    }

    const json = await res.json();
    if (json.success) {
      return {
        success: true,
        message: json.message || 'Login berhasil.',
        user: {
          username: json.username,
          password: password,
          nama: json.nama || json.username,
          role: json.role || 'Petugas',
          status: json.status || 'Aktif',
          areaAkses: json.areaAkses || 'ALL'
        }
      };
    } else {
      return {
        success: false,
        message: json.message || 'Username atau password salah.'
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal terhubung ke Google Spreadsheet: ${err.message || 'Koneksi error'}`
    };
  }
}

/**
 * Retrieves saved Google Apps Script URL & configuration via Centralized Server & Google Apps Script Properties
 * Strictly single active GAS URL architecture with Global Multi-Device synchronization.
 */
export async function getSavedDbConfig(): Promise<{
  gasUrl: string;
  spreadsheetName: string;
  syncStatus: 'Connected' | 'Disconnected';
  lastConnected: string;
  spreadsheetId: string;
}> {
  // Check if this Vercel deployment has an authoritative environment variable (VITE_GAS_URL / VITE_SPREADSHEET_ID)
  const isEnvDriven = Boolean(ENV_GAS_URL && ENV_GAS_URL.startsWith('http'));

  if (isEnvDriven) {
    const activeUrl = ENV_GAS_URL;
    const activeSheetId = ENV_SPREADSHEET_ID || FALLBACK_SPREADSHEET_ID;

    // Direct live poll from the Apps Script Web App for current status & live dynamic spreadsheet name
    try {
      const directUrl = `${activeUrl}${activeUrl.includes('?') ? '&' : '?'}action=getConfig&t=${Date.now()}`;
      const directRes = await fetch(directUrl, { method: 'GET', redirect: 'follow' });
      if (directRes.ok) {
        const json = await directRes.json();
        if (json && json.success && json.config) {
          const cfg = json.config;
          const liveName = (cfg.spreadsheetName && cfg.spreadsheetName !== 'PAMSDIGI Spreadsheet') ? cfg.spreadsheetName : 'Db_pamsdigi';
          return {
            gasUrl: activeUrl,
            spreadsheetName: liveName,
            syncStatus: cfg.syncStatus === 'Connected' ? 'Connected' : 'Disconnected',
            lastConnected: cfg.lastConnected || new Date().toLocaleString('id-ID'),
            spreadsheetId: cfg.spreadsheetId || activeSheetId
          };
        }
      }
    } catch (_) {}

    return {
      gasUrl: activeUrl,
      spreadsheetName: 'Db_pamsdigi',
      syncStatus: 'Connected',
      lastConnected: new Date().toLocaleString('id-ID'),
      spreadsheetId: activeSheetId
    };
  }

  // 1. First poll centralized server config or fallback config
  let serverGasUrl = '';
  let serverSyncStatus = '';
  let serverSpreadsheetName = '';
  let serverLastConnected = '';
  let serverSpreadsheetId = '';

  try {
    const serverRes = await fetch('/api/db-config', { cache: 'no-store' })
      .catch(() => fetch('/db_config.json?t=' + Date.now(), { cache: 'no-store' }));
    if (serverRes && serverRes.ok) {
      const sJson = await serverRes.json();
      if (sJson && sJson.gasUrl && sJson.gasUrl.startsWith('http')) {
        serverGasUrl = sJson.gasUrl;
        serverSyncStatus = sJson.syncStatus || 'Connected';
        serverSpreadsheetName = (sJson.spreadsheetName && sJson.spreadsheetName !== 'PAMSDIGI Spreadsheet') ? sJson.spreadsheetName : 'Db_pamsdigi';
        serverLastConnected = sJson.lastConnected || '';
        serverSpreadsheetId = sJson.spreadsheetId || '';
      }
    }
  } catch (_) {}

  // Prioritize URLs to poll for live spreadsheet connection
  const urlsToPoll: string[] = [];
  if (serverGasUrl && serverGasUrl.startsWith('http')) urlsToPoll.push(serverGasUrl);
  if (DEFAULT_GAS_URL && DEFAULT_GAS_URL.startsWith('http') && !urlsToPoll.includes(DEFAULT_GAS_URL)) urlsToPoll.push(DEFAULT_GAS_URL);

  for (const targetUrl of urlsToPoll) {
    try {
      let json: any = null;
      try {
        const directUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}action=getConfig&t=${Date.now()}`;
        const directRes = await fetch(directUrl, { method: 'GET', redirect: 'follow' });
        if (directRes.ok) {
          json = await directRes.json();
        }
      } catch (_) {}

      if (json && json.success && json.config) {
        const cfg = json.config;
        const status = cfg.syncStatus === 'Connected' ? 'Connected' : 'Disconnected';
        const activeUrl = targetUrl;

        if (status === 'Connected' && activeUrl) {
          const rawSheetName = cfg.spreadsheetName || serverSpreadsheetName || 'Db_pamsdigi';
          const sheetName = (rawSheetName && rawSheetName !== 'PAMSDIGI Spreadsheet') ? rawSheetName : 'Db_pamsdigi';
          const lastConn = cfg.lastConnected || serverLastConnected || new Date().toLocaleString('id-ID');
          const sheetId = cfg.spreadsheetId || ENV_SPREADSHEET_ID || serverSpreadsheetId || DEFAULT_SPREADSHEET_ID;

          return {
            gasUrl: activeUrl,
            spreadsheetName: sheetName,
            syncStatus: 'Connected',
            lastConnected: lastConn,
            spreadsheetId: sheetId
          };
        } else if (status === 'Disconnected') {
          return {
            gasUrl: DEFAULT_GAS_URL,
            spreadsheetName: 'Belum Terhubung',
            syncStatus: 'Disconnected',
            lastConnected: 'Belum Terhubung',
            spreadsheetId: ENV_SPREADSHEET_ID || ''
          };
        }
      }
    } catch (_) {}
  }

  // Network fail-safe: if request fails due to temporary offline or network glitch, use server config or defaults
  if (serverSyncStatus === 'Connected' && serverGasUrl) {
    const sName = (serverSpreadsheetName && serverSpreadsheetName !== 'PAMSDIGI Spreadsheet') ? serverSpreadsheetName : 'Db_pamsdigi';
    return {
      gasUrl: serverGasUrl,
      spreadsheetName: sName,
      syncStatus: 'Connected',
      lastConnected: serverLastConnected || new Date().toLocaleString('id-ID'),
      spreadsheetId: ENV_SPREADSHEET_ID || serverSpreadsheetId || DEFAULT_SPREADSHEET_ID
    };
  }

  return {
    gasUrl: DEFAULT_GAS_URL,
    spreadsheetName: 'Db_pamsdigi',
    syncStatus: 'Connected',
    lastConnected: new Date().toLocaleString('id-ID'),
    spreadsheetId: ENV_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID
  };
}

/**
 * Retrieves saved Google Apps Script URL from Google Apps Script Web App
 */
export async function getSavedGasUrl(): Promise<string> {
  const dbConfig = await getSavedDbConfig();
  if (dbConfig.syncStatus === 'Disconnected' || !dbConfig.gasUrl) {
    return '';
  }
  return dbConfig.gasUrl;
}

/**
 * Saves global database configuration directly to Google Apps Script PropertiesService and server
 */
export async function saveGlobalDbConfig(config: {
  gasUrl: string;
  spreadsheetName?: string;
  spreadsheetId?: string;
  lastConnected?: string;
}): Promise<void> {
  const rawName = config.spreadsheetName || 'Db_pamsdigi';
  const cleanName = rawName === 'PAMSDIGI Spreadsheet' ? 'Db_pamsdigi' : rawName;
  const payloadConfig = {
    gasUrl: config.gasUrl,
    spreadsheetName: cleanName,
    syncStatus: 'Connected' as const,
    lastConnected: config.lastConnected || new Date().toLocaleString('id-ID'),
    spreadsheetId: config.spreadsheetId || ''
  };

  // 1. Save to Centralized Server API (/api/db-config) so all devices immediately know the active spreadsheet
  try {
    await fetch('/api/db-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadConfig)
    }).catch(_ => {});
  } catch (_) {}

  // 2. Direct client-side GAS sync (write directly to sheet 'Konfigurasi' of THIS specific spreadsheet only)
  if (config.gasUrl && config.gasUrl.startsWith('http')) {
    try {
      const queryParams = new URLSearchParams({
        action: 'saveConfig',
        spreadsheetName: payloadConfig.spreadsheetName,
        spreadsheetId: payloadConfig.spreadsheetId,
        syncStatus: 'Connected',
        gasUrl: config.gasUrl,
        t: String(Date.now())
      });
      const directUrl = `${config.gasUrl}${config.gasUrl.includes('?') ? '&' : '?'}${queryParams.toString()}`;
      await fetch(directUrl, { method: 'GET', redirect: 'follow' }).catch(_ => {});
    } catch (_) {}
  }
}

/**
 * Disconnects global database configuration in Google Apps Script PropertiesService and server
 */
export async function disconnectGlobalDbConfig(): Promise<boolean> {
  const currentGasUrl = await getSavedGasUrl();

  // 1. Update centralized server
  try {
    await fetch('/api/db-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gasUrl: '',
        spreadsheetName: 'Belum Terhubung',
        syncStatus: 'Disconnected',
        lastConnected: 'Belum Terhubung',
        spreadsheetId: ''
      })
    }).catch(_ => {});
  } catch (_) {}

  // 2. Only reset the specific tenant's GAS URL, never touch other databases
  if (currentGasUrl && currentGasUrl.startsWith('http')) {
    try {
      const directUrl = `${currentGasUrl}${currentGasUrl.includes('?') ? '&' : '?'}&action=resetConfig&syncStatus=Disconnected&t=${Date.now()}`;
      await fetch(directUrl, { method: 'GET', redirect: 'follow' }).catch(_ => {});
    } catch (_) {}
  }

  return true;
}

export const resetGlobalDbConfig = disconnectGlobalDbConfig;

/**
 * Fetches the current connection status from Google Apps Script Web App (PropertiesService)
 */
export async function fetchGasConfig(customGasUrl?: string): Promise<GasConfigResult> {
  if (customGasUrl === undefined) {
    const gasConfig = await getSavedDbConfig();
    return {
      syncStatus: gasConfig.syncStatus,
      gasUrl: gasConfig.gasUrl,
      spreadsheetName: gasConfig.spreadsheetName,
      lastConnected: gasConfig.lastConnected,
      spreadsheetId: gasConfig.spreadsheetId
    };
  }

  const cleanCustom = customGasUrl.trim();
  if (!cleanCustom || !cleanCustom.startsWith('http')) {
    await resetGlobalDbConfig();
    return {
      syncStatus: 'Disconnected',
      gasUrl: '',
      spreadsheetName: 'Belum Terhubung',
      lastConnected: 'Belum Terhubung',
      spreadsheetId: ''
    };
  }

  try {
    const directUrl = `${cleanCustom}${cleanCustom.includes('?') ? '&' : '?'}action=getConfig&t=${Date.now()}`;
    const res = await fetch(directUrl, { method: 'GET', redirect: 'follow' });
    if (res.ok) {
      const json = await res.json();
      if (json && json.success && json.config) {
        const cfg = json.config;
        const status = cfg.syncStatus === 'Connected' ? 'Connected' : 'Disconnected';
        const activeUrl = status === 'Connected' ? (cfg.gasUrl || cleanCustom) : '';

        if (status === 'Connected') {
          const rSheetName = cfg.spreadsheetName || 'Db_pamsdigi';
          return {
            syncStatus: 'Connected',
            gasUrl: activeUrl,
            spreadsheetName: rSheetName === 'PAMSDIGI Spreadsheet' ? 'Db_pamsdigi' : rSheetName,
            lastConnected: cfg.lastConnected || new Date().toLocaleString('id-ID'),
            spreadsheetId: cfg.spreadsheetId || ''
          };
        } else {
          return {
            syncStatus: 'Disconnected',
            gasUrl: '',
            spreadsheetName: 'Belum Terhubung',
            lastConnected: 'Belum Terhubung',
            spreadsheetId: ''
          };
        }
      }
    }
  } catch (_) {}

  return {
    syncStatus: 'Disconnected',
    gasUrl: '',
    spreadsheetName: 'Belum Terhubung',
    lastConnected: 'Belum Terhubung',
    spreadsheetId: ''
  };
}

/**
 * Direct connection bypasses Google Login and OAuth popup completely.
 */
export async function connectGoogleAccount(): Promise<{ user: User; accessToken: string }> {
  const dummyUser: User = { email: 'KPS-PAMSDIGI SuperAdmin' };
  setAccessToken('public-access');
  localStorage.setItem('pams_google_user', JSON.stringify(dummyUser));
  return { user: dummyUser, accessToken: 'public-access' };
}

/**
 * Disconnect database integration
 */
export async function disconnectGoogleAccount(): Promise<void> {
  setAccessToken(null);
  localStorage.removeItem('pams_google_user');
}

/**
 * Lists the active spreadsheet ID in the database selection list.
 */
export async function listSpreadsheets(): Promise<Array<{ id: string; name: string }>> {
  const cfg = await getSavedDbConfig();
  if (cfg.spreadsheetId) {
    return [{ id: cfg.spreadsheetId, name: cfg.spreadsheetName || 'Db_pamsdigi' }];
  }
  return [];
}

/**
 * Automatic spreadsheet creation is disabled to prevent OAuth requirements.
 */
export async function createNewSpreadsheet(title: string): Promise<{ id: string; url: string }> {
  throw new Error('Pembuatan spreadsheet otomatis tidak didukung tanpa Google OAuth. Silakan buat Spreadsheet baru langsung dari Google Drive Anda, lalu salin ID spreadsheet-nya ke sini.');
}

/**
 * Calls Apps Script Web App directly to initialize sheets and write headers.
 */
export async function initializeSheetsAndHeaders(spreadsheetId: string, gasUrl?: string): Promise<void> {
  let targetGasUrl = gasUrl;
  if (!targetGasUrl && spreadsheetId && spreadsheetId.startsWith('http')) {
    targetGasUrl = spreadsheetId;
  }
  if (!targetGasUrl) {
    targetGasUrl = (await getSavedGasUrl()) || DEFAULT_GAS_URL;
  }

  if (!targetGasUrl) {
    throw new Error('Google Apps Script Web App URL diperlukan untuk inisialisasi.');
  }

  try {
    const directInitUrl = `${targetGasUrl}${targetGasUrl.includes('?') ? '&' : '?'}action=initSheets&t=${Date.now()}`;
    const directRes = await fetch(directInitUrl, { method: 'GET', redirect: 'follow' });

    if (!directRes.ok) {
      throw new Error(`Server Google Apps Script merespons dengan status HTTP ${directRes.status}`);
    }

    const resJson = await directRes.json();
    if (!resJson || resJson.success !== true) {
      throw new Error(resJson?.message || 'Gagal menginisialisasi spreadsheet.');
    }
  } catch (err: any) {
    throw new Error(`Inisialisasi Gagal: ${err.message || 'Pastikan Web App GAS dideploy dengan akses "Anyone" (Siapa saja).'}`);
  }
}

/**
 * Pushes data directly to Google Spreadsheet Web App.
 */
export async function pushDataToSheets(
  spreadsheetIdOrData: any,
  maybeData?: {
    users: UserRow[];
    pelanggan: PelangganRow[];
    areas: AreaRow[];
    tarifs: TarifRow[];
    abonemen: AbonemenRow;
    denda: DendaRow;
    readings?: any[];
    billingList?: any[];
    cashTransactions?: any[];
    profil?: {
      systemNama?: string;
      systemNamaDesa?: string;
      systemKecamatan?: string;
      systemKabupaten?: string;
      systemProvinsi?: string;
      systemAlamat?: string;
      systemTelepon?: string;
      systemEmail?: string;
      systemKetua?: string;
      systemBendahara?: string;
      systemFooterStruk?: string;
      systemLogo?: string;
      systemStempel?: string;
    };
    konfigurasi?: Array<{ key: string; value: string; deskripsi?: string }>;
  }
): Promise<void> {
  const data = maybeData || spreadsheetIdOrData;

  const payloadData = {
    users: data.users || [],
    pelanggan: data.pelanggan || [],
    areas: data.areas || [],
    tarifs: data.tarifs || [],
    abonemen: data.abonemen || { nominal: 0, status: 'Nonaktif' },
    denda: data.denda || { nominal: 0, hariKeterlambatan: 0, status: 'Nonaktif' },
    readings: data.readings || [],
    billingList: data.billingList || [],
    cashTransactions: data.cashTransactions || [],
    konfigurasi: data.konfigurasi || [],
    profil: data.profil || {
      systemNama: localStorage.getItem('pams_system_nama') || 'KPSPAMS DESA MANDIRI',
      systemNamaDesa: localStorage.getItem('pams_system_nama_desa') || 'Desa Mandiri',
      systemKecamatan: localStorage.getItem('pams_system_kecamatan') || 'Kecamatan Makmur',
      systemKabupaten: localStorage.getItem('pams_system_kabupaten') || 'Kabupaten Sejahtera',
      systemProvinsi: localStorage.getItem('pams_system_provinsi') || 'Provinsi Lestari',
      systemAlamat: localStorage.getItem('pams_system_alamat') || 'Jl. Raya Desa Mandiri, RT 01/RW 02',
      systemTelepon: localStorage.getItem('pams_system_hp') || '081234567890',
      systemEmail: localStorage.getItem('pams_system_email') || 'kpspams.mandiri@desa.go.id',
      systemKetua: localStorage.getItem('pams_system_ketua') || 'Agus Setiawan',
      systemBendahara: localStorage.getItem('pams_system_bendahara') || 'Siti Rahayu',
      systemFooterStruk: localStorage.getItem('pams_system_footer_struk') || 'Terima kasih telah membayar tepat waktu. Air bersih untuk kehidupan yang sehat!',
      systemLogo: localStorage.getItem('pams_system_logo') || '',
      systemStempel: localStorage.getItem('pams_system_stempel') || '',
    },
  };

  // 1. Send data directly to Google Apps Script Web App -> Google Spreadsheet
  const gasUrl = await getSavedGasUrl();
  
  if (gasUrl && gasUrl.startsWith('http')) {
    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          action: 'pushAll',
          data: payloadData,
        }),
      });
      if (res && res.ok) {
        drainOfflineQueue().catch(_ => {});
      } else {
        enqueueOfflineAction({ type: 'pushAll', data: payloadData });
      }
    } catch (_) {
      // Saat koneksi HP/browser offline, simpan ke antrean offline
      enqueueOfflineAction({ type: 'pushAll', data: payloadData });
    }
  }
}

/**
 * Fetches a public tab's contents from Google Spreadsheet using the Google Visualization API with &headers=1.
 */
export async function fetchGvizTab(spreadsheetId: string, tabName: string): Promise<any[][]> {
  const cleanId = (spreadsheetId || '').trim() || ENV_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(cleanId)}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(tabName)}&t=${Date.now()}`;
  const response = await fetch(url, { cache: 'no-store' });
  
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
    throw new Error('Spreadsheet belum dibagikan untuk publik (Viewer)');
  }
  
  const startIdx = text.indexOf('{');
  const endIdx = text.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1) {
    return [];
  }
  
  const jsonStr = text.substring(startIdx, endIdx + 1);
  const data = JSON.parse(jsonStr);
  
  if (data.status === 'error') {
    return [];
  }
  
  const rows = data.table?.rows || [];
  return rows.map((r: any) => {
    if (!r || !r.c) return [];
    return r.c.map((cell: any) => {
      if (!cell) return '';
      return (cell.v !== null && cell.v !== undefined) ? cell.v : (cell.f || '');
    });
  });
}

export const fetchPublicTab = fetchGvizTab;

/**
 * Fetches all database tables directly and in parallel via Google Visualization API (GViz)
 */
export async function fetchGvizAllData(spreadsheetId?: string): Promise<{
  users?: UserRow[];
  pelanggan?: PelangganRow[];
  areas?: AreaRow[];
  tarifs?: TarifRow[];
  abonemen?: AbonemenRow;
  denda?: DendaRow;
  readings?: any[];
  billingList?: any[];
  cashTransactions?: any[];
  profil?: any;
  konfigurasi?: Array<{ key: string; value: string; deskripsi?: string; updatedAt?: string }>;
}> {
  let targetId = (spreadsheetId || '').trim();
  if (!targetId) {
    const cfg = await getSavedDbConfig();
    targetId = cfg.spreadsheetId || ENV_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  }
  if (!targetId) {
    targetId = ENV_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  }

  const tabNames = ['Users', 'Pelanggan', 'Area', 'Tarif', 'Abonemen', 'Denda', 'Meter', 'Tagihan', 'Pembayaran', 'Profil', 'Konfigurasi'];
  
  const results = await Promise.allSettled(
    tabNames.map(tab => fetchGvizTab(targetId, tab))
  );

  const getTabRows = (index: number): any[][] => {
    const res = results[index];
    if (res.status === 'fulfilled') return res.value;
    return [];
  };

  const usersRows = getTabRows(0);
  const pelRows = getTabRows(1);
  const areaRows = getTabRows(2);
  const tarifRows = getTabRows(3);
  const abonemenRows = getTabRows(4);
  const dendaRows = getTabRows(5);
  const meterRows = getTabRows(6);
  const tagihanRows = getTabRows(7);
  const bayarRows = getTabRows(8);
  const profilRows = getTabRows(9);
  const konfigRows = getTabRows(10);

  const output: any = {};

  // 1. Users
  if (usersRows && usersRows.length > 0) {
    const mappedUsers: UserRow[] = usersRows.map(r => ({
      username: String(r[0] || '').trim(),
      password: String(r[1] || ''),
      nama: String(r[2] || '').trim(),
      role: (String(r[3] || 'Petugas').trim()) as 'Admin' | 'Petugas',
      status: (String(r[4] || 'Aktif').trim()) as 'Aktif' | 'Nonaktif',
      areaAkses: String(r[5] || 'ALL').trim()
    })).filter(u => u.username);
    if (mappedUsers.length > 0) output.users = mappedUsers;
  }

  // 2. Pelanggan
  if (pelRows) {
    output.pelanggan = pelRows.map(r => ({
      noPelanggan: String(r[0] || '').trim(),
      nama: String(r[1] || '').trim(),
      area: String(r[2] || '').trim(),
      alamat: String(r[3] || '').trim(),
      golongan: String(r[4] || '').trim(),
      tempatPemasangan: String(r[5] || '').trim(),
      tglPasang: String(r[6] || '').trim(),
      meterAwal: Number(r[7]) || 0,
      telepon: String(r[8] || '').trim(),
      latitude: Number(r[9]) || -7.8012,
      longitude: Number(r[10]) || 110.3644,
      status: (String(r[11] || 'Aktif').trim()) as 'Aktif' | 'Nonaktif',
      createdAt: String(r[12] || new Date().toISOString()).trim()
    })).filter(p => p.noPelanggan);
  }

  // 3. Area (Rows directly start from first data item since &headers=1)
  if (areaRows && areaRows.length > 0) {
    const mappedAreas: AreaRow[] = areaRows.map(r => ({
      id: String(r[0] || '').trim(),
      nama: String(r[1] || '').trim()
    })).filter(a => a.id && a.nama);
    if (mappedAreas.length > 0) output.areas = mappedAreas;
  }

  // 4. Tarif
  if (tarifRows && tarifRows.length > 0) {
    const mappedTarifs: TarifRow[] = tarifRows.map(r => ({
      id: String(r[0] || '').trim(),
      golongan: String(r[1] || '').trim(),
      tipe: (String(r[2] || 'Flat').trim()) as 'Flat' | 'Bertingkat',
      tarifFlat: Number(r[3]) || 0,
      range1Max: Number(r[4]) || 0,
      range1Tarif: Number(r[5]) || 0,
      range2Max: Number(r[6]) || 0,
      range2Tarif: Number(r[7]) || 0,
      range3Tarif: Number(r[8]) || 0,
      status: (String(r[9] || 'Aktif').trim()) as 'Aktif' | 'Nonaktif',
      levels: r[10] ? String(r[10]).trim() : undefined
    })).filter(t => t.id);
    if (mappedTarifs.length > 0) output.tarifs = mappedTarifs;
  }

  // 5. Abonemen
  if (abonemenRows && abonemenRows.length > 0) {
    const r = abonemenRows[0];
    output.abonemen = {
      nominal: Number(r[0]) || 0,
      status: (String(r[1] || 'Nonaktif').trim()) as 'Aktif' | 'Nonaktif'
    };
  }

  // 6. Denda
  if (dendaRows && dendaRows.length > 0) {
    const r = dendaRows[0];
    output.denda = {
      nominal: Number(r[0]) || 0,
      hariKeterlambatan: Number(r[1]) || 0,
      status: (String(r[2] || 'Nonaktif').trim()) as 'Aktif' | 'Nonaktif'
    };
  }

  // 7. Meter
  if (meterRows) {
    output.readings = meterRows.map(r => ({
      id: String(r[0] || '').trim(),
      noPelanggan: String(r[1] || '').trim(),
      nama: String(r[2] || '').trim(),
      area: String(r[3] || '').trim(),
      meterLalu: Number(r[4]) || 0,
      meterKini: Number(r[5]) || 0,
      usage: Number(r[6]) || 0,
      tglBaca: String(r[7] || '').trim(),
      periode: String(r[8] || '').trim(),
      status: String(r[9] || '').trim(),
      foto: r[10] ? String(r[10]) : null
    })).filter(m => m.id);
  }

  // 8. Tagihan
  if (tagihanRows) {
    output.billingList = tagihanRows.map(r => ({
      id: String(r[0] || '').trim(),
      noPelanggan: String(r[1] || '').trim(),
      nama: String(r[2] || '').trim(),
      area: String(r[3] || '').trim(),
      meterLalu: Number(r[4]) || 0,
      meterKini: Number(r[5]) || 0,
      usage: Number(r[6]) || 0,
      kubikasiBiaya: Number(r[7]) || 0,
      abonemen: Number(r[8]) || 0,
      denda: Number(r[9]) || 0,
      total: Number(r[10]) || 0,
      status: String(r[11] || 'Belum Bayar').trim(),
      periode: String(r[12] || '').trim(),
      tglJatuhTempo: String(r[13] || '').trim()
    })).filter(b => b.id);
  }

  // 9. Pembayaran
  if (bayarRows) {
    output.cashTransactions = bayarRows.map(r => ({
      id: String(r[0] || '').trim(),
      tanggal: String(r[1] || '').trim(),
      deskripsi: String(r[2] || '').trim(),
      tipe: (String(r[3] || 'Masuk').trim()) as 'Masuk' | 'Keluar',
      jumlah: Number(r[4]) || 0,
      area: String(r[5] || 'ALL').trim()
    })).filter(t => t.id);
  }

  // 10. Profil
  if (profilRows && profilRows.length > 0) {
    const r = profilRows[0];
    output.profil = {
      systemNama: String(r[0] || '').trim(),
      systemNamaDesa: String(r[1] || '').trim(),
      systemKecamatan: String(r[2] || '').trim(),
      systemKabupaten: String(r[3] || '').trim(),
      systemProvinsi: String(r[4] || '').trim(),
      systemAlamat: String(r[5] || '').trim(),
      systemTelepon: String(r[6] || '').trim(),
      systemEmail: String(r[7] || '').trim(),
      systemKetua: String(r[8] || '').trim(),
      systemBendahara: String(r[9] || '').trim(),
      systemFooterStruk: String(r[10] || '').trim(),
      systemLogo: String(r[11] || '').trim(),
      systemStempel: String(r[12] || '').trim()
    };
  }

  // 11. Konfigurasi
  if (konfigRows && konfigRows.length > 0) {
    output.konfigurasi = konfigRows.map(r => ({
      key: String(r[0] || '').trim(),
      value: String(r[1] || '').trim(),
      deskripsi: String(r[2] || '').trim(),
      updatedAt: String(r[3] || '').trim()
    })).filter(k => k.key);
  }

  return output;
}

/**
 * Pull and parse data directly from Google Spreadsheet via GViz API (Fastest Read) or GAS fallback.
 */
export async function pullDataFromSheets(spreadsheetId?: string): Promise<{
  users?: UserRow[];
  pelanggan?: PelangganRow[];
  areas?: AreaRow[];
  tarifs?: TarifRow[];
  abonemen?: AbonemenRow;
  denda?: DendaRow;
  readings?: any[];
  billingList?: any[];
  cashTransactions?: any[];
  profil?: any;
  konfigurasi?: Array<{ key: string; value: string; deskripsi?: string; updatedAt?: string }>;
}> {
  // 1. Primary high-speed read via Google Visualization API (GViz)
  try {
    const gvizData = await fetchGvizAllData(spreadsheetId);
    if (gvizData && (gvizData.users || gvizData.pelanggan || gvizData.areas || gvizData.tarifs || gvizData.profil || gvizData.konfigurasi)) {
      return gvizData;
    }
  } catch (gvizErr) {
    console.warn('GViz pull fallback to GAS:', gvizErr);
  }

  // 2. Secondary fallback via GAS Web App action=readAll
  const gasUrl = await getSavedGasUrl();

  if (gasUrl && gasUrl.startsWith('http')) {
    try {
      const directUrl = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=readAll&t=${Date.now()}`;
      const directRes = await fetch(directUrl, { method: 'GET', redirect: 'follow' });
      let resJson: any = null;

      if (directRes.ok) {
        resJson = await directRes.json();
      }

      if (resJson && resJson.success && resJson.data) {
        const d = resJson.data;
        return {
          users: d.users || [],
          pelanggan: d.pelanggan || [],
          areas: d.areas || [],
          tarifs: d.tarifs || [],
          abonemen: d.abonemen || { nominal: 0, status: 'Nonaktif' },
          denda: d.denda || { nominal: 0, hariKeterlambatan: 0, status: 'Nonaktif' },
          readings: d.readings || [],
          billingList: d.billingList || [],
          cashTransactions: d.cashTransactions || [],
          profil: d.profil || null,
          konfigurasi: d.konfigurasi || [],
        };
      }
    } catch (_) {}
  }

  return {};
}
