'use client';

import { useState } from 'react';
import { adminApi } from '../_components/api';

type EntityType = 'all' | 'users' | 'tracks' | 'playlists' | 'pages';

interface SearchResult {
  type: string;
  results: Array<{
    id: string;
    name: string;
    description?: string;
    email?: string;
    artist?: string;
    [key: string]: any;
  }>;
}

interface SavedSearch {
  id: number;
  query: string;
  entity_type: EntityType;
  created_at: string;
}

export default function GlobalSearchPage() {
  const [query, setQuery] = useState('');
  const [entityType, setEntityType] = useState<EntityType>('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<SavedSearch[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Load saved and recent searches
  useState(() => {
    fetchSearches();
  });

  async function fetchSearches() {
    try {
      const [recent, saved] = await Promise.all([
        adminApi.getRecentSearches(),
        adminApi.getSavedSearches(),
      ]);
      setRecentSearches(recent.searches || []);
      setSavedSearches(saved.searches || []);
    } catch (err) {
      console.error('Error loading searches:', err);
    }
  }

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await adminApi.globalSearch({
        query: query.trim(),
        entity_type: entityType,
      });
      setResults(data.results || []);
      fetchSearches();
    } catch (err) {
      alert(`Erreur de recherche: ${err}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveCurrentSearch() {
    if (!query.trim()) return;
    try {
      await adminApi.saveSearch({
        query: query.trim(),
        entity_type: entityType,
      });
      setShowSaveModal(false);
      fetchSearches();
    } catch (err) {
      alert(`Erreur: ${err}`);
    }
  }

  async function deleteSavedSearch(id: number) {
    try {
      await adminApi.deleteSavedSearch(id);
      fetchSearches();
    } catch (err) {
      alert(`Erreur: ${err}`);
    }
  }

  async function loadSavedSearch(search: SavedSearch) {
    setQuery(search.query);
    setEntityType(search.entity_type);
    setLoading(true);
    try {
      const data = await adminApi.globalSearch({
        query: search.query,
        entity_type: search.entity_type,
      });
      setResults(data.results || []);
    } catch (err) {
      alert(`Erreur: ${err}`);
    } finally {
      setLoading(false);
    }
  }

  const totalResults = results.reduce((sum, cat) => sum + cat.results.length, 0);

  if (loading && results.length === 0) {
    return <div className="p-8 text-center text-gray-400">Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0a0a1a] p-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-[#1a1a2e] rounded-lg p-4">
              <h3 className="text-lg font-bold text-white mb-4">Recherches Sauvegardées</h3>

              {savedSearches.length === 0 ? (
                <p className="text-gray-400 text-sm">Aucune recherche sauvegardée.</p>
              ) : (
                <div className="space-y-2">
                  {savedSearches.map(search => (
                    <div
                      key={search.id}
                      className="bg-[#0a0a1a] rounded p-2 group hover:bg-purple-900 transition cursor-pointer"
                    >
                      <div onClick={() => loadSavedSearch(search)}>
                        <p className="text-white text-sm truncate font-medium">{search.query}</p>
                        <p className="text-gray-500 text-xs">{search.entity_type}</p>
                      </div>
                      <button
                        onClick={() => deleteSavedSearch(search.id)}
                        className="text-gray-400 hover:text-red-400 text-xs mt-1 opacity-0 group-hover:opacity-100 transition"
                      >
                        Supprimer
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <h3 className="text-lg font-bold text-white mt-6 mb-4">Récentes</h3>

              {recentSearches.length === 0 ? (
                <p className="text-gray-400 text-sm">Aucune recherche récente.</p>
              ) : (
                <div className="space-y-2">
                  {recentSearches.slice(0, 5).map(search => (
                    <div
                      key={search.id}
                      onClick={() => loadSavedSearch(search)}
                      className="bg-[#0a0a1a] rounded p-2 hover:bg-[#252540] transition cursor-pointer"
                    >
                      <p className="text-gray-400 text-sm truncate">{search.query}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <h1 className="text-3xl font-bold text-white mb-6">Recherche Globale</h1>

            {/* Search Bar */}
            <div className="bg-[#1a1a2e] rounded-lg p-4 mb-6">
              <div className="flex gap-3 mb-4">
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Rechercher utilisateurs, pistes, playlists..."
                  className="flex-1 bg-[#0a0a1a] text-white border border-purple-600 rounded px-4 py-2"
                />
                <button
                  onClick={handleSearch}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded"
                >
                  Chercher
                </button>
              </div>

              <div className="flex gap-2 mb-4">
                {(['all', 'users', 'tracks', 'playlists', 'pages'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setEntityType(type)}
                    className={`px-3 py-1 rounded text-sm font-medium transition ${
                      entityType === type
                        ? 'bg-purple-600 text-white'
                        : 'bg-[#0a0a1a] text-gray-400 hover:bg-[#252540]'
                    }`}
                  >
                    {type === 'all' ? 'Tous' : type === 'users' ? 'Utilisateurs' : type === 'tracks' ? 'Pistes' : type === 'playlists' ? 'Playlists' : 'Pages'}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowSaveModal(true)}
                disabled={!query.trim()}
                className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 disabled:opacity-50 text-white font-medium px-3 py-1 rounded text-sm"
              >
                Sauvegarder la Recherche
              </button>
            </div>

            {/* Save Modal */}
            {showSaveModal && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                <div className="bg-[#1a1a2e] rounded-lg p-6 max-w-md w-full mx-4">
                  <h3 className="text-xl font-bold text-white mb-4">Sauvegarder la Recherche</h3>
                  <p className="text-gray-400 mb-6">Requête: <span className="text-white font-medium">{query}</span></p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowSaveModal(false)}
                      className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={saveCurrentSearch}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded"
                    >
                      Sauvegarder
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Results */}
            {results.length > 0 && (
              <div className="bg-[#1a1a2e] rounded-lg p-6">
                <h2 className="text-lg font-bold text-white mb-4">
                  Résultats ({totalResults})
                </h2>

                <div className="space-y-6">
                  {results.map(category => (
                    <div key={category.type}>
                      <h3 className="text-purple-400 font-bold mb-3 text-sm uppercase">
                        {category.type} ({category.results.length})
                      </h3>
                      <div className="space-y-2">
                        {category.results.map(item => (
                          <div
                            key={item.id}
                            className="bg-[#0a0a1a] rounded p-4 hover:bg-[#252540] transition cursor-pointer"
                          >
                            <p className="text-white font-medium">{item.name}</p>
                            {item.description && (
                              <p className="text-gray-400 text-sm">{item.description}</p>
                            )}
                            {item.email && (
                              <p className="text-gray-500 text-xs">{item.email}</p>
                            )}
                            {item.artist && (
                              <p className="text-gray-500 text-xs">{item.artist}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {query.trim() && results.length === 0 && !loading && (
              <div className="bg-[#1a1a2e] rounded-lg p-6 text-center">
                <p className="text-gray-400">Aucun résultat pour "{query}"</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
