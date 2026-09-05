import { UserRow, PelangganRow, AreaRow, TarifRow, AbonemenRow, DendaRow } from '../types';

export const initialUsers: UserRow[] = [
  {
    username: 'admin',
    password: 'admin',
    nama: 'Budi Santoso',
    role: 'Admin',
    status: 'Aktif',
    areaAkses: 'ALL',
  },
  {
    username: 'petugas1',
    password: 'user123',
    nama: 'Joko Widodo',
    role: 'Petugas',
    status: 'Aktif',
    areaAkses: 'Dusun Krajan,Dusun Mulyo',
  },
  {
    username: 'petugas2',
    password: 'user123',
    nama: 'Agus Setiawan',
    role: 'Petugas',
    status: 'Aktif',
    areaAkses: 'Dusun Rejo',
  },
  {
    username: 'nonaktif',
    password: 'user123',
    nama: 'Iwan Fals',
    role: 'Petugas',
    status: 'Nonaktif',
    areaAkses: 'ALL',
  }
];

export const initialPelanggan: PelangganRow[] = [];

export const areas: string[] = [];
export const golongans = ['Rumah Tangga A', 'Rumah Tangga B', 'Sosial', 'Niaga'];

export const initialAreas: AreaRow[] = [];

export const initialTarifs: TarifRow[] = [
  {
    id: 'T001',
    golongan: 'Rumah Tangga A',
    tipe: 'Bertingkat',
    tarifFlat: 3000,
    range1Max: 10,
    range1Tarif: 3000,
    range2Max: 20,
    range2Tarif: 3500,
    range3Tarif: 5000,
    status: 'Aktif'
  },
  {
    id: 'T002',
    golongan: 'Rumah Tangga B',
    tipe: 'Bertingkat',
    tarifFlat: 3500,
    range1Max: 10,
    range1Tarif: 3500,
    range2Max: 20,
    range2Tarif: 4000,
    range3Tarif: 6000,
    status: 'Aktif'
  },
  {
    id: 'T003',
    golongan: 'Sosial',
    tipe: 'Flat',
    tarifFlat: 1500,
    range1Max: 10,
    range1Tarif: 1500,
    range2Max: 20,
    range2Tarif: 1500,
    range3Tarif: 1500,
    status: 'Aktif'
  },
  {
    id: 'T004',
    golongan: 'Niaga',
    tipe: 'Flat',
    tarifFlat: 5000,
    range1Max: 10,
    range1Tarif: 5000,
    range2Max: 20,
    range2Tarif: 5000,
    range3Tarif: 5000,
    status: 'Aktif'
  }
];

export const initialAbonemen: AbonemenRow = {
  nominal: 10000,
  status: 'Aktif'
};

export const initialDenda: DendaRow = {
  status: 'Aktif',
  nominal: 5000,
  hariKeterlambatan: 20
};
