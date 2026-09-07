import React, { useState, useEffect, useCallback } from 'react';
import { initialUsers, initialPelanggan, initialAreas, initialTarifs, initialAbonemen, initialDenda } from './data/initialData';
import { UserRow, PelangganRow, AreaRow, TarifRow, AbonemenRow, DendaRow } from './types';
import { fetchGvizAllData, getSavedDbConfig, DEFAULT_SPREADSHEET_ID } from './lib/googleSheets';
import AppSimulator from './components/AppSimulator';
import SpreadsheetView from './components/SpreadsheetView';
import CodeExporter from './components/CodeExporter';
import DeploymentGuide from './components/DeploymentGuide';
import { Play, FileSpreadsheet, FileCode, BookOpen, Droplet, Sparkles } from 'lucide-react';

export default function App() {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [pelanggan, setPelanggan] = useState<PelangganRow[]>([]);
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [tarifs, setTarifs] = useState<TarifRow[]>(initialTarifs);
  const [abonemen, setAbonemen] = useState<AbonemenRow>(initialAbonemen);
  const [denda, setDenda] = useState<DendaRow>(initialDenda);
  const [activeTab, setActiveTab] = useState<'simulator' | 'spreadsheet' | 'code' | 'guide'>('simulator');

  // Real-time synchronization from Google Spreadsheet via Google Visualization API (GViz)
  const syncSpreadsheetData = useCallback(async () => {
    try {
      const cfg = await getSavedDbConfig();
      const sheetId = cfg.spreadsheetId || DEFAULT_SPREADSHEET_ID;
      if (!sheetId) return;

      const remoteData = await fetchGvizAllData(sheetId);
      if (remoteData) {
        if (remoteData.users && remoteData.users.length > 0) {
          setUsers(remoteData.users);
        }
        if (remoteData.areas && remoteData.areas.length > 0) {
          setAreas(remoteData.areas);
        }
        if (remoteData.pelanggan !== undefined && Array.isArray(remoteData.pelanggan)) {
          setPelanggan(remoteData.pelanggan);
        }
        if (remoteData.tarifs && remoteData.tarifs.length > 0) {
          setTarifs(remoteData.tarifs);
        }
        if (remoteData.abonemen) {
          setAbonemen(remoteData.abonemen);
        }
        if (remoteData.denda) {
          setDenda(remoteData.denda);
        }
      }
    } catch (err) {
      console.warn('GViz real-time sync warning:', err);
    }
  }, []);

  useEffect(() => {
    // Initial fetch from Google Spreadsheet
    syncSpreadsheetData();

    // Global synchronization interval (every 10 seconds for instant cross-device updates)
    const intervalId = setInterval(syncSpreadsheetData, 10000);

    // Sync immediately when window/tab is focused
    const handleFocus = () => {
      syncSpreadsheetData();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [syncSpreadsheetData]);

  // --- DATABASE WRITE HANDLERS (Optimistic UI state, persisted to Spreadsheet) ---
  const handleAddPelanggan = (newPel: PelangganRow) => {
    setPelanggan((prev) => [...prev, newPel]);
  };

  const handleReplacePelanggan = (newPelList: PelangganRow[]) => {
    setPelanggan(newPelList);
  };

  const handleUpdatePelanggan = (updatedPel: PelangganRow) => {
    setPelanggan((prev) => prev.map((p) => p.noPelanggan === updatedPel.noPelanggan ? updatedPel : p));
  };

  const handleDeletePelanggan = (noPelanggan: string) => {
    setPelanggan((prev) => prev.filter((p) => p.noPelanggan !== noPelanggan));
  };

  const handleAddUser = (newUser: UserRow) => {
    setUsers((prev) => [...prev, newUser]);
  };

  const handleUpdateUser = (updatedUser: UserRow) => {
    setUsers((prev) => prev.map((u) => u.username === updatedUser.username ? updatedUser : u));
  };

  const handleDeleteUser = (username: string) => {
    setUsers((prev) => prev.filter((u) => u.username !== username));
  };

  // --- MASTER AREA WRITES ---
  const handleAddArea = (newArea: AreaRow) => {
    setAreas((prev) => [...prev, newArea]);
  };

  const handleUpdateArea = (updatedArea: AreaRow) => {
    setAreas((prev) => prev.map((a) => a.id === updatedArea.id ? updatedArea : a));
  };

  const handleDeleteArea = (id: string) => {
    setAreas((prev) => prev.filter((a) => a.id !== id));
  };

  // --- MASTER TARIF WRITES ---
  const handleAddTarif = (newTarif: TarifRow) => {
    setTarifs((prev) => [...prev, newTarif]);
  };

  const handleUpdateTarif = (updatedTarif: TarifRow) => {
    setTarifs((prev) => prev.map((t) => t.id === updatedTarif.id ? updatedTarif : t));
  };

  const handleDeleteTarif = (id: string) => {
    setTarifs((prev) => prev.filter((t) => t.id !== id));
  };

  // --- MASTER ABONEMEN WRITES ---
  const handleUpdateAbonemen = (updatedAbonemen: AbonemenRow) => {
    setAbonemen(updatedAbonemen);
  };

  // --- MASTER DENDA WRITES ---
  const handleUpdateDenda = (updatedDenda: DendaRow) => {
    setDenda(updatedDenda);
  };

  const handleResetData = () => {
    setUsers(initialUsers);
    setPelanggan([]);
    setAreas([]);
    setTarifs(initialTarifs);
    setAbonemen(initialAbonemen);
    setDenda(initialDenda);
  };

  const handleRestoreAllData = (data: { users?: UserRow[], pelanggan?: PelangganRow[], areas?: AreaRow[], tarifs?: TarifRow[], abonemen?: AbonemenRow, denda?: DendaRow }) => {
    if (data.users) setUsers(data.users);
    if (data.pelanggan) setPelanggan(data.pelanggan);
    if (data.areas) setAreas(data.areas);
    if (data.tarifs) setTarifs(data.tarifs);
    if (data.abonemen) setAbonemen(data.abonemen);
    if (data.denda) setDenda(data.denda);
  };

  return (
    <AppSimulator 
      users={users} 
      pelanggan={pelanggan} 
      areas={areas}
      tarifs={tarifs}
      abonemen={abonemen}
      denda={denda}
      onAddPelanggan={handleAddPelanggan}
      onReplacePelanggan={handleReplacePelanggan}
      onUpdatePelanggan={handleUpdatePelanggan}
      onDeletePelanggan={handleDeletePelanggan}
      onAddArea={handleAddArea}
      onUpdateArea={handleUpdateArea}
      onDeleteArea={handleDeleteArea}
      onAddTarif={handleAddTarif}
      onUpdateTarif={handleUpdateTarif}
      onDeleteTarif={handleDeleteTarif}
      onUpdateAbonemen={handleUpdateAbonemen}
      onUpdateDenda={handleUpdateDenda}
      onResetData={handleResetData}
      onAddUser={handleAddUser}
      onUpdateUser={handleUpdateUser}
      onDeleteUser={handleDeleteUser}
      onRestoreAllData={handleRestoreAllData}
    />
  );
}
