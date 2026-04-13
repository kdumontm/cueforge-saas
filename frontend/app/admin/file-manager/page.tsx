"use client";

import { useEffect, useState } from "react";
import {
  Upload, Trash2, Move, Download, List, Grid3x3, X, Loader, Settings,
  FolderOpen, File, Image as ImageIcon, Music, FileText as FileIcon
} from "lucide-react";
import { Card, Badge, PageWrapper, LoadingScreen } from "../_components/shared";
import { adminApi } from "../_components/api";

interface FileItem {
  id: number;
  name: string;
  size: number;
  type: string;
  thumbnail?: string;
  folder_id?: number;
  created_at: string;
  updated_at: string;
  url: string;
}

interface Folder {
  id: number;
  name: string;
  parent_id?: number;
}

interface FileStats {
  total_files: number;
  total_size: number;
  by_type: Record<string, number>;
}

interface CDNConfig {
  provider: string;
  bucket: string;
  region: string;
  enabled: boolean;
}

export default function FileManagerPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [stats, setStats] = useState<FileStats | null>(null);
  const [cdnConfig, setCdnConfig] = useState<CDNConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [currentFolder, setCurrentFolder] = useState<number | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Folder[]>([]);
  const [tab, setTab] = useState<"files" | "cdn">("files");

  // Selections
  const [selected, setSelected] = useState<number[]>([]);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [filesData, foldersData, statsData, cdnData] = await Promise.all([
        adminApi.getFiles({ folder_id: currentFolder }),
        adminApi.getFileFolders(),
        adminApi.getFileStats(),
        adminApi.getCDNConfig(),
      ]);
      setFiles(filesData);
      setFolders(foldersData);
      setStats(statsData);
      setCdnConfig(cdnData);
    } catch (err) {
      console.error("Erreur chargement fichiers:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    const filesToUpload = Array.from(event.target.files);
    setUploading(true);

    for (const file of filesToUpload) {
      try {
        await adminApi.createFile({
          file,
          folder_id: currentFolder,
        });
      } catch (err) {
        console.error("Erreur upload:", err);
      }
    }
    setUploading(false);
    loadData();
  };

  const handleDelete = async (id: number) => {
    if (window.confirm("Confirmer la suppression ?")) {
      try {
        await adminApi.deleteFile(id);
        loadData();
      } catch (err) {
        console.error("Erreur:", err);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (window.confirm(`Supprimer ${selected.length} fichier(s) ?`)) {
      try {
        await adminApi.bulkDeleteFiles(selected);
        setSelected([]);
        loadData();
      } catch (err) {
        console.error("Erreur:", err);
      }
    }
  };

  const handleMove = async () => {
    if (!moveTarget) return;
    try {
      for (const id of selected) {
        await adminApi.moveFile(id, moveTarget);
      }
      setShowMoveModal(false);
      setSelected([]);
      loadData();
    } catch (err) {
      console.error("Erreur:", err);
    }
  };

  const handlePurgeCDN = async () => {
    if (window.confirm("Purger tout le cache CDN ?")) {
      try {
        await adminApi.purgeCDN();
        console.log("CDN purgé");
      } catch (err) {
        console.error("Erreur:", err);
      }
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <ImageIcon size={24} className="text-blue-400" />;
    if (type.startsWith("audio/")) return <Music size={24} className="text-purple-400" />;
    return <FileIcon size={24} className="text-gray-400" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  if (loading && files.length === 0) return <LoadingScreen />;

  return (
    <PageWrapper title="Gestionnaire de fichiers">
      {/* Tabs */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setTab("files")}
          className={`px-6 py-3 rounded font-medium transition ${
            tab === "files"
              ? "bg-purple-600 text-white"
              : "bg-[#1a1a2e] text-text-muted hover:text-white"
          }`}
        >
          <FolderOpen className="inline mr-2" size={18} />
          Fichiers
        </button>
        <button
          onClick={() => setTab("cdn")}
          className={`px-6 py-3 rounded font-medium transition ${
            tab === "cdn"
              ? "bg-purple-600 text-white"
              : "bg-[#1a1a2e] text-text-muted hover:text-white"
          }`}
        >
          <Settings className="inline mr-2" size={18} />
          CDN
        </button>
      </div>

      {/* FILES TAB */}
      {tab === "files" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
              <div className="text-text-muted text-sm mb-2">Fichiers totaux</div>
              <div className="text-3xl font-bold text-white">{stats?.total_files ?? 0}</div>
            </Card>
            <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
              <div className="text-text-muted text-sm mb-2">Taille totale</div>
              <div className="text-3xl font-bold text-white">{stats ? formatSize(stats.total_size) : "0 B"}</div>
            </Card>
            <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
              <div className="text-text-muted text-sm mb-2">Types</div>
              <div className="flex gap-2 flex-wrap mt-2">
                {stats?.by_type && Object.entries(stats.by_type).slice(0, 3).map(([type, count]) => (
                  <Badge key={type} className="bg-purple-900 text-purple-100">
                    {type}: {count}
                  </Badge>
                ))}
              </div>
            </Card>
          </div>

          {/* Controls */}
          <div className="flex gap-4 mb-6 flex-wrap">
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded transition ${
                  viewMode === "grid"
                    ? "bg-purple-600 text-white"
                    : "bg-[#1a1a2e] text-text-muted hover:text-white"
                }`}
              >
                <Grid3x3 size={18} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded transition ${
                  viewMode === "list"
                    ? "bg-purple-600 text-white"
                    : "bg-[#1a1a2e] text-text-muted hover:text-white"
                }`}
              >
                <List size={18} />
              </button>
            </div>

            <label className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium transition cursor-pointer flex items-center gap-2">
              <Upload size={18} /> Télécharger
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>

            {selected.length > 0 && (
              <>
                <button
                  onClick={() => setShowMoveModal(true)}
                  className="px-4 py-2 bg-[#2a2a4a] hover:bg-[#3a3a4a] text-white rounded font-medium transition flex items-center gap-2"
                >
                  <Move size={18} /> Déplacer ({selected.length})
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded font-medium transition flex items-center gap-2"
                >
                  <Trash2 size={18} /> Supprimer ({selected.length})
                </button>
              </>
            )}
          </div>

          {/* File Grid */}
          {viewMode === "grid" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {files.map((file) => (
                <Card
                  key={file.id}
                  className={`p-4 bg-[#0a0a1a] border-[#2a2a4a] cursor-pointer transition hover:border-purple-600 ${
                    selected.includes(file.id) ? "border-purple-600 bg-purple-600/10" : ""
                  }`}
                  onClick={() =>
                    setSelected((s) =>
                      s.includes(file.id) ? s.filter((id) => id !== file.id) : [...s, file.id]
                    )
                  }
                >
                  <div className="aspect-square bg-[#1a1a2e] rounded mb-3 flex items-center justify-center">
                    {file.thumbnail ? (
                      <img src={file.thumbnail} alt={file.name} className="w-full h-full object-cover rounded" />
                    ) : (
                      getFileIcon(file.type)
                    )}
                  </div>
                  <h4 className="text-sm font-medium text-white truncate mb-1">{file.name}</h4>
                  <p className="text-xs text-text-muted mb-3">{formatSize(file.size)}</p>
                  <div className="flex gap-2">
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-2 py-1 bg-[#1a1a2e] hover:bg-[#2a2a4a] text-white rounded text-xs font-medium transition"
                    >
                      <Download size={14} className="inline mr-1" /> Voir
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(file.id);
                      }}
                      className="px-2 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded text-xs font-medium transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* File List */}
          {viewMode === "list" && (
            <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a4a]">
                    <th className="text-left py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selected.length === files.length && files.length > 0}
                        onChange={(e) => setSelected(e.target.checked ? files.map((f) => f.id) : [])}
                        className="rounded"
                      />
                    </th>
                    <th className="text-left py-3 px-4 text-text-muted font-medium">Nom</th>
                    <th className="text-left py-3 px-4 text-text-muted font-medium">Taille</th>
                    <th className="text-left py-3 px-4 text-text-muted font-medium">Type</th>
                    <th className="text-left py-3 px-4 text-text-muted font-medium">Créé</th>
                    <th className="text-left py-3 px-4 text-text-muted font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => (
                    <tr
                      key={file.id}
                      className={`border-b border-[#1a1a2e] hover:bg-[#1a1a2e]/50 transition ${
                        selected.includes(file.id) ? "bg-purple-600/10" : ""
                      }`}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selected.includes(file.id)}
                          onChange={(e) =>
                            setSelected((s) =>
                              e.target.checked ? [...s, file.id] : s.filter((id) => id !== file.id)
                            )
                          }
                          className="rounded"
                        />
                      </td>
                      <td className="py-3 px-4 text-white font-medium">{file.name}</td>
                      <td className="py-3 px-4 text-text-muted">{formatSize(file.size)}</td>
                      <td className="py-3 px-4 text-text-muted text-xs">{file.type}</td>
                      <td className="py-3 px-4 text-text-muted">
                        {new Date(file.created_at).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="py-3 px-4 flex gap-2">
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 transition"
                        >
                          <Download size={16} />
                        </a>
                        <button
                          onClick={() => handleDelete(file.id)}
                          className="text-red-400 hover:text-red-300 transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* Move Modal */}
          {showMoveModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <Card className="bg-[#0a0a1a] border-[#2a2a4a] max-w-md w-full p-6">
                <h2 className="text-xl font-bold text-white mb-6">Déplacer vers</h2>
                <select
                  value={moveTarget}
                  onChange={(e) => setMoveTarget(e.target.value)}
                  className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600 mb-6"
                >
                  <option value="">Racine</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id.toString()}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-3 pt-6 border-t border-[#2a2a4a]">
                  <button
                    onClick={() => setShowMoveModal(false)}
                    className="flex-1 px-4 py-2 bg-[#2a2a4a] hover:bg-[#3a3a4a] text-white rounded font-medium transition"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleMove}
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium transition"
                  >
                    Déplacer
                  </button>
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* CDN TAB */}
      {tab === "cdn" && (
        <>
          <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a] mb-6">
            <h2 className="text-xl font-bold text-white mb-6">Configuration CDN</h2>
            {cdnConfig && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">Fournisseur</label>
                    <div className="px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded">
                      {cdnConfig.provider}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">Bucket</label>
                    <div className="px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded">
                      {cdnConfig.bucket}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">Région</label>
                    <div className="px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded">
                      {cdnConfig.region}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">Statut</label>
                    <div className="flex items-center gap-2 px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded">
                      <div className={`w-3 h-3 rounded-full ${cdnConfig.enabled ? "bg-green-500" : "bg-gray-500"}`} />
                      {cdnConfig.enabled ? "Activé" : "Désactivé"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
            <h3 className="text-lg font-bold text-white mb-4">Actions</h3>
            <button
              onClick={handlePurgeCDN}
              className="px-6 py-3 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded font-medium transition"
            >
              Purger le cache CDN
            </button>
          </Card>
        </>
      )}
    </PageWrapper>
  );
}
