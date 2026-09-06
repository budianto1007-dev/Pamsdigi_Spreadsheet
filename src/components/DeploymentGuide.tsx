import React from 'react';
import { BookOpen, Table, Play, Rocket, ShieldAlert, CheckCircle, Info, ChevronRight, GitBranch, Database, Globe, Layers, ArrowRight } from 'lucide-react';

export default function DeploymentGuide() {
  return (
    <div id="deployment-guide-container" className="space-y-6">
      
      {/* Intro Banner */}
      <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-2xl">
        <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
          <BookOpen className="text-indigo-600" />
          Panduan Deployment PAMSDIGI
        </h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Ikuti petunjuk langkah demi langkah berikut untuk mendeploy sistem PAMSDIGI secara nyata menggunakan Google Spreadsheet sebagai database gratis dan Google Apps Script sebagai server Web App nirkabel.
        </p>
      </div>

      {/* Multi-Tenant Architecture Card (1 Repo -> Multiple Vercel -> Multiple Spreadsheets) */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-5 border border-slate-800 shadow-md space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Layers size={18} />
            </div>
            <div>
              <h4 className="font-black text-sm text-white tracking-wide">
                ARSITEKTUR MULTI-TENANT (1 REPOSITORI &rarr; BANYAK LINK VERCEL &rarr; BANYAK DATABASE)
              </h4>
              <p className="text-[11px] text-slate-400">
                1 Master Codebase di GitHub dapat dideploy ke banyak link Vercel mandiri dengan database Google Spreadsheet terisolasi per klien / desa.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-extrabold px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full uppercase tracking-wider">
            Multi-Tenant Ready
          </span>
        </div>

        {/* Visual Architecture Flow */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-3">
          <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Diagram Alur Arsitektur:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
            
            {/* Repo Column */}
            <div className="bg-slate-900 p-3 rounded-lg border border-slate-700/80 flex flex-col justify-center items-center text-center space-y-1">
              <GitBranch className="text-indigo-400" size={24} />
              <span className="font-black text-indigo-300">1 GitHub Repository</span>
              <span className="text-[10px] text-slate-400 font-sans">Single Source of Truth Kode Aplikasi PAMSDIGI</span>
            </div>

            {/* Vercel Column */}
            <div className="space-y-2">
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-700 flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 font-bold text-sky-400"><Globe size={14} /> Link Vercel 1</span>
                <span className="text-[9px] text-slate-400">Desa A</span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-700 flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 font-bold text-sky-400"><Globe size={14} /> Link Vercel 2</span>
                <span className="text-[9px] text-slate-400">Desa B</span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-700 flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 font-bold text-sky-400"><Globe size={14} /> Link Vercel 3</span>
                <span className="text-[9px] text-slate-400">Desa C</span>
              </div>
            </div>

            {/* Spreadsheet Column */}
            <div className="space-y-2">
              <div className="bg-slate-900 p-2.5 rounded-lg border border-emerald-900/60 flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 font-bold text-emerald-400"><Database size={14} /> Spreadsheet 1</span>
                <span className="text-[9px] text-emerald-500 font-bold">Terisolasi</span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-emerald-900/60 flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 font-bold text-emerald-400"><Database size={14} /> Spreadsheet 2</span>
                <span className="text-[9px] text-emerald-500 font-bold">Terisolasi</span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-emerald-900/60 flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 font-bold text-emerald-400"><Database size={14} /> Spreadsheet 3</span>
                <span className="text-[9px] text-emerald-500 font-bold">Terisolasi</span>
              </div>
            </div>

          </div>
        </div>

        {/* Instructions on Vercel Environment Variables */}
        <div className="space-y-2 text-xs font-sans">
          <p className="font-bold text-slate-200">Cara Mengatur di Dashboard Vercel:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <p className="text-emerald-400 font-mono font-bold text-[11px]">1. VITE_GAS_URL</p>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Isi dengan URL Apps Script Web App (/exec) yang dideploy dari Spreadsheet milik desa bersangkutan.
              </p>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <p className="text-emerald-400 font-mono font-bold text-[11px]">2. VITE_SPREADSHEET_ID</p>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Isi dengan ID file Google Spreadsheet desa tersebut (karakter unik pada URL dokumen Google Drive).
              </p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 pt-1">
            * Setiap perubahan atau update kode di repositori GitHub secara otomatis akan memicu redeploy di seluruh link Vercel secara serentak tanpa mengganggu atau mencampuradukkan data masing-masing Spreadsheet.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* STEP 1 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs relative flex flex-col justify-between">
          <div className="space-y-3.5">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 bg-emerald-100 text-emerald-800 font-black rounded-lg flex items-center justify-center text-xs">1</span>
              <h4 className="font-extrabold text-slate-800 text-sm">Setup Google Sheets</h4>
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed">
              Buatlah Spreadsheet baru di Google Drive Anda untuk digunakan sebagai database utama aplikasi.
            </p>

            <div className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-100 text-[11px]">
              <p className="font-bold text-slate-700">A. Buat 2 Sheet Utama:</p>
              <ul className="list-disc pl-4 space-y-1 text-slate-600">
                <li>Ubah nama sheet pertama menjadi: <strong class="text-emerald-700 font-mono">Users</strong></li>
                <li>Buat sheet kedua dan beri nama: <strong class="text-emerald-700 font-mono">Pelanggan</strong></li>
              </ul>

              <p className="font-bold text-slate-700 pt-1">B. Tulis Struktur Header Kolom:</p>
              <ul className="list-disc pl-4 space-y-1.5 text-slate-600">
                <li>
                  <strong className="text-slate-800">Users:</strong><br />
                  <span className="font-mono text-[10px] text-indigo-600">A1=Username, B1=Password, C1=Nama, D1=Role, E1=Status</span>
                </li>
                <li>
                  <strong className="text-slate-800">Pelanggan:</strong><br />
                  <span className="font-mono text-[10px] text-indigo-600">A1=NoPelanggan, B1=Nama, C1=Area, D1=Alamat, E1=Golongan, F1=TempatPemasangan, G1=TglPasang, H1=MeterAwal, I1=Telepon, J1=Latitude, K1=Longitude, L1=Status, M1=CreatedAt</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
            * JANGAN menambahkan huruf besar-kecil berbeda atau typo pada nama header kolom.
          </div>
        </div>

        {/* STEP 2 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs relative flex flex-col justify-between">
          <div className="space-y-3.5">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 bg-indigo-100 text-indigo-800 font-black rounded-lg flex items-center justify-center text-xs">2</span>
              <h4 className="font-extrabold text-slate-800 text-sm">Penyusunan Kode</h4>
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed">
              Tulis file kode program PAMSDIGI secara modular di dalam editor Google Apps Script.
            </p>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 border border-slate-100 text-[11px] text-slate-600">
              <ol className="list-decimal pl-4 space-y-1.5">
                <li>Di Spreadsheet Anda, klik menu <strong className="text-slate-800">Extensions (Ekstensi)</strong> &gt; <strong className="text-slate-800">Apps Script</strong>.</li>
                <li>Hapus kode bawaan <span className="font-mono">myFunction()</span> yang ada di file <span class="font-mono">Code.gs</span>.</li>
                <li>Salin isi file <strong className="text-slate-800 font-mono">Code.gs</strong> dari Tab Editor PAMSDIGI dan tempelkan.</li>
                <li>Buat file baru dengan menekan tombol <strong className="text-slate-800 font-mono">+</strong> di Apps Script:
                  <ul className="list-disc pl-4 mt-1 space-y-1">
                    <li>Pilih <strong className="text-red-600 font-bold">Script</strong>: Buat file <span class="font-mono font-bold">Auth.gs</span> dan <span class="font-mono font-bold">Pelanggan.gs</span>.</li>
                    <li>Pilih <strong className="text-amber-600 font-bold">HTML</strong>: Buat file <span class="font-mono font-bold">Index.html</span>, <span class="font-mono font-bold">Dashboard.html</span>, <span class="font-mono font-bold">Login.html</span>, dan <span class="font-mono font-bold">Style.html</span>.</li>
                  </ul>
                </li>
                <li>Tempelkan masing-masing kode secara lengkap sesuai nama file yang telah Anda salin dari tab Editor.</li>
              </ol>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
            * Pastikan ekstensi .html tidak tertulis ganda (contoh: tulis "Index", bukan "Index.html" saat membuat file HTML).
          </div>
        </div>

        {/* STEP 3 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs relative flex flex-col justify-between">
          <div className="space-y-3.5">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 bg-violet-100 text-violet-800 font-black rounded-lg flex items-center justify-center text-xs">3</span>
              <h4 className="font-extrabold text-slate-800 text-sm">Deploy Web App</h4>
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed">
              Publikasikan aplikasi web Anda agar bisa diakses oleh petugas lapangan lewat browser HP mereka secara online.
            </p>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 border border-slate-100 text-[11px] text-slate-600">
              <ol className="list-decimal pl-4 space-y-1.5">
                <li>Klik tombol <strong className="text-slate-800 font-bold">Save Project (Simpan)</strong> berlogo floppy disk di atas editor skrip.</li>
                <li>Klik tombol biru <strong className="text-slate-800 font-bold">Deploy</strong> &gt; pilih <strong class="text-slate-800 font-bold">New Deployment (Penerapan Baru)</strong>.</li>
                <li>Klik ikon gir di samping "Select type" &gt; pilih <strong class="text-slate-800 font-bold">Web App (Aplikasi Web)</strong>.</li>
                <li>Konfigurasikan Parameter Wajib berikut:
                  <ul className="list-disc pl-4 mt-1 space-y-1 text-slate-700 font-medium">
                    <li>Execute as (Jalankan sebagai): <span class="text-blue-600">Me (Saya / Email Anda)</span></li>
                    <li>Who has access (Siapa yang memiliki akses): <span class="text-blue-600">Anyone (Siapa saja)</span></li>
                  </ul>
                </li>
                <li>Klik tombol <strong class="text-indigo-600 font-bold">Deploy</strong>.</li>
                <li>Pilih akun Google Anda, klik <strong className="text-slate-700">Advanced (Lanjutan)</strong> &gt; klik <strong className="text-slate-700">Go to PAMSDIGI (unsafe)</strong>, lalu klik <strong class="text-slate-700">Allow</strong>.</li>
                <li>Salin tautan <strong className="text-emerald-700 font-mono">Web App URL</strong> yang diberikan Google. Tautan inilah aplikasi PAMSDIGI aktif Anda!</li>
              </ol>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
            * Pengaturan "Who has access: Anyone" mutlak diperlukan agar petugas meter air desa dapat membuka login di ponsel mereka.
          </div>
        </div>

      </div>

      {/* Database Seeder Guide Row */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-widest flex items-center gap-1.5 text-emerald-700">
          <Table size={16} />
          CONTOH DATA SEEDING UNTUK SHEET DATABASE GOOGLE SPREADSHEET
        </h4>
        
        <p className="text-xs text-slate-500 leading-relaxed">
          Sebelum mendeploy atau mengetes login Web App, Anda disarankan mengisi beberapa baris data awal pada Google Spreadsheet Anda agar aplikasi langsung bekerja dengan data nyata:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
          {/* Table Users Seeding */}
          <div className="space-y-1.5">
            <p className="font-bold text-slate-700">1. Isi Sheet: <span className="font-mono text-emerald-600">Users</span> (Mulai dari Baris 2)</p>
            <div className="bg-slate-900 text-slate-200 p-3 rounded-xl font-mono overflow-x-auto space-y-1">
              <p className="text-slate-400 font-semibold">// Baris 2:</p>
              <p>admin, admin123, Budi Santoso, Admin, Aktif</p>
              <p className="text-slate-400 font-semibold pt-1">// Baris 3:</p>
              <p>petugas1, user123, Joko Widodo, Petugas, Aktif</p>
              <p className="text-slate-400 font-semibold pt-1">// Baris 4:</p>
              <p>petugas2, user123, Agus Setiawan, Petugas, Aktif</p>
            </div>
          </div>

          {/* Table Pelanggan Seeding */}
          <div className="space-y-1.5">
            <p className="font-bold text-slate-700">2. Isi Sheet: <span className="font-mono text-emerald-600">Pelanggan</span> (Mulai dari Baris 2)</p>
            <div className="bg-slate-900 text-slate-200 p-3 rounded-xl font-mono overflow-x-auto space-y-1 text-[10px]">
              <p className="text-slate-400 font-semibold">// Baris 2 (Format CSV):</p>
              <p className="truncate">P001, Ahmad Dahlan, Dusun Krajan, RT 01 RW 02, Rumah Tangga A, Dapur Samping, 2025-01-10, 15, 081234567890, -7.8012, 110.3644, Aktif, 2025-01-10T08:00:00Z</p>
              <p className="text-slate-400 font-semibold pt-1">// Baris 3:</p>
              <p className="truncate">P002, Siti Aminah, Dusun Krajan, RT 03 RW 02, Rumah Tangga A, Kamar Mandi, 2025-01-15, 0, 082345678901, -7.8025, 110.3655, Aktif, 2025-01-15T09:30:00Z</p>
            </div>
          </div>
        </div>
      </div>

      {/* Security Warning */}
      <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-start gap-3 text-xs text-rose-800">
        <ShieldAlert className="shrink-0 text-rose-600 mt-0.5" />
        <div>
          <p className="font-extrabold">Informasi Keamanan Keandalan Kode:</p>
          <p className="mt-1 leading-relaxed text-rose-700">
            Blueprint PAMSDIGI menggunakan sistem otentikasi login kustom berbasis pencarian baris Spreadsheet. Hal ini sangat cocok untuk skala KPSPAMS Desa (100 - 3000 pelanggan) karena mudah dirawat, efisien, dan gratis tanpa biaya database server. Demi keamanan optimal, pastikan akses edit langsung Google Spreadsheet hanya diberikan kepada jajaran pengurus KPSPAMS yang berwenang.
          </p>
        </div>
      </div>

    </div>
  );
}
