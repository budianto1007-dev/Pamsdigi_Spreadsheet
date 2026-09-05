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

export interface GASFile {
  name: string;
  type: 'gs' | 'html';
  content: string;
  description: string;
}

