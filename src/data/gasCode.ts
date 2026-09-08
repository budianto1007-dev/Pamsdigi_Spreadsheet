import { GASFile } from '../types';

export const gasFiles: GASFile[] = [
  {
    name: 'Code.gs',
    type: 'gs',
    description: 'File controller utama Google Apps Script untuk menangani REST API / CRUD Sinkronisasi Database PAMSDIGI.',
    content: `/**
 * PAMSDIGI - PAMS Digital Indonesia
 * REST API & Google Spreadsheet Database Integration
 * Version: v2.3.3
 * Last Updated: 08 September 2026
 * Status: Production Ready - Multi-Tenant Isolated Sync & Sheet Konfigurasi Storage
 * 
 * Change Log v2.3.3:
 * - [FIX] Sheet Konfigurasi Persistence: Memastikan gasUrl yang sudah terhubung tidak pernah terhapus atau tertimpa string kosong saat sinkronisasi background (pushAll/readAll).
 * - [UPDATE] Multi-Tenant Architecture: Mendukung multi-deployment independen (1 link Vercel -> 1 Google Spreadsheet) secara terisolasi tanpa saling menimpa.
 * - [UPDATE] Dynamic Hak Akses & Menu Matrix: Mendukung penyimpanan dinamis matriks hak akses operasi dan visibilitas menu ke sheet 'Konfigurasi' secara global.
 * - [UPDATE] Live Dynamic Spreadsheet Name: Memastikan nama database langsung membaca nama live file spreadsheet Google Drive (Db_pamsdigi) secara dinamis melalui db.getName() dan menyimpannya ke sheet Konfigurasi.
 * - [UPDATE] Konfigurasi Sheet as Single Source of Truth: Menyimpan gasUrl, spreadsheetId, dan status global langsung ke sheet 'Konfigurasi' di Google Spreadsheet.
 * - [UPDATE] Default Admin Seeding: Otomatis mengisi akun admin default (username: admin, password: admin) jika sheet Users baru dibuat.
 * - [UPDATE] Live Authentication API: Endpoint login langsung ke sheet Users secara real-time dari HP petugas.
 * - [UPDATE] Full Spreadsheet Database CRUD: Menangani transaksi pushAll/readAll serta manajemen sinkronisasi global lintas perangkat.
 * 
 * PETUNJUK PEMASANGAN:
 * 1. Buka Google Spreadsheet baru atau yang sedang aktif.
 * 2. Klik menu Ekstensi -> Apps Script.
 * 3. Hapus SELURUH isi file Code.gs lama.
 * 4. PASTE SELURUH isi kode di bawah ini ke dalam file Code.gs.
 * 5. Klik ikon Disket (Simpan / Save).
 * 6. Klik Terapkan (Deploy) -> Penerapan Baru (New Deployment).
 * 7. Pilih Jenis: Aplikasi Web (Web App).
 * 8. Konfigurasi Deployment:
 *    - Deskripsi: PAMSDIGI Web API v2.3.3
 *    - Jalankan sebagai (Execute as): Saya (Me)
 *    - Siapa yang memiliki akses (Who has access): Siapa saja (Anyone) -> WAJIB!
 * 9. Klik Terapkan (Deploy), berikan izin Google (Authorize Access), lalu Salin URL Aplikasi Web yang berakhiran /exec.
 * 10. Buka PAMSDIGI di browser, masuk menu Pengaturan Database, lalu tempel URL tersebut.
 */

function doGet(e) {
  var result = { success: false, message: "" };
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "testConnection";
    var db = getDb();
    
    if (action === "readAll" || action === "pullAll") {
      result.data = readAllSheetsData(db);
      result.success = true;
      result.message = "Berhasil membaca seluruh database PAMSDIGI.";
    } else if (action === "initSheets") {
      initAllSheets(db);
      result.success = true;
      result.message = "Seluruh sheet berhasil diinisialisasi secara aman (non-destructive).";
    } else if (action === "login" || action === "authenticate") {
      var username = (e && e.parameter && e.parameter.username) ? String(e.parameter.username).trim() : "";
      var password = (e && e.parameter && e.parameter.password) ? String(e.parameter.password).trim() : "";
      result = authenticateUser(db, username, password);
    } else if (action === "getConfig") {
      var configData = getStoredConfig(db);
      result.config = configData;
      result.success = true;
    } else if (action === "saveConfig") {
      var gasUrlParam = (e && e.parameter && e.parameter.gasUrl) ? e.parameter.gasUrl : "";
      var liveNameParam = db.getName() || "Db_pamsdigi";
      if (liveNameParam === "PAMSDIGI Spreadsheet") liveNameParam = "Db_pamsdigi";
      var sheetNameParam = (e && e.parameter && e.parameter.spreadsheetName && e.parameter.spreadsheetName !== "PAMSDIGI Spreadsheet") ? e.parameter.spreadsheetName : liveNameParam;
      var sheetIdParam = (e && e.parameter && e.parameter.spreadsheetId) ? e.parameter.spreadsheetId : db.getId();
      
      saveStoredConfig(db, {
        gasUrl: gasUrlParam,
        spreadsheetName: sheetNameParam,
        spreadsheetId: sheetIdParam,
        syncStatus: "Connected",
        lastConnected: new Date().toLocaleString("id-ID")
      });

      result.success = true;
      result.message = "Konfigurasi berhasil disimpan ke sheet Konfigurasi.";
    } else if (action === "resetConfig" || action === "clearConfig") {
      resetStoredConfig(db);
      result.success = true;
      result.message = "Konfigurasi database di Google Apps Script berhasil di-reset secara global.";
    } else {
      // Default: test connection
      var liveDbName = db.getName() || "Db_pamsdigi";
      if (liveDbName === "PAMSDIGI Spreadsheet") liveDbName = "Db_pamsdigi";
      result.success = true;
      result.message = "Google Apps Script Web App PAMSDIGI v2.3.3 terhubung & aktif!";
      result.timestamp = new Date().toISOString();
      result.spreadsheetName = liveDbName;
      result.data = readAllSheetsData(db);
    }
  } catch (err) {
    result.success = false;
    result.message = "Error doGet: " + err.toString();
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var result = { success: false, message: "" };
  try {
    var postData = {};
    if (e && e.postData && e.postData.contents) {
      try {
        postData = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        postData = {};
      }
    }
    
    var action = postData.action || (e && e.parameter && e.parameter.action) || "pushAll";
    var db = getDb();
    
    if (action === "pushAll" || action === "syncAll" || action === "saveData") {
      var payloadData = postData.data || postData;
      saveAllSheetsData(db, payloadData);
      result.success = true;
      result.message = "Data berhasil disimpan permanen ke Google Spreadsheet.";
      result.updatedAt = new Date().toISOString();
    } else if (action === "login" || action === "authenticate") {
      var uName = (postData.username || (e && e.parameter && e.parameter.username) || "").toString().trim();
      var uPass = (postData.password || (e && e.parameter && e.parameter.password) || "").toString().trim();
      result = authenticateUser(db, uName, uPass);
    } else if (action === "readAll" || action === "pullAll") {
      result.data = readAllSheetsData(db);
      result.success = true;
      result.message = "Berhasil membaca seluruh database PAMSDIGI.";
    } else if (action === "initSheets") {
      initAllSheets(db);
      result.success = true;
      result.message = "Spreadsheet berhasil diinisialisasi secara aman.";
    } else if (action === "saveConfig") {
      var cfg = postData.config || {};
      var livePostName = db.getName() || cfg.spreadsheetName || "Db_pamsdigi";
      if (livePostName === "PAMSDIGI Spreadsheet") livePostName = "Db_pamsdigi";
      saveStoredConfig(db, {
        gasUrl: cfg.gasUrl || "",
        spreadsheetName: livePostName,
        spreadsheetId: cfg.spreadsheetId || db.getId(),
        syncStatus: "Connected",
        lastConnected: new Date().toLocaleString("id-ID")
      });
      result.success = true;
      result.message = "Konfigurasi berhasil disimpan ke sheet Konfigurasi.";
    } else if (action === "resetConfig" || action === "clearConfig") {
      resetStoredConfig(db);
      result.success = true;
      result.message = "Konfigurasi database di Google Apps Script berhasil di-reset secara global.";
    } else {
      // Fallback: If data payload is present, attempt pushAll
      if (postData.data || postData.users || postData.pelanggan) {
        saveAllSheetsData(db, postData.data || postData);
        result.success = true;
        result.message = "Data disinkronkan ke Google Spreadsheet.";
      } else {
        result.message = "Aksi POST tidak dikenali: " + action;
      }
    }
  } catch (err) {
    result.success = false;
    result.message = "Error doPost: " + err.toString();
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Mendapatkan referensi Spreadsheet Aktif
 */
function getDb() {
  var db = SpreadsheetApp.getActiveSpreadsheet();
  if (!db) {
    throw new Error("Gagal mengakses Google Spreadsheet. Pastikan script ini terpasang sebagai Container-Bound Script pada Google Spreadsheet Anda.");
  }
  return db;
}

/**
 * Otomatis mendeteksi dan membuat seluruh sheet tabel yang belum ada beserta headernya.
 * Sifat: Non-Destructive (Hanya membuat yang belum ada, TIDAK menghapus data lama).
 */
function initAllSheets(db) {
  var currentPropGasUrl = "";
  try {
    currentPropGasUrl = PropertiesService.getScriptProperties().getProperty("gasUrl") || "";
  } catch (e) {}

  var sheetsNeeded = [
    { 
      name: 'Konfigurasi', 
      headers: ['Key', 'Value', 'Deskripsi', 'UpdatedAt'],
      defaultRows: [
        ['gasUrl', currentPropGasUrl, 'URL Web App Google Apps Script PAMSDIGI', new Date().toISOString()],
        ['spreadsheetId', db.getId(), 'ID Google Spreadsheet Database', new Date().toISOString()],
        ['spreadsheetName', (db.getName() && db.getName() !== 'PAMSDIGI Spreadsheet') ? db.getName() : 'Db_pamsdigi', 'Nama File Spreadsheet', new Date().toISOString()],
        ['syncStatus', 'Connected', 'Status Koneksi Database', new Date().toISOString()],
        ['lastConnected', new Date().toLocaleString('id-ID'), 'Waktu Terakhir Terhubung', new Date().toISOString()]
      ]
    },
    { 
      name: 'Profil', 
      headers: ['SystemNama', 'SystemNamaDesa', 'SystemKecamatan', 'SystemKabupaten', 'SystemProvinsi', 'SystemAlamat', 'SystemTelepon', 'SystemEmail', 'SystemKetua', 'SystemBendahara', 'SystemFooterStruk', 'SystemLogo', 'SystemStempel'],
      defaultRows: [
        ['KPSPAMS DESA MANDIRI', 'Desa Mandiri', 'Kecamatan Makmur', 'Kabupaten Sejahtera', 'Provinsi Lestari', 'Jl. Raya Desa Mandiri, RT 01/RW 02', '081234567890', 'kpspams.mandiri@desa.go.id', 'Agus Setiawan', 'Siti Rahayu', 'Terima kasih telah membayar tepat waktu. Air bersih untuk kehidupan yang sehat!', '', '']
      ]
    },
    { 
      name: 'Users', 
      headers: ['Username', 'Password', 'Nama', 'Role', 'Status', 'AreaAkses'],
      defaultRows: [
        ['admin', 'admin', 'Superadmin PAMSDIGI', 'Admin', 'Aktif', 'ALL'],
        ['petugas1', 'petugas1', 'Budi Santoso', 'Petugas', 'Aktif', 'Dusun 1']
      ]
    },
    { 
      name: 'Pelanggan', 
      headers: ['NoPelanggan', 'Nama', 'Area', 'Alamat', 'Golongan', 'TempatPemasangan', 'TglPasang', 'MeterAwal', 'Telepon', 'Latitude', 'Longitude', 'Status', 'CreatedAt'],
      defaultRows: []
    },
    { 
      name: 'Area', 
      headers: ['ID', 'Nama'],
      defaultRows: [
        ['AREA-001', 'Dusun 1'],
        ['AREA-002', 'Dusun 2'],
        ['AREA-003', 'Dusun 3']
      ]
    },
    { 
      name: 'Tarif', 
      headers: ['ID', 'Golongan', 'Tipe', 'TarifFlat', 'Range1Max', 'Range1Tarif', 'Range2Max', 'Range2Tarif', 'Range3Tarif', 'Status', 'Levels'],
      defaultRows: [
        ['TRF-001', 'Rumah Tangga A', 'Bertingkat', 3000, 10, 2500, 20, 3500, 5000, 'Aktif', '[{"level":1,"dari":1,"sampai":10,"tarif":2500},{"level":2,"dari":11,"sampai":20,"tarif":3500},{"level":3,"dari":21,"sampai":null,"tarif":5000}]'],
        ['TRF-002', 'Niaga / Usaha', 'Flat', 4000, 0, 0, 0, 0, 0, 'Aktif', '[]'],
        ['TRF-003', 'Sosial / Ibadah', 'Flat', 1500, 0, 0, 0, 0, 0, 'Aktif', '[]']
      ]
    },
    { 
      name: 'Abonemen', 
      headers: ['Nominal', 'Status'],
      defaultRows: [
        [5000, 'Aktif']
      ]
    },
    { 
      name: 'Denda', 
      headers: ['Nominal', 'HariKeterlambatan', 'Status'],
      defaultRows: [
        [10000, 20, 'Aktif']
      ]
    },
    { 
      name: 'Meter', 
      headers: ['ID', 'NoPelanggan', 'Nama', 'Area', 'MeterLalu', 'MeterKini', 'Usage', 'TglBaca', 'Periode', 'Status', 'Foto'],
      defaultRows: []
    },
    { 
      name: 'Tagihan', 
      headers: ['ID', 'NoPelanggan', 'Nama', 'Area', 'MeterLalu', 'MeterKini', 'Usage', 'KubikasiBiaya', 'Abonemen', 'Denda', 'Total', 'Status', 'Periode', 'TglJatuhTempo'],
      defaultRows: []
    },
    { 
      name: 'Pembayaran', 
      headers: ['ID', 'Tanggal', 'Deskripsi', 'Tipe', 'Jumlah', 'Area'],
      defaultRows: []
    }
  ];
  
  sheetsNeeded.forEach(function(item) {
    var sheet = db.getSheetByName(item.name);
    var isNewSheet = false;
    if (!sheet) {
      sheet = db.insertSheet(item.name);
      isNewSheet = true;
    }
    
    // Jika sheet baru atau kosong barisnya, buat header di baris 1
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(item.headers);
      // Format header agar rapi di spreadsheet
      sheet.getRange(1, 1, 1, item.headers.length).setFontWeight("bold").setBackground("#EEF2FF");
      sheet.setFrozenRows(1);
      
      // Jika ada default row untuk inisialisasi awal, masukkan
      if (item.defaultRows && item.defaultRows.length > 0) {
        item.defaultRows.forEach(function(dRow) {
          sheet.appendRow(dRow);
        });
      }
    }
  });

  // Hapus Sheet1 default Google jika kosong dan sheet PAMSDIGI sudah berhasil dibuat
  try {
    var defaultSheet1 = db.getSheetByName("Sheet1") || db.getSheetByName("Sheet 1");
    if (defaultSheet1 && defaultSheet1.getLastRow() === 0 && db.getSheets().length > 1) {
      db.deleteSheet(defaultSheet1);
    }
  } catch (e) {}
}

/**
 * Menyimpan konfigurasi ke sheet Konfigurasi (Single Source of Truth) dan ScriptProperties
 */
function saveStoredConfig(db, cfg) {
  initAllSheets(db);
  
  // 1. Simpan ke ScriptProperties sebagai cache cepat
  var props = PropertiesService.getScriptProperties();
  if (cfg.spreadsheetId) props.setProperty("spreadsheetId", cfg.spreadsheetId);
  if (cfg.gasUrl) props.setProperty("gasUrl", cfg.gasUrl);
  if (cfg.spreadsheetName) props.setProperty("spreadsheetName", cfg.spreadsheetName);
  if (cfg.syncStatus) props.setProperty("syncStatus", cfg.syncStatus);
  if (cfg.lastConnected) props.setProperty("lastConnected", cfg.lastConnected);

  // 2. Simpan permanen ke sheet 'Konfigurasi'
  var sheet = db.getSheetByName("Konfigurasi");
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  var existingMap = {};
  if (lastRow > 1) {
    var rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    for (var i = 0; i < rows.length; i++) {
      var k = String(rows[i][0] || "").trim();
      if (k) existingMap[k] = i + 2; // row index in sheet (1-based)
    }
  }

  var realDbName = db.getName() || cfg.spreadsheetName || 'Db_pamsdigi';
  if (realDbName === 'PAMSDIGI Spreadsheet') realDbName = 'Db_pamsdigi';

  // Dapatkan gasUrl yang sudah tersimpan agar tidak pernah terhapus atau tertimpa string kosong
  var currentStoredGasUrl = "";
  if (existingMap['gasUrl']) {
    currentStoredGasUrl = String(sheet.getRange(existingMap['gasUrl'], 2).getValue() || "").trim();
  }
  if (!currentStoredGasUrl) {
    currentStoredGasUrl = props.getProperty("gasUrl") || "";
  }
  var finalGasUrl = (cfg.gasUrl && String(cfg.gasUrl).trim().startsWith('http')) 
    ? String(cfg.gasUrl).trim() 
    : currentStoredGasUrl;

  // Pastikan ScriptProperties juga selalu tersinkronisasi
  if (finalGasUrl) props.setProperty("gasUrl", finalGasUrl);

  var updates = [
    { key: 'gasUrl', val: finalGasUrl, desc: 'URL Web App Google Apps Script PAMSDIGI' },
    { key: 'spreadsheetId', val: cfg.spreadsheetId || db.getId(), desc: 'ID Google Spreadsheet Database' },
    { key: 'spreadsheetName', val: realDbName, desc: 'Nama File Spreadsheet' },
    { key: 'syncStatus', val: cfg.syncStatus || 'Connected', desc: 'Status Koneksi Database' },
    { key: 'lastConnected', val: cfg.lastConnected || new Date().toLocaleString('id-ID'), desc: 'Waktu Terakhir Terhubung' }
  ];

  // Tambahkan key custom lainnya yang ada di cfg (misal: HAK_AKSES_FITUR, HAK_AKSES_MENU, dll.)
  if (cfg && typeof cfg === 'object') {
    Object.keys(cfg).forEach(function(customKey) {
      if (customKey && !updates.some(function(u) { return u.key === customKey; })) {
        var rawVal = cfg[customKey];
        var stringVal = (typeof rawVal === 'object' && rawVal !== null) ? JSON.stringify(rawVal) : String(rawVal || '');
        updates.push({
          key: customKey,
          val: stringVal,
          desc: 'Pengaturan Sistem & Hak Akses PAMSDIGI'
        });
      }
    });
  }

  updates.forEach(function(item) {
    var nowIso = new Date().toISOString();
    if (existingMap[item.key]) {
      var rowNum = existingMap[item.key];
      sheet.getRange(rowNum, 2).setValue(item.val);
      sheet.getRange(rowNum, 3).setValue(item.desc);
      sheet.getRange(rowNum, 4).setValue(nowIso);
    } else {
      sheet.appendRow([item.key, item.val, item.desc, nowIso]);
    }
  });
}

/**
 * Membaca konfigurasi dari sheet Konfigurasi (Single Source of Truth) atau fallback PropertiesService
 */
function getStoredConfig(db) {
  initAllSheets(db);
  var realSheetName = db.getName() || "Db_pamsdigi";
  if (realSheetName === "PAMSDIGI Spreadsheet") realSheetName = "Db_pamsdigi";

  var config = {
    spreadsheetId: db.getId(),
    gasUrl: "",
    spreadsheetName: realSheetName,
    syncStatus: "Disconnected",
    lastConnected: "Belum Terhubung"
  };

  // Baca dari sheet Konfigurasi
  var sheet = db.getSheetByName("Konfigurasi");
  if (sheet && sheet.getLastRow() > 1) {
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    for (var i = 0; i < values.length; i++) {
      var key = String(values[i][0] || "").trim();
      var val = String(values[i][1] || "").trim();
      if (key === "gasUrl") config.gasUrl = val;
      else if (key === "spreadsheetId") config.spreadsheetId = val || db.getId();
      else if (key === "spreadsheetName") {
        config.spreadsheetName = (val && val !== 'PAMSDIGI Spreadsheet') ? val : realSheetName;
      }
      else if (key === "syncStatus") config.syncStatus = val || "Connected";
      else if (key === "lastConnected") config.lastConnected = val || new Date().toLocaleString("id-ID");
    }
  }

  // Fallback ke PropertiesService jika gasUrl di sheet belum terisi
  var props = PropertiesService.getScriptProperties();
  if (!config.gasUrl) {
    var propUrl = props.getProperty("gasUrl") || "";
    if (propUrl) {
      config.gasUrl = propUrl;
      config.syncStatus = props.getProperty("syncStatus") || "Connected";
      config.lastConnected = props.getProperty("lastConnected") || new Date().toLocaleString("id-ID");
    }
  }

  return config;
}

/**
 * Reset konfigurasi database
 */
function resetStoredConfig(db) {
  var props = PropertiesService.getScriptProperties();
  props.deleteAllProperties();
  props.setProperty("syncStatus", "Disconnected");
  props.setProperty("gasUrl", "");
  props.setProperty("spreadsheetName", "Belum Terhubung");
  props.setProperty("lastConnected", "Belum Terhubung");

  var sheet = db.getSheetByName("Konfigurasi");
  if (sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 4).clearContent();
    }
    sheet.appendRow(['gasUrl', '', 'URL Web App Google Apps Script PAMSDIGI', new Date().toISOString()]);
    sheet.appendRow(['spreadsheetId', db.getId(), 'ID Google Spreadsheet Database', new Date().toISOString()]);
    sheet.appendRow(['spreadsheetName', 'Belum Terhubung', 'Nama File Spreadsheet', new Date().toISOString()]);
    sheet.appendRow(['syncStatus', 'Disconnected', 'Status Koneksi Database', new Date().toISOString()]);
    sheet.appendRow(['lastConnected', 'Belum Terhubung', 'Waktu Terakhir Terhubung', new Date().toISOString()]);
  }
}

/**
 * Autentikasi langsung ke sheet Users
 */
function authenticateUser(db, username, password) {
  initAllSheets(db);
  var sheet = db.getSheetByName("Users");
  if (!sheet) {
    return { success: false, message: "Sheet Users tidak ditemukan." };
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { success: false, message: "Belum ada data user di sheet Users." };
  }
  
  var rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  for (var i = 0; i < rows.length; i++) {
    var rUser = String(rows[i][0] || "").trim();
    var rPass = String(rows[i][1] || "").trim();
    var rNama = String(rows[i][2] || "").trim();
    var rRole = String(rows[i][3] || "Petugas").trim();
    var rStatus = String(rows[i][4] || "Aktif").trim();
    var rArea = String(rows[i][5] || "ALL").trim();
    
    if (rUser.toLowerCase() === username.toLowerCase()) {
      if (rPass !== password) {
        return { success: false, message: "Password yang Anda masukkan salah." };
      }
      if (rStatus !== "Aktif") {
        return { success: false, message: "Akun Anda berstatus Nonaktif. Hubungi Admin." };
      }
      return {
        success: true,
        message: "Login berhasil.",
        username: rUser,
        nama: rNama,
        role: rRole,
        status: rStatus,
        areaAkses: rArea
      };
    }
  }
  
  return { success: false, message: "Username tidak ditemukan di database Spreadsheet." };
}

/**
 * Menulis dan menyinkronkan seluruh database lokal ke Google Sheets tanpa crash range.
 */
function saveAllSheetsData(db, data) {
  if (!data) return;
  initAllSheets(db);
  
  var mappings = [
    { key: 'profil', name: 'Profil', headers: ['SystemNama', 'SystemNamaDesa', 'SystemKecamatan', 'SystemKabupaten', 'SystemProvinsi', 'SystemAlamat', 'SystemTelepon', 'SystemEmail', 'SystemKetua', 'SystemBendahara', 'SystemFooterStruk', 'SystemLogo', 'SystemStempel'], fields: ['systemNama', 'systemNamaDesa', 'systemKecamatan', 'systemKabupaten', 'systemProvinsi', 'systemAlamat', 'systemTelepon', 'systemEmail', 'systemKetua', 'systemBendahara', 'systemFooterStruk', 'systemLogo', 'systemStempel'], isObject: true },
    { key: 'users', name: 'Users', headers: ['Username', 'Password', 'Nama', 'Role', 'Status', 'AreaAkses'], fields: ['username', 'password', 'nama', 'role', 'status', 'areaAkses'] },
    { key: 'pelanggan', name: 'Pelanggan', headers: ['NoPelanggan', 'Nama', 'Area', 'Alamat', 'Golongan', 'TempatPemasangan', 'TglPasang', 'MeterAwal', 'Telepon', 'Latitude', 'Longitude', 'Status', 'CreatedAt'], fields: ['noPelanggan', 'nama', 'area', 'alamat', 'golongan', 'tempatPemasangan', 'tglPasang', 'meterAwal', 'telepon', 'latitude', 'longitude', 'status', 'createdAt'] },
    { key: 'areas', name: 'Area', headers: ['ID', 'Nama'], fields: ['id', 'nama'] },
    { key: 'tarifs', name: 'Tarif', headers: ['ID', 'Golongan', 'Tipe', 'TarifFlat', 'Range1Max', 'Range1Tarif', 'Range2Max', 'Range2Tarif', 'Range3Tarif', 'Status', 'Levels'], fields: ['id', 'golongan', 'tipe', 'tarifFlat', 'range1Max', 'range1Tarif', 'range2Max', 'range2Tarif', 'range3Tarif', 'status', 'levels'] },
    { key: 'abonemen', name: 'Abonemen', headers: ['Nominal', 'Status'], fields: ['nominal', 'status'], isObject: true },
    { key: 'denda', name: 'Denda', headers: ['Nominal', 'HariKeterlambatan', 'Status'], fields: ['nominal', 'hariKeterlambatan', 'status'], isObject: true },
    { key: 'readings', name: 'Meter', headers: ['ID', 'NoPelanggan', 'Nama', 'Area', 'MeterLalu', 'MeterKini', 'Usage', 'TglBaca', 'Periode', 'Status', 'Foto'], fields: ['id', 'noPelanggan', 'nama', 'area', 'meterLalu', 'meterKini', 'usage', 'tglBaca', 'periode', 'status', 'foto'] },
    { key: 'billingList', name: 'Tagihan', headers: ['ID', 'NoPelanggan', 'Nama', 'Area', 'MeterLalu', 'MeterKini', 'Usage', 'KubikasiBiaya', 'Abonemen', 'Denda', 'Total', 'Status', 'Periode', 'TglJatuhTempo'], fields: ['id', 'noPelanggan', 'nama', 'area', 'meterLalu', 'meterKini', 'usage', 'kubikasiBiaya', 'abonemen', 'denda', 'total', 'status', 'periode', 'tglJatuhTempo'] },
    { key: 'cashTransactions', name: 'Pembayaran', headers: ['ID', 'Tanggal', 'Deskripsi', 'Tipe', 'Jumlah', 'Area'], fields: ['id', 'tanggal', 'deskripsi', 'tipe', 'jumlah', 'area'] }
  ];

  mappings.forEach(function(map) {
    var sheet = db.getSheetByName(map.name);
    if (!sheet) return;

    // Bersihkan isi data baris lama tanpa menghapus format
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, map.headers.length).clearContent();
    }
    
    // Pastikan header kolom di baris 1 selalu ada
    sheet.getRange(1, 1, 1, map.headers.length).setValues([map.headers]);

    var items = data[map.key];
    if (!items) return;

    var rowsToAppend = [];

    if (map.isObject) {
      if (typeof items === 'object' && Object.keys(items).length > 0) {
        var row = map.fields.map(function(f) {
          var val = items[f];
          if (val === undefined || val === null) return '';
          if (typeof val === 'object') return JSON.stringify(val);
          return val;
        });
        rowsToAppend.push(row);
      }
    } else if (Array.isArray(items)) {
      items.forEach(function(item) {
        if (!item) return;
        var row = map.fields.map(function(f) {
          var val = item[f];
          if (val === undefined || val === null) return '';
          if (typeof val === 'object') return JSON.stringify(val);
          return val;
        });
        rowsToAppend.push(row);
      });
    }

    if (rowsToAppend.length > 0) {
      var neededRows = rowsToAppend.length + 1;
      if (sheet.getMaxRows() < neededRows) {
        sheet.insertRowsAfter(sheet.getMaxRows(), neededRows - sheet.getMaxRows());
      }
      sheet.getRange(2, 1, rowsToAppend.length, map.headers.length).setValues(rowsToAppend);
    }
  });

  // Jika ada data konfigurasi di payload, simpan juga ke sheet Konfigurasi
  if (data.konfigurasi && Array.isArray(data.konfigurasi)) {
    var cfgObj = {};
    data.konfigurasi.forEach(function(c) {
      if (c && c.key) cfgObj[c.key] = c.value;
    });
    saveStoredConfig(db, cfgObj);
  }
}

/**
 * Membaca seluruh data dari semua sheet Google Spreadsheet.
 */
function readAllSheetsData(db) {
  initAllSheets(db);
  var result = {};
  var mappings = [
    { key: 'profil', name: 'Profil', fields: ['systemNama', 'systemNamaDesa', 'systemKecamatan', 'systemKabupaten', 'systemProvinsi', 'systemAlamat', 'systemTelepon', 'systemEmail', 'systemKetua', 'systemBendahara', 'systemFooterStruk', 'systemLogo', 'systemStempel'], isObject: true },
    { key: 'users', name: 'Users', fields: ['username', 'password', 'nama', 'role', 'status', 'areaAkses'] },
    { key: 'pelanggan', name: 'Pelanggan', fields: ['noPelanggan', 'nama', 'area', 'alamat', 'golongan', 'tempatPemasangan', 'tglPasang', 'meterAwal', 'telepon', 'latitude', 'longitude', 'status', 'createdAt'] },
    { key: 'areas', name: 'Area', fields: ['id', 'nama'] },
    { key: 'tarifs', name: 'Tarif', fields: ['id', 'golongan', 'tipe', 'tarifFlat', 'range1Max', 'range1Tarif', 'range2Max', 'range2Tarif', 'range3Tarif', 'status', 'levels'] },
    { key: 'abonemen', name: 'Abonemen', fields: ['nominal', 'status'], isObject: true },
    { key: 'denda', name: 'Denda', fields: ['nominal', 'hariKeterlambatan', 'status'], isObject: true },
    { key: 'readings', name: 'Meter', fields: ['id', 'noPelanggan', 'nama', 'area', 'meterLalu', 'meterKini', 'usage', 'tglBaca', 'periode', 'status', 'foto'] },
    { key: 'billingList', name: 'Tagihan', fields: ['id', 'noPelanggan', 'nama', 'area', 'meterLalu', 'meterKini', 'usage', 'kubikasiBiaya', 'abonemen', 'denda', 'total', 'status', 'periode', 'tglJatuhTempo'] },
    { key: 'cashTransactions', name: 'Pembayaran', fields: ['id', 'tanggal', 'deskripsi', 'tipe', 'jumlah', 'area'] }
  ];

  mappings.forEach(function(map) {
    var sheet = db.getSheetByName(map.name);
    if (!sheet) {
      result[map.key] = map.isObject ? null : [];
      return;
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      result[map.key] = map.isObject ? null : [];
      return;
    }

    var values = sheet.getRange(2, 1, lastRow - 1, map.fields.length).getValues();

    if (map.isObject) {
      var row = values[0];
      var obj = {};
      var hasData = false;
      map.fields.forEach(function(f, idx) {
        var cellVal = row[idx];
        if (cellVal !== '' && cellVal !== null && cellVal !== undefined) {
          hasData = true;
          if (typeof cellVal === 'string' && (cellVal.startsWith('{') || cellVal.startsWith('['))) {
            try { cellVal = JSON.parse(cellVal); } catch (e) {}
          }
        }
        obj[f] = cellVal;
      });
      result[map.key] = hasData ? obj : null;
    } else {
      var list = [];
      values.forEach(function(row) {
        var obj = {};
        var hasData = false;
        map.fields.forEach(function(f, idx) {
          var cellVal = row[idx];
          if (cellVal !== '' && cellVal !== null && cellVal !== undefined) {
            hasData = true;
            if (typeof cellVal === 'string' && (cellVal.startsWith('{') || cellVal.startsWith('['))) {
              try { cellVal = JSON.parse(cellVal); } catch (e) {}
            }
          }
          obj[f] = cellVal;
        });
        if (hasData) {
          list.push(obj);
        }
      });
      result[map.key] = list;
    }
  });

  // Ambil data konfigurasi dari sheet Konfigurasi
  var cfgSheet = db.getSheetByName("Konfigurasi");
  if (cfgSheet && cfgSheet.getLastRow() > 1) {
    var cfgVals = cfgSheet.getRange(2, 1, cfgSheet.getLastRow() - 1, 4).getValues();
    var cfgList = [];
    cfgVals.forEach(function(r) {
      var k = String(r[0] || "").trim();
      var v = String(r[1] || "").trim();
      var desc = String(r[2] || "").trim();
      var uAt = String(r[3] || "").trim();
      if (k) {
        cfgList.push({ key: k, value: v, deskripsi: desc, updatedAt: uAt });
      }
    });
    result.konfigurasi = cfgList;
  }

  return result;
}
`
  }
];
