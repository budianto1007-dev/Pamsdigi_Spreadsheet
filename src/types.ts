export interface UserRow {
  username: string;
  password?: string; // Hidden in view
  nama: string;
  role: 'Admin' | 'Petugas' | 'SUPER_ADMIN';
  status: 'Aktif' | 'Nonaktif';
  areaAkses?: string; // e.g. "ALL" or comma-separated areas like "Dusun Krajan,Dusun Mulyo"
}

export interface PelangganRow {
  noPelanggan: string;
  nama: string;
  area: string;
  alamat: string;
  golongan: string;
  tempatPemasangan: string;
  tglPasang: string;
  meterAwal: number;
  telepon: string;
  latitude: number;
  longitude: number;
  status: 'Aktif' | 'Nonaktif';
  createdAt: string;
}

export interface AreaRow {
  id: string;
  nama: string;
}

export interface TarifRow {
  id: string;
  golongan: string;
  tipe: 'Flat' | 'Bertingkat';
  tarifFlat: number;
  range1Max: number;
  range1Tarif: number;
  range2Max: number;
  range2Tarif: number;
  range3Tarif: number;
  status: 'Aktif' | 'Nonaktif';
  levels?: string;
}

export interface AbonemenRow {
  nominal: number;
  status: 'Aktif' | 'Nonaktif';
}

export interface DendaRow {
  status: 'Aktif' | 'Nonaktif';
  nominal: number;
  hariKeterlambatan: number;
}

export interface KonfigurasiRow {
  key: string;
  value: string;
  deskripsi?: string;
  updatedAt?: string;
}

export interface GASFile {
  name: string;
  type: 'gs' | 'html';
  content: string;
  description: string;
}

export interface FeaturePermissions {
  catatMeter: boolean;        // Catat Meter Pelanggan
  bayarTagihan: boolean;      // Penarikan Langsung & Input Pembayaran Tagihan
  tambahPelanggan: boolean;   // Pendaftaran Pelanggan Baru
  editPelanggan: boolean;     // Edit Profil Pelanggan
  hapusPelanggan: boolean;    // Hapus Pelanggan
  ubahMasterData: boolean;    // Ubah Master Data Tarif/Abo/Denda
  hapusWilayah: boolean;      // Hapus Wilayah Dusun
  catatKeuangan: boolean;     // Catat Transaksi Kas Keuangan
}

export interface RoleFeatureAccess {
  admin: FeaturePermissions;
  petugas: FeaturePermissions;
}

export interface MenuPermissions {
  dashboard: boolean;
  pelanggan: boolean;
  'catat-meter': boolean;
  tagihan: boolean;
  keuangan: boolean;
  laporan: boolean;
  'master-data': boolean;
  pengaturan: boolean;
}

export interface RoleMenuAccess {
  admin: MenuPermissions;
  petugas: MenuPermissions;
}

export const DEFAULT_FEATURE_ACCESS: RoleFeatureAccess = {
  admin: {
    catatMeter: true,
    bayarTagihan: true,
    tambahPelanggan: true,
    editPelanggan: true,
    hapusPelanggan: true,
    ubahMasterData: true,
    hapusWilayah: true,
    catatKeuangan: true,
  },
  petugas: {
    catatMeter: true,
    bayarTagihan: true,
    tambahPelanggan: false,
    editPelanggan: false,
    hapusPelanggan: false,
    ubahMasterData: false,
    hapusWilayah: false,
    catatKeuangan: false,
  },
};

export const DEFAULT_MENU_ACCESS: RoleMenuAccess = {
  admin: {
    dashboard: true,
    pelanggan: true,
    'catat-meter': true,
    tagihan: true,
    keuangan: true,
    laporan: true,
    'master-data': true,
    pengaturan: true,
  },
  petugas: {
    dashboard: true,
    pelanggan: false,
    'catat-meter': true,
    tagihan: true,
    keuangan: false,
    laporan: false,
    'master-data': false,
    pengaturan: false,
  },
};

