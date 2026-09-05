import React, { useState } from 'react';
import { initialUsers, initialPelanggan, initialAreas, initialTarifs, initialAbonemen, initialDenda } from './data/initialData';
import { UserRow, PelangganRow, AreaRow, TarifRow, AbonemenRow, DendaRow } from './types';
import AppSimulator from './components/AppSimulator';
import SpreadsheetView from './components/SpreadsheetView';
import CodeExporter from './components/CodeExporter';
import DeploymentGuide from './components/DeploymentGuide';
import { Play, FileSpreadsheet, FileCode, BookOpen, Droplet, Sparkles } from 'lucide-react';

export default function App() {
  const [users, setUsers] = useState<UserRow[]>(() => {
    try {
      const saved = localStorage.getItem('pams_data_users_default');
      return saved ? JSON.parse(saved) : initialUsers;
    } catch (e) {
      return initialUsers;
    }
  });

  const [pelanggan, setPelanggan] = useState<PelangganRow[]>(() => {
    try {
      const saved = localStorage.getItem('pams_data_pelanggan_default');
      return saved ? JSON.parse(saved) : initialPelanggan;
    } catch (e) {
      return initialPelanggan;
    }
  });

  const [areas, setAreas] = useState<AreaRow[]>(() => {
    try {
      const saved = localStorage.getItem('pams_data_areas_default');
      return saved ? JSON.parse(saved) : initialAreas;
    } catch (e) {
      return initialAreas;
    }
  });

  const [tarifs, setTarifs] = useState<TarifRow[]>(() => {
    try {
      const saved = localStorage.getItem('pams_data_tarifs_default');
      return saved ? JSON.parse(saved) : initialTarifs;
    } catch (e) {
      return initialTarifs;
    }
  });

  const [abonemen, setAbonemen] = useState<AbonemenRow>(() => {
    try {
      const saved = localStorage.getItem('pams_data_abonemen_default');
      return saved ? JSON.parse(saved) : initialAbonemen;
    } catch (e) {
      return initialAbonemen;
    }
  });

  const [denda, setDenda] = useState<DendaRow>(() => {
    try {
      const saved = localStorage.getItem('pams_data_denda_default');
      return saved ? JSON.parse(saved) : initialDenda;
    } catch (e) {
      return initialDenda;
    }
  });

  const [activeTab, setActiveTab] = useState<'simulator' | 'spreadsheet' | 'code' | 'guide'>('simulator');

  // --- DATABASE WRITE HANDLERS ---
  const handleAddPelanggan = (newPel: PelangganRow) => {
    setPelanggan((prev) => {
      const updated = [...prev, newPel];
      try { localStorage.setItem('pams_data_pelanggan_default', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const handleReplacePelanggan = (newPelList: PelangganRow[]) => {
    setPelanggan(newPelList);
    try { localStorage.setItem('pams_data_pelanggan_default', JSON.stringify(newPelList)); } catch (e) {}
  };

  const handleUpdatePelanggan = (updatedPel: PelangganRow) => {
    setPelanggan((prev) => {
      const updated = prev.map((p) => p.noPelanggan === updatedPel.noPelanggan ? updatedPel : p);
      try { localStorage.setItem('pams_data_pelanggan_default', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const handleDeletePelanggan = (noPelanggan: string) => {
    setPelanggan((prev) => {
      const updated = prev.filter((p) => p.noPelanggan !== noPelanggan);
      try { localStorage.setItem('pams_data_pelanggan_default', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const handleAddUser = (newUser: UserRow) => {
    setUsers((prev) => {
      const updated = [...prev, newUser];
      try { localStorage.setItem('pams_data_users_default', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const handleUpdateUser = (updatedUser: UserRow) => {
    setUsers((prev) => {
      const updated = prev.map((u) => u.username === updatedUser.username ? updatedUser : u);
      try { localStorage.setItem('pams_data_users_default', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const handleDeleteUser = (username: string) => {
    setUsers((prev) => {
      const updated = prev.filter((u) => u.username !== username);
      try { localStorage.setItem('pams_data_users_default', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  // --- MASTER AREA WRITES ---
  const handleAddArea = (newArea: AreaRow) => {
    setAreas((prev) => {
      const updated = [...prev, newArea];
      try { localStorage.setItem('pams_data_areas_default', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const handleUpdateArea = (updatedArea: AreaRow) => {
    setAreas((prev) => {
      const updated = prev.map((a) => a.id === updatedArea.id ? updatedArea : a);
      try { localStorage.setItem('pams_data_areas_default', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const handleDeleteArea = (id: string) => {
    setAreas((prev) => {
      const updated = prev.filter((a) => a.id !== id);
      try { localStorage.setItem('pams_data_areas_default', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  // --- MASTER TARIF WRITES ---
  const handleAddTarif = (newTarif: TarifRow) => {
    setTarifs((prev) => {
      const updated = [...prev, newTarif];
      try { localStorage.setItem('pams_data_tarifs_default', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const handleUpdateTarif = (updatedTarif: TarifRow) => {
    setTarifs((prev) => {
      const updated = prev.map((t) => t.id === updatedTarif.id ? updatedTarif : t);
      try { localStorage.setItem('pams_data_tarifs_default', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const handleDeleteTarif = (id: string) => {
    setTarifs((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      try { localStorage.setItem('pams_data_tarifs_default', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  // --- MASTER ABONEMEN WRITES ---
  const handleUpdateAbonemen = (updatedAbonemen: AbonemenRow) => {
    setAbonemen(updatedAbonemen);
    try { localStorage.setItem('pams_data_abonemen_default', JSON.stringify(updatedAbonemen)); } catch (e) {}
  };

  // --- MASTER DENDA WRITES ---
  const handleUpdateDenda = (updatedDenda: DendaRow) => {
    setDenda(updatedDenda);
    try { localStorage.setItem('pams_data_denda_default', JSON.stringify(updatedDenda)); } catch (e) {}
  };

  const handleResetData = () => {
    setUsers(initialUsers);
    setPelanggan(initialPelanggan);
    setAreas(initialAreas);
    setTarifs(initialTarifs);
    setAbonemen(initialAbonemen);
    setDenda(initialDenda);
    localStorage.removeItem('pams_data_users_default');
    localStorage.removeItem('pams_data_pelanggan_default');
    localStorage.removeItem('pams_data_areas_default');
    localStorage.removeItem('pams_data_tarifs_default');
    localStorage.removeItem('pams_data_abonemen_default');
    localStorage.removeItem('pams_data_denda_default');
  };

  const handleRestoreAllData = (data: { users?: UserRow[], pelanggan?: PelangganRow[], areas?: AreaRow[], tarifs?: TarifRow[], abonemen?: AbonemenRow, denda?: DendaRow }) => {
    if (data.users) {
      setUsers(data.users);
      try { localStorage.setItem('pams_data_users_default', JSON.stringify(data.users)); } catch (e) {}
    }
    if (data.pelanggan) {
      setPelanggan(data.pelanggan);
      try { localStorage.setItem('pams_data_pelanggan_default', JSON.stringify(data.pelanggan)); } catch (e) {}
    }
    if (data.areas) {
      setAreas(data.areas);
      try { localStorage.setItem('pams_data_areas_default', JSON.stringify(data.areas)); } catch (e) {}
    }
    if (data.tarifs) {
      setTarifs(data.tarifs);
      try { localStorage.setItem('pams_data_tarifs_default', JSON.stringify(data.tarifs)); } catch (e) {}
    }
    if (data.abonemen) {
      setAbonemen(data.abonemen);
      try { localStorage.setItem('pams_data_abonemen_default', JSON.stringify(data.abonemen)); } catch (e) {}
    }
    if (data.denda) {
      setDenda(data.denda);
      try { localStorage.setItem('pams_data_denda_default', JSON.stringify(data.denda)); } catch (e) {}
    }
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
