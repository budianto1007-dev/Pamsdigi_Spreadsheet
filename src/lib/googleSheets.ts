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

export const DEFAULT_GAS_URL = ((import.meta as any).env?.VITE_GAS_URL as string) || 'https://script.google.com/macros/s/AKfycbzDwmkxUigIyaMGL8R8MH_k0qjx7Q0imFJ20uWwlzbAzHCNWthD_hQot66M_cyuYI6umQ/exec';

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
  const localGasUrl = localStorage.getItem('pams_google_gas_url') || '';
  const lastKnownUrl = localStorage.getItem('pams_last_known_gas_url') || '';
  const localSyncStatus = localStorage.getItem('pams_db_sync_status') || 'Disconnected';

  // 1. First poll centralized server config so all devices (HP, desktop, new browsers) sync globally
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
        serverSpreadsheetName = sJson.spreadsheetName || 'PAMSDIGI Spreadsheet';
        serverLastConnected = sJson.lastConnected || '';
        serverSpreadsheetId = sJson.spreadsheetId || '';
      }
    }
  } catch (_) {}

  // Prioritize server config for global connection across all devices
  const urlsToPoll: string[] = [];
  if (serverGasUrl && serverGasUrl.startsWith('http')) urlsToPoll.push(serverGasUrl);
  if (DEFAULT_GAS_URL && DEFAULT_GAS_URL.startsWith('http') && !urlsToPoll.includes(DEFAULT_GAS_URL)) urlsToPoll.push(DEFAULT_GAS_URL);
  if (localGasUrl && localGasUrl.startsWith('http') && !urlsToPoll.includes(localGasUrl)) urlsToPoll.push(localGasUrl);
  if (lastKnownUrl && lastKnownUrl.startsWith('http') && !urlsToPoll.includes(lastKnownUrl)) urlsToPoll.push(lastKnownUrl);

  if (urlsToPoll.length === 0) {
    localStorage.setItem('pams_google_gas_url', DEFAULT_GAS_URL);
    localStorage.setItem('pams_db_sheet_name', 'Belum Terhubung');
    localStorage.setItem('pams_db_sync_status', 'Disconnected');
    localStorage.setItem('pams_db_last_connected', 'Belum Terhubung');

    return {
      gasUrl: DEFAULT_GAS_URL,
      spreadsheetName: 'Belum Terhubung',
      syncStatus: 'Disconnected',
      lastConnected: 'Belum Terhubung',
      spreadsheetId: ''
    };
  }

  for (const targetUrl of urlsToPoll) {
    try {
      let json: any = null;
      // Direct client-side fetch to Google Apps Script Web App
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
        const activeUrl = cfg.gasUrl && typeof cfg.gasUrl === 'string' && cfg.gasUrl.trim().startsWith('http') ? cfg.gasUrl.trim() : (status === 'Connected' ? targetUrl : '');

        if (status === 'Connected' && activeUrl) {
          const sheetName = cfg.spreadsheetName || serverSpreadsheetName || localStorage.getItem('pams_db_sheet_name') || 'PAMSDIGI Spreadsheet';
          const lastConn = cfg.lastConnected || serverLastConnected || localStorage.getItem('pams_db_last_connected') || new Date().toLocaleString('id-ID');
          const sheetId = cfg.spreadsheetId || serverSpreadsheetId || localStorage.getItem('pams_google_sheet_id') || '';

          localStorage.setItem('pams_google_gas_url', activeUrl);
          localStorage.setItem('pams_last_known_gas_url', activeUrl);
          localStorage.setItem('pams_db_sheet_name', sheetName);
          localStorage.setItem('pams_db_sync_status', 'Connected');
          localStorage.setItem('pams_db_last_connected', lastConn);

          return {
            gasUrl: activeUrl,
            spreadsheetName: sheetName,
            syncStatus: 'Connected',
            lastConnected: lastConn,
            spreadsheetId: sheetId
          };
        } else if (status === 'Disconnected') {
          // Server explicitly returned Disconnected status (Global Reset)
          localStorage.setItem('pams_google_gas_url', DEFAULT_GAS_URL);
          localStorage.setItem('pams_db_sheet_name', 'Belum Terhubung');
          localStorage.setItem('pams_db_sync_status', 'Disconnected');
          localStorage.setItem('pams_db_last_connected', 'Belum Terhubung');

          return {
            gasUrl: DEFAULT_GAS_URL,
            spreadsheetName: 'Belum Terhubung',
            syncStatus: 'Disconnected',
            lastConnected: 'Belum Terhubung',
            spreadsheetId: ''
          };
        }
      }
    } catch (_) {}
  }

  // Network fail-safe: if request fails due to temporary offline or network glitch, use server config or cached local
  if (serverSyncStatus === 'Connected' && serverGasUrl) {
    return {
      gasUrl: serverGasUrl,
      spreadsheetName: serverSpreadsheetName || 'PAMSDIGI Spreadsheet',
      syncStatus: 'Connected',
      lastConnected: serverLastConnected || new Date().toLocaleString('id-ID'),
      spreadsheetId: serverSpreadsheetId
    };
  }

  if (localSyncStatus === 'Connected' && localGasUrl) {
    return {
      gasUrl: localGasUrl,
      spreadsheetName: localStorage.getItem('pams_db_sheet_name') || 'PAMSDIGI Spreadsheet',
      syncStatus: 'Connected',
      lastConnected: localStorage.getItem('pams_db_last_connected') || new Date().toLocaleString('id-ID'),
      spreadsheetId: localStorage.getItem('pams_google_sheet_id') || ''
    };
  }

  return {
    gasUrl: localGasUrl || DEFAULT_GAS_URL,
    spreadsheetName: 'Belum Terhubung',
    syncStatus: 'Disconnected',
    lastConnected: 'Belum Terhubung',
    spreadsheetId: ''
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
  const payloadConfig = {
    gasUrl: config.gasUrl,
    spreadsheetName: config.spreadsheetName || 'PAMSDIGI Spreadsheet',
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

  // 2. Direct client-side GAS sync
  const urlsToUpdate = new Set<string>();
  if (config.gasUrl && config.gasUrl.startsWith('http')) urlsToUpdate.add(config.gasUrl);
  if (DEFAULT_GAS_URL && DEFAULT_GAS_URL.startsWith('http')) urlsToUpdate.add(DEFAULT_GAS_URL);
  const lastKnown = localStorage.getItem('pams_last_known_gas_url');
  if (lastKnown && lastKnown.startsWith('http')) urlsToUpdate.add(lastKnown);

  for (const url of urlsToUpdate) {
    try {
      const queryParams = new URLSearchParams({
        action: 'saveConfig',
        spreadsheetName: payloadConfig.spreadsheetName,
        spreadsheetId: payloadConfig.spreadsheetId,
        syncStatus: 'Connected',
        gasUrl: config.gasUrl || '',
        t: String(Date.now())
      });
      const directUrl = `${url}${url.includes('?') ? '&' : '?'}${queryParams.toString()}`;
      await fetch(directUrl, { method: 'GET', redirect: 'follow' }).catch(_ => {});
    } catch (_) {}
  }

  localStorage.setItem('pams_google_gas_url', config.gasUrl);
  localStorage.setItem('pams_last_known_gas_url', config.gasUrl);
  localStorage.setItem('pams_db_sheet_name', payloadConfig.spreadsheetName);
  localStorage.setItem('pams_db_sync_status', 'Connected');
  localStorage.setItem('pams_db_last_connected', payloadConfig.lastConnected);
}

/**
 * Disconnects global database configuration in Google Apps Script PropertiesService and server
 */
export async function disconnectGlobalDbConfig(): Promise<boolean> {
  const currentGasUrl = localStorage.getItem('pams_google_gas_url') || localStorage.getItem('pams_last_known_gas_url') || DEFAULT_GAS_URL;

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

  const urlsToReset = new Set<string>();
  if (currentGasUrl && currentGasUrl.startsWith('http')) urlsToReset.add(currentGasUrl);
  if (DEFAULT_GAS_URL && DEFAULT_GAS_URL.startsWith('http')) urlsToReset.add(DEFAULT_GAS_URL);
  const lastKnown = localStorage.getItem('pams_last_known_gas_url');
  if (lastKnown && lastKnown.startsWith('http')) urlsToReset.add(lastKnown);

  for (const url of urlsToReset) {
    try {
      const directUrl = `${url}${url.includes('?') ? '&' : '?'}&action=resetConfig&syncStatus=Disconnected&t=${Date.now()}`;
      await fetch(directUrl, { method: 'GET', redirect: 'follow' }).catch(_ => {});
    } catch (_) {}
  }

  localStorage.setItem('pams_google_gas_url', '');
  if (currentGasUrl) {
    localStorage.setItem('pams_last_known_gas_url', currentGasUrl);
  }
  localStorage.setItem('pams_google_sheet_id', '');
  localStorage.setItem('pams_db_sheet_name', 'Belum Terhubung');
  localStorage.setItem('pams_db_sync_status', 'Disconnected');
  localStorage.setItem('pams_db_last_connected', 'Belum Terhubung');
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
          return {
            syncStatus: 'Connected',
            gasUrl: activeUrl,
            spreadsheetName: cfg.spreadsheetName || 'PAMSDIGI Spreadsheet',
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
  const activeId = localStorage.getItem('pams_google_sheet_id');
  const activeName = localStorage.getItem('pams_db_sheet_name') || 'PAMSDIGI Spreadsheet';
  if (activeId) {
    return [{ id: activeId, name: activeName }];
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
    targetGasUrl = (await getSavedGasUrl()) || localStorage.getItem('pams_google_gas_url') || '';
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

  // 1. Save to LocalStorage for instant local cache & offline resilience
  try {
    localStorage.setItem('pams_data_users_default', JSON.stringify(payloadData.users));
    localStorage.setItem('pams_data_pelanggan_default', JSON.stringify(payloadData.pelanggan));
    localStorage.setItem('pams_data_areas_default', JSON.stringify(payloadData.areas));
    localStorage.setItem('pams_data_tarifs_default', JSON.stringify(payloadData.tarifs));
    localStorage.setItem('pams_data_abonemen_default', JSON.stringify(payloadData.abonemen));
    localStorage.setItem('pams_data_denda_default', JSON.stringify(payloadData.denda));
    localStorage.setItem('pams_data_readings_default', JSON.stringify(payloadData.readings));
    localStorage.setItem('pams_data_billing_default', JSON.stringify(payloadData.billingList));
    localStorage.setItem('pams_data_cash_default', JSON.stringify(payloadData.cashTransactions));
  } catch (_) {}

  // 2. Push directly to Google Apps Script Web App -> Google Spreadsheet
  const syncStatus = localStorage.getItem('pams_db_sync_status');
  const gasUrl = (await getSavedGasUrl()) || localStorage.getItem('pams_google_gas_url') || '';
  
  if (syncStatus !== 'Disconnected' && gasUrl && gasUrl.startsWith('http')) {
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
 * Fetches a public tab's contents from Google Spreadsheet using the Google Visualization API.
 */
async function fetchPublicTab(spreadsheetId: string, tabName: string): Promise<any[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}`;
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
  
  const startIdx = text.indexOf('{');
  const endIdx = text.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Spreadsheet belum dibagikan');
  }
  
  const jsonStr = text.substring(startIdx, endIdx + 1);
  const data = JSON.parse(jsonStr);
  
  if (data.status === 'error') {
    // Return empty if sheet tab is missing/empty
    return [];
  }
  
  const rows = data.table?.rows || [];
  return rows.map((r: any) => {
    if (!r || !r.c) return [];
    return r.c.map((cell: any) => (cell && cell.v !== null && cell.v !== undefined) ? cell.v : '');
  });
}

/**
 * Pull and parse data directly from Google Spreadsheet via Google Apps Script Web App.
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
}> {
  // 1. Try pulling directly from Google Apps Script Web App
  const syncStatus = localStorage.getItem('pams_db_sync_status');
  const gasUrl = (await getSavedGasUrl()) || localStorage.getItem('pams_google_gas_url') || '';

  if (syncStatus !== 'Disconnected' && gasUrl && gasUrl.startsWith('http')) {
    try {
      const directUrl = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=readAll&t=${Date.now()}`;
      const directRes = await fetch(directUrl, { method: 'GET', redirect: 'follow' });
      let resJson: any = null;

      if (directRes.ok) {
        resJson = await directRes.json();
      }

      if (resJson && resJson.success && resJson.data) {
        const d = resJson.data;
        // Save to LocalStorage for local caching
        try {
          if (d.users) localStorage.setItem('pams_data_users_default', JSON.stringify(d.users));
          if (d.pelanggan) localStorage.setItem('pams_data_pelanggan_default', JSON.stringify(d.pelanggan));
          if (d.areas) localStorage.setItem('pams_data_areas_default', JSON.stringify(d.areas));
          if (d.tarifs) localStorage.setItem('pams_data_tarifs_default', JSON.stringify(d.tarifs));
          if (d.abonemen) localStorage.setItem('pams_data_abonemen_default', JSON.stringify(d.abonemen));
          if (d.denda) localStorage.setItem('pams_data_denda_default', JSON.stringify(d.denda));
          if (d.readings) localStorage.setItem('pams_data_readings_default', JSON.stringify(d.readings));
          if (d.billingList) localStorage.setItem('pams_data_billing_default', JSON.stringify(d.billingList));
          if (d.cashTransactions) localStorage.setItem('pams_data_cash_default', JSON.stringify(d.cashTransactions));
        } catch (_) {}

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
        };
      }
    } catch (_) {}
  }

  // FALLBACK: Read-only via Public Visualization API
  const result: any = {};
  
  if (!spreadsheetId) {
    return result;
  }
  
  try {
    // 1. Users Tab
    try {
      const rows = await fetchPublicTab(spreadsheetId, 'Users');
      if (rows.length > 1) {
        result.users = rows.slice(1).map(r => ({
          username: String(r[0] || ''),
          password: String(r[1] || ''),
          nama: String(r[2] || ''),
          role: String(r[3] || 'Petugas'),
          status: String(r[4] || 'Aktif')
        })).filter(u => u.username);
      }
    } catch (_) {}

    // 2. Pelanggan Tab
    try {
      const rows = await fetchPublicTab(spreadsheetId, 'Pelanggan');
      if (rows.length > 1) {
        result.pelanggan = rows.slice(1).map(r => ({
          noPelanggan: String(r[0] || ''),
          nama: String(r[1] || ''),
          area: String(r[2] || ''),
          alamat: String(r[3] || ''),
          golongan: String(r[4] || ''),
          tempatPemasangan: String(r[5] || ''),
          tglPasang: String(r[6] || ''),
          meterAwal: Number(r[7]) || 0,
          telepon: String(r[8] || ''),
          latitude: Number(r[9]) || -7.8012,
          longitude: Number(r[10]) || 110.3644,
          status: String(r[11] || 'Aktif'),
          createdAt: String(r[12] || new Date().toISOString())
        })).filter(p => p.noPelanggan);
      }
    } catch (_) {}

    // 3. Area Tab
    try {
      const rows = await fetchPublicTab(spreadsheetId, 'Area');
      if (rows.length > 1) {
        result.areas = rows.slice(1).map(r => ({
          id: String(r[0] || ''),
          nama: String(r[1] || '')
        })).filter(a => a.id);
      }
    } catch (_) {}

    // 4. Tarif Tab
    try {
      const rows = await fetchPublicTab(spreadsheetId, 'Tarif');
      if (rows.length > 1) {
        result.tarifs = rows.slice(1).map(r => ({
          id: String(r[0] || ''),
          golongan: String(r[1] || ''),
          tipe: String(r[2] || 'Flat') as 'Flat' | 'Bertingkat',
          tarifFlat: Number(r[3]) || 0,
          range1Max: Number(r[4]) || 0,
          range1Tarif: Number(r[5]) || 0,
          range2Max: Number(r[6]) || 0,
          range2Tarif: Number(r[7]) || 0,
          range3Tarif: Number(r[8]) || 0,
          status: String(r[9] || 'Aktif') as 'Aktif' | 'Nonaktif'
        })).filter(t => t.id);
      }
    } catch (_) {}

    // 5. Abonemen Tab
    try {
      const rows = await fetchPublicTab(spreadsheetId, 'Abonemen');
      if (rows.length > 1) {
        const r = rows[1] || [];
        result.abonemen = {
          nominal: Number(r[0]) || 0,
          status: (r[1] || 'Nonaktif') as 'Aktif' | 'Nonaktif'
        };
      }
    } catch (_) {}

    // 6. Denda Tab
    try {
      const rows = await fetchPublicTab(spreadsheetId, 'Denda');
      if (rows.length > 1) {
        const r = rows[1] || [];
        result.denda = {
          nominal: Number(r[0]) || 0,
          hariKeterlambatan: Number(r[1]) || 0,
          status: (r[2] || 'Nonaktif') as 'Aktif' | 'Nonaktif'
        };
      }
    } catch (_) {}

    // 7. Meter Tab
    try {
      const rows = await fetchPublicTab(spreadsheetId, 'Meter');
      if (rows.length > 1) {
        result.readings = rows.slice(1).map(r => ({
          id: String(r[0] || ''),
          noPelanggan: String(r[1] || ''),
          nama: String(r[2] || ''),
          area: String(r[3] || ''),
          meterLalu: Number(r[4]) || 0,
          meterKini: Number(r[5]) || 0,
          usage: Number(r[6]) || 0,
          tglBaca: String(r[7] || ''),
          periode: String(r[8] || ''),
          foto: null
        })).filter(r => r.id);
      }
    } catch (_) {}

    // 8. Tagihan Tab
    try {
      const rows = await fetchPublicTab(spreadsheetId, 'Tagihan');
      if (rows.length > 1) {
        result.billingList = rows.slice(1).map(r => ({
          id: String(r[0] || ''),
          noPelanggan: String(r[1] || ''),
          nama: String(r[2] || ''),
          area: String(r[3] || ''),
          meterLalu: Number(r[4]) || 0,
          meterKini: Number(r[5]) || 0,
          usage: Number(r[6]) || 0,
          kubikasiBiaya: Number(r[7]) || 0,
          abonemen: Number(r[8]) || 0,
          denda: Number(r[9]) || 0,
          total: Number(r[10]) || 0,
          status: String(r[11] || 'Belum Bayar'),
          periode: String(r[12] || ''),
          tglJatuhTempo: String(r[13] || '')
        })).filter(b => b.id);
      }
    } catch (_) {}

    // 9. Pembayaran Tab
    try {
      const rows = await fetchPublicTab(spreadsheetId, 'Pembayaran');
      if (rows.length > 1) {
        result.cashTransactions = rows.slice(1).map(r => ({
          id: String(r[0] || ''),
          tanggal: String(r[1] || ''),
          deskripsi: String(r[2] || ''),
          tipe: String(r[3] || 'Masuk') as 'Masuk' | 'Keluar',
          jumlah: Number(r[4]) || 0,
          area: String(r[5] || 'ALL')
        })).filter(t => t.id);
      }
    } catch (_) {}

    // 10. Profil Tab
    try {
      const rows = await fetchPublicTab(spreadsheetId, 'Profil');
      if (rows.length > 1) {
        const r = rows[1] || [];
        result.profil = {
          systemNama: String(r[0] || ''),
          systemNamaDesa: String(r[1] || ''),
          systemKecamatan: String(r[2] || ''),
          systemKabupaten: String(r[3] || ''),
          systemProvinsi: String(r[4] || ''),
          systemAlamat: String(r[5] || ''),
          systemTelepon: String(r[6] || ''),
          systemEmail: String(r[7] || ''),
          systemKetua: String(r[8] || ''),
          systemBendahara: String(r[9] || ''),
          systemFooterStruk: String(r[10] || ''),
          systemLogo: String(r[11] || ''),
          systemStempel: String(r[12] || '')
        };
      }
    } catch (_) {}

  } catch (err: any) {
    if (err.message === 'Spreadsheet belum dibagikan' || err.message === 'Spreadsheet tidak ditemukan') {
      throw err;
    }
    throw new Error('Spreadsheet belum dibagikan');
  }

  return result;
}
