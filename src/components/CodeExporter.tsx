import React, { useState } from 'react';
import { gasFiles } from '../data/gasCode';
import { GASFile } from '../types';
import { FileCode, Copy, Check, Download, AlertCircle, Info, ChevronRight, CheckCircle2 } from 'lucide-react';

export default function CodeExporter() {
  const [selectedFile, setSelectedFile] = useState<GASFile>(gasFiles[0]);
  const [copiedState, setCopiedState] = useState(false);
  const [downloadAllState, setDownloadAllState] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopiedState(true);
    setTimeout(() => setCopiedState(false), 2000);
  };

  const handleDownloadSingle = (file: GASFile) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    setDownloadAllState(true);
    gasFiles.forEach((file, index) => {
      setTimeout(() => {
        handleDownloadSingle(file);
      }, index * 250); // Stagger download prompts to allow browsers to process them
    });
    setTimeout(() => setDownloadAllState(false), 3000);
  };

  return (
    <div id="code-exporter-container" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      
      {/* LEFT: File List Selector */}
      <div className="lg:col-span-4 space-y-4">
        
        {/* GAS Info Banner */}
        <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 bg-indigo-600 text-white rounded-lg mt-0.5">
              <Info size={16} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="font-extrabold text-slate-800 text-xs">Arsitektur Modular GAS</h4>
                <span className="text-[10px] bg-indigo-600 text-white font-extrabold px-2 py-0.5 rounded-full">
                  v2.3.3
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] bg-white/80 p-2 rounded-xl border border-indigo-100">
                <div>
                  <p className="text-slate-400 font-medium">Last Update:</p>
                  <p className="text-slate-700 font-bold">08 Sept 2026</p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium">Status API:</p>
                  <p className="text-emerald-700 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Production Ready - Multi-Tenant Isolated
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Mendukung <strong>Self-Provisioning Non-Destructive</strong> (otomatis membuat sheet dari spreadsheet kosong tanpa menimpa sheet lama saat update) dan <strong>Global Sync</strong>.
              </p>
            </div>
          </div>
          <button 
            onClick={handleDownloadAll}
            className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
          >
            <Download size={14} />
            {downloadAllState ? 'Mengunduh...' : 'Unduh Semua File (ZIP alternatif)'}
          </button>
        </div>
 
        {/* File Navigator List */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Daftar File Sprint 1</h3>
          
          <div className="space-y-1">
            {gasFiles.map((file) => {
               const isSelected = selectedFile.name === file.name;
               const isGS = file.type === 'gs';
 
               return (
                <button
                  key={file.name}
                  onClick={() => {
                     setSelectedFile(file);
                     setCopiedState(false);
                  }}
                  className={`w-full text-left p-3 rounded-xl transition flex items-center justify-between gap-3 cursor-pointer ${
                    isSelected
                       ? 'bg-indigo-50 border border-indigo-200/60 text-indigo-900 font-extrabold shadow-2xs'
                       : 'hover:bg-slate-50 border border-transparent text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-1.5 rounded-lg shrink-0 ${
                      isGS 
                        ? 'bg-red-50 text-red-600' 
                        : 'bg-amber-50 text-amber-600'
                    }`}>
                      <FileCode size={16} />
                    </div>
                    <div className="truncate text-xs">
                      <p className="font-mono font-bold">{file.name}</p>
                      <p className="text-[10px] text-slate-400 font-normal truncate mt-0.5">{file.description}</p>
                    </div>
                  </div>
                  <ChevronRight size={14} className={isSelected ? 'text-indigo-600' : 'text-slate-300'} />
                </button>
               );
            })}
          </div>
        </div>
 
        {/* File Setup Location Card */}
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-[11px] text-slate-600 space-y-1.5 leading-relaxed">
          <p className="font-bold text-amber-800 flex items-center gap-1">
            <AlertCircle size={14} />
            PENTING SAAT PASTE DI GAS:
          </p>
          <ul className="list-disc pl-4 space-y-1 text-slate-700">
            <li>File berekstensi <strong className="text-red-700">.gs</strong> wajib dibuat di Apps Script sebagai <strong>"Skrip"</strong>.</li>
            <li>File berekstensi <strong className="text-amber-700">.html</strong> wajib dibuat di Apps Script sebagai <strong>"Halaman HTML"</strong>.</li>
            <li>JANGAN salah memilih jenis file karena compiler Apps Script akan mendeteksi error sintaks!</li>
          </ul>
        </div>
      </div>
 
      {/* RIGHT: Code Editor Screen */}
      <div className="lg:col-span-8 flex flex-col gap-4 self-stretch">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col flex-1 shadow-xl overflow-hidden min-h-[500px]">
          
          {/* Editor Header Bar */}
          <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className={`w-3 h-3 rounded-full ${selectedFile.type === 'gs' ? 'bg-red-500' : 'bg-amber-500'}`}></span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-mono font-bold text-white text-sm">{selectedFile.name}</h3>
                  <span className="text-[10px] bg-slate-800 text-slate-400 font-bold px-2 py-0.5 rounded-sm uppercase">
                    {selectedFile.type === 'gs' ? 'Google Script' : 'HTML template'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{selectedFile.description}</p>
              </div>
            </div>
 
            {/* Actions for current file */}
            <div className="flex items-center gap-2.5 self-end sm:self-auto">
              <button
                onClick={handleCopy}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                  copiedState 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
                title="Salin kode ke clipboard"
              >
                {copiedState ? <Check size={14} /> : <Copy size={14} />}
                {copiedState ? 'Tersalin!' : 'Salin Kode'}
              </button>
 
              <button
                onClick={() => handleDownloadSingle(selectedFile)}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
                title="Unduh file tunggal"
              >
                <Download size={14} />
                Unduh
              </button>
            </div>
          </div>
 
          {/* Editor Code Body */}
          <div className="flex-1 p-5 overflow-auto font-mono text-[12px] bg-slate-950 text-slate-100 max-h-[520px] select-all relative">
            
            {/* Real-time Code Viewer */}
            <pre className="leading-relaxed whitespace-pre font-mono">{selectedFile.content}</pre>
 
            {/* Copied Overlay Feedback */}
            {copiedState && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col justify-center items-center z-10 animate-fade-in">
                <CheckCircle2 size={36} className="text-emerald-500 mb-2 animate-bounce" />
                <span className="text-white font-bold text-sm">Kode Berhasil Disalin!</span>
                <span className="text-slate-400 text-xs mt-1">Siap ditempel langsung ke Google Apps Script Editor</span>
              </div>
            )}
          </div>
 
        </div>
      </div>

    </div>
  );
}
